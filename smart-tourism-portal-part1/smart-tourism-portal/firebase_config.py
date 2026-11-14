import json
import os
import firebase_admin
from firebase_admin import credentials

_admin_app = None

def get_firebase_web_config():
    """Public Firebase web configuration. These values identify the project;
    security must be enforced with Firestore/Storage rules and backend checks.
    """
    return {
        "apiKey": os.getenv("FIREBASE_API_KEY", ""),
        "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", ""),
        "projectId": os.getenv("FIREBASE_PROJECT_ID", ""),
        "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", ""),
        "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID", ""),
        "appId": os.getenv("FIREBASE_APP_ID", ""),
    }

def initialize_firebase_admin():
    """Initialize Admin SDK from a JSON string or base64 service-account JSON."""
    global _admin_app
    if firebase_admin._apps:
        _admin_app = firebase_admin.get_app()
        return _admin_app

    raw_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    raw_b64 = os.getenv("FIREBASE_SERVICE_ACCOUNT_BASE64", "").strip()

    if not raw_json and not raw_b64:
        return None

    try:
        if raw_b64:
            import base64
            raw_json = base64.b64decode(raw_b64).decode("utf-8")
        service_account_info = json.loads(raw_json)
        cred = credentials.Certificate(service_account_info)
        _admin_app = firebase_admin.initialize_app(cred)
        return _admin_app
    except Exception as exc:
        # Fail loudly when credentials were provided but are invalid.
        raise RuntimeError("Firebase Admin initialization failed. Check the service-account environment variable.") from exc


def get_firestore_client():
    """Return Firestore client when Firebase Admin is initialized."""
    if not firebase_admin._apps:
        return None
    from firebase_admin import firestore
    return firestore.client()
