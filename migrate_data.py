from app import app, db, Team, System
import os
import json

DATA_DIR = os.path.join(os.getcwd(), "data")

with app.app_context():
    for team_folder in os.listdir(DATA_DIR):
        folder_path = os.path.join(DATA_DIR, team_folder)
        bom_file = os.path.join(folder_path, "bom.json")
        if not os.path.isfile(bom_file):
            continue

        team = Team.query.filter_by(team_number=team_folder).first()
        if not team:
            print(f"Skipping unknown team: {team_folder}")
            continue

        with open(bom_file) as f:
            team_bom = json.load(f)

        for robot_name, systems in team_bom.items():
            for system_name in systems.keys():
                existing = System.query.filter_by(team_id=team.id, robot_name=robot_name, system_name=system_name).first()
                if not existing:
                    new_system = System(
                        team_id=team.id,
                        robot_name=robot_name,
                        system_name=system_name
                    )
                    db.session.add(new_system)
    db.session.commit()
