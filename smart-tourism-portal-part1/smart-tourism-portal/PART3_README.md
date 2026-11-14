# Part 3 — Destinations + Listings

This update builds on the Part 1 + Part 2 project you uploaded.

## Included
- 10 Karnataka destination records available through the destination API as clearly labelled sample content.
- Destination search and category filters.
- Homestay, tour guide and cultural experience listing browser.
- Owner-only listing create, edit and delete endpoints.
- Firebase Storage client-side image upload (JPG, PNG, WebP; up to 5 MB each; maximum 8).
- Listing detail pages and owner listing workspace.
- Server-side ownership checks; Firestore writes are intentionally denied from browser clients and go through Flask.

## Important setup
1. Extract this ZIP and open the `smart-tourism-portal` folder in VS Code.
2. Keep your existing `.env` file if you already configured Part 1/2. Do not upload it to GitHub.
3. Check that these values exist in `.env`: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, and `FIREBASE_SERVICE_ACCOUNT_JSON` (or `FIREBASE_SERVICE_ACCOUNT_BASE64`).
4. In Firebase Console, enable **Storage** and create the default bucket. The `FIREBASE_STORAGE_BUCKET` value must exactly match the bucket shown in Firebase.
5. In Firebase Console → Storage → Rules, publish the included `storage.rules`.
6. In Firebase Console → Firestore → Rules, merge/publish the included `firestore.rules` with your later-part rules when those are developed. This file is deliberately restrictive for collections not yet implemented.
7. Restart Flask after changing `.env`.

## Windows VS Code terminal
```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python app.py
```
If `.env` already exists, do not overwrite it with the example. Open `http://127.0.0.1:5000/explore`.

## Owner flow
- Register a new account and choose **Business owner**.
- Log in and open `/owner/listings`.
- Add a listing, select photos, and save.
- New listings are unverified until a future admin verification module is built in Part 6.
- The public browse page shows listings stored in Firestore. The 10 destinations are served as sample records until Firestore destinations are populated by the seed module in Part 7.

## API endpoints
- `GET /api/destinations`
- `GET /api/destinations/<destination_id>`
- `GET /api/businesses`
- `GET /api/businesses/<business_id>`
- `GET /api/businesses/mine` (owner)
- `POST /api/businesses` (owner)
- `PUT /api/businesses/<business_id>` (own listing only)
- `DELETE /api/businesses/<business_id>` (own listing only)

## Verification
Run:
```powershell
python -m compileall .
pytest -q
```
The existing Part 2 tests cover only their stated authentication checks. They do not prove that live Firebase credentials, Storage uploads, or Firestore rules are correctly configured. Test an owner upload with a real Firebase project before deployment.

## Known scope boundary
Booking, availability calendars, reviews, live notifications, admin verification UI, seed.py and Vercel deployment validation are later project parts. A business detail page does not take a booking or process payment yet.
