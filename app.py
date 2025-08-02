import logging
import os
from datetime import datetime

from flask import Flask, request, jsonify, render_template, redirect, session, flash, url_for
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity, get_jwt, jwt_required
from flask_migrate import Migrate
from flask_socketio import SocketIO, emit
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

# Optional: Set level and format for clarity
logging.basicConfig(level=logging.INFO)

# Initialize Flask app and configuration
app = Flask(__name__)
# Configure database URI (use env variable for Railway PostgreSQL, fallback to SQLite for local dev)
db_uri = os.getenv("DATABASE_URL")
if db_uri and db_uri.startswith("postgres://"):
    db_uri = db_uri.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = db_uri or 'sqlite:///teams.db'
app.secret_key = os.getenv('SECRET_KEY', 'super-secret-session-key')
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'super-secure-jwt-key')
app.config['UPLOAD_FOLDER'] = os.path.join(app.root_path, 'statiDec', 'uploads')

# Initialize extensions
from models import db, Team, Robot, System, Machine

db.init_app(app)
migrate = Migrate(app, db)
jwt = JWTManager(app)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization", "X-Requested-With"])

socketio = SocketIO(app, cors_allowed_origins="*")

# Ensure base upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)


# HTML page routes
@app.route('/')
def home():
    return render_template("index.html")


@app.route('/<team_number>/<robot_name>')
def team_dashboard(team_number, robot_name):
    team = Team.query.filter_by(team_number=team_number).first_or_404()
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first_or_404()
    return render_template('robot_detail_user.html', team=team, robot=robot)


@app.route('/<team_number>')
def team_page(team_number):
    team = Team.query.filter_by(team_number=str(team_number)).first()
    if not team:
        return "Team not found", 404

    robots = Robot.query.filter_by(team_id=team.id).all()

    return render_template('dashboard.html', team=team, team_number=team_number, robots=robots)


@app.route("/<team_number>/Admin")
def team_admin_dashboard(team_number):
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return "Team not found", 404
    robots = Robot.query.filter_by(team_id=team.id).all()
    return render_template("teamAdmin_dashboard.html", team=team, robots=robots)


@app.route("/<int:team_number>/Admin/machines", methods=["GET"])
def manage_machines(team_number):
    print(team_number)
    team = Team.query.filter_by(team_number=str(team_number)).first()
    if not team:
        return "Team not found", 404

    machines = Machine.query.filter_by(team_id=team.id).all()

    return render_template("manage_machines.html", team=team, machines=machines)


@app.route("/<team_number>/new_robot")
def new_robot_form(team_number):
    team = Team.query.filter_by(team_number=team_number).first_or_404()
    return render_template("new_robot.html", team=team, team_id=team.id, team_number=team.team_number)


@app.route("/<team_number>/Admin/<robot_name>")
def team_admin_robot(team_number, robot_name):
    team = Team.query.filter_by(team_number=team_number).first_or_404()
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first_or_404()
    return render_template("robot_detail.html", robot=robot, team=team)


@app.route('/<team_number>/Admin/<robot_name>/<system>')
def team_admin_bom(team_number, robot_name, system):
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return "Team not found", 404

    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    if not robot:
        return "Robot not found", 404

    system_obj = System.query.filter_by(robot_id=robot.id, name=system).first()
    if not system_obj:
        return "System not found", 404

    robots = Robot.query.filter_by(team_id=team.id).all()

    return render_template("system_detail.html",
                           team=team,
                           team_number=team_number,
                           team_id=team.id,
                           robots=robots,
                           current_robot=robot_name,
                           filter_system=system,
                           is_admin=True,
                           system=system_obj)  # ✅ Pass this in


@app.route("/<team_number>/<robot_name>/<system>")
def team_bom_filtered(team_number, robot_name, system):
    team = Team.query.filter_by(team_number=str(team_number)).first()
    if not team:
        return "Team not found", 404

    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    if not robot:
        return "Robot not found", 404

    return render_template(
        'system_detail.html',
        team=team,
        team_number=team_number,
        robot_name=robot_name,
        filter_system=system,
        is_admin=False,
        system=system
    )


@app.route('/register')
def register_page():
    return render_template('register.html')


# Authentication endpoints
@app.route('/api/register', methods=['POST'])
def register():
    """Register a new team with user and admin passwords."""
    data = request.get_json()
    team_number = data.get("team_number")
    password = data.get("password")
    admin_password = data.get("adminPassword")
    if not team_number or not password or not admin_password:
        return jsonify({"error": "Team number, password, and adminPassword are required"}), 400
    if Team.query.filter_by(team_number=team_number).first():
        return jsonify({"error": "Team already exists"}), 400

    hashed_password = generate_password_hash(password)
    hashed_admin_password = generate_password_hash(admin_password)
    new_team = Team(team_number=team_number, password=hashed_password, adminPassword=hashed_admin_password)
    db.session.add(new_team)
    db.session.commit()
    return jsonify({"message": "Team registered successfully"}), 200


@app.route("/logout")
def logout():
    session.clear()  # or remove JWT cookies if you use Flask-JWT-Extended
    flash("You have been logged out.", "success")
    return redirect(url_for("home"))


@app.route('/api/login', methods=['POST'])
def login():
    """Login a team (user or admin password) and return a JWT token and role info."""
    data = request.get_json()
    team_number = data.get('team_number')
    password = data.get('password')
    if not team_number or not password:
        return jsonify({"error": "Team number and password are required"}), 400
    team = Team.query.filter_by(team_number=team_number).first()
    if not team or not (
            check_password_hash(team.password, password) or check_password_hash(team.adminPassword, password)):
        return jsonify({"error": "Invalid credentials"}), 401

    is_admin = False
    if check_password_hash(team.adminPassword, password):
        is_admin = True
    additional_claims = {"is_team_admin": False, "is_global_admin": False}
    if is_admin:
        additional_claims["is_team_admin"] = True
        if team_number == "0000":  # global admin account
            additional_claims["is_global_admin"] = True

    access_token = create_access_token(identity=team_number, additional_claims=additional_claims)
    return jsonify(access_token=access_token, team_number=team_number, isAdmin=is_admin), 200


@app.route('/api/team_exists', methods=['GET'])
def team_exists():
    team_number = request.args.get('team_number')
    if not team_number:
        return jsonify({"error": "Team number is required"}), 400
    exists = bool(Team.query.filter_by(team_number=team_number).first())
    return jsonify({"exists": exists}), 200


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "API is running"}), 200


# ** Team Admin Protected Endpoints **
@app.route('/api/robots', methods=['GET'])
@jwt_required()
def list_robots():
    """List all robots (with details) for a team."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    team_number = request.args.get('team_number')
    if claims.get('is_global_admin'):
        if not team_number:
            return jsonify({"error": "Team number is required"}), 400
    else:
        team_number = current_user  # non-admin can only list their own team
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    robots = Robot.query.filter_by(team_id=team.id).all()
    robot_list = []
    for robot in robots:
        robot_data = {"id": robot.id, "name": robot.name, "is_template": robot.is_template, "image": None}
        if robot.image_text:
            robot_data["image"] = "/static/" + robot.image_text
        robot_list.append(robot_data)
    return jsonify({"robots": robot_list}), 200


@app.route('/api/robots', methods=['POST'])
@jwt_required()
def create_robot():
    """Create a new robot (team admin or global admin only)."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    if request.is_json:
        team_number = request.json.get("team_number")
        robot_name = request.json.get("robot_name")
    else:
        team_number = request.form.get("team_number")
        robot_name = request.form.get("robot_name")
    image_text = request.files.get('image')
    if not team_number or not robot_name:
        return jsonify({"error": "Team number and robot name are required"}), 400
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404
    if Robot.query.filter_by(team_id=team.id, name=robot_name).first():
        return jsonify({"error": "Robot name already exists"}), 400

    new_robot = Robot(name=robot_name, team_id=team.id, year=datetime.now().year)
    template_robot = Robot.query.filter_by(team_id=team.id, is_template=True).first()
    db.session.add(new_robot)
    db.session.flush()  # assign ID

    if image_text:
        team_dir = os.path.join(app.config['UPLOAD_FOLDER'], f"team_{team_number}", "robots")
        os.makedirs(team_dir, exist_ok=True)
        ext = ''
        filename = secure_filename(image_text.filename)
        if '.' in filename:
            ext = filename.rsplit('.', 1)[1].lower()
        image_textname = f"robot_{new_robot.id}.{ext}" if ext else f"robot_{new_robot.id}"
        image_path = os.path.join(team_dir, image_textname)
        image_text.save(image_path)
        # Store relative path in DB
        new_robot.image_text = os.path.join("uploads", f"team_{team_number}", "robots", image_textname)

    default_systems = ["Main", "System1", "System2", "System3", "System4", "System5"]
    for sys_name in default_systems:
        sys_record = System(robot=new_robot, name=sys_name, assembly_url=None, partstudio_urls=[], bom_data=[])
        if template_robot:
            templ_sys = System.query.filter_by(robot_id=template_robot.id, name=sys_name).first()
            if templ_sys:
                sys_record.access_key = templ_sys.access_key
                sys_record.secret_key = templ_sys.secret_key
        db.session.add(sys_record)
    if template_robot:
        for templ_machine in template_robot.machines:
            machine_copy = Machine(team_id=team.id, name=templ_machine.name, cad_format=templ_machine.cad_format)
            if templ_machine.icon_file:
                machine_dir = os.path.join(app.config['UPLOAD_FOLDER'], f"team_{team_number}", "machines")
                os.makedirs(machine_dir, exist_ok=True)
                if os.path.isfile(templ_machine.icon_file):
                    ext = templ_machine.icon_file.rsplit('.', 1)[-1] if '.' in templ_machine.icon_file else ''
                    new_icon_filename = f"machine_{new_robot.id}_{secure_filename(templ_machine.name)}.{ext}" if ext else f"machine_{new_robot.id}_{secure_filename(templ_machine.name)}"
                    new_icon_path = os.path.join(machine_dir, new_icon_filename)
                    try:
                        with open(templ_machine.icon_file, 'rb') as src, open(new_icon_path, 'wb') as dst:
                            dst.write(src.read())
                        machine_copy.icon_file = new_icon_path
                    except Exception:
                        machine_copy.icon_file = None
            db.session.add(machine_copy)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to create robot: {str(e)}"}), 500
    return jsonify({"message": f"Robot '{robot_name}' created successfully", "robot_id": new_robot.id}), 200


@app.route('/api/robots/<int:robot_id>', methods=['PUT'])
@jwt_required()
def update_robot(robot_id):
    """Update a robot's details (name or image)."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    new_name = request.json.get("name") if request.is_json else request.form.get("name")
    image_text = request.files.get("image")
    robot = Robot.query.get(robot_id)
    if not robot:
        return jsonify({"error": "Robot not found"}), 404
    team = Team.query.get(robot.team_id)
    if not team:
        return jsonify({"error": "Team not found"}), 404
    if not (claims.get('is_team_admin') and current_user == team.team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    if new_name is not None:
        new_name = new_name.strip()
        if new_name == "":
            return jsonify({"error": "Robot name cannot be empty"}), 400
        if new_name != robot.name:
            if Robot.query.filter_by(team_id=team.id, name=new_name).first():
                return jsonify({"error": "Another robot with this name already exists"}), 400
            robot.name = new_name
    if image_text:
        team_dir = os.path.join(app.config['UPLOAD_FOLDER'], f"team_{team.team_number}", "robots")
        os.makedirs(team_dir, exist_ok=True)
        ext = ''
        filename = secure_filename(image_text.filename)
        if '.' in filename:
            ext = filename.rsplit('.', 1)[1].lower()
        image_textname = f"robot_{robot.id}.{ext}" if ext else f"robot_{robot.id}"
        image_path = os.path.join(team_dir, image_textname)
        if robot.image_text:
            old_image_path = os.path.join(app.root_path, 'static', robot.image_text)
            if os.path.isfile(old_image_path):
                try:
                    os.remove(old_image_path)
                except Exception as e:
                    print(f"Warning: could not remove old robot image: {e}")
        image_text.save(image_path)
        robot.image_text = os.path.join("uploads", f"team_{team.team_number}", "robots", image_textname)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to update robot: {str(e)}"}), 500
    return jsonify({"message": "Robot updated successfully"}), 200


@app.route('/api/robots/<int:robot_id>', methods=['DELETE'])
@jwt_required()
def delete_robot_by_id(robot_id):
    """Delete a robot and all its systems/machines."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    robot = Robot.query.get(robot_id)
    if not robot:
        return jsonify({"error": "Robot not found"}), 404
    team = Team.query.get(robot.team_id)
    if not team:
        return jsonify({"error": "Team not found"}), 404
    if not (claims.get('is_team_admin') and current_user == team.team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    if robot.image_text:
        old_image_path = os.path.join(app.root_path, 'static', robot.image_text)
        if os.path.isfile(old_image_path):
            try:
                os.remove(old_image_path)
            except Exception as e:
                print(f"Warning: could not delete robot image file: {e}")
    # (System image files not applicable, skipping)
    for mach in robot.machines:
        if mach.icon_file:
            icon_path = os.path.join(app.root_path, 'static', mach.icon_file)
            if os.path.isfile(icon_path):
                try:
                    os.remove(icon_path)
                except Exception as e:
                    print(f"Warning: could not delete machine icon file: {e}")
    try:
        db.session.delete(robot)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to delete robot: {str(e)}"}), 500
    return jsonify({"message": "Robot deleted successfully"}), 200


# Legacy endpoints for compatibility
@app.route('/api/new_robot', methods=['POST'])
@jwt_required()
def new_robot_legacy():
    data = request.get_json()
    team_number = data.get("team_number")
    robot_name = data.get("robot_name")
    if not team_number or not robot_name:
        return jsonify({"error": "Team number and robot name are required"}), 400
    current_user = get_jwt_identity()
    claims = get_jwt()
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404
    if Robot.query.filter_by(team_id=team.id, name=robot_name).first():
        return jsonify({"error": "Robot name already exists"}), 400

    new_robot = Robot(name=robot_name, team_id=team.id, year=datetime.now().year)
    template_robot = Robot.query.filter_by(team_id=team.id, is_template=True).first()
    db.session.add(new_robot)
    db.session.flush()
    default_systems = ["Main", "System1", "System2", "System3", "System4", "System5"]
    for sys_name in default_systems:
        sys_record = System(robot=new_robot, name=sys_name, assembly_url=None, partstudio_urls=[], bom_data=[])
        if template_robot:
            templ_sys = System.query.filter_by(robot_id=template_robot.id, name=sys_name).first()
            if templ_sys:
                sys_record.access_key = templ_sys.access_key
                sys_record.secret_key = templ_sys.secret_key
        db.session.add(sys_record)
    if template_robot:
        for templ_machine in template_robot.machines:
            machine_copy = Machine(team_id=team.id, name=templ_machine.name, cad_format=templ_machine.cad_format)
            if templ_machine.icon_file and os.path.isfile(templ_machine.icon_file):
                ext = templ_machine.icon_file.rsplit('.', 1)[-1] if '.' in templ_machine.icon_file else ''
                machine_dir = os.path.join(app.config['UPLOAD_FOLDER'], f"team_{team_number}", "machines")
                os.makedirs(machine_dir, exist_ok=True)
                new_icon_filename = f"machine_{new_robot.id}_{secure_filename(templ_machine.name)}.{ext}" if ext else f"machine_{new_robot.id}_{secure_filename(templ_machine.name)}"
                new_icon_path = os.path.join(machine_dir, new_icon_filename)
                try:
                    with open(templ_machine.icon_file, 'rb') as src, open(new_icon_path, 'wb') as dst:
                        dst.write(src.read())
                    machine_copy.icon_file = new_icon_path
                except Exception:
                    machine_copy.icon_file = None
            db.session.add(machine_copy)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to create robot: {str(e)}"}), 500
    return jsonify({"message": f"Robot '{robot_name}' created successfully"}), 200


@app.route('/api/get_robots', methods=['GET'])
@jwt_required()
def get_robots_legacy():
    current_user = get_jwt_identity()
    claims = get_jwt()
    team_number = request.args.get('team_number')
    if not team_number:
        return jsonify({"error": "Team number is required"}), 400
    if current_user != team_number and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404
    robot_names = [robot.name for robot in Robot.query.filter_by(team_id=team.id).all()]
    return jsonify({"robots": robot_names}), 200


@app.route('/api/rename_robot', methods=['POST'])
@jwt_required()
def rename_robot():
    current_user = get_jwt_identity()
    claims = get_jwt()
    data = request.get_json()
    team_number = data.get('team_number')
    old_name = data.get('old_robot_name')
    new_name = data.get('new_robot_name')
    if not team_number or not old_name or not new_name:
        return jsonify({"error": "Missing required fields"}), 400
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404
    robot = Robot.query.filter_by(team_id=team.id, name=old_name).first()
    if not robot:
        return jsonify({"error": f"Robot '{old_name}' does not exist"}), 404
    if Robot.query.filter_by(team_id=team.id, name=new_name).first():
        return jsonify({"error": f"Robot '{new_name}' already exists"}), 400
    robot.name = new_name
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to rename robot: {str(e)}"}), 500
    return jsonify({"message": f"Robot '{old_name}' renamed to '{new_name}'"}), 200


@app.route('/api/delete_robot', methods=['DELETE'])
@jwt_required()
def delete_robot_legacy():
    current_user = get_jwt_identity()
    claims = get_jwt()
    data = request.get_json()
    team_number = data.get('team_number')
    robot_name = data.get('robot_name')
    if not team_number or not robot_name:
        return jsonify({"error": "Missing required fields"}), 400
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    if not robot:
        return jsonify({"error": f"Robot '{robot_name}' not found"}), 404
    # Remove files for this robot
    if robot.image_text:
        old_image_path = os.path.join(app.root_path, 'static', robot.image_text)
        if os.path.isfile(old_image_path):
            try:
                os.remove(old_image_path)
            except Exception:
                pass
    for mach in robot.machines:
        if mach.icon_file:
            icon_path = os.path.join(app.root_path, 'static', mach.icon_file)
            if os.path.isfile(icon_path):
                try:
                    os.remove(icon_path)
                except Exception:
                    pass
    try:
        db.session.delete(robot)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to delete robot: {str(e)}"}), 500
    return jsonify({"message": f"Robot '{robot_name}' deleted successfully"}), 200


# Machine endpoints
@app.route('/api/machines', methods=['GET'])
def list_machines():
    """List all machines for a given team and robot."""

    team_number = request.args.get('team_number')
    if not team_number:
        return jsonify({"error": "Team number is required"}), 400

    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team or robot not found"}), 404

    machines = Machine.query.filter_by(team_id=team.id).all()
    machine_list = []
    for m in machines:
        machine_data = {"id": m.id, "name": m.name, "cad_format": m.cad_format, "icon": None}
        if m.icon_file:
            machine_data["icon"] = "/static/" + m.icon_file
        machine_list.append(machine_data)
    return jsonify({"machines": machine_list}), 200


@app.route("/api/robot_data")
def team_dashboard_api():
    team_number = request.args.get("team_number")
    robot_name = request.args.get("robot")

    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return "Team not found", 404

    robots = Robot.query.filter_by(team_id=team.id).all()

    return render_template(
        "dashboard.html",
        team=team,
        robots=robots,
        team_number=team_number,
        robot_name=robot_name
    )


@app.route('/api/machines', methods=['POST'])
@jwt_required()
def add_machine():
    """Add a new machine to the team (not tied to any robot)."""
    current_user = get_jwt_identity()
    claims = get_jwt()

    if request.is_json:
        team_number = request.json.get("team_number")
        machine_name = request.json.get("name")
        cad_format = request.json.get("cad_format")
    else:
        team_number = request.form.get("team_number")
        machine_name = request.form.get("name")
        cad_format = request.form.get("cad_format")

    icon_file = request.files.get("icon")

    if not team_number or not machine_name or not cad_format:
        return jsonify({"error": "Missing team_number, name, or cad_format"}), 400

    # Auth check
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    team = Team.query.filter_by(team_number=str(team_number)).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    if Machine.query.filter_by(team_id=team.id, name=machine_name).first():
        return jsonify({"error": "Machine already exists for this team"}), 400

    new_machine = Machine(team=team, name=machine_name, cad_format=cad_format)
    db.session.add(new_machine)
    db.session.flush()

    if icon_file:
        machine_dir = os.path.join(app.config['UPLOAD_FOLDER'], f"team_{team_number}", "machines")
        os.makedirs(machine_dir, exist_ok=True)
        ext = ''
        icon_filename_secure = secure_filename(icon_file.filename)
        if '.' in icon_filename_secure:
            ext = icon_filename_secure.rsplit('.', 1)[1].lower()
        icon_filename = f"machine_{new_machine.id}_{secure_filename(machine_name)}.{ext}" if ext else f"machine_{new_machine.id}_{secure_filename(machine_name)}"
        icon_path = os.path.join(machine_dir, icon_filename)
        icon_file.save(icon_path)
        new_machine.icon_file = os.path.join("uploads", f"team_{team_number}", "machines", icon_filename)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to add machine: {str(e)}"}), 500

    return jsonify({
        "message": "Machine added successfully",
        "machine": {
            "id": new_machine.id,
            "name": new_machine.name,
            "cad_format": new_machine.cad_format,
            "icon": ("/static/" + new_machine.icon_file if new_machine.icon_file else None)
        }
    }), 200


@app.route('/api/machines/<int:machine_id>', methods=['PUT'])
@jwt_required()
def update_machine(machine_id):
    """Update a machine's details (name, format, or icon)."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    machine = Machine.query.get(machine_id)
    if not machine:
        return jsonify({"error": "Machine not found"}), 404
    robot = Robot.query.get(machine.robot_id)
    team = Team.query.get(robot.team_id) if robot else None
    if not robot or not team:
        return jsonify({"error": "Associated robot/team not found"}), 404
    if not (claims.get('is_team_admin') and current_user == team.team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    if request.is_json:
        new_name = request.json.get("name")
        new_format = request.json.get("cad_format")
    else:
        new_name = request.form.get("name")
        new_format = request.form.get("cad_format")
    icon_file = request.files.get("icon")

    if new_name:
        new_name = new_name.strip()
        if new_name == "":
            return jsonify({"error": "Machine name cannot be empty"}), 400
        if new_name != machine.name:
            if Machine.query.filter_by(robot_id=robot.id, name=new_name).first():
                return jsonify({"error": "Another machine with this name already exists"}), 400
            machine.name = new_name
    if new_format:
        machine.cad_format = new_format
    if icon_file:
        machine_dir = os.path.join(app.config['UPLOAD_FOLDER'], f"team_{team.team_number}", "machines")
        os.makedirs(machine_dir, exist_ok=True)
        ext = ''
        filename_secure = secure_filename(icon_file.filename)
        if '.' in filename_secure:
            ext = filename_secure.rsplit('.', 1)[1].lower()
        icon_filename = f"machine_{robot.id}_{secure_filename(machine.name)}.{ext}" if ext else f"machine_{robot.id}_{secure_filename(machine.name)}"
        icon_path = os.path.join(machine_dir, icon_filename)
        if machine.icon_file:
            old_icon_path = os.path.join(app.root_path, 'static', machine.icon_file)
            if os.path.isfile(old_icon_path):
                try:
                    os.remove(old_icon_path)
                except Exception as e:
                    print(f"Warning: could not remove old machine icon: {e}")
        icon_file.save(icon_path)
        machine.icon_file = os.path.join("uploads", f"team_{team.team_number}", "machines", icon_filename)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to update machine: {str(e)}"}), 500
    return jsonify({"message": "Machine updated successfully"}), 200


@app.route('/api/machines/<int:machine_id>', methods=['DELETE'])
@jwt_required()
def delete_machine(machine_id):
    """Delete a machine from a robot."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    machine = Machine.query.get(machine_id)
    if not machine:
        return jsonify({"error": "Machine not found"}), 404
    robot = Robot.query.get(machine.robot_id)
    team = Team.query.get(robot.team_id) if robot else None
    if not robot or not team:
        return jsonify({"error": "Associated robot/team not found"}), 404
    if not (claims.get('is_team_admin') and current_user == team.team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    if machine.icon_file:
        icon_path = os.path.join(app.root_path, 'static', machine.icon_file)
        if os.path.isfile(icon_path):
            try:
                os.remove(icon_path)
            except Exception:
                pass
    try:
        db.session.delete(machine)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to delete machine: {str(e)}"}), 500
    return jsonify({"message": "Machine deleted successfully"}), 200


# BOM and Onshape integration endpoints
@app.route('/api/get_bom', methods=['GET'])
@jwt_required()
def get_bom():
    """Retrieve BOM data for a specific team, robot, and system."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    team_number = request.args.get('team_number')
    robot_name = request.args.get('robot')
    system_name = request.args.get('system', 'Main')
    if not team_number or not robot_name:
        return jsonify({"error": "Team number and robot name are required"}), 400
    if current_user != team_number and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    team = Team.query.filter_by(team_number=team_number).first()
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first() if team else None
    if not team or not robot:
        return jsonify({"error": "Team or robot not found"}), 404

    if system_name == "Main":
        combined = []
        for sys_record in robot.systems:
            if sys_record.bom_data:
                combined.extend(sys_record.bom_data)
        return jsonify({"bom_data": combined}), 200
    else:
        sys_record = System.query.filter_by(robot_id=robot.id, name=system_name).first()
        if not sys_record:
            return jsonify({"error": "System not found"}), 404
        bom_list = sys_record.bom_data if sys_record.bom_data is not None else []
        return jsonify({"bom_data": bom_list}), 200


@app.route('/api/save_bom_for_robot_system', methods=['POST'])
@jwt_required()
def save_bom_for_robot_system():
    """Save provided BOM data for a given team, robot, and system."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    data = request.get_json()
    team_number = data.get("team_number")
    robot_name = data.get("robot_name")
    system_name = data.get("system_name") or data.get("system")
    bom_data = data.get("bom_data")
    if not team_number or not robot_name or not system_name or bom_data is None:
        return jsonify({"error": "Missing required data"}), 400
    if current_user != team_number and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    team = Team.query.filter_by(team_number=team_number).first()
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first() if team else None
    if not team or not robot:
        return jsonify({"error": "Team or robot not found"}), 404

    system = System.query.filter_by(robot_id=robot.id, name=system_name).first()
    if not system:
        system = System(robot=robot, name=system_name)
        db.session.add(system)
    system.bom_data = bom_data
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to save BOM data: {str(e)}"}), 500
    return jsonify({"message": "BOM data saved successfully"}), 200


@app.route("/api/robot_exists", methods=["POST"])
@jwt_required()
def robot_exists():
    data = request.get_json()
    team_number = data.get("team_number")
    robot_name = data.get("robot_name")

    if not team_number or not robot_name:
        return jsonify({"error": "Missing fields"}), 400

    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"exists": False})

    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    return jsonify({"exists": robot is not None})


@app.route("/api/bom", methods=["POST"])
@jwt_required()
def fetch_bom():
    from onshape_client.client import Client
    from onshape_client.onshape_url import OnshapeElement
    import json as jsonlib

    data = request.get_json()
    app.logger.info("📥 Incoming BOM fetch request: %s", data)

    team_number = data.get("team_number")
    robot_name = data.get("robot_name")
    system_name = data.get("system_name")

    if system_name == "Main":
        return jsonify({"error": "Cannot fetch BOM into 'Main'. Select a specific system."}), 400

    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    if not robot:
        return jsonify({"error": "Robot not found"}), 404

    system = System.query.filter_by(robot_id=robot.id, name=system_name).first()
    if not system:
        return jsonify({"error": "System not found"}), 404

    if not system.assembly_url or not system.access_key or not system.secret_key:
        return jsonify({"error": "Missing required Onshape credentials or assembly URL"}), 400

    try:
        client = Client(configuration={
            "base_url": "https://cad.onshape.com",
            "access_key": system.access_key,
            "secret_key": system.secret_key
        })
    except Exception as e:
        return jsonify({"error": f"Onshape client init failed: {str(e)}"}), 500

    try:
        element = OnshapeElement(system.assembly_url)
        did, wid, eid = element.did, element.wvmid, element.eid

        bom_url = f"/api/v10/assemblies/d/{did}/w/{wid}/e/{eid}/bom"
        headers = {'Accept': 'application/vnd.onshape.v1+json', 'Content-Type': 'application/json'}
        response = client.api_client.request(
            'GET',
            url="https://cad.onshape.com" + bom_url,
            query_params={"indented": False},
            headers=headers,
            body={}
        )
        bom_json = response.data
        if isinstance(bom_json, (bytes, bytearray)):
            bom_json = jsonlib.loads(bom_json.decode("utf-8"))
        elif isinstance(bom_json, str):
            bom_json = jsonlib.loads(bom_json)
    except Exception as e:
        return jsonify({"error": f"❌ Failed to fetch BOM: {str(e)}"}), 500

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

    # Get old BOM (if any) and index by partId
    old_bom = system.bom_data or []
    old_bom_by_id = {p.get("partId"): p for p in old_bom}

    bom_data_list = []
    for row in bom_json.get("rows", []):
        values = row.get("headerIdToValue", {})
        part_id = row.get("itemSource", {}).get("partId", "")
        part_entry = {
            "Part Name": values.get(part_name_id, "Unknown") if part_name_id else "Unknown",
            "Description": values.get(desc_id, "Unknown") if desc_id else "Unknown",
            "Quantity": values.get(qty_id, "N/A") if qty_id else "N/A",
            "Material": values.get(material_id, "Unknown") if material_id else "Unknown",
            "materialBOM": values.get(material_bom_id, "Unknown") if material_bom_id else "Unknown",
            "Pre Process": values.get(preproc_id, "Unknown") if preproc_id else "Unknown",
            "Process 1": values.get(proc1_id, "Unknown") if proc1_id else "Unknown",
            "Process 2": values.get(proc2_id, "Unknown") if proc2_id else "Unknown",
            "partId": part_id
        }

        # Normalize dict values
        for key in ["Material", "materialBOM"]:
            if isinstance(part_entry[key], dict):
                part_entry[key] = part_entry[key].get("displayName", "Unknown")

        # Restore progress if exists
        old = old_bom_by_id.get(part_id)
        if old:
            part_entry["done_preprocess"] = old.get("done_preprocess", 0)
            part_entry["done_process1"] = old.get("done_process1", 0)
            part_entry["done_process2"] = old.get("done_process2", 0)
            part_entry["available_qty"] = old.get("available_qty", 0)

        bom_data_list.append(part_entry)

    system.bom_data = bom_data_list

    try:
        db.session.commit()
        return jsonify({"msg": "✅ BOM successfully fetched and saved!", "bom_data": bom_data_list}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to save BOM data: {str(e)}"}), 500


# Global admin endpoints
@app.route('/api/admin/get_bom', methods=['GET'])
@jwt_required()
def admin_get_bom():
    """(Global Admin) Get BOM data for a team (all robots) or a specific system across robots."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    if not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    team_number = request.args.get('team_number')
    system_name = request.args.get('system', 'Main')
    if not team_number:
        return jsonify({"error": "Team number is required"}), 400
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    combined_parts = []
    if system_name == "Main":
        for robot in team.robots:
            for sys in robot.systems:
                if sys.bom_data:
                    combined_parts.extend(sys.bom_data)
    else:
        for robot in team.robots:
            for sys in robot.systems:
                if sys.name == system_name and sys.bom_data:
                    combined_parts.extend(sys.bom_data)
    return jsonify({"bom_data": combined_parts}), 200


@app.route('/api/admin/download_bom_dict', methods=['GET'])
@jwt_required()
def download_bom_dict():
    """(Global Admin) Download the entire BOM data dictionary for all teams."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    if not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    bom_data_dict = {}
    for team in Team.query.all():
        team_dict = {}
        for robot in team.robots:
            robot_dict = {}
            for sys in robot.systems:
                robot_dict[sys.name] = sys.bom_data if sys.bom_data else []
            team_dict[robot.name] = robot_dict
        bom_data_dict[team.team_number] = team_dict
    return jsonify({"bom_data_dict": bom_data_dict}), 200


@app.route("/api/download_cad", methods=["POST"])
@jwt_required()
def download_cad():
    import requests, time, io
    from flask import send_file
    from onshape_client.onshape_url import OnshapeElement

    current_user = get_jwt_identity()
    claims = get_jwt()
    data = request.get_json()

    team_number = data.get("team_number")
    robot_name = data.get("robot")
    system_name = data.get("system")
    part_id = data.get("id")
    file_format = data.get("format", "STEP").upper()

    print("🛠️ Received download request for part:", part_id)

    if not all([team_number, robot_name, system_name, part_id]):
        return jsonify({"error": "Missing required fields (team_number, robot, system, id)"}), 400

    if current_user != team_number and not claims.get("is_global_admin"):
        return jsonify({"error": "Unauthorized"}), 403

    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    if not robot:
        return jsonify({"error": "Robot not found"}), 404

    system = System.query.filter_by(robot_id=robot.id, name=system_name).first()
    if not system:
        return jsonify({"error": "System not found"}), 404

    if not all([system.access_key, system.secret_key, system.partstudio_urls]):
        return jsonify({"error": "Onshape credentials or part studio URLs missing"}), 400

    headers = {"Accept": "application/json"}
    auth = (system.access_key, system.secret_key)

    # 🔁 Find matching partId
    target = None
    for ps_url in system.partstudio_urls:
        try:
            element = OnshapeElement(ps_url)
            did, wid, eid = element.did, element.wvmid, element.eid

            res = requests.get(
                f"https://cad.onshape.com/api/parts/d/{did}/w/{wid}/e/{eid}",
                headers=headers,
                auth=auth
            )
            if res.status_code != 200:
                continue

            part_ids = [p["partId"] for p in res.json()]
            if part_id in part_ids:
                target = {"did": did, "wid": wid, "eid": eid}
                break
        except Exception as e:
            print(f"⚠️ Failed to process {ps_url}: {e}")

    if not target:
        return jsonify({"error": f"Part ID '{part_id}' not found in any part studio"}), 404

    print(f"🚀 Found part, requesting export to {file_format}")
    r = requests.post(
        f"https://cad.onshape.com/api/partstudios/d/{target['did']}/w/{target['wid']}/e/{target['eid']}/translations",
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        auth=auth,
        json={
            "formatName": file_format,
            "partIds": part_id,
            "storeInDocument": False
        }
    )

    if r.status_code != 200:
        print("❌ Failed to start translation:", r.text)
        return jsonify({"error": "Failed to start translation"}), 500

    translation_id = r.json().get("id")
    print("🆔 Translation ID:", translation_id)

    # ⏳ Poll until ready
    for attempt in range(30):
        time.sleep(0.5)
        poll = requests.get(
            f"https://cad.onshape.com/api/translations/{translation_id}",
            headers=headers,
            auth=auth
        )
        result = poll.json()
        state = result.get("requestState")
        print(f"⏳ Attempt {attempt + 1}: {state}")
        if state == "DONE":
            ids = result.get("resultExternalDataIds")
            if not ids:
                return jsonify({"error": "Export completed but no file found"}), 500
            external_id = ids[0]
            download_url = f"https://cad.onshape.com/api/documents/d/{target['did']}/externaldata/{external_id}"
            print("✅ Downloading from:", download_url)

            # 🎯 Fetch the actual file
            file_response = requests.get(download_url, headers=headers, auth=auth, stream=True)
            if file_response.status_code != 200:
                return jsonify({"error": "Failed to retrieve translated file"}), 500

            # 🧾 Stream the file back
            filename = f"{part_id}.{file_format.lower()}"
            return send_file(
                io.BytesIO(file_response.content),
                mimetype="application/octet-stream",
                as_attachment=True,
                download_name=filename
            )

        elif state == "FAILED":
            return jsonify({"error": "Translation failed"}), 500

    return jsonify({"error": "Export timed out"}), 504


@app.route("/api/viewer_gltf", methods=["POST"])
@jwt_required()
def view_gltf():
    import requests
    from flask import Response
    from onshape_client.onshape_url import OnshapeElement

    data = request.get_json()
    team_number = data.get("team_number")
    robot_name = data.get("robot")
    system_name = data.get("system")
    part_id = data.get("id")

    team = Team.query.filter_by(team_number=team_number).first()
    if not team: return jsonify({"error": "Team not found"}), 404

    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    if not robot: return jsonify({"error": "Robot not found"}), 404

    system = System.query.filter_by(robot_id=robot.id, name=system_name).first()
    if not system: return jsonify({"error": "System not found"}), 404

    auth = (system.access_key, system.secret_key)

    for ps_url in system.partstudio_urls:
        try:
            element = OnshapeElement(ps_url)
            did, wid, eid = element.did, element.wvmid, element.eid

            # 🔍 Find matching part
            parts_res = requests.get(
                f"https://cad.onshape.com/api/parts/d/{did}/w/{wid}/e/{eid}",
                headers={"Accept": "application/json"},
                auth=auth
            )

            if parts_res.status_code != 200:
                return jsonify({"error": "Failed to fetch part list", "status": parts_res.status_code,
                                "details": parts_res.text}), parts_res.status_code

            for part in parts_res.json():
                if part["partId"] == part_id:
                    gltf_url = (
                        f"https://cad.onshape.com/api/v12/parts/d/{did}/w/{wid}/e/{eid}/partid/{part_id}/gltf"
                        f"?rollbackBarIndex=-1"
                        f"&outputSeparateFaceNodes=false"
                        f"&outputFaceAppearances=false"
                        f"&angleTolerance=0.5"  # Smaller = smoother curves
                        f"&chordTolerance=0.05"  # Smaller = higher precision
                        f"&maxFacetWidth=0.1"  # Smaller = more detail
                    )

                    headers = {
                        "Accept": "*/*"
                    }
                    gltf_res = requests.get(gltf_url, headers=headers, auth=auth, stream=True)

                    if gltf_res.status_code == 200:
                        return Response(gltf_res.content, content_type="model/gltf+json")
                    else:
                        return jsonify({
                            "error": "GLTF fetch failed",
                            "status": gltf_res.status_code,
                            "url": gltf_url,
                            "details": gltf_res.text
                        }), gltf_res.status_code
        except Exception as e:
            return jsonify({"error": f"Exception: {str(e)}"}), 500

    return jsonify({"error": f"Part '{part_id}' not found in any partstudio"}), 404


@app.route('/api/admin/download_settings_dict', methods=['GET'])
@jwt_required()
def download_settings_dict():
    """(Global Admin) Download Onshape API settings (keys and assembly URLs) for all teams."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    if not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    settings_data_dict = {}
    for team in Team.query.all():
        team_settings = {}
        for robot in team.robots:
            if robot.systems:
                sys = robot.systems[0]
                team_settings[robot.name] = {
                    "accessKey": sys.access_key or "",
                    "secretKey": sys.secret_key or "",
                    "documentURL": sys.assembly_url or ""
                }
            else:
                team_settings[robot.name] = {"accessKey": "", "secretKey": "", "documentURL": ""}
        settings_data_dict[team.team_number] = team_settings
    return jsonify({"settings_data_dict": settings_data_dict}), 200


@app.route("/api/system_settings", methods=["GET"])
@jwt_required()
def get_system_settings():
    team_number = request.args.get("team_number")
    robot_name = request.args.get("robot_name")
    system_name = request.args.get("system_name")

    if not team_number or not robot_name or not system_name:
        return jsonify({"error": "Missing parameters"}), 400

    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404

    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    if not robot:
        return jsonify({"error": "Robot not found"}), 404

    system = System.query.filter_by(robot_id=robot.id, name=system_name).first()
    if not system:
        return jsonify({"error": "System not found"}), 404

    return jsonify({
        "assembly_url": system.assembly_url,
        "access_key": system.access_key,
        "secret_key": system.secret_key,
        "partstudio_urls": system.partstudio_urls or []
    }), 200


@app.route("/api/update_system_settings", methods=["POST"])
@jwt_required()
def update_system_settings():
    data = request.get_json()
    team_number = data.get("team_number")
    robot_name = data.get("robot_name")
    old_system_name = data.get("old_system_name")
    new_system_name = data.get("new_system_name")
    print(old_system_name)
    if old_system_name == "":
        system_name = data.get("system_name")
    else:
        system_name = old_system_name
    current_user = get_jwt_identity()
    claims = get_jwt()
    if current_user != team_number and not claims.get("is_global_admin"):
        return jsonify({"error": "Unauthorized"}), 403

    team = Team.query.filter_by(team_number=team_number).first()
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    system = System.query.filter_by(robot_id=robot.id, name=system_name).first()

    if not system:
        return jsonify({"error": "System not found"}), 404

    if old_system_name != "":
        system.name = new_system_name
    system.assembly_url = data.get("assembly_url")
    system.access_key = data.get("access_key")
    system.secret_key = data.get("secret_key")
    system.partstudio_urls = data.get("partstudio_urls")

    db.session.commit()
    return jsonify({"success": True})


# Web endpoints for form actions (for completeness)
@app.route('/<team_number>/new_robot', methods=['POST'])
def create_robot_web(team_number):
    team = Team.query.filter_by(team_number=team_number).first_or_404()
    name = request.form.get('name')
    year = request.form.get('year') or datetime.now().year
    image_text = request.files.get('image_text')
    if not name or not year:
        return redirect(request.referrer or f"/{team_number}/Admin")  # missing data
    if Robot.query.filter_by(team_id=team.id, name=name).first():
        return redirect(request.referrer or f"/{team_number}/Admin")  # duplicate name
    new_robot = Robot(name=name, year=int(year), team_id=team.id)
    db.session.add(new_robot)
    db.session.flush()
    # Create default subsystems and machines as per template (simplified)
    for sys_name in ["Main", "System1", "System2", "System3", "System4", "System5"]:
        db.session.add(System(robot=new_robot, name=sys_name, bom_data=[]))
    if image_text:
        team_dir = os.path.join(app.config['UPLOAD_FOLDER'], f"team_{team_number}", "robots")
        os.makedirs(team_dir, exist_ok=True)
        ext = ''
        filename = secure_filename(image_text.filename)
        if '.' in filename:
            ext = filename.rsplit('.', 1)[1].lower()
        image_textname = f"robot_{new_robot.id}.{ext}" if ext else f"robot_{new_robot.id}"
        image_path = os.path.join(team_dir, image_textname)
        image_text.save(image_path)
        new_robot.image_text = os.path.join("uploads", f"team_{team_number}", "robots", image_textname)
    db.session.commit()
    return redirect(f"/{team_number}/Admin")


@app.route('/delete_robot/<int:robot_id>', methods=['POST'])
def delete_robot(robot_id):
    robot = Robot.query.get_or_404(robot_id)
    team_number = robot.team.team_number
    # Remove associated files as in API
    if robot.image_text:
        file_path = os.path.join(app.root_path, 'static', robot.image_text)
        if os.path.isfile(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass
    for mach in robot.machines:
        if mach.icon_file:
            icon_path = os.path.join(app.root_path, 'static', mach.icon_file)
            if os.path.isfile(icon_path):
                try:
                    os.remove(icon_path)
                except Exception:
                    pass
    db.session.delete(robot)
    db.session.commit()
    return redirect(f"/{team_number}/Admin")


@app.route('/<team_number>/delete_machine/<int:machine_id>', methods=['POST'])
def delete_machine_web(team_number, machine_id):
    machine = Machine.query.get_or_404(machine_id)
    if machine.icon_file:
        file_path = os.path.join(app.root_path, 'static', machine.icon_file)
        if os.path.isfile(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass
    db.session.delete(machine)
    db.session.commit()
    return redirect(f"/{team_number}/manage_machines")


# SocketIO events
@socketio.on('connect')
def handle_connect():
    app.logger.info('Client connected via SocketIO')


@socketio.on('disconnect')
def handle_disconnect():
    app.logger.info('Client disconnected')


@app.route("/api/debug_system_url")
@jwt_required()
def debug_system_url():
    team_number = request.args.get("team_number")
    robot_name = request.args.get("robot")
    system_name = request.args.get("system")
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    if not robot:
        return jsonify({"error": "Robot not found"}), 404
    system = System.query.filter_by(robot_id=robot.id, name=system_name).first()
    if not system:
        return jsonify({"error": "System not found"}), 404
    return jsonify({
        "assembly_url": system.assembly_url,
        "access_key": system.access_key,
        "secret_key": system.secret_key
    })


@socketio.on("qty_update")
def handle_qty_update(data):
    emit("qty_update", data, broadcast=True)


def run():
    print("✅ Flask app is starting via socketio.run() (Gunicorn)")
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
