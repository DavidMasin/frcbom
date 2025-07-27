# wsgi.py
import app
import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))

    app.socketio.run(app.app, host="0.0.0.0", port=port)
