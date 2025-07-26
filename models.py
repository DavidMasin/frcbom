from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.dialects.postgresql import JSON

db = SQLAlchemy()

class Team(db.Model):
    """Database model for a team (login credentials and team info)."""
    id = db.Column(db.Integer, primary_key=True)
    team_number = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)       # Hashed user password
    adminPassword = db.Column(db.String(200), nullable=False)  # Hashed admin password

    # Relationship: one team can have multiple robots
    robots = db.relationship('Robot', cascade='all, delete-orphan', back_populates='team')

    def __repr__(self):
        return f"<Team {self.team_number}>"

class Robot(db.Model):
    """Database model for a robot (with optional image and associated systems/machines)."""
    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey('team.id', ondelete='CASCADE'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    image = db.Column(db.String(300), nullable=True)      # file path to robot image
    is_template = db.Column(db.Boolean, default=False)    # if this robot is the default template for the team

    team = db.relationship('Team', back_populates='robots')
    systems = db.relationship('System', cascade='all, delete-orphan', back_populates='robot')
    machines = db.relationship('Machine', cascade='all, delete-orphan', back_populates='robot')

    __table_args__ = (
        db.UniqueConstraint('team_id', 'name', name='uq_robot_name_per_team'),
    )

    def __repr__(self):
        return f"<Robot {self.name} (Team {self.team_id})>"

class System(db.Model):
    """Database model for a robot's system (sub-assembly) with Onshape credentials and document references."""
    id = db.Column(db.Integer, primary_key=True)
    robot_id = db.Column(db.Integer, db.ForeignKey('robot.id', ondelete='CASCADE'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    assembly_url = db.Column(db.String(500), nullable=True)   # URL of the Onshape Assembly for this system
    partstudio_urls = db.Column(JSON, nullable=True)          # List of Onshape Part Studio URLs for this system
    access_key = db.Column(db.String(200), nullable=True)     # Onshape API access key for this system
    secret_key = db.Column(db.String(200), nullable=True)     # Onshape API secret key for this system
    image = db.Column(db.String(300), nullable=True)          # Optional image for the system (file path)
    bom_data = db.Column(JSON, nullable=True)                 # BOM data stored as JSON (list of parts)

    robot = db.relationship('Robot', back_populates='systems')

    __table_args__ = (
        db.UniqueConstraint('robot_id', 'name', name='uq_system_name_per_robot'),
    )

    def __repr__(self):
        return f"<System {self.name} (Robot {self.robot_id})>"

class Machine(db.Model):
    """Database model for a machine used by the team (for manufacturing parts)."""
    id = db.Column(db.Integer, primary_key=True)
    robot_id = db.Column(db.Integer, db.ForeignKey('robot.id', ondelete='CASCADE'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    icon = db.Column(db.String(300), nullable=True)      # file path to icon image for this machine
    cad_format = db.Column(db.String(10), nullable=False)  # CAD format for part downloads (e.g., "STEP", "STL")

    robot = db.relationship('Robot', back_populates='machines')

    __table_args__ = (
        db.UniqueConstraint('robot_id', 'name', name='uq_machine_name_per_robot'),
    )

    def __repr__(self):
        return f"<Machine {self.name} (Robot {self.robot_id})>"
