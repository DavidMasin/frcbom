import json
import os

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token
from flask_socketio import SocketIO, emit
from flask_sqlalchemy import SQLAlchemy
from onshape_client.client import Client
from onshape_client.onshape_url import OnshapeElement

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///teams.db'
app.config['JWT_SECRET_KEY'] = 'ysm201996'  # Update this with a secure key

db = SQLAlchemy(app)
jwt = JWTManager(app)
CORS(app, resources={r"/*": {"origins": ["*"]}},
     supports_credentials=True,
     methods=["GET", "POST", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization", "X-Requested-With"])
socketio = SocketIO(app, cors_allowed_origins="*")

# In-memory dictionary to store BOM data per team
bom_data_dict = {}
bom_data_file = 'bom_data.json'  # File to persist BOM data
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
access_key = 'iVTJDrE6RTFeWKRTj8cF4VCa'
secret_key = 'hjhZYvSX1ylafeku5a7e4wDsBXUNQ6oKynl6HnocHTTddy0Q'
base_url = 'https://cad.onshape.com'
client = Client(configuration={"base_url": base_url, "access_key": access_key, "secret_key": secret_key})


# Helper function to fetch BOM data from Onshape
def fetch_bom_data(document_url):
    element = OnshapeElement(document_url)
    did = element.did
    wid = element.wvmid
    eid = element.eid
    fixed_url = f'/api/v9/assemblies/d/{did}/w/{wid}/e/{eid}/bom'

    headers = {
        'Accept': 'application/vnd.onshape.v1+json; charset=UTF-8;qs=0.1',
        'Content-Type': 'application/json'
    }

    response = client.api_client.request('GET', url=base_url + fixed_url, headers=headers)
    return json.loads(response.data)


# Serve static assets
@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

# Catch-all route to serve dashboard.html
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    if path.startswith('api'):
        # Return 404 for API paths not found
        return jsonify({'error': 'API endpoint not found'}), 404
    elif os.path.exists(os.path.join(app.static_folder, path)):
        # Serve the file if it exists in the static folder
        return send_from_directory(app.static_folder, path)
    else:
        # Serve dashboard.html for all other routes
        return send_from_directory(app.static_folder, 'dashboard.html')
# Register endpoint
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    team_number = data['team_number']
    password = data['password']

    if team_number in teams:
        return jsonify({"error": "Team already exists"}), 400

    teams[team_number] = {"password": password}
    return jsonify({"message": "Team registered successfully"}), 200


# Login endpoint
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    team_number = data['team_number']
    password = data['password']

    # Check if the team is registered
    if team_number not in teams:
        return jsonify({"error": "Invalid credentials"}), 401

    # Verify the password
    if teams[team_number]['password'] != password:
        return jsonify({"error": "Invalid credentials"}), 401

    # Generate a JWT token
    access_token = create_access_token(identity=team_number)
    return jsonify(access_token=access_token, team_number=team_number), 200


# Health check endpoint
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "API is running"}), 200


@socketio.on('bom_update')
def handle_bom_update(data):
    team_number = data.get('team_number')
    bom_data = data.get('bom_data')
    if team_number and bom_data:
        # Update the latest BOM data
        bom_data_dict[team_number] = bom_data
        # Broadcast the update to other clients
        emit('update_bom', {'team_number': team_number, 'bom_data': bom_data}, broadcast=True, include_self=False)


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
        if part_material != "N/A" and part_material is not None:
            partDict[part_name] = (part_description,
                                   int(quantity), part_material["displayName"], part_material_bom, part_preProcess,
                                   part_process1,
                                   part_process2)
        else:
            partDict[part_name] = (part_description,
                                   int(quantity), "No material set", part_material_bom, part_preProcess, part_process1,
                                   part_process2)
    return partDict


@app.route('/api/bom', methods=['POST'])
def fetch_bom():
    data = request.json
    print(data)
    document_url = data.get("document_url")
    team_number = data.get("team_number")

    if not document_url or not team_number:
        return jsonify({"error": "Document URL and Team Number are required"}), 400
    try:
        element = OnshapeElement(document_url)

        fixed_url = '/api/v9/assemblies/d/did/w/wid/e/eid/bom'
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
        print("Connecting to Onshape's API...")
        response = client.api_client.request(method, url=base_url + fixed_url, query_params=params, headers=headers,
                                             body=payload)
        print("Onshape API Connected.")

        bom_dict = dict(json.loads(response.data))
        # Extract BOM data
        part_nameID = findIDs(bom_dict, "Name")
        part_quantity = findIDs(bom_dict, "Quantity")
        part_materialID = findIDs(bom_dict, "Material")
        part_materialBomID = findIDs(bom_dict, "Bom Material")
        part_preProcessID = findIDs(bom_dict, "Pre Process")
        process1ID = findIDs(bom_dict, "Process 1")
        process2ID = findIDs(bom_dict, "Process 2")
        DescriptionID = findIDs(bom_dict, "Description")
        print("Trying to get Parts...")
        parts = getPartsDict(bom_dict, part_nameID, DescriptionID, part_quantity, part_materialID, part_materialBomID,
                             part_preProcessID, process1ID, process2ID)
        print("Got parts!")
        # Prepare the response data
        bom_data = []

        for part_name, (description, quantity, material, materialBOM, preProcess, Process1, Process2) in parts.items():
            bom_data.append({
                "Part Name": part_name,
                "Description": description,
                "Quantity": quantity,
                "Material": material,
                "materialBOM": materialBOM,
                "preProcess": preProcess,
                "Process1": Process1,
                "Process2": Process2
            })
        # Store the latest BOM data for the team and emit it to all connected clients
        latest_bom_data[team_number] = bom_data
        socketio.emit('update_bom', {'team_number': team_number, 'bom_data': bom_data})
        return jsonify({"bom_data": bom_data}), 200

    except Exception as e:
        print("Error fetching BOM:", str(e))
        return jsonify({"error": str(e)}), 500


# Helper function to load BOM data from file
def load_bom_data():
    global bom_data_dict
    try:
        with open(bom_data_file, 'r') as file:
            bom_data_dict = json.load(file)
    except (FileNotFoundError, json.JSONDecodeError):
        bom_data_dict = {}


# Helper function to save BOM data to file
def save_bom_data():
    with open(bom_data_file, 'w') as file:
        json.dump(bom_data_dict, file)


# Load BOM data when the server starts
load_bom_data()


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
def get_bom():
    team_number = request.args.get('team_number')

    if not team_number:
        return jsonify({"error": "Team number is required"}), 400

    bom_data = bom_data_dict.get(team_number, [])
    return jsonify({"bom_data": bom_data}), 200


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


@socketio.on('connect')
def handle_connect():
    print('Client connected')


@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
