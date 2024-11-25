import json

from flask import Flask, request, jsonify, render_template
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

# In-memory dictionary to store BOM data per team
bom_data_dict = {}
bom_data_file = 'bom_data.json'  # File to persist BOM data
settings_data_dict = {}
settings_data_file = 'settings_data.json'

# In-memory storage for BOM data per team
teams = {}
latest_bom_data = {}


class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    team_number = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)


# Create tables within the application context
with app.app_context():
    db.create_all()

# Onshape API Client Setup
# access_key = 'iVTJDrE6RTFeWKRTj8cF4VCa'
# secret_key = 'hjhZYvSX1ylafeku5a7e4wDsBXUNQ6oKynl6HnocHTTddy0Q'
access_key = ""
secret_key = ""
base_url = 'https://cad.onshape.com'
client = Client(configuration={"base_url": base_url, "access_key": access_key, "secret_key": secret_key})


@app.route('/')
def home():
    print("HOME")
    return render_template("index.html")
    # return "HELLO WORLD"


@app.route('/<team_number>')
def team_dashboard(team_number):
    # Pass the team number to the template for dynamic rendering
    return render_template('dashboard.html', team_number=team_number)




@app.route('/<team_number>/<machine>')
def team_bom_filtered(team_number, machine):
    # Render the dashboard with a filtered BOM
    return render_template('dashboard.html', team_number=team_number, filter_machine=machine)


@app.route('/register')
def register_function(team_number, machine):
    # Render the dashboard with a filtered BOM
    return render_template('register.html')


# Register endpoint
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    team_number = data['team_number']
    password = data['password']

    # Check if team exists
    existing_team = Team.query.filter_by(team_number=team_number).first()
    if existing_team:
        return jsonify({"error": "Team already exists"}), 400

    # Hash the password
    hashed_password = generate_password_hash(password)

    # Create new team
    new_team = Team(team_number=team_number, password=hashed_password)
    db.session.add(new_team)
    db.session.commit()

    return jsonify({"message": "Team registered successfully"}), 200


# Login endpoint
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    team_number = data['team_number']
    password = data['password']

    # Retrieve the team from the database
    team = Team.query.filter_by(team_number=team_number).first()

    if not team:
        return jsonify({"error": "Invalid credentials"}), 401

    # Verify the password
    if not check_password_hash(team.password, password):
        return jsonify({"error": "Invalid credentials"}), 401

    # Generate a JWT token
    access_token = create_access_token(identity=team_number)
    return jsonify(access_token=access_token, team_number=team_number), 200


# Endpoint to check if a team exists
@app.route('/api/team_exists', methods=['GET'])
def team_exists():
    team_number = request.args.get('team_number')
    app.logger.debug(f"Checking if team {team_number} exists.")

    if not team_number:
        return jsonify({"error": "Team number is required"}), 400

    # Check if the team exists in the database
    team = Team.query.filter_by(team_number=team_number).first()
    app.logger.debug(f"Team found: {team}")

    if team:
        return jsonify({"exists": True}), 200
    else:
        return jsonify({"exists": False}), 200


# Health check endpoint
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "API is running"}), 200


# Protected endpoint (example)
@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    return jsonify({"message": "This is a protected endpoint"}), 200


# Helper functions
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
        if part_material != "N/A" and part_material is not None:
            partDict[part_name] = (part_description,
                                   int(quantity), part_material["displayName"], part_material_bom, part_preProcess,
                                   part_process1,
                                   part_process2, part_id)
        else:
            partDict[part_name] = (part_description,
                                   int(quantity), "No material set", part_material_bom, part_preProcess, part_process1,
                                   part_process2, part_id)
    return partDict


def save_codes():
    with open(settings_data_file, 'w') as file:
        json.dump(settings_data_dict, file)


@app.route('/api/bom', methods=['POST'])
def fetch_bom():
    global access_key, secret_key, client
    data = request.json

    # Extract necessary data
    document_url = data.get("document_url")
    team_number = data.get("team_number")
    system = data.get("system", "Main")  # Default to "Main" if no system is provided
    access_key = data.get("access_key")
    secret_key = data.get("secret_key")
    client = Client(configuration={"base_url": base_url, "access_key": access_key, "secret_key": secret_key})

    if not document_url or not team_number:
        return jsonify({"error": "Document URL and Team Number are required"}), 400

    try:
        if access_key and secret_key:
            # Save access and secret keys for the team
            settings_data_dict[team_number] = {
                "accessKey": access_key,
                "secretKey": secret_key,
                "documentURL": document_url,
            }
            save_codes()

            # Onshape API setup
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
            description, quantity, material, materialBOM, preProcess, Process1, Process2, part_id) in parts.items():
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

            # Save BOM data for the specific system
            if team_number not in bom_data_dict:
                bom_data_dict[team_number] = {}

            bom_data_dict[team_number][system] = bom_data
            save_bom_data()

            return jsonify({"bom_data": bom_data}), 200
        else:
            return jsonify({"error": "Access key or secret key missing"}), 400

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def is_admin(team_number):
    return team_number == "0000"


@app.route('/api/admin/get_bom', methods=['GET'])
@jwt_required()
def admin_get_bom():
    current_user = get_jwt_identity()

    # Check if the user is the admin
    if not is_admin(current_user):
        return jsonify({"error": "Unauthorized access"}), 403

    team_number = request.args.get('team_number')
    system = request.args.get('system', 'Main')  # Default to "Main"

    if not team_number:
        return jsonify({"error": "Team number is required"}), 400

    # Fetch BOM data for the specified team and system
    team_bom_data = bom_data_dict.get(team_number, {})
    if system == "Main":
        # Combine BOMs for all systems
        combined_bom = []
        for sys_bom in team_bom_data.values():
            combined_bom.extend(sys_bom)
        return jsonify({"bom_data": combined_bom}), 200
    else:
        # Fetch BOM for the specific system
        return jsonify({"bom_data": team_bom_data.get(system, [])}), 200

@app.route('/api/admin/upload_bom_dict', methods=['POST'])
@jwt_required()
def upload_bom_dict():
    current_user = get_jwt_identity()
    print("Hi there")
    # Check if the user is the admin
    if not is_admin(current_user):
        return jsonify({"error": "Unauthorized access"}), 403

    data = request.get_json()
    print("Data from Upload: ", data)
    bom_data_dict_new = data.get('bom_data_dict')
    print(data)
    if not bom_data_dict_new:
        return jsonify({"error": "No BOM data provided."}), 400

    # Optionally validate the bom_data_dict_new structure
    if not isinstance(bom_data_dict_new, dict):
        return jsonify({"error": "Invalid BOM data format."}), 400

    # Update the in-memory bom_data_dict and save to file
    global bom_data_dict
    bom_data_dict = bom_data_dict_new
    save_bom_data()

    return jsonify({"message": "BOM data uploaded successfully."}), 200

@app.route('/api/admin/download_bom_dict', methods=['GET'])
@jwt_required()
def download_bom_dict():
    current_user = get_jwt_identity()

    # Check if the user is the admin
    if not is_admin(current_user):
        return jsonify({"error": "Unauthorized access"}), 403

    try:
        return jsonify({"bom_data_dict": bom_data_dict}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to download BOM data: {str(e)}"}), 500


# Helper function to load BOM data from file
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


# Helper function to save BOM data to file
def save_bom_data():
    with open(bom_data_file, 'w') as file:
        json.dump(bom_data_dict, file)


# Load BOM data when the server starts
load_bom_data()
load_settings_data()


# Endpoint to save BOM data for a specific team
@app.route('/api/save_bom', methods=['POST'])
def save_bom():
    data = request.json
    team_number = data.get('team_number')
    bom_data = data.get('bom_data')

    if not team_number or not bom_data:
        return jsonify({"error": "Team number and BOM data are required"}), 400

    # Save BOM data for the team
    bom_data_dict[team_number] = bom_data
    save_bom_data()

    return jsonify({"message": "BOM data saved successfully"}), 200


# Endpoint to retrieve BOM data for a specific team
@app.route('/api/get_bom', methods=['GET'])
@jwt_required()
def get_bom():
    current_user = get_jwt_identity()
    team_number = request.args.get('team_number')
    system = request.args.get('system', 'Main')  # Default to "Main"

    if not team_number:
        return jsonify({"error": "Team number is required"}), 400

    # Restrict non-admin users from accessing admin BOM data
    if team_number == "0000" and not is_admin(current_user):
        return jsonify({"error": "Unauthorized access"}), 403

    # Fetch BOM data
    team_bom_data = bom_data_dict.get(team_number, {})
    if system == "Main":
        combined_bom = []
        for sys_bom in team_bom_data.values():
            combined_bom.extend(sys_bom)
        return jsonify({"bom_data": combined_bom}), 200
    else:
        return jsonify({"bom_data": team_bom_data.get(system, [])}), 200


# Endpoint to clear BOM data for a specific team (Optional)
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
def download_cad():
    data = request.json
    print(request)
    part_id = data.get('id')
    team_number = data.get("team_number")
    if not part_id or not team_number:
        return jsonify({'message': 'Missing part ID or team number'}), 400
    # document_url = settings_data_dict[team_number]["documentURL"]
    document_url = "https://cad.onshape.com/documents/0f3c906136618fd7ebb6090c/w/ad4ff8bac9eff7f8abe5f2f7/e/3427958cf6a5e5b7120e3a42"
    print(settings_data_dict)
    access_key_data = settings_data_dict[team_number]["accessKey"]
    secret_key_data = settings_data_dict[team_number]["secretKey"]
    client_data = Client(
        configuration={"base_url": base_url, "access_key": access_key_data, "secret_key": secret_key_data})
    if not document_url or not team_number:
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
            print("Connecting to Onshape's API...")
            url = base_url + fixed_url
            print("URL: " , url)
            response = client_data.api_client.request(method, url=url, query_params=params,
                                                      headers=headers,
                                                      body=payload)
            print("Onshape API Connected.")

            return response, 200
        else:
            print("DIDN'T GET ACCESS AND SECRET!!")
            return
    except Exception as e:
        print("Error fetching CAD:", str(e))
        return jsonify({"bom_data": ()}), 500


@socketio.on('connect')
def handle_connect():
    print('Client connected')


@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
