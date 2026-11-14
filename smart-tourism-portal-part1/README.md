# Smart Local Tourism Business Portal — Parts 1–6

A Flask + Firebase foundation for the VTU Smart Local Tourism Business Portal.

## Part 1 includes
- Flask app factory and basic routes
- Firebase web configuration and optional Firebase Admin initialization
- Firebase email/password registration, sign-in, password reset and role-based dashboards
- Firestore rules that prevent users from assigning themselves the administrator role
- Ten Karnataka destination guides and searchable local experience listings
- Owner listing create, edit, delete and image upload through authenticated Flask endpoints
- Tourist booking requests and owner confirmation/decline workflows
- Booking date-conflict checks, server-calculated totals, completed-booking reviews, wishlists and real-time notifications
- Admin listing approval, account suspension, booking oversight and platform analytics
- Responsive landing page with CSS motion, scroll reveals and light/dark toggle
- Custom 404 and 500 pages
- Vercel serverless entry point and initial deployment configuration

Payments, calendar availability synchronization and newsletter delivery are not connected yet.

## Requirements
- Python 3.10+
- VS Code
- A Firebase project (setup can be completed before Part 2)

## Run locally (Windows PowerShell)
```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
python app.py
```
Open http://127.0.0.1:5000 and http://127.0.0.1:5000/health.

If PowerShell blocks activation, run:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

## Firebase Console setup
1. Open https://console.firebase.google.com/ and create a project named `smart-tourism-portal`.
2. In Project settings → General → Your apps, add a Web app. Copy the web configuration values into `.env`.
3. In Authentication → Get started → Sign-in method, enable Email/Password.
4. In Firestore Database, create a database in production mode. Deploy rules and indexes with `firebase deploy --only firestore:rules,firestore:indexes`, or publish `firestore.rules` and `firestore.indexes.json` in the Console. Client writes are blocked for server-managed data.
5. In Storage, create a bucket and deploy rules with `firebase deploy --only storage`, or publish `storage.rules`. Images can be read publicly; writes are handled by the Flask server's Firebase Admin SDK.
6. For owner listing management, open Project settings → Service accounts → Generate new private key. Keep the downloaded JSON private. Never put the key file in the project or commit it. Set its JSON content as `FIREBASE_SERVICE_ACCOUNT_JSON` in local `.env` (one line JSON), or use `FIREBASE_SERVICE_ACCOUNT_BASE64` in deployment. Backend listing create/edit/delete and image uploads are disabled until this server credential is configured.
7. In `.env`, fill `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, and `FIREBASE_APP_ID`. These are Firebase web app settings, not Admin credentials.

The Firebase web config is not an Admin credential. Firestore and Storage security rules, plus backend authorization, protect data.

## Part 2 authentication
- Open `/auth` to create a Tourist or Owner account, sign in, or request a password reset. The role list deliberately does not include Admin.
- `/dashboard` requires a Firebase sign-in and displays the account dashboard based on the Firestore profile role. Admins can view accounts and change their roles.
- To bootstrap the first admin, create an account normally, find its UID in Firebase Authentication, then create/update `users/{UID}` in Firestore using the Firebase Console and set `role` to `admin`. The console is a trusted administrative surface; never add an admin option to public registration.
- Admin role updates in the dashboard are guarded by Firestore rules. Firebase Admin service-account credentials are not required for browser authentication and must remain server-only.

## Parts 3–6 destinations, listings and platform workflows
- The homepage includes ten destination guides and fifteen clearly marked sample listings (five per category). Use the search form to filter listings by destination and category.
- Destination details use `/destinations/<slug>`; listing details use `/listings/<id>`.
- Owner listing changes start in `pending` state. Admins can approve or reject them; only approved/published listings appear publicly. Every listing mutation verifies the Firebase ID token and stored account role in Flask.
- Owners can upload up to five JPEG, PNG or WebP images, 5 MB each. The dashboard previews images and reports transfer progress; the backend validates image signatures and saves download URLs and Storage paths to Firestore.
- Configure `FIREBASE_SERVICE_ACCOUNT_JSON` (or its base64 equivalent) and `FIREBASE_STORAGE_BUCKET` before using owner listing writes. Missing Storage settings do not prevent Firebase web authentication from loading.
- Admins can inspect platform totals and booking values, review listings, suspend users and view bookings. Booking value is not verified revenue.

## Part 4 booking requests
- Tourists can request dates and guest counts for published owner listings. Sample listings are demonstration-only and cannot be booked.
- Tourists can review and cancel pending requests in their dashboard. Owners can review incoming requests and confirm or decline pending requests.
- The Flask API verifies Firebase ID tokens and reads roles from Firestore for every booking operation. Booking records cannot be written directly from the browser under `firestore.rules`.
- This is a request/confirmation flow only. It does not collect payment, promise inventory availability, or sync calendars; owners should confirm availability with guests before treating a booking as final.
- Booking totals are calculated by the server, and a Firestore transaction checks date conflicts when confirming bookings. Pending requests do not reserve dates until confirmed.
- Tourists can review a listing after the owner marks their confirmed booking completed. Wishlist data for live listings is stored in Firestore; sample listing saves are local to the browser.
- Booking, review and notification dashboards listen for Firestore updates. Deploy `firestore.indexes.json` if Firestore requests a composite index.

### Firebase Storage troubleshooting
1. In Firebase Console, open **Build → Storage** and create/enable a bucket.
2. Set `FIREBASE_STORAGE_BUCKET` to the exact bucket name shown in Firebase (without `gs://`) in local `.env` and deployment environment variables.
3. Ensure the server has a Firebase Admin service account with Storage access. Keep service-account JSON server-side; never paste it into browser configuration.
4. Deploy `storage.rules` with `firebase deploy --only storage`. Flask uses the Admin SDK for uploads; direct browser writes remain denied.
5. Try a small JPEG, PNG or WebP upload from the owner dashboard. It should show a preview and progress. If uploads fail while sign-in works, check the bucket name, service-account permissions and Flask logs.

### Seed and tests
```powershell
python -m pip install -r requirements-dev.txt
python seed.py
python -m pytest
```
Seeding merges the ten destinations, categories and fifteen sample listings into Firestore. Sample listings are demonstration-only and cannot be booked.

### Responsive manual check
Use browser responsive mode at 375 px, 768 px and desktop widths. Check homepage, destination and listing details, authentication and role dashboards for navigation, forms, card/table overflow, booking actions, reviews, and image uploads.

## Environment variables
Copy `.env.example` to `.env` and fill values. Never commit `.env`, service account JSON, or private keys.

## Important deployment note
Vercel's Python runtime and routing behavior can change. Verify the deployment build using the current Vercel dashboard/logs before treating it as production-ready. Add every required environment variable in Vercel Project → Settings → Environment Variables, then redeploy. Add the deployed domain to Firebase Authentication → Settings → Authorized domains.
