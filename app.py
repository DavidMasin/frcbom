import os
import json
from flask import Flask, request, jsonify, send_file, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity, get_jwt, jwt_required
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

# Initialize Flask app and configuration
app = Flask(__name__)
# Configure the database URI (use environment variable for Railway PostgreSQL, fallback to SQLite for local dev)
db_uri = os.getenv("DATABASE_URL")
if db_uri and db_uri.startswith("postgres://"):
    db_uri = db_uri.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = db_uri or 'sqlite:///teams.db'
# Set JWT secret key from env for security
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'super-secure-jwt-key')

# Initialize extensions
db = SQLAlchemy(app)
jwt = JWTManager(app)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], allow_headers=["Content-Type", "Authorization", "X-Requested-With"])
socketio = SocketIO(app, cors_allowed_origins="*")

class Team(db.Model):
    """Database model for a team account (with user and admin passwords)."""
    id = db.Column(db.Integer, primary_key=True)
    team_number = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)       # Hashed user password
    adminPassword = db.Column(db.String(200), nullable=False)  # Hashed admin password

class System(db.Model):
    """Database model for Onshape API credentials and document for a specific team robot system."""
    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=False)
    robot_name = db.Column(db.String(100), nullable=False)
    system_name = db.Column(db.String(100), nullable=False)
    access_key = db.Column(db.String(200), nullable=True)
    secret_key = db.Column(db.String(200), nullable=True)
    document_url = db.Column(db.String(500), nullable=True)
    bom_data = db.Column(db.JSON, nullable=True)
    team = db.relationship('Team', backref=db.backref('systems', lazy=True))

# Create database tables (if not already created)
with app.app_context():
    db.create_all()

# Routes to serve HTML pages
@app.route('/')
def home():
    """Serve the home page (login page)."""
    return render_template("index.html")

@app.route('/<team_number>/<robot_name>')
def team_dashboard(team_number, robot_name):
    """Serve the user dashboard for a given team and robot."""
    return render_template('dashboard.html', team_number=team_number, robot_name=robot_name)

@app.route('/<team_number>/Admin')
def team_admin_dashboard(team_number):
    """Serve the team admin dashboard for a given team."""
    return render_template('teamAdmin_dashboard.html', team_number=team_number)

@app.route('/<team_number>/<robot_name>/<system>')
def team_bom_filtered(team_number, robot_name, system):
    """Serve the dashboard with a specific system filter (for deep linking)."""
    return render_template('dashboard.html', team_number=team_number, robot_name=robot_name, filter_system=system)

@app.route('/register')
def register_page():
    """Serve the registration page."""
    return render_template('register.html')

# Authentication endpoints
@app.route('/api/register', methods=['POST'])
def register():
    """Register a new team with user and admin passwords."""
    data = request.get_json()
    team_number = data.get("team_number")
    password = data.get("password")
    admin_password = data.get("adminPassword")
    if not team_number or not password or not admin_password:
        return jsonify({"error": "Team number, password, and adminPassword are required"}), 400

    # Check if team already exists
    existing_team = Team.query.filter_by(team_number=team_number).first()
    if existing_team:
        return jsonify({"error": "Team already exists"}), 400

    # Create new team with hashed passwords
    hashed_password = generate_password_hash(password)
    hashed_admin_password = generate_password_hash(admin_password)
    new_team = Team(team_number=team_number, password=hashed_password, adminPassword=hashed_admin_password)
    db.session.add(new_team)
    db.session.commit()

    return jsonify({"message": "Team registered successfully"}), 200

@app.route('/api/login', methods=['POST'])
def login():
    """Login a team (user or admin) and return a JWT token and role information."""
    data = request.get_json()
    team_number = data.get('team_number')
    password = data.get('password')
    if not team_number or not password:
        return jsonify({"error": "Team number and password are required"}), 400

    # Find team in database
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Invalid credentials"}), 401

    # Verify password against user or admin hash
    if check_password_hash(team.password, password):
        # Logged in as normal user
        is_admin = False
    elif check_password_hash(team.adminPassword, password):
        # Logged in with admin credentials
        is_admin = True
    else:
        # Neither password matches
        return jsonify({"error": "Invalid credentials"}), 401

    # Set JWT additional claims for roles
    additional_claims = {"is_team_admin": False, "is_global_admin": False}
    if is_admin:
        additional_claims["is_team_admin"] = True
        if team_number == "0000":  # Team "0000" is treated as global admin account
            additional_claims["is_global_admin"] = True

    # Generate JWT access token
    access_token = create_access_token(identity=team_number, additional_claims=additional_claims)
    return jsonify(access_token=access_token, team_number=team_number, isAdmin=is_admin), 200

# Utility endpoint to check team existence (no auth required)
@app.route('/api/team_exists', methods=['GET'])
def team_exists():
    """Check if a team number is already registered (for client-side validation)."""
    team_number = request.args.get('team_number')
    if not team_number:
        return jsonify({"error": "Team number is required"}), 400
    team = Team.query.filter_by(team_number=team_number).first()
    return jsonify({"exists": bool(team)}), 200

# Health check endpoint (no auth required)
@app.route('/api/health', methods=['GET'])
def health_check():
    """Simple health check endpoint."""
    return jsonify({"status": "API is running"}), 200

# ** BOM Data and Robot Management Endpoints **
@app.route('/api/save_bom_for_robot_system', methods=['POST'])
@jwt_required()
def save_bom_for_robot_system():
    """
    Save BOM data for a specific team, robot, and system.
    This operation is restricted to team admins or global admin.
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    data = request.get_json()
    team_number = data.get('team_number')
    robot_name = data.get('robot_name')
    system = data.get('system')
    bom_data = data.get('bom_data')
    if not all([team_number, robot_name, system, bom_data]):
        return jsonify({"error": "Missing required fields"}), 400

    # Authorization: only team admin of that team or global admin can save BOM data
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    # Save BOM data in database
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    system_record = System.query.filter_by(team_id=team.id, robot_name=robot_name, system_name=system).first()
    if not system_record:
        system_record = System(team_id=team.id, robot_name=robot_name, system_name=system, bom_data=bom_data)
        db.session.add(system_record)
    else:
        system_record.bom_data = bom_data
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to save BOM data: {str(e)}"}), 500

    return jsonify({"message": f"BOM data saved for robot '{robot_name}', system '{system}'"}), 200

@app.route('/api/new_robot', methods=['POST'])
@jwt_required()
def new_robot():
    """
    Create a new robot entry for a team, with default systems.
    Only team admins or global admin can perform this.
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    data = request.get_json()
    team_number = data.get("team_number")
    robot_name = data.get("robot_name")
    if not team_number or not robot_name:
        return jsonify({"error": "Team number and robot name are required"}), 400

    # Authorization: only team admin of that team or global admin can create new robots
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    # Create new robot with default systems in database
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    existing_robot = System.query.filter_by(team_id=team.id, robot_name=robot_name).first()
    if existing_robot:
        return jsonify({"error": "Robot name already exists"}), 400

    # Create default systems for the new robot
    for system_name in ["Main", "System1", "System2", "System3", "System4", "System5"]:
        system = System(team_id=team.id, robot_name=robot_name, system_name=system_name, bom_data=[])
        db.session.add(system)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to create robot: {str(e)}"}), 500

    return jsonify({"message": f"Robot '{robot_name}' created successfully"}), 200

@app.route('/api/get_robots', methods=['GET'])
@jwt_required()
def get_robots():
    """Retrieve the list of robot names for a given team (accessible to team members and admins)."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    team_number = request.args.get('team_number')
    if not team_number:
        return jsonify({"error": "Team number is required"}), 400

    # Authorization: allow if the requesting user's team matches, or if global admin
    if current_user != team_number and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    # Retrieve robot names from database
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    systems = System.query.filter_by(team_id=team.id).all()
    robots = list(set(sys.robot_name for sys in systems))
    print(robots)
    return jsonify({"robots": robots}), 200

@app.route('/api/get_bom', methods=['GET'])
@jwt_required()
def get_bom():
    """Retrieve BOM data for a specific team, robot, and system (team members or admin only)."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    team_number = request.args.get('team_number')
    robot_name = request.args.get('robot')
    system = request.args.get('system', 'Main')
    if not team_number or not robot_name:
        return jsonify({"error": "Team number and robot name are required"}), 400

    # Authorization: user must belong to the team or be global admin
    if current_user != team_number and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    # Retrieve BOM data from database
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    if system == "Main":
        systems = System.query.filter_by(team_id=team.id, robot_name=robot_name).all()
        combined = []
        for sys_record in systems:
            if sys_record.bom_data:
                combined.extend(sys_record.bom_data)
        return jsonify({"bom_data": combined}), 200
    else:
        sys_record = System.query.filter_by(team_id=team.id, robot_name=robot_name, system_name=system).first()
        bom_list = sys_record.bom_data if (sys_record and sys_record.bom_data is not None) else []
        return jsonify({"bom_data": bom_list}), 200

@app.route('/api/rename_robot', methods=['POST'])
@jwt_required()
def rename_robot():
    """
    Rename an existing robot for a given team.
    Payload: {"team_number": "...", "old_robot_name": "...", "new_robot_name": "..."}
    Only team admins or global admin can rename robots.
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    data = request.get_json()
    team_number = data.get('team_number')
    old_name = data.get('old_robot_name')
    new_name = data.get('new_robot_name')
    if not team_number or not old_name or not new_name:
        return jsonify({"error": "Missing required fields"}), 400

    # Authorization check
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    # Rename robot in database
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    systems_old = System.query.filter_by(team_id=team.id, robot_name=old_name).all()
    if not systems_old:
        return jsonify({"error": f"Robot '{old_name}' does not exist"}), 404
    exists_new = System.query.filter_by(team_id=team.id, robot_name=new_name).first()
    if exists_new:
        return jsonify({"error": f"Robot '{new_name}' already exists"}), 400

    for sys_record in systems_old:
        sys_record.robot_name = new_name
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to rename robot: {str(e)}"}), 500

    return jsonify({"message": f"Robot '{old_name}' renamed to '{new_name}'"}), 200

@app.route('/api/delete_robot', methods=['DELETE'])
@jwt_required()
def delete_robot():
    """
    Delete a robot (and its BOM data) for a given team.
    Payload: {"team_number": "...", "robot_name": "..."}
    Only team admins or global admin can delete robots.
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    data = request.get_json()
    team_number = data.get('team_number')
    robot_name = data.get('robot_name')
    if not team_number or not robot_name:
        return jsonify({"error": "Missing required fields"}), 400

    # Authorization check
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    # Delete robot and its systems from database
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    deleted_count = System.query.filter_by(team_id=team.id, robot_name=robot_name).delete()
    if deleted_count == 0:
        return jsonify({"error": f"Robot '{robot_name}' not found"}), 404
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to delete robot: {str(e)}"}), 500

    return jsonify({"message": f"Robot '{robot_name}' deleted successfully"}), 200

# Onshape integration helper (find IDs for specific columns in Onshape BOM JSON)
def findIDs(bom_dict: dict, name: str):
    for header in bom_dict.get("headers", []):
        if header.get('name') == name:
            return header.get('id')
    return None

def getPartsDict(bom_dict: dict, partNameID, descriptionID, quantityID, materialID,
                 materialBomID, preProcessID, process1ID, process2ID) -> dict:
    """Extract parts data from Onshape BOM JSON into a structured dictionary."""
    part_dict = {}
    rows = bom_dict.get("rows", [])
    for row in rows:
        # Basic fields
        part_name = row.get("headerIdToValue", {}).get(partNameID, "Unknown")
        part_desc = row.get("headerIdToValue", {}).get(descriptionID, "Unknown")

        quantity = row.get("headerIdToValue", {}).get(quantityID, "N/A")
        material = row.get("headerIdToValue", {}).get(materialID, "Unknown")
        material_bom = row.get("headerIdToValue", {}).get(materialBomID, "Unknown")
        pre_process = row.get("headerIdToValue", {}).get(preProcessID, "Unknown")
        process1 = row.get("headerIdToValue", {}).get(process1ID, "Unknown")
        process2 = row.get("headerIdToValue", {}).get(process2ID, "Unknown")
        part_id = row.get("itemSource", {}).get("partId", "Unknown")
        # Determine display values
        if material and material != "N/A" and isinstance(material, dict):
            material_display = material.get("displayName", "Unknown")
        else:
            material_display = "No material set" if material == "N/A" or material is None else str(material)
        if isinstance(material_bom, dict):
            material_bom_display = material_bom.get("displayName", "Unknown")
        else:
            material_bom_display = material_bom if material_bom != "Unknown" else "No material set"
        # Store part data tuple
        part_dict[part_name] = (
            part_desc, int(quantity) if isinstance(quantity, (int, str)) and str(quantity).isdigit() else quantity,
            material_display, material_bom_display,
            pre_process, process1, process2, part_id
        )
    return part_dict

@app.route('/api/bom', methods=['POST'])
@jwt_required()
def fetch_bom():
    """
    Fetch the Bill of Materials from Onshape for a given document URL and save it for a team/robot/system.
    Requires the team's Onshape API access key and secret. Team admin or global admin only.
    Payload: {document_url, team_number, robot, system, access_key, secret_key}
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    data = request.get_json()
    document_url = data.get("document_url")
    team_number = data.get("team_number")
    robot = data.get("robot", "Robot1")
    system = data.get("system", "Main")
    access_key = data.get("access_key")
    secret_key = data.get("secret_key")

    if not document_url or not team_number or not access_key or not secret_key:
        return jsonify({"error": "Document URL, team_number, access_key, and secret_key are required"}), 400

    # Authorization: only team admin of that team or global admin can fetch BOM (since it requires keys)
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    # Look up the team in the database and ensure it exists
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    # Initialize Onshape API client for this request
    from onshape_client.client import Client
    from onshape_client.onshape_url import OnshapeElement
    try:
        element = OnshapeElement(document_url)
    except Exception as e:
        return jsonify({"error": f"Invalid Onshape document URL: {str(e)}"}), 400

    client = Client(configuration={"base_url": "https://cad.onshape.com", "access_key": access_key, "secret_key": secret_key})
    try:
        # Construct BOM API request URL for Onshape
        did = element.did
        wid = element.wvmid
        eid = element.eid
        bom_url = f"/api/v10/assemblies/d/{did}/w/{wid}/e/{eid}/bom"
        headers = {'Accept': 'application/vnd.onshape.v1+json', 'Content-Type': 'application/json'}
        response = client.api_client.request('GET', url="https://cad.onshape.com" + bom_url, query_params={"indented": False}, headers=headers, body={})
        bom_dict = json.loads(response.data)
    except Exception as e:
        return jsonify({"error": f"Failed to fetch BOM from Onshape: {str(e)}"}), 500

    # Extract relevant part data from the Onshape BOM JSON
    part_name_id = findIDs(bom_dict, "Name")
    quantity_id = findIDs(bom_dict, "Quantity") or findIDs(bom_dict, "QTY")
    material_id = findIDs(bom_dict, "Material")
    material_bom_id = findIDs(bom_dict, "Bom Material") or material_id
    pre_proc_id = findIDs(bom_dict, "Pre Process")
    proc1_id = findIDs(bom_dict, "Process 1")
    proc2_id = findIDs(bom_dict, "Process 2")
    description_id = findIDs(bom_dict, "Description")
    parts = getPartsDict(bom_dict, part_name_id, description_id, quantity_id, material_id,
                         material_bom_id, pre_proc_id, proc1_id, proc2_id)
    # Convert parts dict into a list of part info dicts for JSON response
    bom_data_list = []
    for part_name, (desc, qty, material, materialBOM, preProcess, proc1, proc2, part_id) in parts.items():
        bom_data_list.append({
            "Part Name": part_name,
            "Description": desc,
            "Quantity": qty,
            "Material": material,
            "materialBOM": materialBOM,
            "preProcess": preProcess,
            "Process1": proc1,
            "Process2": proc2,
            "ID": part_id
        })

    # Save Onshape credentials and BOM data in database
    system_record = System.query.filter_by(team_id=team.id, robot_name=robot, system_name=system).first()
    if not system_record:
        system_record = System(team_id=team.id, robot_name=robot, system_name=system,
                                access_key=access_key, secret_key=secret_key, document_url=document_url, bom_data=bom_data_list)
        db.session.add(system_record)
    else:
        system_record.access_key = access_key
        system_record.secret_key = secret_key
        system_record.document_url = document_url
        system_record.bom_data = bom_data_list
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to save BOM data: {str(e)}"}), 500

    return jsonify({"bom_data": bom_data_list}), 200

@app.route("/api/download_cad", methods=["POST"])
@jwt_required()
def download_cad():
    """
    Provide a redirect URL to download a Parasolid CAD file for a specific part from Onshape.
    Payload: {"team_number": "...", "id": partId}
    Returns a redirect URL for the part's Parasolid file (if available).
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    data = request.get_json()
    team_number = data.get("team_number")
    part_id = data.get("id")
    if not team_number or not part_id:
        return jsonify({"error": "Missing part ID or team number"}), 400

    # Authorization: must belong to team or be global admin
    if current_user != team_number and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    # Identify which robot and system this part belongs to via database
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404
    systems = System.query.filter_by(team_id=team.id).all()
    found_entry = None
    for sys_record in systems:
        if sys_record.bom_data:
            for part in sys_record.bom_data:
                if isinstance(part, dict) and part.get("ID") == part_id:
                    found_entry = sys_record
                    break
        if found_entry:
            break
    if not found_entry:
        return jsonify({"error": "Part ID not found in BOM data for team"}), 404

    system_record = found_entry
    if not system_record.access_key or not system_record.secret_key or not system_record.document_url:
        return jsonify({"error": "Onshape API credentials or document URL not configured for this system"}), 400

    # Look up Onshape credentials for this team and system
    access_key = system_record.access_key
    secret_key = system_record.secret_key
    document_url = system_record.document_url

    from onshape_client.client import Client
    from onshape_client.onshape_url import OnshapeElement
    try:
        client = Client(configuration={"base_url": "https://cad.onshape.com", "access_key": access_key, "secret_key": secret_key})
        element = OnshapeElement(document_url)
    except Exception as e:
        return jsonify({"error": f"Onshape client initialization failed: {str(e)}"}), 500

    try:
        # Construct the Parasolid export endpoint
        did = element.did
        wid = element.wvmid
        eid = element.eid
        export_url = f"/api/v10/parts/d/{did}/w/{wid}/e/{eid}/partid/{part_id}/parasolid?version=0"
        # First call to get the redirect URL
        initial_resp = client.api_client.request("GET", url="https://cad.onshape.com" + export_url, headers={'Accept': 'application/vnd.onshape.v1+json'}, body={})
        redirect_url = initial_resp.headers.get('Location')
        if redirect_url:
            # Return the redirect URL to the client
            return jsonify({"redirect_url": redirect_url}), 200
        else:
            return jsonify({"error": "No redirect URL found for CAD download"}), 500
    except Exception as e:
        return jsonify({"error": f"Failed to get CAD download URL: {str(e)}"}), 500

# ** Global Admin Endpoints **
@app.route('/api/admin/get_bom', methods=['GET'])
@jwt_required()
def admin_get_bom():
    """
    (Admin only) Fetch the BOM data for a specified team and system.
    If system="Main", returns all parts for the team (all robots & systems combined).
    If a specific system is provided, returns all parts in that system across all robots of the team.
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    if not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    team_number = request.args.get('team_number')
    system = request.args.get('system', 'Main')
    if not team_number:
        return jsonify({"error": "Team number is required"}), 400

    # Fetch BOM data from database for specified team and system
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    combined_parts = []
    if system == "Main":
        systems = System.query.filter_by(team_id=team.id).all()
        for sys_record in systems:
            if sys_record.bom_data:
                combined_parts.extend(sys_record.bom_data)
    else:
        systems = System.query.filter_by(team_id=team.id, system_name=system).all()
        for sys_record in systems:
            if sys_record.bom_data:
                combined_parts.extend(sys_record.bom_data)
    return jsonify({"bom_data": combined_parts}), 200

@app.route('/api/admin/download_bom_dict', methods=['GET'])
@jwt_required()
def download_bom_dict():
    """
    (Admin only) Download the entire BOM data dictionary for all teams.
    Returns a JSON structure with data for all teams, robots, and systems.
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    if not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    all_bom_data = {}
    teams = Team.query.all()
    for team in teams:
        systems = System.query.filter_by(team_id=team.id).all()
        team_bom = {}
        for sys_record in systems:
            robot = sys_record.robot_name
            if robot not in team_bom:
                team_bom[robot] = {}
            team_bom[robot][sys_record.system_name] = sys_record.bom_data or []
        all_bom_data[team.team_number] = team_bom
    return jsonify({"bom_data_dict": all_bom_data}), 200

@app.route('/api/admin/download_settings_dict', methods=['GET'])
@jwt_required()
def download_settings_dict():
    """
    (Admin only) Download the entire settings data dictionary for all teams.
    Returns a JSON structure containing settings (access keys, etc.) for all teams.
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    if not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    all_settings_data = {}
    teams = Team.query.all()
    for team in teams:
        team_records = System.query.filter_by(team_id=team.id).all()
        team_settings = {}
        for sys in team_records:
            if team_settings.get(sys.robot_name) is None:
                team_settings[sys.robot_name] = {}
            team_settings[sys.robot_name][sys.system_name] = {
                "accessKey": sys.access_key or "",
                "secretKey": sys.secret_key or "",
                "documentURL": sys.document_url or ""
            }
        all_settings_data[team.team_number] = team_settings
    return jsonify({"settings_data_dict": all_settings_data}), 200

@app.route('/api/admin/download_teams_db', methods=['GET'])
@jwt_required()
def download_teams_db():
    """
    (Admin only) **Deprecated**: Downloading the raw database is not supported when using a remote PostgreSQL.
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    if not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    # Not supported in PostgreSQL setup
    return jsonify({"error": "Downloading the database file is not supported for the current setup."}), 400

@app.route('/api/admin/upload_bom_dict', methods=['POST'])
@jwt_required()
def upload_bom_dict():
    """
    (Admin only) Upload a full BOM data dictionary to restore/merge data for multiple teams.
    Expects JSON payload with "bom_data_dict" containing the dictionary structure.
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    if not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    bom_data_dict = data.get('bom_data_dict')
    if not bom_data_dict or not isinstance(bom_data_dict, dict):
        return jsonify({"error": "Invalid or missing BOM data"}), 400

    # Update each team's BOM data in database with provided data
    for team_number, team_bom in bom_data_dict.items():
        if not isinstance(team_bom, dict):
            continue
        team = Team.query.filter_by(team_number=team_number).first()
        if not team:
            continue
        # Remove existing BOM data for this team
        System.query.filter_by(team_id=team.id).delete()
        for robot_name, systems in team_bom.items():
            if not isinstance(systems, dict):
                continue
            for system_name, parts_list in systems.items():
                if not isinstance(parts_list, list):
                    parts_list = []
                new_system = System(team_id=team.id, robot_name=robot_name, system_name=system_name, bom_data=parts_list)
                db.session.add(new_system)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to upload BOM data: {str(e)}"}), 500
    return jsonify({"message": "BOM data uploaded successfully"}), 200

@app.route('/api/admin/upload_settings_dict', methods=['POST'])
@jwt_required()
def upload_settings_dict():
    """
    (Admin only) Upload a full Settings data dictionary to restore data for multiple teams.
    Expects JSON payload with "settings_data_dict" containing the dictionary structure.
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    if not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    settings_data_dict = data.get('settings_data_dict')
    if not settings_data_dict or not isinstance(settings_data_dict, dict):
        return jsonify({"error": "Invalid or missing Settings data"}), 400

    for team_number, team_settings in settings_data_dict.items():
        if not isinstance(team_settings, dict):
            continue
        team = Team.query.filter_by(team_number=team_number).first()
        if not team:
            continue
        # If provided settings in flat format (no robot/system nesting), skip
        if any(k in team_settings for k in ["accessKey", "secretKey", "documentURL"]):
            continue
        # Remove existing system credentials for this team to replace with provided data
        System.query.filter_by(team_id=team.id).delete()
        for robot_name, systems in team_settings.items():
            if not isinstance(systems, dict):
                continue
            for system_name, creds in systems.items():
                if not isinstance(creds, dict):
                    continue
                access_key = creds.get("accessKey")
                secret_key = creds.get("secretKey")
                document_url = creds.get("documentURL")
                if not access_key or not secret_key or not document_url:
                    continue
                new_record = System(team_id=team.id, robot_name=robot_name, system_name=system_name,
                                     access_key=access_key, secret_key=secret_key, document_url=document_url)
                db.session.add(new_record)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to upload settings data: {str(e)}"}), 500
    return jsonify({"message": "Settings data uploaded successfully"}), 200

@app.route('/api/admin/upload_teams_db', methods=['POST'])
@jwt_required()
def upload_teams_db():
    """
    (Admin only) **Deprecated**: Uploading the raw teams database is not supported for remote DB.
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    if not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    return jsonify({"error": "Uploading the teams.db file is not supported in this configuration."}), 400

@app.route('/api/clear_bom', methods=['POST'])
@jwt_required()
def clear_bom():
    """
    Clear all BOM data for a given team (removes all robot entries).
    Only team admins or global admin can perform this.
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    data = request.get_json()
    team_number = data.get('team_number')
    if not team_number:
        return jsonify({"error": "Team number is required"}), 400

    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    # Remove all robot BOM data for the team from database
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    System.query.filter_by(team_id=team.id).delete()
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to clear BOM data: {str(e)}"}), 500

    return jsonify({"message": f"BOM data for team '{team_number}' cleared successfully"}), 200

@app.route('/api/system_settings', methods=['GET', 'POST'])
@jwt_required()
def system_settings():
    """GET or POST system-level Onshape credentials and document URL (admin only)."""
    current_user = get_jwt_identity()
    claims = get_jwt()

    # Admins only
    if not claims.get('is_team_admin') and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    if request.method == 'GET':
        team_number = request.args.get("team_number")
        robot_name = request.args.get("robot_name")
        system_name = request.args.get("system_name")
        if not all([team_number, robot_name, system_name]):
            return jsonify({"error": "Missing team_number, robot_name, or system_name"}), 400

        team = Team.query.filter_by(team_number=team_number).first()
        if not team:
            return jsonify({"error": "Team not found"}), 404

        system = System.query.filter_by(team_id=team.id, robot_name=robot_name, system_name=system_name).first()
        if not system:
            return jsonify({})  # Return empty settings if not configured yet

        return jsonify({
            "access_key": system.access_key or "",
            "secret_key": system.secret_key or "",
            "document_url": system.document_url or ""
        }), 200

    elif request.method == 'POST':
        data = request.get_json()
        team_number = data.get("team_number")
        robot_name = data.get("robot_name")
        system_name = data.get("system_name")
        access_key = data.get("access_key")
        secret_key = data.get("secret_key")
        document_url = data.get("document_url")

        if not all([team_number, robot_name, system_name]):
            return jsonify({"error": "Missing fields"}), 400

        team = Team.query.filter_by(team_number=team_number).first()
        if not team:
            return jsonify({"error": "Team not found"}), 404

        system = System.query.filter_by(team_id=team.id, robot_name=robot_name, system_name=system_name).first()
        if not system:
            system = System(team_id=team.id, robot_name=robot_name, system_name=system_name, bom_data=[])
            db.session.add(system)

        system.access_key = access_key
        system.secret_key = secret_key
        system.document_url = document_url

        try:
            db.session.commit()
            return jsonify({"message": "System settings updated"}), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": f"Failed to save: {str(e)}"}), 500

# SocketIO event handlers (for future real-time features, if any)
@socketio.on('connect')
def handle_connect():
    app.logger.info('Client connected via SocketIO')

@socketio.on('disconnect')
def handle_disconnect():
    app.logger.info('Client disconnected')

if __name__ == '__main__':
    # Run the Flask development server (for production, use a WSGI server or socketio.run if using WebSocket features)
    app.run(host='0.0.0.0', port=5000)
