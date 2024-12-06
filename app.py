import json
import os
import zipfile
from io import BytesIO

from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity, jwt_required
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy
from onshape_client.client import Client
from onshape_client.onshape_url import OnshapeElement
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///teams.db'
app.config['JWT_SECRET_KEY'] = 'ysm201996'  # Update this with a secure key

db = SQLAlchemy(app)
jwt = JWTManager(app)
CORS(app, resources={"/*": {"origins": ["*"]}},
     supports_credentials=True,
     methods=["GET", "POST", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization", "X-Requested-With"])
socketio = SocketIO(app, cors_allowed_origins="*")

bom_data_dict = {}
bom_data_file = 'bom_data.json'
settings_data_dict = {}
settings_data_file = 'settings_data.json'

# Updated: Now we have a User model with roles
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    team_number = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(50), nullable=False)  # 'admin' or 'user'
    password = db.Column(db.String(200), nullable=False)

with app.app_context():
    db.create_all()

access_key = ""
secret_key = ""
base_url = 'https://cad.onshape.com'
client = Client(configuration={"base_url": base_url, "access_key": access_key, "secret_key": secret_key})


@app.route('/')
def home():
    return render_template("index.html")


@app.route('/<team_number>')
def team_base(team_number):
    # If team number is provided without robot, redirect to default robot
    # Check if default robot is set for this team
    default_robot = settings_data_dict.get(team_number, {}).get("default_robot")
    if default_robot:
        return render_template('dashboard.html', team_number=team_number, robot_name=default_robot, system='Main')
    else:
        # if no default robot, just show dashboard.html which will handle robot selection
        return render_template('dashboard.html', team_number=team_number)


@app.route('/<team_number>/<robot_name>')
def team_dashboard(team_number, robot_name):
    return render_template('dashboard.html', team_number=team_number, robot_name=robot_name, system='Main')


@app.route('/<team_number>/<robot_name>/<system>')
def team_bom_filtered(team_number, robot_name, system):
    return render_template('dashboard.html', team_number=team_number, robot_name=robot_name, filter_system=system)


@app.route('/register')
def register_function():
    return render_template('register.html')


@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    team_number = data['team_number']
    password = data['password']

    # Check if team admin already exists
    existing_admin = User.query.filter_by(team_number=team_number, role='admin').first()
    if existing_admin:
        return jsonify({"error": "Team already exists"}), 400

    # Hash the password
    hashed_password = generate_password_hash(password)

    # Create admin and user accounts for the team
    new_admin = User(team_number=team_number, role='admin', password=hashed_password)
    new_user = User(team_number=team_number, role='user', password=hashed_password)
    db.session.add(new_admin)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": "Registered"}), 200


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    team_number = data['team_number']
    password = data['password']
    role = data.get('role', 'user')  # default to user if not specified

    user = User.query.filter_by(team_number=team_number, role=role).first()
    if not user:
        return jsonify({"error": "Invalid credentials"}), 401

    # Verify the password
    if not check_password_hash(user.password, password):
        return jsonify({"error": "Invalid credentials"}), 401

    # Generate a JWT token
    identity = {"team_number": team_number, "role": role}
    access_token = create_access_token(identity=identity)
    return jsonify(access_token=access_token, team_number=team_number, role=role), 200


@app.route('/api/team_exists', methods=['GET'])
def team_exists():
    team_number = request.args.get('team_number')
    if not team_number:
        return jsonify({"error": "Team number is required"}), 400

    team = User.query.filter_by(team_number=team_number, role='admin').first()
    if team:
        return jsonify({"exists": True}), 200
    else:
        return jsonify({"exists": False}), 200


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "API is running"}), 200


@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    return jsonify({"message": "This is a protected endpoint"}), 200


def findIDs(bom_dict, IDName):
    for head in bom_dict["headers"]:
        if head['name'] == IDName:
            return head['id']
    return None


def getPartsDict(bom_dict, partNameID, DescriptionID, quantityID, materialID, materialBomID, preProcessID, process1ID,
                 process2ID):
    partDict = {}
    rows = bom_dict.get("rows", [])
    for row in rows:
        part_name = row.get("headerIdToValue", {}).get(partNameID, "Unknown")
        part_description = row.get("headerIdToValue", {}).get(DescriptionID, "Unknown")
        quantity = row.get("headerIdToValue", {}).get(quantityID, "N/A")
        part_material = row.get("headerIdToValue", {}).get(materialID, "Unknown")
        part_material_bom = row.get("headerIdToValue", {}).get(materialBomID, "Unknown")
        part_preProcess = row.get("headerIdToValue", {}).get(preProcessID, "Unknown")
        part_process1 = row.get("headerIdToValue", {}).get(process1ID, "Unknown")
        part_process2 = row.get("headerIdToValue", {}).get(process2ID, "Unknown")
        part_id = row.get("itemSource", {}).get("partId", "Unknown")
        if part_material != "N/A" and part_material is not None and isinstance(part_material, dict):
            display_mat = part_material["displayName"]
        else:
            display_mat = "No material set"
        partDict[part_name] = (part_description,
                               int(quantity), display_mat, part_material_bom, part_preProcess,
                               part_process1, part_process2, part_id)
    return partDict


def save_codes():
    with open(settings_data_file, 'w') as file:
        json.dump(settings_data_dict, file)


@app.route('/api/bom', methods=['POST'])
@jwt_required()
def fetch_bom():
    current_user = get_jwt_identity()
    if current_user["role"] != "admin":
        return jsonify({"error": "Only admin can fetch BOM"}), 403

    data = request.json
    document_url = data.get("document_url")
    team_number = data.get("team_number")
    robot = data.get("robot", "Robot1")
    system = data.get("system", "Main")
    global access_key, secret_key, client
    access_key = data.get("access_key")
    secret_key = data.get("secret_key")
    client = Client(configuration={"base_url": base_url, "access_key": access_key, "secret_key": secret_key})

    if not document_url or not team_number:
        return jsonify({"error": "Document URL and Team Number are required"}), 400

    try:
        if access_key and secret_key:
            if team_number not in settings_data_dict:
                settings_data_dict[team_number] = {}
            settings_data_dict[team_number].update({
                "accessKey": access_key,
                "secretKey": secret_key,
                "documentURL": document_url,
            })
            save_codes()

            element = OnshapeElement(document_url)
            fixed_url = '/api/v10/assemblies/d/did/w/wid/e/eid/bom'
            method = 'GET'
            did = element.did
            wid = element.wvmid
            eid = element.eid
            headers = {
                'Accept': 'application/vnd.onshape.v1+json; charset=UTF-8;qs=0.1',
                'Content-Type': 'application/json',
            }
            fixed_url = fixed_url.replace('did', did).replace('wid', wid).replace('eid', eid)

            response = client.api_client.request(
                method, url=base_url + fixed_url, query_params={"indented": False}, headers=headers, body={}
            )

            bom_dict = dict(json.loads(response.data))
            part_nameID = findIDs(bom_dict, "Name")
            part_quantity = findIDs(bom_dict, "Quantity")
            part_materialID = findIDs(bom_dict, "Material")
            part_materialBomID = findIDs(bom_dict, "Bom Material")
            part_preProcessID = findIDs(bom_dict, "Pre Process")
            process1ID = findIDs(bom_dict, "Process 1")
            process2ID = findIDs(bom_dict, "Process 2")
            DescriptionID = findIDs(bom_dict, "Description")
            parts = getPartsDict(
                bom_dict, part_nameID, DescriptionID, part_quantity, part_materialID,
                part_materialBomID, part_preProcessID, process1ID, process2ID
            )

            bom_data = []
            for part_name, (
                    description, quantity, material, materialBOM, preProcess, Process1, Process2,
                    part_id) in parts.items():
                bom_data.append({
                    "Part Name": part_name,
                    "Description": description,
                    "Quantity": quantity,
                    "Material": material,
                    "materialBOM": materialBOM,
                    "preProcess": preProcess,
                    "Process1": Process1,
                    "Process2": Process2,
                    "ID": part_id,
                })

            if team_number not in bom_data_dict:
                bom_data_dict[team_number] = {}
            if robot not in bom_data_dict[team_number]:
                bom_data_dict[team_number][robot] = {}
            bom_data_dict[team_number][robot][system] = bom_data
            save_bom_data()

            return jsonify({"bom_data": bom_data}), 200
        else:
            return jsonify({"error": "Access key or secret key missing"}), 400

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/new_robot', methods=['POST'])
@jwt_required()
def new_robot():
    current_user = get_jwt_identity()
    data = request.json
    team_number = data.get("team_number")
    robot_name = data.get("robot_name")

    if current_user["team_number"] != team_number:
        return jsonify({"error": "Unauthorized"}), 403

    if not team_number or not robot_name:
        return jsonify({"error": "Team number and robot name are required"}), 400

    if team_number not in bom_data_dict:
        bom_data_dict[team_number] = {}

    if robot_name in bom_data_dict[team_number]:
        return jsonify({"error": "Robot name already exists"}), 400

    bom_data_dict[team_number][robot_name] = {"Main": [], "System1": [], "System2": [], "System3": [], "System4": [], "System5": []}
    save_bom_data()
    return jsonify({"message": f"Robot {robot_name} created successfully"}), 200


@app.route('/api/get_robots', methods=['GET'])
@jwt_required()
def get_robots():
    current_user = get_jwt_identity()
    team_number = request.args.get('team_number')
    if current_user["team_number"] != team_number:
        return jsonify({"error": "Unauthorized"}), 403

    robots = list(bom_data_dict.get(team_number, {}).keys())
    return jsonify({"robots": robots}), 200


def is_global_admin(team_number):
    # Replace with your global admin logic if needed. For now admin team is "0000"
    return team_number == "0000"


@app.route('/api/admin/get_bom', methods=['GET'])
@jwt_required()
def admin_get_bom():
    current_user = get_jwt_identity()
    if current_user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403
    team_number = request.args.get('team_number')
    robot_name = request.args.get('robot_name')
    system = request.args.get('system', 'Main')

    team_bom_data = bom_data_dict.get(team_number, {})
    if robot_name and robot_name in team_bom_data:
        robot_bom_data = team_bom_data[robot_name]
        if system == "Main":
            combined_bom = []
            for sys_bom in robot_bom_data.values():
                combined_bom.extend(sys_bom)
            return jsonify({"bom_data": combined_bom}), 200
        else:
            return jsonify({"bom_data": robot_bom_data.get(system, [])}), 200
    else:
        # if no robot specified or robot doesn't exist
        combined_bom = []
        for rdata in team_bom_data.values():
            for sys_bom in rdata.values():
                combined_bom.extend(sys_bom)
        return jsonify({"bom_data": combined_bom}), 200


@app.route('/api/admin/download_bom_dict', methods=['GET'])
@jwt_required()
def download_bom_dict():
    current_user = get_jwt_identity()
    if current_user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    return jsonify({"bom_data_dict": bom_data_dict}), 200


@app.route('/api/admin/download_settings_dict', methods=['GET'])
@jwt_required()
def download_settings_dict():
    current_user = get_jwt_identity()
    if current_user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    return jsonify({"settings_data_dict": settings_data_dict}), 200


@app.route('/api/admin/upload_bom_dict', methods=['POST'])
@jwt_required()
def upload_bom_dict():
    current_user = get_jwt_identity()
    if current_user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    bom_data_dict1 = data.get('bom_data_dict')

    if not bom_data_dict1:
        return jsonify({"error": "No BOM data provided."}), 400

    if not isinstance(bom_data_dict1, dict):
        return jsonify({"error": "Invalid BOM data format."}), 400

    bom_data_dict.update(bom_data_dict1)
    save_bom_data()
    return jsonify({"message": "BOM data uploaded successfully."}), 200


@app.route('/api/download_bom_data', methods=['GET'])
@jwt_required()
def download_bom_data():
    current_user = get_jwt_identity()
    if current_user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    if not os.path.exists(bom_data_file):
        return jsonify({"error": "BOM data file not found"}), 404

    try:
        return send_file(
            bom_data_file,
            as_attachment=True,
            download_name='bom_data.json',
            mimetype='application/json'
        )
    except Exception as e:
        return jsonify({"error": f"Failed to download BOM data: {str(e)}"}), 500


@app.route('/api/download_settings_data', methods=['GET'])
@jwt_required()
def download_settings_data():
    current_user = get_jwt_identity()
    if current_user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    if not os.path.exists(settings_data_file):
        return jsonify({"error": "Settings data file not found"}), 404

    try:
        return jsonify(settings_data_dict), 200
    except Exception as e:
        return jsonify({"error": f"Failed to download settings data: {str(e)}"}), 500


def load_bom_data():
    global bom_data_dict
    try:
        with open(bom_data_file, 'r') as file:
            bom_data_dict = json.load(file)
    except (FileNotFoundError, json.JSONDecodeError):
        bom_data_dict = {}


def load_settings_data():
    global settings_data_dict
    try:
        with open(settings_data_file, 'r') as file:
            settings_data_dict = json.load(file)
    except (FileNotFoundError, json.JSONDecodeError):
        settings_data_dict = {}


def save_bom_data():
    with open(bom_data_file, 'w') as file:
        json.dump(bom_data_dict, file)


load_bom_data()
load_settings_data()


@app.route('/api/save_bom', methods=['POST'])
def save_bom():
    data = request.json
    team_number = data.get('team_number')
    bom_data = data.get('bom_data')

    if not team_number or not bom_data:
        return jsonify({"error": "Team number and BOM data are required"}), 400

    bom_data_dict[team_number] = bom_data
    save_bom_data()
    return jsonify({"message": "BOM data saved successfully"}), 200


@app.route('/api/get_bom', methods=['GET'])
@jwt_required()
def get_bom():
    current_user = get_jwt_identity()
    team_number = request.args.get('team_number')
    robot = request.args.get('robot')
    system = request.args.get('system', 'Main')

    if current_user["team_number"] != team_number:
        return jsonify({"error": "Unauthorized"}), 403

    if not team_number or not robot:
        return jsonify({"error": "Team number and robot name are required"}), 400

    team_bom_data = bom_data_dict.get(team_number, {})
    robot_bom_data = team_bom_data.get(robot, {})
    if system == "Main":
        combined_bom = []
        for sys_bom in robot_bom_data.values():
            combined_bom.extend(sys_bom)
        return jsonify({"bom_data": combined_bom}), 200
    else:
        return jsonify({"bom_data": robot_bom_data.get(system, [])}), 200


@app.route('/api/clear_bom', methods=['POST'])
def clear_bom():
    data = request.json
    team_number = data.get('team_number')
    if not team_number:
        return jsonify({"error": "Team number is required"}), 400

    bom_data_dict.pop(team_number, None)
    save_bom_data()
    return jsonify({"message": "BOM data cleared successfully"}), 200


@app.route('/api/download_cad', methods=['POST'])
@jwt_required()
def download_cad():
    current_user = get_jwt_identity()
    data = request.json
    part_id = data.get('id')
    team_number = data.get("team_number")

    if current_user["team_number"] != team_number:
        return jsonify({"error": "Unauthorized"}), 403

    if not part_id or not team_number:
        return jsonify({'message': 'Missing part ID or team number'}), 400

    document_url = settings_data_dict[team_number]["documentURL"]
    access_key_data = settings_data_dict[team_number]["accessKey"]
    secret_key_data = settings_data_dict[team_number]["secretKey"]
    client_data = Client(
        configuration={"base_url": base_url, "access_key": access_key_data, "secret_key": secret_key_data})
    if not document_url:
        return jsonify({"error": "Document URL and Team Number are required"}), 400
    try:
        if access_key_data != "" and secret_key_data != "":
            element = OnshapeElement(document_url)

            fixed_url = '/api/v10/parts/d/did/w/wid/e/eid/partid/pid/parasolid'
            method = 'GET'
            did = element.did
            wid = element.wvmid
            eid = element.eid
            params = {}
            payload = {}
            headers = {'Accept': 'application/vnd.onshape.v1+json; charset=UTF-8;qs=0.1',
                       'Content-Type': 'application/json'}

            fixed_url = fixed_url.replace('did', did)
            fixed_url = fixed_url.replace('wid', wid)
            fixed_url = fixed_url.replace('eid', eid)
            fixed_url = fixed_url.replace('pid', part_id)
            url = base_url + fixed_url
            response = client_data.api_client.request(method, url=url, query_params=params,
                                                      headers=headers,
                                                      body=payload)
            # Return as a file download (assuming response.data is binary)
            return send_file(BytesIO(response.data),
                             as_attachment=True,
                             download_name=f"Part-{part_id}.x_t",
                             mimetype='application/octet-stream')
        else:
            return jsonify({"error": "Access and Secret keys missing"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/download_all', methods=['GET'])
@jwt_required()
def download_all():
    current_user = get_jwt_identity()
    if current_user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, 'w') as z:
        if os.path.exists(bom_data_file):
            z.write(bom_data_file)
        if os.path.exists(settings_data_file):
            z.write(settings_data_file)
        if os.path.exists('teams.db'):
            z.write('teams.db')
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name='all_data.zip', mimetype='application/zip')


@app.route('/api/admin/set_default_robot', methods=['POST'])
@jwt_required()
def set_default_robot():
    current_user = get_jwt_identity()
    if current_user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    team_number = data.get('team_number')
    robot_name = data.get('robot_name')
    if current_user["team_number"] != team_number:
        return jsonify({"error": "Unauthorized"}), 403

    if team_number not in settings_data_dict:
        settings_data_dict[team_number] = {}
    settings_data_dict[team_number]["default_robot"] = robot_name
    save_codes()
    return jsonify({"message": f"Default robot set to {robot_name}"}), 200


@app.route('/api/admin/set_filters', methods=['POST'])
@jwt_required()
def set_filters():
    current_user = get_jwt_identity()
    if current_user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403
    data = request.json
    team_number = data.get('team_number')
    filters = data.get('filters', {})
    if current_user["team_number"] != team_number:
        return jsonify({"error": "Unauthorized"}), 403

    if team_number not in settings_data_dict:
        settings_data_dict[team_number] = {}
    settings_data_dict[team_number]["filters"] = filters
    save_codes()
    return jsonify({"message": "Filters updated"}), 200


@socketio.on('connect')
def handle_connect():
    print('Client connected')


@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
