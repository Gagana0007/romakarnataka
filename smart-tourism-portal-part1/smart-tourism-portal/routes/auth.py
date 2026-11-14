from functools import wraps
from flask import Blueprint, jsonify, request, g
from firebase_admin import auth as firebase_auth, firestore
from firebase_config import get_firestore_client

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def require_firebase_user(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify({"error": "Missing Firebase ID token."}), 401
        try:
            g.firebase_user = firebase_auth.verify_id_token(header.split(" ", 1)[1].strip(), check_revoked=True)
        except Exception:
            return jsonify({"error": "Invalid or expired login session. Please sign in again."}), 401
        return fn(*args, **kwargs)
    return wrapper


def require_role(*roles):
    def decorator(fn):
        @wraps(fn)
        @require_firebase_user
        def wrapper(*args, **kwargs):
            user = g.firebase_user
            role = user.get("role")
            db = get_firestore_client()
            if role not in roles and db:
                snap = db.collection("users").document(user["uid"]).get()
                role = (snap.to_dict() or {}).get("role") if snap.exists else None
            if role not in roles:
                return jsonify({"error": "You do not have permission to access this resource."}), 403
            g.user_role = role
            return fn(*args, **kwargs)
        return wrapper
    return decorator


@auth_bp.post("/profile")
@require_firebase_user
def create_or_get_profile():
    db = get_firestore_client()
    if db is None:
        return jsonify({"error": "Firebase Admin is not configured on the server."}), 503
    user = g.firebase_user
    data = request.get_json(silent=True) or {}
    requested_role = str(data.get("role", "tourist")).lower().strip()
    if requested_role not in {"tourist", "owner"}:
        return jsonify({"error": "Choose tourist or owner. Admin accounts are provisioned separately."}), 400
    name = str(data.get("name", "")).strip()[:80]
    phone = str(data.get("phone", "")).strip()[:25]
    if len(name) < 2:
        return jsonify({"error": "Please provide your name (at least 2 characters)."}), 400
    ref = db.collection("users").document(user["uid"])
    snap = ref.get()
    if snap.exists:
        profile = snap.to_dict() or {}
        role = profile.get("role", "tourist")
        if role not in {"tourist", "owner", "admin"}:
            role = "tourist"
        ref.set({"name": name, "email": user.get("email", ""), "phone": phone,
                 "role": role, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
    else:
        role = requested_role
        ref.set({"userId": user["uid"], "name": name, "email": user.get("email", ""),
                 "phone": phone, "role": role, "profileImage": user.get("picture", ""),
                 "createdAt": firestore.SERVER_TIMESTAMP, "updatedAt": firestore.SERVER_TIMESTAMP})
    return jsonify({"message": "Profile ready.", "uid": user["uid"], "role": role})


@auth_bp.get("/me")
@require_firebase_user
def get_my_profile():
    db = get_firestore_client()
    if db is None:
        return jsonify({"error": "Firebase Admin is not configured on the server."}), 503
    snap = db.collection("users").document(g.firebase_user["uid"]).get()
    if not snap.exists:
        return jsonify({"error": "Profile not found. Complete registration first."}), 404
    profile = snap.to_dict() or {}
    for key in ("createdAt", "updatedAt"):
        value = profile.get(key)
        if value and hasattr(value, "isoformat"):
            profile[key] = value.isoformat()
    return jsonify({"profile": profile})


@auth_bp.get("/tourist-area")
@require_role("tourist")
def tourist_area():
    return jsonify({"message": "Tourist access verified."})


@auth_bp.get("/owner-area")
@require_role("owner")
def owner_area():
    return jsonify({"message": "Business owner access verified."})


@auth_bp.get("/admin-area")
@require_role("admin")
def admin_area():
    return jsonify({"message": "Administrator access verified."})
