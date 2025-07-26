from sqlalchemy import text
from app import app
from models import db, Team, Robot, System

# Migration script: move legacy System data into the new Robot/System structure.
# Run this after applying the new database schema via Flask-Migrate.
with app.app_context():
    try:
        # Query legacy System data (including old robot_name and document_url fields)
        systems_data = db.session.execute(text(
            "SELECT id, team_id, robot_name, document_url FROM system"
        )).mappings()
    except Exception as e:
        print(f"❌ Migration failed: unable to query legacy data ({e})")
        exit(1)

    robots_by_name = {}  # Map (team_id, robot_name) -> new Robot.id
    # Step 1: Create Robot entries for each unique (team_id, robot_name)
    for row in systems_data:
        team_id = row['team_id']
        robot_name = row['robot_name']
        if not team_id or not robot_name:
            continue
        key = (team_id, robot_name)
        if key in robots_by_name:
            continue
        team = Team.query.get(team_id)
        if not team:
            continue
        existing_robot = Robot.query.filter_by(team_id=team_id, name=robot_name).first()
        if existing_robot:
            robots_by_name[key] = existing_robot.id
        else:
            new_robot = Robot(team_id=team_id, name=robot_name)
            db.session.add(new_robot)
            db.session.flush()
            robots_by_name[key] = new_robot.id

    # Step 2: Assign robot_id to each System and copy assembly_url
    systems_data = db.session.execute(text(
        "SELECT id, team_id, robot_name, system_name, document_url FROM system"
    )).mappings()
    for row in systems_data:
        sys_id = row['id']
        team_id = row['team_id']
        robot_name = row['robot_name']
        assembly_url = row['document_url']
        if not team_id or not robot_name:
            continue
        robot_id = robots_by_name.get((team_id, robot_name))
        if not robot_id:
            continue
        system_obj = System.query.get(sys_id)
        if not system_obj:
            continue
        system_obj.robot_id = robot_id
        if assembly_url:
            system_obj.assembly_url = assembly_url
        if system_obj.partstudio_urls is None:
            system_obj.partstudio_urls = []
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"❌ Migration failed during data update: {e}")
    else:
        print("✅ Migration completed: All robot and system data migrated to new structure.")
