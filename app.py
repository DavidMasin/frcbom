import bcrypt
from flask import Flask, request, jsonify
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
import json

from flask_sqlalchemy import SQLAlchemy
# import pandas as pd
from onshape_client.client import Client
from onshape_client.onshape_url import OnshapeElement

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///teams.db'
app.config['JWT_SECRET_KEY'] = 'your_secret_key'  # Update this with a secure key

db = SQLAlchemy(app)
jwt = JWTManager(app)
CORS(app, resources={r"/*": {"origins": ["https://frcbom.com"]}})

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


# In-memory dictionary to store team data
teams = {}

# Register endpoint
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    team_number = data['team_number']
    password = data['password']

    # Check if the team is already registered
    if team_number in teams:
        return jsonify({"error": "Team already exists"}), 400

    # Store the team number and password (plain text)
    teams[team_number] = {"password": password, "parts": {}}
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

# Protected endpoint (example)
@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    return jsonify({"message": "This is a protected endpoint"}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)