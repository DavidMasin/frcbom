from app import app

if __name__ == "__main__":
    from app import socketio
    socketio.run(app, host="0.0.0.0", port=8080)
