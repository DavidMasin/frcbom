import os
import json
from app import app, db, Team, Robot, System

DATA_DIR = os.path.join(os.getcwd(), "data")

with app.app_context():
    if not os.path.exists(DATA_DIR):
        print("No /data folder found — skipping migration.")
    else:
        # Proceed with migration
        for team_folder in os.listdir(DATA_DIR):
            team_path = os.path.join(DATA_DIR, team_folder)
            if not os.path.isdir(team_path):
                continue  # skip if not a directory
            team_number = team_folder
            team = Team.query.filter_by(team_number=team_number).first()
            if not team:
                print(f"Team {team_number} not found in DB. Skipping import for this team.")
                continue

            # Load BOM JSON data for the team
            bom_file = os.path.join(team_path, "bom.json")
            try:
                with open(bom_file, 'r') as bf:
                    bom_data = json.load(bf)
            except FileNotFoundError:
                bom_data = {}
            except json.JSONDecodeError:
                bom_data = {}

            # Clear any existing Robot/System entries for the team to avoid duplicates
            for robot in team.robots:
                db.session.delete(robot)
            db.session.flush()

            # Import robots and their systems from the JSON data
            if isinstance(bom_data, dict):
                for robot_name, systems_dict in bom_data.items():
                    if not isinstance(systems_dict, dict):
                        continue
                    robot = Robot(name=robot_name, team_id=team.id)
                    db.session.add(robot)
                    db.session.flush()  # assign an ID to robot for foreign keys
                    for system_name, parts_list in systems_dict.items():
                        if not isinstance(parts_list, list):
                            parts_list = []  # ensure we have a list
                        system = System(name=system_name, bom_data=parts_list, robot=robot)
                        db.session.add(system)

            # Load Settings JSON data for the team (Onshape API keys and document URL)
            settings_file = os.path.join(team_path, "settings.json")
            try:
                with open(settings_file, 'r') as sf:
                    settings_data = json.load(sf)
            except FileNotFoundError:
                settings_data = {}
            except json.JSONDecodeError:
                settings_data = {}
            if isinstance(settings_data, dict):
                access_key = settings_data.get("accessKey")
                secret_key = settings_data.get("secretKey")
                document_url = settings_data.get("documentURL")
                if access_key:
                    team.access_key = access_key
                if secret_key:
                    team.secret_key = secret_key
                if document_url:
                    team.document_url = document_url

    # Commit all changes to the database at once
    db.session.commit()
    print("Migration completed: JSON BOM and settings data have been imported into the database.")
