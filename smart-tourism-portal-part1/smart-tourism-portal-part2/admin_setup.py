"""One-time trusted local script to assign the admin role to a verified account."""
import os
from dotenv import load_dotenv
from firebase_admin import auth, firestore
from firebase_config import initialize_firebase_admin, get_firestore_client

load_dotenv()


def main():
    email = os.getenv("INITIAL_ADMIN_EMAIL", "").strip().lower()
    if not email:
        raise SystemExit("Set INITIAL_ADMIN_EMAIL in your local .env first.")
    initialize_firebase_admin()
    db = get_firestore_client()
    if db is None:
        raise SystemExit("Firebase Admin is not configured. Check your service account.")
    user = auth.get_user_by_email(email)
    if not user.email_verified:
        raise SystemExit("Verify this Firebase Auth email before granting admin access.")
    claims = dict(user.custom_claims or {})
    claims["role"] = "admin"
    auth.set_custom_user_claims(user.uid, claims)
    db.collection("users").document(user.uid).set({
        "userId": user.uid, "name": user.display_name or email.split("@")[0],
        "email": user.email, "role": "admin", "updatedAt": firestore.SERVER_TIMESTAMP
    }, merge=True)
    print(f"Administrator role granted to verified account: {email}")
    print("Sign out and sign in again to refresh the Firebase ID token.")


if __name__ == "__main__":
    main()
