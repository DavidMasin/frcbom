import os
from flask import Flask, request, jsonify, send_file, render_template, redirect
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity, get_jwt, jwt_required
from flask_cors import CORS
from flask_socketio import SocketIO
from onshape_client import OnshapeElement
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from flask_migrate import Migrate

# Initialize Flask app and configuration
app = Flask(__name__)
# Configure database URI (use env variable for Railway PostgreSQL, fallback to SQLite for local dev)
db_uri = os.getenv("DATABASE_URL")
if db_uri and db_uri.startswith("postgres://"):
    db_uri = db_uri.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = db_uri or 'sqlite:///teams.db'
# app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///teams.db'

app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'super-secure-jwt-key')
app.config['UPLOAD_FOLDER'] = os.path.join(app.root_path, 'static', 'uploads')

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

# HTML page routes (for existing frontend templates)
@app.route('/')
def home():
    return render_template("index.html")
# @app.route("/")
# def hello():
#     return "Hello from Gunicorn!"
@app.route('/<team_number>/<robot_name>')
def team_dashboard(team_number, robot_name):
    return render_template('dashboard.html', team_number=team_number, robot_name=robot_name)

@app.route('/<team_number>')
def team_page(team_number):
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return "Team not found", 404
    return render_template('dashboard.html', team_number=team_number)
# (New route for user dashboard with no robot specified)

@app.route("/<team_number>/Admin")
def team_admin_dashboard(team_number):
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return "Team not found", 404

    robots = Robot.query.filter_by(team_id=team.id).all()
    return render_template(
        "teamAdmin_dashboard.html",
        team_number=team_number,
        team_id=team.id,
        robots=robots
    )
# (JWT requirement and identity checks removed from the admin route above)
@app.route("/<team_number>/new_robot")
def new_robot_form(team_number):
    team = Team.query.filter_by(team_number=team_number).first_or_404()
    return render_template(
        "new_robot.html",
        team_id=team.id,
        team_number=team.team_number,
        default_config=None,
    )


@app.route('/<team_number>/Admin/<robot_name>')
def team_admin_robot(team_number, robot_name):
    return redirect(f"/{team_number}/Admin/{robot_name}/Main")
# (New route: ensure “Main” system in URL by redirecting)

@app.route('/<team_number>/Admin/<robot_name>/<system>')
def team_admin_bom(team_number, robot_name, system):
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return "Team not found", 404
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
    if not robot:
        return "Robot not found", 404

    robots = Robot.query.filter_by(team_id=team.id).all()
    return render_template(
        "teamAdmin_dashboard.html",
        team_number=team_number,
        team_name=team.name,
        team_id=team.id,
        robots=robots,
        current_robot=robot_name,
        filter_system=system
    )
# (New route: serves team admin dashboard for a specific robot & system)

@app.route('/<team_number>/<robot_name>/<system>')
def team_bom_filtered(team_number, robot_name, system):
    return render_template('dashboard.html', team_number=team_number, robot_name=robot_name, filter_system=system)

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

    # Check if team already exists
    if Team.query.filter_by(team_number=team_number).first():
        return jsonify({"error": "Team already exists"}), 400

    # Create new team with hashed passwords
    hashed_password = generate_password_hash(password)
    hashed_admin_password = generate_password_hash(admin_password)
    new_team = Team(team_number=team_number, password=hashed_password, adminPassword=hashed_admin_password)
    db.session.add(new_team)
    db.session.commit()
    return jsonify({"message": "Team registered successfully"}), 200

@app.route('/api/login', methods=['POST'])
def login():
    """Login a team (using user or admin password) and return a JWT token and role info."""
    data = request.get_json()
    team_number = data.get('team_number')
    password = data.get('password')
    if not team_number or not password:
        return jsonify({"error": "Team number and password are required"}), 400

    team = Team.query.filter_by(team_number=team_number).first()
    if not team or not (check_password_hash(team.password, password) or check_password_hash(team.adminPassword, password)):
        return jsonify({"error": "Invalid credentials"}), 401

    # Determine role
    is_admin = False
    if check_password_hash(team.adminPassword, password):
        is_admin = True
    # Set JWT claims for roles
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
        robot_data = {
            "id": robot.id,
            "name": robot.name,
            "is_template": robot.is_template,
            "image": None
        }
        if robot.image:
            # Provide relative static path for the image
            img_path = robot.image
            idx = img_path.find('/static/')
            if idx != -1:
                robot_data["image"] = img_path[idx:]
            else:
                robot_data["image"] = robot.image
        robot_list.append(robot_data)
    return jsonify({"robots": robot_list}), 200

@app.route('/api/robots', methods=['POST'])
@jwt_required()
def create_robot():
    """Create a new robot (team admin or global admin only)."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    # Accept JSON or form data
    if request.is_json:
        team_number = request.json.get("team_number")
        robot_name = request.json.get("robot_name")
    else:
        team_number = request.form.get("team_number")
        robot_name = request.form.get("robot_name")
    image_file = request.files.get('image')

    if not team_number or not robot_name:
        return jsonify({"error": "Team number and robot name are required"}), 400
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404
    if Robot.query.filter_by(team_id=team.id, name=robot_name).first():
        return jsonify({"error": "Robot name already exists"}), 400

    new_robot = Robot(name=robot_name, team_id=team.id)
    # Determine if a default template robot exists to copy settings
    template_robot = Robot.query.filter_by(team_id=team.id, is_template=True).first()
    db.session.add(new_robot)
    db.session.flush()  # assign ID

    # Save robot image if provided
    if image_file:
        team_dir = os.path.join(app.config['UPLOAD_FOLDER'], f"team_{team_number}", "robots")
        os.makedirs(team_dir, exist_ok=True)
        ext = ''
        filename = secure_filename(image_file.filename)
        if '.' in filename:
            ext = filename.rsplit('.', 1)[1].lower()
        image_filename = f"robot_{new_robot.id}.{ext}" if ext else f"robot_{new_robot.id}"
        image_path = os.path.join(team_dir, image_filename)
        image_file.save(image_path)
        new_robot.image = image_path

    # Create default systems for the new robot
    default_systems = ["Main", "System1", "System2", "System3", "System4", "System5"]
    for sys_name in default_systems:
        sys_record = System(robot=new_robot, name=sys_name, assembly_url=None, partstudio_urls=[], bom_data=[])
        # Copy Onshape API keys from template robot's corresponding system (if exists)
        if template_robot:
            templ_sys = System.query.filter_by(robot_id=template_robot.id, name=sys_name).first()
            if templ_sys:
                sys_record.access_key = templ_sys.access_key
                sys_record.secret_key = templ_sys.secret_key
        db.session.add(sys_record)
    # Copy machine definitions from template robot (if exists)
    if template_robot:
        for templ_machine in template_robot.machines:
            machine_copy = Machine(robot=new_robot, name=templ_machine.name, cad_format=templ_machine.cad_format)
            if templ_machine.icon:
                machine_dir = os.path.join(app.config['UPLOAD_FOLDER'], f"team_{team_number}", "machines")
                os.makedirs(machine_dir, exist_ok=True)
                if os.path.isfile(templ_machine.icon):
                    ext = templ_machine.icon.rsplit('.', 1)[-1] if '.' in templ_machine.icon else ''
                    new_icon_filename = f"machine_{new_robot.id}_{secure_filename(templ_machine.name)}.{ext}" if ext else f"machine_{new_robot.id}_{secure_filename(templ_machine.name)}"
                    new_icon_path = os.path.join(machine_dir, new_icon_filename)
                    try:
                        with open(templ_machine.icon, 'rb') as src, open(new_icon_path, 'wb') as dst:
                            dst.write(src.read())
                        machine_copy.icon = new_icon_path
                    except Exception:
                        machine_copy.icon = None
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
    new_name = None
    if request.is_json:
        new_name = request.json.get("name")
    else:
        new_name = request.form.get("name")
    image_file = request.files.get("image")

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
    if image_file:
        team_dir = os.path.join(app.config['UPLOAD_FOLDER'], f"team_{team.team_number}", "robots")
        os.makedirs(team_dir, exist_ok=True)
        ext = ''
        filename = secure_filename(image_file.filename)
        if '.' in filename:
            ext = filename.rsplit('.', 1)[1].lower()
        image_filename = f"robot_{robot.id}.{ext}" if ext else f"robot_{robot.id}"
        image_path = os.path.join(team_dir, image_filename)
        # Remove old image if exists
        if robot.image and os.path.isfile(robot.image):
            try:
                os.remove(robot.image)
            except Exception as e:
                print(f"Warning: could not remove old robot image: {e}")
        image_file.save(image_path)
        robot.image = image_path

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

    # Delete associated files (robot image, system images, machine icons)
    if robot.image and os.path.isfile(robot.image):
        try:
            os.remove(robot.image)
        except Exception as e:
            print(f"Warning: could not delete robot image file: {e}")
    for sys in robot.systems:
        if sys.image and os.path.isfile(sys.image):
            try:
                os.remove(sys.image)
            except Exception as e:
                print(f"Warning: could not delete system image file: {e}")
    for mach in robot.machines:
        if mach.icon and os.path.isfile(mach.icon):
            try:
                os.remove(mach.icon)
            except Exception as e:
                print(f"Warning: could not delete machine icon file: {e}")
    try:
        db.session.delete(robot)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to delete robot: {str(e)}"}), 500
    return jsonify({"message": "Robot deleted successfully"}), 200

# Legacy endpoints (for compatibility with existing frontend calls)
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

    new_robot = Robot(name=robot_name, team_id=team.id)
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
            machine_copy = Machine(robot=new_robot, name=templ_machine.name, cad_format=templ_machine.cad_format)
            if templ_machine.icon and os.path.isfile(templ_machine.icon):
                ext = templ_machine.icon.rsplit('.', 1)[-1] if '.' in templ_machine.icon else ''
                machine_dir = os.path.join(app.config['UPLOAD_FOLDER'], f"team_{team_number}", "machines")
                os.makedirs(machine_dir, exist_ok=True)
                new_icon_filename = f"machine_{new_robot.id}_{secure_filename(templ_machine.name)}.{ext}" if ext else f"machine_{new_robot.id}_{secure_filename(templ_machine.name)}"
                new_icon_path = os.path.join(machine_dir, new_icon_filename)
                try:
                    with open(templ_machine.icon, 'rb') as src, open(new_icon_path, 'wb') as dst:
                        dst.write(src.read())
                    machine_copy.icon = new_icon_path
                except Exception:
                    machine_copy.icon = None
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
    if robot.image and os.path.isfile(robot.image):
        try:
            os.remove(robot.image)
        except Exception:
            pass
    for sys in robot.systems:
        if sys.image and os.path.isfile(sys.image):
            try:
                os.remove(sys.image)
            except Exception:
                pass
    for mach in robot.machines:
        if mach.icon and os.path.isfile(mach.icon):
            try:
                os.remove(mach.icon)
            except Exception:
                pass
    try:
        db.session.delete(robot)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to delete robot: {str(e)}"}), 500
    return jsonify({"message": f"Robot '{robot_name}' deleted successfully"}), 200

# System endpoints
@app.route('/api/systems/<int:system_id>', methods=['PUT'])
@jwt_required()
def update_system(system_id):
    """Update a system's details (name, assembly URL, part studios, API keys, image)."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    # Accept JSON or form data
    data = request.get_json() if request.is_json else request.form
    new_name = data.get('name')
    assembly_url = data.get('assembly_url')
    partstudio_list = data.get('partstudio_urls')
    access_key = data.get('access_key')
    secret_key = data.get('secret_key')
    image_file = request.files.get('image')

    system = System.query.get(system_id)
    if not system:
        return jsonify({"error": "System not found"}), 404
    robot = Robot.query.get(system.robot_id)
    team = Team.query.get(robot.team_id) if robot else None
    if not robot or not team:
        return jsonify({"error": "Associated robot/team not found"}), 404
    if not (claims.get('is_team_admin') and current_user == team.team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    if new_name:
        new_name = new_name.strip()
        if new_name == "":
            return jsonify({"error": "System name cannot be empty"}), 400
        if new_name != system.name:
            if System.query.filter_by(robot_id=robot.id, name=new_name).first():
                return jsonify({"error": "Another system with this name already exists"}), 400
            system.name = new_name
    if assembly_url is not None:
        system.assembly_url = assembly_url.strip() if assembly_url != "" else None
    if partstudio_list is not None:
        # partstudio_urls might be JSON list or comma-separated string
        if isinstance(partstudio_list, str):
            urls = [u.strip() for u in partstudio_list.split(",") if u.strip()]
            system.partstudio_urls = urls
        elif isinstance(partstudio_list, list):
            system.partstudio_urls = partstudio_list
    if access_key is not None:
        system.access_key = access_key if access_key != "" else None
    if secret_key is not None:
        system.secret_key = secret_key if secret_key != "" else None
    if image_file:
        system_dir = os.path.join(app.config['UPLOAD_FOLDER'], f"team_{team.team_number}", "systems")
        os.makedirs(system_dir, exist_ok=True)
        ext = ''
        filename = secure_filename(image_file.filename)
        if '.' in filename:
            ext = filename.rsplit('.', 1)[1].lower()
        image_filename = f"system_{system.id}.{ext}" if ext else f"system_{system.id}"
        image_path = os.path.join(system_dir, image_filename)
        if system.image and os.path.isfile(system.image):
            try:
                os.remove(system.image)
            except Exception as e:
                print(f"Warning: could not remove old system image: {e}")
        image_file.save(image_path)
        system.image = image_path

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to update system: {str(e)}"}), 500
    return jsonify({"message": "System updated successfully"}), 200

@app.route('/api/systems/<int:system_id>', methods=['DELETE'])
@jwt_required()
def delete_system(system_id):
    """Delete a system from a robot."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    system = System.query.get(system_id)
    if not system:
        return jsonify({"error": "System not found"}), 404
    robot = Robot.query.get(system.robot_id)
    team = Team.query.get(robot.team_id) if robot else None
    if not robot or not team:
        return jsonify({"error": "Associated robot/team not found"}), 404
    if not (claims.get('is_team_admin') and current_user == team.team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    if system.image and os.path.isfile(system.image):
        try:
            os.remove(system.image)
        except Exception:
            pass
    try:
        db.session.delete(system)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to delete system: {str(e)}"}), 500
    return jsonify({"message": "System deleted successfully"}), 200

# Machine endpoints
@app.route('/api/machines', methods=['GET'])
@jwt_required()
def list_machines():
    """List all machines for a given team and robot."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    team_number = request.args.get('team_number')
    robot_name = request.args.get('robot_name')
    if not team_number or not robot_name:
        return jsonify({"error": "Team number and robot name are required"}), 400
    if current_user != team_number and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    team = Team.query.filter_by(team_number=team_number).first()
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first() if team else None
    if not team or not robot:
        return jsonify({"error": "Team or robot not found"}), 404

    machines = Machine.query.filter_by(robot_id=robot.id).all()
    machine_list = []
    for m in machines:
        machine_data = {"id": m.id, "name": m.name, "cad_format": m.cad_format, "icon": None}
        if m.icon:
            icon_path = m.icon
            idx = icon_path.find('/static/')
            if idx != -1:
                machine_data["icon"] = icon_path[idx:]
            else:
                machine_data["icon"] = m.icon
        machine_list.append(machine_data)
    return jsonify({"machines": machine_list}), 200

@app.route('/api/machines', methods=['POST'])
@jwt_required()
def add_machine():
    """Add a new machine to a robot (team admin or global admin only)."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    if request.is_json:
        team_number = request.json.get("team_number")
        robot_name = request.json.get("robot_name")
        machine_name = request.json.get("name")
        cad_format = request.json.get("cad_format")
    else:
        team_number = request.form.get("team_number")
        robot_name = request.form.get("robot_name")
        machine_name = request.form.get("name")
        cad_format = request.form.get("cad_format")
    icon_file = request.files.get("icon")

    if not team_number or not robot_name or not machine_name or not cad_format:
        return jsonify({"error": "Team number, robot name, machine name, and cad_format are required"}), 400
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    team = Team.query.filter_by(team_number=team_number).first()
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first() if team else None
    if not team or not robot:
        return jsonify({"error": "Team or robot not found"}), 404
    if Machine.query.filter_by(robot_id=robot.id, name=machine_name).first():
        return jsonify({"error": "Machine name already exists for this robot"}), 400

    new_machine = Machine(robot=robot, name=machine_name, cad_format=cad_format)
    db.session.add(new_machine)
    db.session.flush()  # assign ID

    if icon_file:
        machine_dir = os.path.join(app.config['UPLOAD_FOLDER'], f"team_{team_number}", "machines")
        os.makedirs(machine_dir, exist_ok=True)
        ext = ''
        icon_filename_secure = secure_filename(icon_file.filename)
        if '.' in icon_filename_secure:
            ext = icon_filename_secure.rsplit('.', 1)[1].lower()
        icon_filename = f"machine_{robot.id}_{secure_filename(machine_name)}.{ext}" if ext else f"machine_{robot.id}_{secure_filename(machine_name)}"
        icon_path = os.path.join(machine_dir, icon_filename)
        icon_file.save(icon_path)
        new_machine.icon = icon_path

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
            "icon": (new_machine.icon[new_machine.icon.find('/static/'):]
                     if new_machine.icon and new_machine.icon.find('/static/') != -1 else None)
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
        if machine.icon and os.path.isfile(machine.icon):
            try:
                os.remove(machine.icon)
            except Exception as e:
                print(f"Warning: could not remove old machine icon: {e}")
        icon_file.save(icon_path)
        machine.icon = icon_path

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

    if machine.icon and os.path.isfile(machine.icon):
        try:
            os.remove(machine.icon)
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
    system_name = data.get("system_name")
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
        # If system did not exist (in case of a new custom system name), create it
        system = System(robot=robot, name=system_name)
        db.session.add(system)
    system.bom_data = bom_data
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to save BOM data: {str(e)}"}), 500
    return jsonify({"message": "BOM data saved successfully"}), 200

@app.route('/api/bom', methods=['POST'])
@jwt_required()
def fetch_bom():
    """
    Fetch the Bill of Materials from Onshape for a given assembly URL and save it for a team/robot/system.
    Requires Onshape API access key and secret. (Team admin or global admin only.)
    Payload JSON: {document_url, team_number, robot, system, access_key, secret_key}
    """
    current_user = get_jwt_identity()
    claims = get_jwt()
    data = request.get_json()
    document_url = data.get("document_url")
    team_number = data.get("team_number")
    robot_name = data.get("robot")
    system_name = data.get("system", "Main")
    access_key = data.get("access_key")
    secret_key = data.get("secret_key")
    if not document_url or not team_number or not access_key or not secret_key:
        return jsonify({"error": "Document URL, team_number, access_key, and secret_key are required"}), 400
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    team = Team.query.filter_by(team_number=team_number).first()
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first() if team else None
    if not team or not robot:
        return jsonify({"error": "Team or robot not found"}), 404

    # Initialize Onshape API client
    from onshape_client.client import Client
    from onshape_client.onshape_url import OnshapeElement
    try:
        element = OnshapeElement(document_url)
    except Exception as e:
        return jsonify({"error": f"Invalid Onshape document URL: {str(e)}"}), 400
    client = Client(configuration={
        "base_url": "https://cad.onshape.com",
        "access_key": access_key,
        "secret_key": secret_key
    })
    try:
        did = element.did
        wid = element.wvmid
        eid = element.eid
        bom_url = f"/api/v10/assemblies/d/{did}/w/{wid}/e/{eid}/bom"
        headers = {'Accept': 'application/vnd.onshape.v1+json', 'Content-Type': 'application/json'}
        response = client.api_client.request('GET', url="https://cad.onshape.com" + bom_url,
                                            query_params={"indented": False}, headers=headers, body={})
        # Onshape client might return data as bytes
        bom_json = response.data
        if isinstance(bom_json, (bytes, bytearray)):
            import json as jsonlib
            bom_json = jsonlib.loads(bom_json)
    except Exception as e:
        return jsonify({"error": f"Failed to fetch BOM from Onshape: {str(e)}"}), 500

    # Helper to find column header IDs in BOM JSON
    def find_id_by_name(bom_dict, name):
        for header in bom_dict.get("headers", []):
            if header.get('name') == name:
                return header.get('id')
        return None

    # Determine relevant column IDs
    part_name_id = find_id_by_name(bom_json, "Name")
    desc_id = find_id_by_name(bom_json, "Description")
    qty_id = find_id_by_name(bom_json, "Quantity") or find_id_by_name(bom_json, "QTY")
    material_id = find_id_by_name(bom_json, "Material")
    material_bom_id = find_id_by_name(bom_json, "Bom Material") or material_id
    preproc_id = find_id_by_name(bom_json, "Pre Process")
    proc1_id = find_id_by_name(bom_json, "Process 1")
    proc2_id = find_id_by_name(bom_json, "Process 2")

    # Build list of BOM part entries (each as a dict of relevant fields)
    bom_data_list = []
    for row in bom_json.get("rows", []):
        values = row.get("headerIdToValue", {})
        part_entry = {
            "Part Name": values.get(part_name_id, "Unknown") if part_name_id else "Unknown",
            "Description": values.get(desc_id, "Unknown") if desc_id else "Unknown",
            "Quantity": values.get(qty_id, "N/A") if qty_id else "N/A",
            "Material": values.get(material_id, "Unknown") if material_id else "Unknown",
            "materialBOM": values.get(material_bom_id, "Unknown") if material_bom_id else "Unknown",
            "Pre Process": values.get(preproc_id, "Unknown") if preproc_id else "Unknown",
            "Process 1": values.get(proc1_id, "Unknown") if proc1_id else "Unknown",
            "Process 2": values.get(proc2_id, "Unknown") if proc2_id else "Unknown",
            "partId": row.get("itemSource", {}).get("partId", "")
        }
        # Simplify material fields if they are objects with displayName
        if isinstance(part_entry["Material"], dict):
            part_entry["Material"] = part_entry["Material"].get("displayName", "Unknown")
        if isinstance(part_entry["materialBOM"], dict):
            part_entry["materialBOM"] = part_entry["materialBOM"].get("displayName", "Unknown")
        bom_data_list.append(part_entry)

    # Save BOM data and Onshape credentials in the database
    system = System.query.filter_by(robot_id=robot.id, name=system_name).first()
    if not system:
        system = System(robot=robot, name=system_name)
        db.session.add(system)
    system.access_key = access_key
    system.secret_key = secret_key
    system.assembly_url = document_url
    system.bom_data = bom_data_list
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to save BOM data: {str(e)}"}), 500

    return jsonify({"bom_data": bom_data_list}), 200

@app.route("/api/download_cad", methods=["POST"])
@jwt_required()
def download_cad():
    """Generate a downloadable CAD file for a specific part from Onshape (format based on machine type)."""
    import requests, time
    current_user = get_jwt_identity()
    claims = get_jwt()
    data = request.get_json()
    team_number = data.get("team_number")
    robot_name = data.get("robot")
    system_name = data.get("system")
    part_id = data.get("id")
    if not team_number or not robot_name or not system_name or not part_id:
        return jsonify({"error": "Missing required fields (team_number, robot, system, id)"}), 400
    if current_user != team_number and not claims.get("is_global_admin"):
        return jsonify({"error": "Unauthorized"}), 403

    team = Team.query.filter_by(team_number=team_number).first()
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first() if team else None
    system = System.query.filter_by(robot_id=robot.id, name=system_name).first() if robot else None
    if not team or not robot or not system:
        return jsonify({"error": "Team, robot, or system not found"}), 404
    if not system.access_key or not system.secret_key or not system.assembly_url:
        return jsonify({"error": "Onshape API credentials or assembly URL not configured for this system"}), 400

    # Verify the part exists in the assembly
    did = OnshapeElement(system.assembly_url).did
    wid = OnshapeElement(system.assembly_url).wvmid
    eid = OnshapeElement(system.assembly_url).eid
    headers = {"Accept": "application/json"}
    r = requests.get(f"https://cad.onshape.com/api/parts/d/{did}/w/{wid}/e/{eid}",
                     auth=(system.access_key, system.secret_key), headers=headers)
    if r.status_code != 200:
        return jsonify({"error": "Failed to list parts in assembly"}), 500
    parts = r.json()
    if part_id not in [p.get("partId") for p in parts]:
        return jsonify({"error": f"Part ID '{part_id}' not found in Onshape assembly"}), 404

    # Determine desired format (e.g., use STL for 3D printed parts, otherwise STEP)
    format_name = "STEP"
    if system.bom_data:
        for part in system.bom_data:
            if part.get("partId") == part_id:
                proc = part.get("Process 1", "") or part.get("Process1", "")
                if proc and "3D" in proc:
                    format_name = "STL"
                break
    # Request Onshape to generate the translation
    r = requests.post(f"https://cad.onshape.com/api/partstudios/d/{did}/w/{wid}/e/{eid}/translations",
                      auth=(system.access_key, system.secret_key),
                      headers={"Accept": "application/json", "Content-Type": "application/json"},
                      json={"formatName": format_name, "partIds": part_id, "storeInDocument": False})
    if r.status_code != 200:
        return jsonify({"error": "Failed to initiate Onshape translation"}), 500
    translation_id = r.json().get("id")
    if not translation_id:
        return jsonify({"error": "Onshape translation did not return an ID"}), 500

    # Poll for translation completion and get the download URL
    download_url = None
    for attempt in range(30):
        status_resp = requests.get(f"https://cad.onshape.com/api/translations/{translation_id}",
                                   auth=(system.access_key, system.secret_key), headers=headers)
        status = status_resp.json()
        if status.get("requestState") == "DONE":
            ids = status.get("resultExternalDataIds")
            if ids:
                download_url = f"https://cad.onshape.com/api/documents/d/{did}/externaldata/{ids[0]}"
            break
        elif status.get("requestState") == "FAILED":
            return jsonify({"error": "Onshape translation failed"}), 500
        time.sleep(0.5)
    if not download_url:
        return jsonify({"error": "CAD export timed out"}), 504
    return jsonify({"redirect_url": download_url}), 200

# Global admin endpoints (for data download/upload)
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
        # All parts from all systems of all robots in the team
        for robot in team.robots:
            for sys in robot.systems:
                if sys.bom_data:
                    combined_parts.extend(sys.bom_data)
    else:
        # Parts from the specified subsystem (by name) across all robots
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
            # Use the first system's settings as representative (assuming same keys for all subsystems)
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

@app.route('/api/admin/download_teams_db', methods=['GET'])
@jwt_required()
def download_teams_db():
    """(Global Admin) Download the raw database file (if using SQLite)."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    if not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    db_url = app.config['SQLALCHEMY_DATABASE_URI']
    if db_url.startswith("sqlite"):
        db_path = db_url.replace("sqlite:///", "")
        if os.path.isfile(db_path):
            return send_file(db_path, as_attachment=True, download_name="teams.db")
        else:
            return jsonify({"error": "Database file not found"}), 400
    else:
        return jsonify({"error": "Direct DB download is not supported for PostgreSQL"}), 400

@app.route('/api/admin/upload_bom_dict', methods=['POST'])
@jwt_required()
def upload_bom_dict():
    """(Global Admin) Upload a BOM data dictionary (JSON file) to import BOM data for all teams."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    if not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files['file']
    import json
    try:
        data = json.loads(file.read().decode('utf-8'))
    except Exception as e:
        return jsonify({"error": f"Invalid JSON file: {e}"}), 400

    # Clear existing BOM data
    for sys in System.query.all():
        sys.bom_data = []
    # Import new BOM data
    for team_num, team_data in data.items():
        team = Team.query.filter_by(team_number=team_num).first()
        if not team:
            continue
        for robot_name, systems_dict in team_data.items():
            robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
            if not robot:
                robot = Robot(team_id=team.id, name=robot_name)
                db.session.add(robot)
                db.session.flush()
            for system_name, parts_list in systems_dict.items():
                system = System.query.filter_by(robot_id=robot.id, name=system_name).first()
                if not system:
                    system = System(robot=robot, name=system_name)
                    db.session.add(system)
                system.bom_data = parts_list if isinstance(parts_list, list) else []
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to import BOM data: {str(e)}"}), 500
    return jsonify({"message": "BOM data imported successfully"}), 200

@app.route('/api/admin/upload_settings_dict', methods=['POST'])
@jwt_required()
def upload_settings_dict():
    """(Global Admin) Upload Onshape settings (keys and assembly URLs) JSON to import for all teams."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    if not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files['file']
    import json
    try:
        data = json.loads(file.read().decode('utf-8'))
    except Exception as e:
        return jsonify({"error": f"Invalid JSON file: {e}"}), 400

    for team_num, robots_dict in data.items():
        team = Team.query.filter_by(team_number=team_num).first()
        if not team:
            continue
        for robot_name, settings in robots_dict.items():
            robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first()
            if not robot:
                robot = Robot(team_id=team.id, name=robot_name)
                db.session.add(robot)
                db.session.flush()
            # Apply settings to each system of the robot (if none, create a Main system)
            if robot.systems:
                for sys in robot.systems:
                    sys.access_key = settings.get("accessKey") or None
                    sys.secret_key = settings.get("secretKey") or None
                    sys.assembly_url = settings.get("documentURL") or None
            else:
                main_sys = System(robot=robot, name="Main",
                                  access_key=settings.get("accessKey") or None,
                                  secret_key=settings.get("secretKey") or None,
                                  assembly_url=settings.get("documentURL") or None,
                                  partstudio_urls=[])
                db.session.add(main_sys)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to import settings data: {str(e)}"}), 500
    return jsonify({"message": "Settings data imported successfully"}), 200

@app.route('/api/clear_bom', methods=['POST'])
@jwt_required()
def clear_bom():
    """Clear all BOM data for a given team (team admin or global admin)."""
    current_user = get_jwt_identity()
    claims = get_jwt()
    data = request.get_json()
    team_number = data.get("team_number")
    if not team_number:
        return jsonify({"error": "Team number is required"}), 400
    if not (claims.get('is_team_admin') and current_user == team_number) and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403
    team = Team.query.filter_by(team_number=team_number).first()
    if not team:
        return jsonify({"error": "Team not found"}), 404
    for robot in team.robots:
        for sys in robot.systems:
            sys.bom_data = []
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to clear BOM data: {str(e)}"}), 500
    return jsonify({"message": "BOM data cleared"}), 200

@app.route('/api/system_settings', methods=['GET'])
@jwt_required()
def get_system_settings():
    """Get Onshape API keys and assembly URL for a given team, robot, and system."""
    team_number = request.args.get("team_number")
    robot_name = request.args.get("robot_name")
    system_name = request.args.get("system_name")
    if not team_number or not robot_name or not system_name:
        return jsonify({"error": "Missing parameters"}), 400
    current_user = get_jwt_identity()
    claims = get_jwt()
    if current_user != team_number and not claims.get('is_global_admin'):
        return jsonify({"error": "Unauthorized"}), 403

    team = Team.query.filter_by(team_number=team_number).first()
    robot = Robot.query.filter_by(team_id=team.id, name=robot_name).first() if team else None
    system = System.query.filter_by(robot_id=robot.id, name=system_name).first() if robot else None
    if not team or not robot or not system:
        return jsonify({"error": "Team, robot, or system not found"}), 404

    return jsonify({
        "access_key": system.access_key or "",
        "secret_key": system.secret_key or "",
        "document_url": system.assembly_url or ""
    }), 200

# SocketIO events (optional real-time features)
@socketio.on('connect')
def handle_connect():
    app.logger.info('Client connected via SocketIO')

@socketio.on('disconnect')
def handle_disconnect():
    app.logger.info('Client disconnected')


def run():
    import os
    port = int(os.environ.get("PORT", 5000))
    print("✅ Flask app is starting via socketio.run() (Gunicorn)")
    socketio.run(app, host="0.0.0.0", port=port)

