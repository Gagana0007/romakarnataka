# Smart Tourism Portal — Parts 1 & 2

Flask + Firebase Authentication + Firestore starter for Roam Karnataka.

## Part 2 features
- Tourist and business-owner registration (Firebase Email/Password).
- Login and password reset.
- Firebase ID-token verification in Flask.
- Firestore user profiles and role-protected API examples.
- Tourist/owner/admin dashboard shell.
- Trusted local admin provisioning script.
- Restrictive starter Firestore rules.

## Windows setup
```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python app.py
```
Open http://127.0.0.1:5000.

## Firebase configuration
1. Create a Firebase project and add a Web App.
2. Enable Authentication > Email/Password.
3. Create Firestore.
4. Add the web config values to `.env` (`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`).
5. Generate a Firebase service-account JSON key and set `FIREBASE_SERVICE_ACCOUNT_JSON` to its one-line JSON content in `.env`. Keep this secret out of GitHub.
6. Restart Flask.

## Admin provisioning
Create and email-verify the intended account in Firebase Authentication. Set `INITIAL_ADMIN_EMAIL` in `.env`, then run `python admin_setup.py` locally from a trusted machine. Sign out and back in to refresh the ID token. Never expose the script as a public route.

## Tests
Run `pytest -q`. These tests verify unauthenticated API requests are rejected; they do not validate live Firebase credentials.

## Important
The dashboards are account shells. Booking, listing, and admin-management functionality will be added in later parts. Configure Firestore rules and Vercel environment variables separately before deployment.
