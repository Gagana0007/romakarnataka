import {auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile, apiRequest} from "./firebase-client.js";
const message = document.querySelector("#authMessage");
function showMessage(text, isError = false) { if (!message) return; message.textContent = text; message.classList.toggle("error", isError); message.classList.add("visible"); }
function friendlyError(error) {
  const known = {"auth/email-already-in-use":"An account already exists with this email. Please log in.","auth/invalid-email":"Please enter a valid email address.","auth/weak-password":"Choose a stronger password with at least 6 characters.","auth/invalid-credential":"Email or password is incorrect.","auth/user-disabled":"This account has been disabled. Contact support.","auth/too-many-requests":"Too many attempts. Please wait and try again.","auth/network-request-failed":"Network error. Check your internet connection."};
  return known[error?.code] || error?.message || "Something went wrong. Please try again.";
}
document.querySelector("#registerForm")?.addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button[type=submit]"); button.disabled = true; button.textContent = "Creating account…";
  try {
    const name = document.querySelector("#registerName").value.trim(); const email = document.querySelector("#registerEmail").value.trim(); const phone = document.querySelector("#registerPhone").value.trim(); const password = document.querySelector("#registerPassword").value; const role = document.querySelector('input[name="registerRole"]:checked')?.value || "tourist";
    const credential = await createUserWithEmailAndPassword(auth, email, password); await updateProfile(credential.user, {displayName: name}); await apiRequest("/api/auth/profile", credential.user, {name, phone, role}); window.location.assign("/dashboard");
  } catch (error) { showMessage(friendlyError(error), true); button.disabled = false; button.innerHTML = 'Create account <span>↗</span>'; }
});
document.querySelector("#loginForm")?.addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button[type=submit]"); button.disabled = true; button.textContent = "Logging in…";
  try { const email = document.querySelector("#loginEmail").value.trim(); const password = document.querySelector("#loginPassword").value; const credential = await signInWithEmailAndPassword(auth, email, password); await apiRequest("/api/auth/me", credential.user); window.location.assign("/dashboard"); }
  catch (error) { showMessage(friendlyError(error), true); button.disabled = false; button.innerHTML = 'Log in <span>↗</span>'; }
});
document.querySelector("#forgotPassword")?.addEventListener("click", async () => {
  const email = document.querySelector("#loginEmail")?.value.trim(); if (!email) return showMessage("Enter your email address first, then choose Forgot password.", true);
  try { await sendPasswordResetEmail(auth, email); showMessage("If an account exists for this address, Firebase has sent a password reset email."); } catch (error) { showMessage(friendlyError(error), true); }
});
