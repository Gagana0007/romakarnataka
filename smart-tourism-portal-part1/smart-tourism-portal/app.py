import os
from flask import Flask, render_template, jsonify
from dotenv import load_dotenv
from firebase_config import get_firebase_web_config, initialize_firebase_admin, get_firestore_client
from routes.auth import auth_bp
from routes.destinations import destinations_bp
from routes.businesses import businesses_bp

load_dotenv()

def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("FLASK_SECRET_KEY", "dev-only-change-me")
    app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024

    # Firebase Admin is optional during the first local UI setup.
    # It will initialize only when valid service-account credentials are supplied.
    initialize_firebase_admin()
    app.register_blueprint(auth_bp)
    app.register_blueprint(destinations_bp)
    app.register_blueprint(businesses_bp)

    @app.get("/")
    def home():
        return render_template("index.html", firebase_config=get_firebase_web_config())

    @app.get("/login")
    def login():
        return render_template("login.html", firebase_config=get_firebase_web_config())

    @app.get("/register")
    def register():
        return render_template("register.html", firebase_config=get_firebase_web_config())

    @app.get("/explore")
    def explore():
        return render_template("explore.html", firebase_config=get_firebase_web_config())

    @app.get("/destinations/<destination_id>")
    def destination_page(destination_id):
        from routes.destinations import SAMPLE_DESTINATIONS
        db = get_firestore_client()
        destination = None
        if db is not None:
            try:
                snap = db.collection("destinations").document(destination_id).get()
                if snap.exists:
                    destination = snap.to_dict() or {}
                    destination.setdefault("destinationId", snap.id)
            except Exception:
                pass
        if destination is None:
            destination = next((x for x in SAMPLE_DESTINATIONS if x["destinationId"] == destination_id), None)
        if destination is None:
            return render_template("404.html"), 404
        return render_template("destination_detail.html", destination=destination, firebase_config=get_firebase_web_config())

    @app.get("/businesses/<business_id>")
    def business_page(business_id):
        db = get_firestore_client()
        if db is None:
            return render_template("404.html"), 404
        snap = db.collection("businesses").document(business_id).get()
        if not snap.exists:
            return render_template("404.html"), 404
        business = snap.to_dict() or {}
        if business.get("verified") is not True and business.get("isSample") is not True:
            return render_template("404.html"), 404
        business.setdefault("businessId", snap.id)
        return render_template("business_detail.html", business=business, firebase_config=get_firebase_web_config())

    @app.get("/owner/listings")
    def owner_listings():
        return render_template("owner_listings.html", firebase_config=get_firebase_web_config())

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
