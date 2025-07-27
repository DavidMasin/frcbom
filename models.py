# models.py
# No changes to imports are needed if they are already present
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.dialects.postgresql import JSON
import bcrypt

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'))
    team = db.relationship('Team', back_populates='users')
    role = db.Column(db.String(50), default='member')

    def set_password(self, password):
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def check_password(self, password):
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))

class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    team_number = db.Column(db.Integer, unique=True, nullable=False)
    users = db.relationship('User', back_populates='team')
    robots = db.relationship('Robot', back_populates='team', cascade="all, delete-orphan")
    machines = db.relationship('Machine', back_populates='team', cascade="all, delete-orphan")
    password = db.Column(db.String, nullable=False)
    adminPassword = db.Column(db.String, nullable=False)


class Robot(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=False)
    team = db.relationship('Team', back_populates='robots')
    systems = db.relationship('System', back_populates='robot', cascade="all, delete-orphan")
    # New field for the robot's image
    image_file = db.Column(db.String(100), nullable=True, default='default_robot.png')


# New Model for Robot Systems
class System(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    assembly_url = db.Column(db.String(500), nullable=False)
    # Using JSON to store a list of part studio URLs
    part_studio_urls = db.Column(JSON)
    onshape_access_key = db.Column(db.String(100), nullable=False)
    onshape_secret_key = db.Column(db.String(100), nullable=False)
    robot_id = db.Column(db.Integer, db.ForeignKey('robot.id'), nullable=False)
    robot = db.relationship('Robot', back_populates='systems')

# New Model for Team Machines
class Machine(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    # Field for the machine's icon
    icon_file = db.Column(db.String(100), nullable=True, default='default_machine.png')
    # The default CAD format for this machine (e.g., 'STL', 'STEP')
    output_format = db.Column(db.String(20), nullable=False, default='STEP')
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=False)
    team = db.relationship('Team', back_populates='machines')

