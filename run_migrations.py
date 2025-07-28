from flask_migrate import upgrade

from app import app

with app.app_context():
    upgrade()
    print("✅ Database upgraded successfully.")
