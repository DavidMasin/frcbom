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
    password = db.Column(db.String(128))
    adminPassword = db.Column(db.String(128))
    users = db.relationship('User', back_populates='team')
    robots = db.relationship('Robot', back_populates='team', cascade="all, delete-orphan")

class Robot(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    is_template = db.Column(db.Boolean, default=False)
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=False)
    team = db.relationship('Team', back_populates='robots')
    systems = db.relationship('System', back_populates='robot', cascade="all, delete-orphan")
    machines = db.relationship('Machine', back_populates='robot', cascade="all, delete-orphan")
    image_text = db.Column(db.String(100), nullable=True, default='uploads/robot_images/default_robot.png')

class System(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    assembly_url = db.Column(db.String(500), nullable=True)
    part_studio_urls = db.Column(JSON)
    access_key = db.Column(db.String(100), nullable=True)
    secret_key = db.Column(db.String(100), nullable=True)
    bom_data = db.Column(JSON)
    robot_id = db.Column(db.Integer, db.ForeignKey('robot.id'), nullable=False)
    robot = db.relationship('Robot', back_populates='systems')

class Machine(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    icon_file = db.Column(db.String(100), nullable=True, default='uploads/machine_icons/default_machine.png')
    cad_format = db.Column(db.String(20), nullable=False, default='STEP')
    robot_id = db.Column(db.Integer, db.ForeignKey('robot.id'), nullable=False)
    robot = db.relationship('Robot', back_populates='machines')
