# Smart Local Tourism Business Portal — Roam Karnataka

Flask + Firebase project. Parts 1–3 are integrated in this folder.

## Current modules
- Part 1: responsive Roam Karnataka home page, Flask app, Vercel entry files and base UI.
- Part 2: Firebase Authentication, tourist/owner registration, verified ID-token APIs, role-aware dashboard.
- Part 3: Karnataka destination browser, destination details, business listing browser, owner listing CRUD and Firebase Storage photo upload.

## Run locally (Windows PowerShell)
```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Create .env from .env.example only if you do not already have your configured .env
Copy-Item .env.example .env
python app.py
```
Open http://127.0.0.1:5000 and /explore.

## Firebase configuration
1. Create a Firebase project and add a Web App.
2. Enable Authentication → Email/Password.
3. Create Firestore Database.
4. Create Firebase Storage bucket.
5. Copy Web App values to `.env`: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`.
6. Add a service account JSON as a one-line value in `FIREBASE_SERVICE_ACCOUNT_JSON`, or its base64 form in `FIREBASE_SERVICE_ACCOUNT_BASE64`. Keep it private.
7. Publish `firestore.rules` and `storage.rules` in the matching Firebase console tabs.
8. Restart Flask after `.env` changes.

## Admin provisioning from Part 2
Create and email-verify the intended account in Firebase Authentication. Set `INITIAL_ADMIN_EMAIL` in `.env`, run `python admin_setup.py` from a trusted local machine, then sign out and back in to refresh the ID token. Never expose this script as a public route.

## Part 3 owner workflow
1. Register and choose **Business owner**.
2. Sign in.
3. Open `/owner/listings` (also linked in the main navigation).
4. Add a homestay, guide service or cultural experience. Upload JPG/PNG/WebP images up to 5 MB each (maximum 8).
5. New listings are marked unverified and must be approved in Part 6 before they should be treated as verified.

## Important boundaries
- The ten destinations are clearly marked sample data in the API until populated into Firestore by the Part 7 seed script.
- No fake partnerships are claimed. A business owner must create their own real listing.
- Booking/payment, reviews, real-time notifications, admin verification, complete seed script and final Vercel validation are later parts.
- Payment must remain labelled demo/mock until a real payment provider is integrated.
- Storage upload is client-side, while ownership and listing writes are checked in Flask. Firestore rules deny direct browser writes to protected collections.

## Tests
```powershell
python -m compileall .
pytest -q
```
Tests cover the destination sample data, listing validation and explore page plus earlier Part 2 auth checks. They do not prove your live Firebase project configuration or real Storage upload works.
