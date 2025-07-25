import os
import json
from flask import Flask, request, jsonify, send_file, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity, get_jwt, jwt_required
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from sqlalchemy import JSON  # Use JSON type for PostgreSQL (stores as JSON, falls back to text on SQLite)

# Initialize Flask app and configuration
app = Flask(__name__)
# Configure the database URI (use environment variable for Railway PostgreSQL, fallback to SQLite for local dev)
db_uri = os.getenv('DATABASE_URL')
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

# Define data models for Team, Robot, and System
class Team(db.Model):
    """Database model for a team account, including Onshape settings."""
    id = db.Column(db.Integer, primary_key=True)
    team_number = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)       # Hashed user password
    adminPassword = db.Column(db.String(200), nullable=False)  # Hashed admin password
    # New fields for Onshape API credentials and document URL
    access_key = db.Column(db.String(200))
    secret_key = db.Column(db.String(200))
    document_url = db.Column(db.String(500))
    # Relationships
    robots = db.relationship('Robot', backref='team', cascade='all, delete-orphan', lazy=True)

class Robot(db.Model):
    """Database model for a robot, belonging to a Team and having multiple systems."""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=False)
    # Ensure a team cannot have two robots with the same name
    __table_args__ = (db.UniqueConstraint('team_id', 'name', name='uq_robot_name_per_team'),)
    # Relationship to systems
    systems = db.relationship('System', backref='robot', cascade='all, delete-orphan', lazy=True)

class System(db.Model):
    """Database model for a system (subsection of a robot) with BOM data stored as JSON."""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    robot_id = db.Column(db.Integer, db.ForeignKey('robot.id'), nullable=False)
    # BOM data for this system, stored as JSON (list of parts dictionaries)
    bom_data = db.Column(JSON, nullable=False)

# Create database tables (for new models Robot and System, and any new Team columns)
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
    """Serve the team admin dashboard for a given team (admin view)."""
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
    # No file-based bom.json or settings.json needed, data will be stored in DB
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
    system_name = data.get('system')
    bom_data = data.get('bom_data')
    if not all([team_number, robot_name, system_name, bom_data is not None]):
        return jsonify({"error": "Missing required fields"}), 400

    # Authorization: only that team's admin or global admin can save BOM data
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    # Get the team and find or create the specified robot and system
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": f"Team '{team_number}' not found"}), 404
    # Find or create robot
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    if robot is None:
        robot = Robot(name=robot_name, team_id=team.id)
        db.session.add(robot)
        db.session.flush()  # ensure robot.id is generated for linking systems
    # Find or create system within that robot
    system = System.query.filter_by(robot_id=robot.id, name=system_name).first()
    if system is None:
        system = System(name=system_name, bom_data=bom_data, robot=robot)
        db.session.add(system)
    else:
        system.bom_data = bom_data
    db.session.commit()
    return jsonify({"message": f"BOM data saved for robot '{robot_name}', system '{system_name}'"}), 200

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

    # Authorization: only that team's admin or global admin can create new robots
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404
    # Check if robot name already exists for this team
    existing_robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    if existing_robot:
        return jsonify({"error": "Robot name already exists"}), 400

    # Create new Robot with default systems (Main and System1-5, all with empty BOM lists)
    new_robot = Robot(name=robot_name, team_id=team.id)
    db.session.add(new_robot)
    db.session.flush()  # get new_robot.id
    default_systems = ["Main", "System1", "System2", "System3", "System4", "System5"]
    for sys_name in default_systems:
        sys = System(name=sys_name, bom_data=[], robot=new_robot)
        db.session.add(sys)
    db.session.commit()
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

    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"robots": []}), 200  # return empty list if team not found
    robots = [robot.name for robot in team.robots]
    return jsonify({"robots": robots}), 200

@app.route('/api/get_bom', methods=['GET'])
@jwt_required()
def get_bom():
    """Retrieve BOM data for a specific team, robot, and system (team members or admin only)."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    team_number = request.args.get('team_number')
    robot_name = request.args.get('robot')
    system_name = request.args.get('system', 'Main')
    if not team_number or not robot_name:
        return jsonify({"error": "Team number and robot name are required"}), 400

    # Authorization: user must belong to the team or be global admin
    if current_user != team_number and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"bom_data": []}), 200  # team not found, return empty BOM
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    if not robot:
        return jsonify({"bom_data": []}), 200  # robot not found, return empty list
    # Find the specific system's BOM data
    system = System.query.filter_by(robot_id=robot.id, name=system_name).first()
    if not system:
        return jsonify({"bom_data": []}), 200
    return jsonify({"bom_data": system.bom_data or []}), 200

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

    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": f"Team '{team_number}' not found"}), 404
    robot = Robot.query.filter_by(team_id=team.id, name=old_name).first()
    if not robot:
        return jsonify({"error": f"Robot '{old_name}' does not exist"}), 404
    # Ensure new_name isn't already taken
    existing_robot = Robot.query.filter_by(team_id=team.id, name=new_name).first()
    if existing_robot:
        return jsonify({"error": f"Robot '{new_name}' already exists"}), 400

    robot.name = new_name
    db.session.commit()
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

    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": f"Team '{team_number}' not found"}), 404
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    if not robot:
        return jsonify({"error": f"Robot '{robot_name}' not found"}), 404

    # Delete the robot and cascade delete its systems
    db.session.delete(robot)
    db.session.commit()
    return jsonify({"message": f"Robot '{robot_name}' deleted successfully"}), 200

# Onshape integration helper functions
def findIDs(bom_dict: dict, name: str):
    """Find the ID of a column in Onshape BOM JSON by name."""
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
        # Determine display values for material fields
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
            part_desc,
            int(quantity) if isinstance(quantity, (int, str)) and str(quantity).isdigit() else quantity,
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
    robot_name = data.get("robot", "Robot1")
    system_name = data.get("system", "Main")
    access_key = data.get("access_key")
    secret_key = data.get("secret_key")

    if not document_url or not team_number or not access_key or not secret_key:
        return jsonify({"error": "Document URL, team_number, access_key, and secret_key are required"}), 400

    # Authorization: only that team's admin or global admin can fetch BOM (requires keys)
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    # Save the Onshape API keys and document URL in the team's database record for future use
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": f"Team '{team_number}' not found"}), 404
    team.access_key = access_key
    team.secret_key = secret_key
    team.document_url = document_url
    db.session.commit()  # commit keys immediately so they are saved even if fetch fails

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

    # Save the fetched BOM data under the specified team/robot/system in the database
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    if robot is None:
        robot = Robot(name=robot_name, team_id=team.id)
        db.session.add(robot)
        db.session.flush()
    system = System.query.filter_by(robot_id=robot.id, name=system_name).first()
    if system is None:
        system = System(name=system_name, bom_data=bom_data_list, robot=robot)
        db.session.add(system)
    else:
        system.bom_data = bom_data_list
    db.session.commit()

    return jsonify({"bom_data": bom_data_list}), 200

@app.route("/api/download_cad", methods=["POST"])
@jwt_required()
def download_cad():
    """
    Provide a redirect URL to download a Parasolid CAD file for a specific part from Onshape.
    Payload: {"team_number": "...", "id": partId}
    Returns a JSON with a redirect_url for the part's Parasolid file (if available).
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

    # Load saved Onshape API credentials for the team from the database
    team = Team.query.filter_by(team_number=team_number).first()
    if not team or not team.access_key or not team.secret_key or not team.document_url:
        return jsonify({"error": "Onshape API keys or document URL not configured for this team"}), 400

    access_key = team.access_key
    secret_key = team.secret_key
    document_url = team.document_url

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
    system_name = request.args.get('system', 'Main')
    if not team_number:
        return jsonify({"error": "Team number is required"}), 400

    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        # If team not found, return empty list
        return jsonify({"bom_data": []}), 200

    combined_parts = []
    if system_name == "Main":
        # All parts from all systems of all robots
        for robot in team.robots:
            for sys in robot.systems:
                # sys.bom_data might be None if not set; ensure it's a list
                if sys.bom_data:
                    combined_parts.extend(sys.bom_data)
    else:
        # All parts from the specified system across all robots
        for robot in team.robots:
            for sys in robot.systems:
                if sys.name == system_name and sys.bom_data:
                    combined_parts.extend(sys.bom_data)
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
    # Iterate through all teams and collect BOM data from the database
    teams = Team.query.all()
    for team in teams:
        team_bom = {}
        for robot in team.robots:
            robot_data = {}
            for sys in robot.systems:
                robot_data[sys.name] = sys.bom_data or []
            team_bom[robot.name] = robot_data
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
        team_settings = {}
        if team.access_key:
            team_settings["accessKey"] = team.access_key
        if team.secret_key:
            team_settings["secretKey"] = team.secret_key
        if team.document_url:
            team_settings["documentURL"] = team.document_url
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

    # Update each team's BOM data in the database
    for team_number, team_bom in bom_data_dict.items():
        if not isinstance(team_bom, dict):
            continue
        team = Team.query.filter_by(team_number=team_number).first()
        if not team:
            continue  # skip teams not found in DB
        # Remove existing robots (and their systems) for this team
        for robot in team.robots:
            db.session.delete(robot)
        # Add robots and systems from the input data
        for robot_name, systems_dict in team_bom.items():
            if not isinstance(systems_dict, dict):
                continue
            robot = Robot(name=robot_name, team_id=team.id)
            db.session.add(robot)
            db.session.flush()
            for sys_name, parts_list in systems_dict.items():
                if not isinstance(parts_list, list):
                    parts_list = []  # ensure it's a list
                sys = System(name=sys_name, bom_data=parts_list, robot=robot)
                db.session.add(sys)
    db.session.commit()
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
        # Update team's Onshape API keys and document URL if provided
        if "accessKey" in team_settings:
            team.access_key = team_settings["accessKey"]
        if "secretKey" in team_settings:
            team.secret_key = team_settings["secretKey"]
        if "documentURL" in team_settings:
            team.document_url = team_settings["documentURL"]
    db.session.commit()
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

    team = Team.query.filter_by(team_number=team_number).first()
    if team:
        # Delete all robots (and cascaded systems) for this team
        for robot in team.robots:
            db.session.delete(robot)
        db.session.commit()
    return jsonify({"message": f"BOM data for team '{team_number}' cleared successfully"}), 200

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
