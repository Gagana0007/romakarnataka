import re
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request, g
from firebase_admin import firestore
from firebase_config import get_firestore_client
from routes.auth import require_firebase_user, require_role

businesses_bp = Blueprint("businesses", __name__, url_prefix="/api/businesses")
ALLOWED_TYPES = {"homestay", "guide", "experience"}
MAX_IMAGES = 8

def clean_text(value, limit):
    return re.sub(r"[<>]", "", str(value or "")).strip()[:limit]

def validate_listing(data):
    business_name = clean_text(data.get("businessName"), 100)
    business_type = clean_text(data.get("businessType"), 20).lower()
    description = clean_text(data.get("description"), 2000)
    city = clean_text(data.get("city"), 80)
    state = clean_text(data.get("state") or "Karnataka", 80)
    try:
        price = float(data.get("price"))
        if price < 0 or price > 10000000:
            raise ValueError()
    except (TypeError, ValueError):
        return None, "Enter a valid non-negative price."
    images = data.get("imageUrls") or []
    if not isinstance(images, list) or len(images) > MAX_IMAGES:
        return None, f"Add no more than {MAX_IMAGES} image URLs."
    safe_images = []
    for url in images:
        url = str(url).strip()
        if not url.startswith("https://") or len(url) > 2000:
            return None, "Every image must be a valid HTTPS URL."
        safe_images.append(url)
    if len(business_name) < 3 or business_type not in ALLOWED_TYPES or len(description) < 20 or not city:
        return None, "Provide a business name, valid category, description (at least 20 characters) and city."
    return {"businessName":business_name,"businessType":business_type,"description":description,
            "city":city,"state":state,"price":price,"imageUrls":safe_images,
            "location": data.get("location") if isinstance(data.get("location"), dict) else {},
            "availability": data.get("availability") if isinstance(data.get("availability"), dict) else {},
            "verified":False,"isSample":False}, None

@businesses_bp.get("")
def list_businesses():
    db = get_firestore_client()
    if db is None:
        return jsonify({"businesses":[],"source":"firestore-unavailable"})
    try:
        docs = db.collection("businesses").stream()
        items = []
        for doc in docs:
            item = doc.to_dict() or {}
            item.setdefault("businessId", doc.id)
            # Public browsing exposes only approved listings; owners use /mine for drafts.
            if item.get("verified") is True or item.get("isSample") is True:
                items.append(item)
        return jsonify({"businesses":items,"source":"firestore"})
    except Exception:
        return jsonify({"error":"Could not load business listings."}), 503

@businesses_bp.get("/<business_id>")
def get_business(business_id):
    db = get_firestore_client()
    if db is None: return jsonify({"error":"Firebase Admin is not configured."}), 503
    snap = db.collection("businesses").document(business_id).get()
    if not snap.exists: return jsonify({"error":"Listing not found."}), 404
    item = snap.to_dict() or {}; item.setdefault("businessId", snap.id)
    return jsonify({"business":item})

@businesses_bp.post("")
@require_role("owner")
def create_business():
    db = get_firestore_client()
    if db is None: return jsonify({"error":"Firebase Admin is not configured."}), 503
    data, error = validate_listing(request.get_json(silent=True) or {})
    if error: return jsonify({"error":error}), 400
    data.update({"ownerId":g.firebase_user["uid"],"createdAt":firestore.SERVER_TIMESTAMP,
                 "updatedAt":firestore.SERVER_TIMESTAMP,"verified":False})
    ref = db.collection("businesses").document()
    ref.set(data)
    return jsonify({"message":"Listing created and submitted for review.","businessId":ref.id}), 201

@businesses_bp.put("/<business_id>")
@require_role("owner")
def update_business(business_id):
    db = get_firestore_client()
    if db is None: return jsonify({"error":"Firebase Admin is not configured."}), 503
    ref = db.collection("businesses").document(business_id)
    snap = ref.get()
    if not snap.exists: return jsonify({"error":"Listing not found."}), 404
    if (snap.to_dict() or {}).get("ownerId") != g.firebase_user["uid"]:
        return jsonify({"error":"You can only edit your own listings."}), 403
    data, error = validate_listing(request.get_json(silent=True) or {})
    if error: return jsonify({"error":error}), 400
    data.update({"updatedAt":firestore.SERVER_TIMESTAMP,"verified":False})
    ref.update(data)
    return jsonify({"message":"Listing updated. It will require verification again."})

@businesses_bp.delete("/<business_id>")
@require_role("owner")
def delete_business(business_id):
    db = get_firestore_client()
    if db is None: return jsonify({"error":"Firebase Admin is not configured."}), 503
    ref = db.collection("businesses").document(business_id)
    snap = ref.get()
    if not snap.exists: return jsonify({"error":"Listing not found."}), 404
    if (snap.to_dict() or {}).get("ownerId") != g.firebase_user["uid"]:
        return jsonify({"error":"You can only delete your own listings."}), 403
    ref.delete()
    return jsonify({"message":"Listing deleted."})

@businesses_bp.get("/mine")
@require_role("owner")
def my_businesses():
    db = get_firestore_client()
    if db is None: return jsonify({"error":"Firebase Admin is not configured."}), 503
    docs = db.collection("businesses").where("ownerId","==",g.firebase_user["uid"]).stream()
    items=[]
    for doc in docs:
        item=doc.to_dict() or {}; item.setdefault("businessId",doc.id); items.append(item)
    return jsonify({"businesses":items})
