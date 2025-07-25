import os
import json
from app import app, db, Team, System  # Robot removed

DATA_DIR = os.path.join(os.getcwd(), "data")

with app.app_context():
    for team_folder in os.listdir(DATA_DIR):
        folder_path = os.path.join(DATA_DIR, team_folder)
        bom_file = os.path.join(folder_path, "bom.json")
        settings_file = os.path.join(folder_path, "settings.json")

        if not os.path.isdir(folder_path):
            continue

        team = Team.query.filter_by(team_number=team_folder).first()
        if not team:
            print(f"Skipping unknown team: {team_folder}")
            continue

        # Load BOM JSON
        try:
            with open(bom_file, 'r') as bf:
                bom_data = json.load(bf)
        except (FileNotFoundError, json.JSONDecodeError):
            bom_data = {}

        # Load settings JSON
        try:
            with open(settings_file, 'r') as sf:
                settings_data = json.load(sf)
        except (FileNotFoundError, json.JSONDecodeError):
            settings_data = {}

        access_key = settings_data.get("accessKey")
        secret_key = settings_data.get("secretKey")
        document_url = settings_data.get("documentURL")

        # Import robots and their systems
        if isinstance(bom_data, dict):
            for robot_name, systems_dict in bom_data.items():
                if not isinstance(systems_dict, dict):
                    continue
                for system_name, parts_list in systems_dict.items():
                    if not isinstance(parts_list, list):
                        parts_list = []

                    existing = System.query.filter_by(
                        team_id=team.id,
                        robot_name=robot_name,
                        system_name=system_name
                    ).first()

                    if not existing:
                        system = System(
                            team_id=team.id,
                            robot_name=robot_name,
                            system_name=system_name,
                            bom_data=parts_list,
                            access_key=access_key,
                            secret_key=secret_key,
                            document_url=document_url
                        )
                        db.session.add(system)
                    else:
                        # Update existing
                        existing.bom_data = parts_list
                        existing.access_key = access_key
                        existing.secret_key = secret_key
                        existing.document_url = document_url

    db.session.commit()
    print("✅ Migration completed: BOM and settings data imported into System table.")
