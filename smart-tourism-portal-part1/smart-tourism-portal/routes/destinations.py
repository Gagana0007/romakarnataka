from flask import Blueprint, jsonify, request
from firebase_config import get_firestore_client

destinations_bp = Blueprint("destinations", __name__, url_prefix="/api/destinations")

SAMPLE_DESTINATIONS = [
    {"destinationId":"mysuru-palace","name":"Mysuru Palace","description":"Discover the royal heritage, illuminated architecture and lively markets of Mysuru.","state":"Karnataka","city":"Mysuru","category":"Heritage","imageUrls":["https://images.unsplash.com/photo-1600100397608-f010a6e7b8f7?auto=format&fit=crop&w=1200&q=85"],"location":{"lat":12.3052,"lng":76.6552},"entryFee":0,"bestTimeToVisit":"October to March","nearbyAttractions":["Chamundi Hills","Devaraja Market"],"isSample":True},
    {"destinationId":"coorg","name":"Coorg","description":"Coffee estates, misty hills and forest-lined roads in the Western Ghats.","state":"Karnataka","city":"Kodagu","category":"Nature","imageUrls":["https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1200&q=85"],"location":{"lat":12.3375,"lng":75.8069},"entryFee":0,"bestTimeToVisit":"October to May","nearbyAttractions":["Abbey Falls","Raja's Seat"],"isSample":True},
    {"destinationId":"hampi","name":"Hampi","description":"Explore the monumental ruins and dramatic boulder landscapes of the Vijayanagara Empire.","state":"Karnataka","city":"Vijayanagara","category":"Heritage","imageUrls":["https://images.unsplash.com/photo-1600100397608-f010a6e7b8f7?auto=format&fit=crop&w=1200&q=85"],"location":{"lat":15.3350,"lng":76.4600},"entryFee":0,"bestTimeToVisit":"October to February","nearbyAttractions":["Virupaksha Temple","Vittala Temple"],"isSample":True},
    {"destinationId":"chikkamagaluru","name":"Chikkamagaluru","description":"A hill-country escape known for coffee plantations, trekking routes and cool weather.","state":"Karnataka","city":"Chikkamagaluru","category":"Nature","imageUrls":["https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=85"],"location":{"lat":13.3161,"lng":75.7720},"entryFee":0,"bestTimeToVisit":"September to March","nearbyAttractions":["Mullayanagiri","Baba Budangiri"],"isSample":True},
    {"destinationId":"gokarna","name":"Gokarna","description":"A relaxed coastal town with beaches, coastal trails and a distinctive temple-town atmosphere.","state":"Karnataka","city":"Uttara Kannada","category":"Coast","imageUrls":["https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=85"],"location":{"lat":14.5479,"lng":74.3188},"entryFee":0,"bestTimeToVisit":"October to March","nearbyAttractions":["Om Beach","Kudle Beach"],"isSample":True},
    {"destinationId":"jog-falls","name":"Jog Falls","description":"Witness the Sharavathi River plunging through a dramatic forested gorge.","state":"Karnataka","city":"Shivamogga","category":"Nature","imageUrls":["https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=1200&q=85"],"location":{"lat":14.2290,"lng":74.8120},"entryFee":0,"bestTimeToVisit":"July to December","nearbyAttractions":["Sharavathi Valley","Linganamakki Dam"],"isSample":True},
    {"destinationId":"badami","name":"Badami","description":"Red sandstone cliffs, cave temples and remarkable Chalukyan architecture.","state":"Karnataka","city":"Bagalkot","category":"Heritage","imageUrls":["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=85"],"location":{"lat":15.9149,"lng":75.6768},"entryFee":0,"bestTimeToVisit":"October to March","nearbyAttractions":["Badami Cave Temples","Agastya Lake"],"isSample":True},
    {"destinationId":"nandi-hills","name":"Nandi Hills","description":"Catch sunrise views, winding roads and a refreshing break close to Bengaluru.","state":"Karnataka","city":"Chikkaballapur","category":"Outdoors","imageUrls":["https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=85"],"location":{"lat":13.3702,"lng":77.6835},"entryFee":0,"bestTimeToVisit":"September to February","nearbyAttractions":["Tipu's Drop","Bhoga Nandeeshwara Temple"],"isSample":True},
    {"destinationId":"udupi","name":"Udupi","description":"A coastal destination celebrated for temple heritage, cuisine and nearby beaches.","state":"Karnataka","city":"Udupi","category":"Coast","imageUrls":["https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1200&q=85"],"location":{"lat":13.3409,"lng":74.7421},"entryFee":0,"bestTimeToVisit":"October to March","nearbyAttractions":["Malpe Beach","Sri Krishna Matha"],"isSample":True},
    {"destinationId":"kabini","name":"Kabini","description":"A tranquil river-and-forest landscape known for wildlife habitats and nature stays.","state":"Karnataka","city":"Mysuru district","category":"Wildlife","imageUrls":["https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=1200&q=85"],"location":{"lat":11.9667,"lng":76.3000},"entryFee":0,"bestTimeToVisit":"October to May","nearbyAttractions":["Kabini Backwaters","Nagarhole National Park"],"isSample":True}
]

@destinations_bp.get("")
def list_destinations():
    db = get_firestore_client()
    if db is not None:
        try:
            docs = db.collection("destinations").stream()
            records = []
            for doc in docs:
                item = doc.to_dict() or {}
                item.setdefault("destinationId", doc.id)
                records.append(item)
            if records:
                return jsonify({"destinations": records, "source": "firestore"})
        except Exception:
            pass
    return jsonify({"destinations": SAMPLE_DESTINATIONS, "source": "sample"})

@destinations_bp.get("/<destination_id>")
def destination_detail(destination_id):
    db = get_firestore_client()
    if db is not None:
        try:
            snap = db.collection("destinations").document(destination_id).get()
            if snap.exists:
                item = snap.to_dict() or {}
                item.setdefault("destinationId", snap.id)
                return jsonify({"destination": item})
        except Exception:
            pass
    match = next((x for x in SAMPLE_DESTINATIONS if x["destinationId"] == destination_id), None)
    if not match:
        return jsonify({"error":"Destination not found."}), 404
    return jsonify({"destination": match})
