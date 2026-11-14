import argparse

from catalog import DESTINATIONS, SAMPLE_LISTINGS
from firebase_config import get_firebase_admin_app, initialize_firebase_admin


def seed_database():
    admin_app = initialize_firebase_admin() or get_firebase_admin_app()
    if admin_app is None:
        raise RuntimeError(
            "Firebase Admin credentials are required. Set FIREBASE_SERVICE_ACCOUNT_JSON "
            "or FIREBASE_SERVICE_ACCOUNT_BASE64 in .env."
        )

    from firebase_admin import firestore

    db = firestore.client(app=admin_app)
    batch = db.batch()
    for destination in DESTINATIONS:
        data = {**destination, "createdAt": firestore.SERVER_TIMESTAMP}
        batch.set(db.collection("destinations").document(destination["destinationId"]), data, merge=True)
    categories = ["Homestay", "Tour guide", "Cultural experience"]
    for name in categories:
        category_id = name.casefold().replace(" ", "-")
        batch.set(db.collection("categories").document(category_id), {
            "name": name,
            "active": True,
            "isSample": True,
        }, merge=True)
    for sample in SAMPLE_LISTINGS:
        data = {
            **sample,
            "businessId": sample["id"],
            "businessName": sample["title"],
            "businessType": sample["type"],
            "ownerId": "",
            "imageUrls": [sample["imageUrl"]] if sample.get("imageUrl") else [],
            "imagePaths": [],
            "state": "Karnataka",
            "availability": {},
            "isSample": True,
            "status": "sample",
            "verified": False,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        batch.set(db.collection("listings").document(sample["id"]), data, merge=True)
    batch.commit()

    print(f"Seeded {len(DESTINATIONS)} destinations, {len(categories)} categories, and {len(SAMPLE_LISTINGS)} sample listings.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed Karnataka destination and sample listing data.")
    parser.parse_args()
    seed_database()
