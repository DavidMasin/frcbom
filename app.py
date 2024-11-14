from flask import Flask, request, jsonify
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
import json
# import pandas as pd
from onshape_client.client import Client
from onshape_client.onshape_url import OnshapeElement

app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = "Ysm201996"
jwt = JWTManager(app)

CORS(app, resources={r"/*": {"origins": ["https://frcbom-production.up.railway.app"]}})

# Mock Database (Replace with a real database like PostgreSQL or MongoDB)
teams = {}  # {team_number: {"password": str, "parts": list}}

# Onshape API Client Setup
access_key = 'your-access-key'
secret_key = 'your-secret-key'
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


# User Registration
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    team_number = data['team_number']
    password = data['password']

    if team_number in teams:
        return jsonify({"error": "Team already exists"}), 400

    teams[team_number] = {"password": password, "parts": []}
    return jsonify({"message": "Team registered successfully"}), 200


# User Login
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    team_number = data['team_number']
    password = data['password']

    if team_number not in teams or teams[team_number]['password'] != password:
        return jsonify({"error": "Invalid credentials"}), 401

    access_token = create_access_token(identity=team_number)
    return jsonify(access_token=access_token), 200


# Fetch BOM Data
@app.route('/api/bom', methods=['POST'])
@jwt_required()
def get_bom():
    data = request.json
    document_url = data['document_url']

    try:
        bom_data = fetch_bom_data(document_url)
        return jsonify(bom_data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Update Part Status
@app.route('/api/update-part', methods=['POST'])
@jwt_required()
def update_part_status():
    team_number = get_jwt_identity()
    data = request.json
    part_name = data['part_name']
    new_status = data['status']

    # Find the part and update its status
    parts = teams[team_number]['parts']
    for part in parts:
        if part['name'] == part_name:
            part['status'] = new_status
            return jsonify({"message": "Part status updated"}), 200

    return jsonify({"error": "Part not found"}), 404


# Get Dashboard Data
@app.route('/api/dashboard', methods=['GET'])
@jwt_required()
def get_dashboard():
    team_number = get_jwt_identity()
    parts = teams[team_number]['parts']

    # Filter parts based on their process status
    cnc_parts = [part for part in parts if part['status'] == 'CNC' and part.get('pre_process_done', False)]
    lathe_parts = [part for part in parts if part['status'] == 'Lathe']
    mill_parts = [part for part in parts if part['status'] == 'Mill']

    dashboard_data = {
        "CNC": cnc_parts,
        "Lathe": lathe_parts,
        "Mill": mill_parts
    }

    return jsonify(dashboard_data), 200


# Health Check
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "API is running"}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
# from flask import Flask, jsonify
# from flask_cors import CORS
#
# app = Flask(__name__)
# CORS(app)
#
# @app.route('/api/health', methods=['GET'])
# def health_check():
#     return jsonify({"status": "API is running"}), 200
#
# if __name__ == '__main__':
#     app.run(host='0.0.0.0', port=5000)