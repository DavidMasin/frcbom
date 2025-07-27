# app.py
import os
import requests
import time
import json as jsonlib
from flask import Flask, request, jsonify, send_file, render_template, redirect, url_for, flash, session
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity, get_jwt, jwt_required
from flask_cors import CORS
from onshape_client.client import Client
from onshape_client.onshape_url import OnshapeElement
from werkzeug.utils import secure_filename
from models import db, User, Team, Robot, System, Machine  # Using the new models
from flask_migrate import Migrate

# --- Configuration ---
# Use the new, simpler User/Team auth model alongside JWT for API
SECRET_KEY = os.environ.get('SECRET_KEY', 'a-secure-default-secret-key')
UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'svg'}

app = Flask(__name__)
db_uri = os.getenv("DATABASE_URL")
if db_uri and db_uri.startswith("postgres://"):
    db_uri = db_uri.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = db_uri or 'sqlite:///instance/teams.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'super-secure-jwt-key-for-api')
app.config['SECRET_KEY'] = SECRET_KEY
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# --- Initialize Extensions ---
db.init_app(app)
migrate = Migrate(app, db)
jwt = JWTManager(app)
CORS(app, resources={r"/api/*": {"origins": "*"}})


# --- Helper Functions ---
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def is_team_admin():
    """Check if the logged-in user is a team admin for web routes."""
    return 'role' in session and session['role'] == 'teamAdmin'


# --- Web Page Routes (Old and New) ---

@app.route('/')
def index():
    # Redirect to dashboard if logged in, otherwise show index
    if 'user_id' in session:
        return redirect(url_for('teamAdmin_dashboard'))
    return render_template('index.html')


@app.route('/logout')
def logout():
    session.clear()
    flash('You have been logged out.', 'success')
    return redirect(url_for('index'))


# --- NEW TEAM ADMIN DASHBOARD (Replaces old admin pages) ---

@app.route('/team/dashboard')
def teamAdmin_dashboard():
    if not is_team_admin():
        flash('You must be logged in as a Team Admin to view this page.', 'danger')
        return redirect(url_for('index'))

    team_id = session.get('team_id')
    team = Team.query.get_or_404(team_id)
    # Pass team to the base template context
    return render_template('teamAdmin_dashboard.html', team=team, robots=team.robots)


@app.route('/team/robot/new', methods=['GET', 'POST'])
def new_robot():
    if not is_team_admin():
        return redirect(url_for('index'))

    team_id = session.get('team_id')
    team = Team.query.get_or_404(team_id)

    if request.method == 'POST':
        name = request.form.get('name')
        year = request.form.get('year')
        image_file = request.files.get('image_file')

        if not name or not year:
            flash('Robot name and year are required.', 'danger')
            return render_template('new_robot.html', team=team)

        robot = Robot(name=name, year=year, team_id=team_id)

        if image_file and allowed_file(image_file.filename):
            filename = secure_filename(f"robot_{name}_{year}_{image_file.filename}")
            image_path = os.path.join(app.config['UPLOAD_FOLDER'], 'robot_images', filename)
            image_file.save(image_path)
            robot.image_file = filename

        db.session.add(robot)
        db.session.commit()

        flash(f'Robot "{name}" created successfully!', 'success')
        return redirect(url_for('teamAdmin_dashboard'))

    return render_template('new_robot.html', team=team)


@app.route('/team/robot/<int:robot_id>')
def robot_detail(robot_id):
    if not is_team_admin():
        return redirect(url_for('index'))

    robot = Robot.query.get_or_404(robot_id)
    team = Team.query.get_or_404(session.get('team_id'))
    if robot.team_id != session.get('team_id'):
        flash('Unauthorized access.', 'danger')
        return redirect(url_for('teamAdmin_dashboard'))

    return render_template('robot_detail.html', robot=robot, team=team)


@app.route('/team/robot/<int:robot_id>/add_system', methods=['POST'])
def add_system(robot_id):
    if not is_team_admin():
        return jsonify({'error': 'Unauthorized'}), 403

    robot = Robot.query.get_or_404(robot_id)
    if robot.team_id != session.get('team_id'):
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.form
    system_name = data.get('name')
    assembly_url = data.get('assembly_url')
    access_key = data.get('onshape_access_key')
    secret_key = data.get('onshape_secret_key')
    part_studio_urls = request.form.getlist('part_studio_urls[]')

    if not all([system_name, assembly_url, access_key, secret_key, part_studio_urls]):
        flash('All fields are required to add a system.', 'danger')
        return redirect(url_for('robot_detail', robot_id=robot_id))

    new_system = System(
        name=system_name,
        assembly_url=assembly_url,
        part_studio_urls=part_studio_urls,
        onshape_access_key=access_key,
        onshape_secret_key=secret_key,
        robot_id=robot.id
    )
    db.session.add(new_system)
    db.session.commit()

    flash(f'System "{system_name}" added to {robot.name}.', 'success')
    return redirect(url_for('robot_detail', robot_id=robot_id))


@app.route('/team/robot/<int:robot_id>/delete', methods=['POST'])
def delete_robot(robot_id):
    if not is_team_admin():
        return redirect(url_for('index'))

    robot = Robot.query.get_or_404(robot_id)
    if robot.team_id != session.get('team_id'):
        flash('Unauthorized access.', 'danger')
        return redirect(url_for('teamAdmin_dashboard'))

    if robot.image_file and robot.image_file != 'default_robot.png':
        try:
            os.remove(os.path.join(app.config['UPLOAD_FOLDER'], 'robot_images', robot.image_file))
        except OSError:
            pass

    db.session.delete(robot)
    db.session.commit()
    flash(f'Robot "{robot.name}" has been deleted.', 'success')
    return redirect(url_for('teamAdmin_dashboard'))


@app.route('/team/machines')
def manage_machines():
    if not is_team_admin():
        return redirect(url_for('index'))

    team_id = session.get('team_id')
    team = Team.query.get_or_404(team_id)
    machines = Machine.query.filter_by(team_id=team_id).all()
    return render_template('manage_machines.html', machines=machines, team=team)


@app.route('/team/machine/add', methods=['POST'])
def add_machine_web():  # Renamed to avoid conflict with API endpoint
    if not is_team_admin():
        return redirect(url_for('index'))

    name = request.form.get('name')
    output_format = request.form.get('output_format')
    icon_file = request.files.get('icon_file')
    team_id = session.get('team_id')

    if not name or not output_format:
        flash('Machine name and output format are required.', 'danger')
        return redirect(url_for('manage_machines'))

    machine = Machine(name=name, output_format=output_format, team_id=team_id)

    if icon_file and allowed_file(icon_file.filename):
        filename = secure_filename(f"machine_{name}_{icon_file.filename}")
        icon_file.save(os.path.join(app.config['UPLOAD_FOLDER'], 'machine_icons', filename))
        machine.icon_file = filename

    db.session.add(machine)
    db.session.commit()
    flash(f'Machine "{name}" added successfully!', 'success')
    return redirect(url_for('manage_machines'))


@app.route('/team/machine/<int:machine_id>/delete', methods=['POST'])
def delete_machine_web(machine_id):  # Renamed to avoid conflict
    if not is_team_admin():
        return redirect(url_for('index'))

    machine = Machine.query.get_or_404(machine_id)
    if machine.team_id != session.get('team_id'):
        flash('Unauthorized access.', 'danger')
        return redirect(url_for('manage_machines'))

    if machine.icon_file and machine.icon_file != 'default_machine.png':
        try:
            os.remove(os.path.join(app.config['UPLOAD_FOLDER'], 'machine_icons', machine.icon_file))
        except OSError:
            pass

    db.session.delete(machine)
    db.session.commit()
    flash(f'Machine "{machine.name}" has been deleted.', 'success')
    return redirect(url_for('manage_machines'))


@app.route('/system/<int:system_id>')
def system_detail(system_id):
    if not is_team_admin():
        return redirect(url_for('index'))

    system = System.query.get_or_404(system_id)
    team = Team.query.get_or_404(session.get('team_id'))

    if system.robot.team_id != session.get('team_id'):
        flash('Unauthorized access.', 'danger')
        return redirect(url_for('teamAdmin_dashboard'))

    return render_template('system_detail.html', system=system, team=team)


# --- ORIGINAL API ENDPOINTS (RESTORED AND INTEGRATED) ---

@app.route('/api/register', methods=['POST'])
def register_api():
    data = request.get_json()
    team_name = data.get('team_name')
    team_number = data.get('team_number')
    username = data.get('username')
    password = data.get('password')

    if not all([team_name, team_number, username, password]):
        return jsonify({"msg": "Missing required fields"}), 400

    if Team.query.filter_by(team_number=team_number).first() or User.query.filter_by(username=username).first():
        return jsonify({"msg": "Team number or username already exists"}), 409

    new_team = Team(name=team_name, team_number=team_number)
    db.session.add(new_team)
    db.session.flush()

    new_user = User(username=username, team_id=new_team.id, role='teamAdmin')
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()
    return jsonify({"msg": "Team and admin user created successfully"}), 201


@app.route('/api/login', methods=['POST'])
def login_api():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    user = User.query.filter_by(username=username).first()

    if user and user.check_password(password):
        # Create token with user's role and team_id in claims
        access_token = create_access_token(
            identity=user.username,
            additional_claims={'role': user.role, 'team_id': user.team_id}
        )
        # Also set session for web routes
        session['user_id'] = user.id
        session['role'] = user.role
        session['team_id'] = user.team_id
        return jsonify(access_token=access_token)

    return jsonify({"msg": "Bad username or password"}), 401


@app.route('/api/bom', methods=['POST'])
@jwt_required()
def fetch_bom():
    """
    Fetch the Bill of Materials from Onshape for a given assembly URL.
    This is a protected endpoint requiring a valid JWT.
    """
    claims = get_jwt()
    if claims.get('role') not in ['teamAdmin', 'admin']:
        return jsonify({"error": "Admin access required"}), 403

    data = request.get_json()
    document_url = data.get("document_url")
    access_key = data.get("access_key")
    secret_key = data.get("secret_key")

    if not all([document_url, access_key, secret_key]):
        return jsonify({"error": "document_url, access_key, and secret_key are required"}), 400

    try:
        element = OnshapeElement(document_url)
        client = Client(
            configuration={"base_url": "https://cad.onshape.com", "access_key": access_key, "secret_key": secret_key})

        bom_url = f"/api/assemblies/d/{element.did}/w/{element.wvmid}/e/{element.eid}/bom"
        headers = {'Accept': 'application/vnd.onshape.v1+json', 'Content-Type': 'application/json'}
        response = client.api_client.request('GET', url=client.configuration.base_url + bom_url,
                                             query_params={"indented": False}, headers=headers)

        bom_json = jsonlib.loads(response.data)

        # Parsing logic from your original file
        def find_id_by_name(bom_dict, name):
            for header in bom_dict.get("headers", []):
                if header.get('name') == name:
                    return header.get('id')
            return None

        part_name_id = find_id_by_name(bom_json, "Name")
        desc_id = find_id_by_name(bom_json, "Description")
        qty_id = find_id_by_name(bom_json, "Quantity") or find_id_by_name(bom_json, "QTY")
        material_id = find_id_by_name(bom_json, "Material")
        material_bom_id = find_id_by_name(bom_json, "Bom Material") or material_id
        preproc_id = find_id_by_name(bom_json, "Pre Process")
        proc1_id = find_id_by_name(bom_json, "Process 1")
        proc2_id = find_id_by_name(bom_json, "Process 2")

        bom_data_list = []
        for row in bom_json.get("rows", []):
            values = row.get("headerIdToValue", {})
            part_entry = {
                "Part Name": values.get(part_name_id, "Unknown"),
                "Description": values.get(desc_id, "Unknown"),
                "Quantity": values.get(qty_id, "N/A"),
                "Material": values.get(material_id, "Unknown"),
                "materialBOM": values.get(material_bom_id, "Unknown"),
                "Pre Process": values.get(preproc_id, "Unknown"),
                "Process 1": values.get(proc1_id, "Unknown"),
                "Process 2": values.get(proc2_id, "Unknown"),
                "partId": row.get("itemSource", {}).get("partId", "")
            }
            if isinstance(part_entry["Material"], dict):
                part_entry["Material"] = part_entry["Material"].get("displayName", "Unknown")
            if isinstance(part_entry["materialBOM"], dict):
                part_entry["materialBOM"] = part_entry["materialBOM"].get("displayName", "Unknown")
            bom_data_list.append(part_entry)

        return jsonify({"bom_data": bom_data_list}), 200

    except Exception as e:
        return jsonify({"error": f"Failed to fetch or process BOM from Onshape: {str(e)}"}), 500


@app.route("/api/download_cad", methods=["POST"])
@jwt_required()
def download_cad_api():
    """
    Generate a downloadable CAD file for a specific part from Onshape.
    This is the full, original implementation.
    """
    claims = get_jwt()
    if claims.get('role') not in ['teamAdmin', 'admin']:
        return jsonify({"error": "Admin access required"}), 403

    data = request.get_json()
    system_id = data.get("system_id")
    part_id = data.get("partId")
    file_format = data.get("format", "STEP").upper()

    if not all([system_id, part_id]):
        return jsonify({"error": "system_id and partId are required"}), 400

    system = System.query.get(system_id)
    if not system:
        return jsonify({"error": "System not found"}), 404

    if system.robot.team_id != claims.get('team_id'):
        return jsonify({"error": "Unauthorized to access this system"}), 403

    if not all([system.onshape_access_key, system.onshape_secret_key, system.assembly_url]):
        return jsonify({"error": "Onshape API credentials or assembly URL not configured for this system"}), 400

    try:
        element = OnshapeElement(system.assembly_url)
        did = element.did
        wid = element.wvmid
        eid = element.eid

        # Request Onshape to generate the translation
        client = Client(configuration={"base_url": "https://cad.onshape.com", "access_key": system.onshape_access_key,
                                       "secret_key": system.onshape_secret_key})

        # Note: The original code used /api/partstudios/... for translation, which might be incorrect for assembly parts.
        # A more robust URL would be /api/documents/d/{did}/... but we will stick to the original for now.
        # Let's assume the part is in a part studio within the same document context.
        # A better approach would be to find the element ID of the part first.
        # For now, we use the assembly eid, which may or may not work depending on part origin.

        translation_payload = {
            "formatName": file_format,
            "partIds": part_id,
            "storeInDocument": False,
            "linkDocumentId": did,  # This might be needed
        }

        # The endpoint depends on whether it's a part studio or assembly
        # Let's try part studio first as in the original code
        url = f"/api/partstudios/d/{did}/w/{wid}/e/{eid}/translations"

        response = client.api_client.request(
            'POST',
            url=client.configuration.base_url + url,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            body=translation_payload
        )

        if response.status != 200:
            # If part studio fails, try assembly endpoint
            url = f"/api/assemblies/d/{did}/w/{wid}/e/{eid}/translations"
            response = client.api_client.request(
                'POST',
                url=client.configuration.base_url + url,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                body=translation_payload
            )
            if response.status != 200:
                return jsonify({
                                   "error": f"Failed to initiate Onshape translation. Status: {response.status}. Body: {response.data}"}), 500

        translation_id = jsonlib.loads(response.data).get("id")
        if not translation_id:
            return jsonify({"error": "Onshape translation did not return an ID"}), 500

        # Poll for translation completion
        download_url = None
        for _ in range(30):  # 30 attempts, ~15 seconds
            status_resp = client.api_client.request('GET',
                                                    url=f"https://cad.onshape.com/api/translations/{translation_id}",
                                                    headers={"Accept": "application/json"})
            status = jsonlib.loads(status_resp.data)
            if status.get("requestState") == "DONE":
                ids = status.get("resultExternalDataIds")
                if ids:
                    # This is a temporary, pre-signed URL from Onshape
                    download_url = f"https://cad.onshape.com/api/documents/d/{did}/externaldata/{ids[0]}"
                break
            elif status.get("requestState") == "FAILED":
                return jsonify({"error": "Onshape translation failed", "details": status.get('failureReason')}), 500
            time.sleep(0.5)

        if not download_url:
            return jsonify({"error": "CAD export timed out"}), 504

        # Onshape returns a redirect to the actual file. We need to follow it.
        final_response = requests.get(download_url, auth=client.api_client.auth, allow_redirects=True)

        if final_response.status_code == 200:
            return jsonify({"download_url": final_response.url}), 200
        else:
            return jsonify({"error": "Failed to retrieve final download link from Onshape"}), 500

    except Exception as e:
        return jsonify({"error": f"An error occurred during CAD download: {str(e)}"}), 500


# --- Main Execution ---
if __name__ == '__main__':
    # Create upload directories if they don't exist
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'robot_images'), exist_ok=True)
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'machine_icons'), exist_ok=True)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5001)), debug=True)

