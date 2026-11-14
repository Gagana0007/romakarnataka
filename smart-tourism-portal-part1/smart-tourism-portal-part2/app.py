import os
from flask import Flask, render_template, jsonify
from dotenv import load_dotenv
from firebase_config import get_firebase_web_config, initialize_firebase_admin, get_firestore_client
from routes.auth import auth_bp

load_dotenv()

def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("FLASK_SECRET_KEY", "dev-only-change-me")
    app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024

    # Firebase Admin is optional during the first local UI setup.
    # It will initialize only when valid service-account credentials are supplied.
    initialize_firebase_admin()
    app.register_blueprint(auth_bp)

    @app.get("/")
    def home():
        return render_template("index.html", firebase_config=get_firebase_web_config())

    @app.get("/login")
    def login():
        return render_template("login.html", firebase_config=get_firebase_web_config())

    @app.get("/register")
    def register():
        return render_template("register.html", firebase_config=get_firebase_web_config())

    @app.get("/dashboard")
    def dashboard():
        return render_template("dashboard.html", firebase_config=get_firebase_web_config())

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "service": "smart-tourism-portal"})

    @app.errorhandler(404)
    def not_found(_error):
        return render_template("404.html"), 404

    @app.errorhandler(500)
    def server_error(_error):
        return render_template("500.html"), 500

    return app

app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG") == "1")
