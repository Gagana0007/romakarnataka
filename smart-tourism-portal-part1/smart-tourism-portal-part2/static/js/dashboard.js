import {auth, onAuthStateChanged, signOut, apiRequest} from "./firebase-client.js";
const $ = selector => document.querySelector(selector);
const showFailure = text => { const notice = $("#dashboardNotice"); if (notice) notice.textContent = text; };
onAuthStateChanged(auth, async user => {
  if (!user) return window.location.replace("/login");
  try {
    const {profile} = await apiRequest("/api/auth/me", user); const name = profile.name || user.displayName || "Traveller"; const role = profile.role || "tourist";
    $("#dashboardGreeting").textContent = `Welcome, ${name.split(" ")[0]}.`; $("#profileName").textContent = name; $("#profileEmail").textContent = profile.email || user.email || ""; $("#profileAvatar").textContent = name.charAt(0).toUpperCase(); $("#dashboardRole").textContent = role.toUpperCase();
    $("#dashboardSubheading").textContent = role === "owner" ? "Your local business journey starts here." : role === "admin" ? "Your platform overview starts here." : "Your next Karnataka discovery starts here.";
    if (role === "owner") { $("#roleCardTitle").textContent = "Your business"; $("#roleCardDescription").textContent = "Create and manage your tourism listings in Part 3."; $("#roleCardLink").textContent = "Prepare your listing ↗"; showFailure("Owner account verified. Business listing management is coming in Part 3."); }
    else if (role === "admin") { $("#roleCardTitle").textContent = "Platform control"; $("#roleCardDescription").textContent = "Secure admin management will be developed in Part 6."; $("#roleCardLink").textContent = "Admin workspace ↗"; showFailure("Administrator role verified from the server-controlled account profile."); }
    else { $("#roleCardTitle").textContent = "Your bookings"; $("#roleCardDescription").textContent = "Booking and trip management will be built in Part 4."; $("#roleCardLink").textContent = "Plan a trip ↗"; showFailure("Tourist account verified. Destination browsing and bookings are coming in the next parts."); }
  } catch (error) { showFailure(error.message || "Unable to load your account. Please log in again."); }
});
$("#logoutButton")?.addEventListener("click", async () => { try { await signOut(auth); window.location.assign("/login"); } catch { showFailure("Could not log out. Please try again."); } });
document.querySelectorAll("[data-coming-soon]").forEach(link => link.addEventListener("click", event => { event.preventDefault(); showFailure("This feature will be enabled in a later development part."); }));
