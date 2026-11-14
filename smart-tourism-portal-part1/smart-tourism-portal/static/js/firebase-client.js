import {initializeApp, getApps} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, updateProfile} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
const config = window.FIREBASE_WEB_CONFIG || {};
if (!config.apiKey || !config.projectId) throw new Error("Firebase web configuration is missing. Fill FIREBASE_* values in .env and restart Flask.");
const app = getApps().length ? getApps()[0] : initializeApp(config);
const auth = getAuth(app);
async function apiRequest(path, user, body) {
  const token = await user.getIdToken();
  const response = await fetch(path, {method: body === undefined ? "GET" : "POST", headers: {Authorization: `Bearer ${token}`, ...(body === undefined ? {} : {"Content-Type": "application/json"})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The server could not complete your request.");
  return data;
}
export {auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, updateProfile, apiRequest};
