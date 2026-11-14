import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const toast = (message) => {
  const node = $("#toastMessage");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => node.classList.remove("show"), 3200);
};

document.documentElement.classList.add("js-motion");
window.addEventListener("load", () => window.setTimeout(() => $("#preloader")?.classList.add("done"), 350));

const header = $("#siteHeader");
const updateHeader = () => header?.classList.toggle("scrolled", window.scrollY > 30);
window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

$("#year").textContent = new Date().getFullYear();

const themeToggle = $("#themeToggle");
const savedTheme = localStorage.getItem("roam-theme");
if (savedTheme === "dark") document.body.classList.add("dark-mode");
themeToggle?.addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
  const mode = document.body.classList.contains("dark-mode") ? "dark" : "light";
  localStorage.setItem("roam-theme", mode);
  themeToggle.textContent = mode === "dark" ? "☀" : "☾";
});
if (themeToggle && document.body.classList.contains("dark-mode")) themeToggle.textContent = "☀";

const revealItems = $$(".reveal");
if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealItems.forEach(item => observer.observe(item));
} else {
  revealItems.forEach(item => item.classList.add("visible"));
}

function listenToWishlist(userId) {
  const wishlistQuery = collection(db, "wishlists", userId, "items");
  const unsubscribe = onSnapshot(wishlistQuery, snapshot => {
    const savedSamples = getSavedListingIds().filter(id => id.startsWith("sample-"));
    wishlistIds = [...new Set([...snapshot.docs.map(item => item.id), ...savedSamples])];
    localStorage.setItem("roam-saved-listings", JSON.stringify(wishlistIds));
    renderSavedListings();
  }, error => {
    setStatus(dashboardStatus, authErrorMessage(error), true);
    dashboardStatus.hidden = false;
  });
  liveDashboardUnsubscribers.push(unsubscribe);
}

async function loadOwnerReviews() {
  const reviewsQuery = query(collection(db, "reviews"), where("ownerId", "==", auth.currentUser.uid));
  const unsubscribe = onSnapshot(reviewsQuery, snapshot => {
    const reviews = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    $("#ownerReviewGrid").replaceChildren(...reviews.map(makeReviewCard));
    $("#ownerReviewEmpty").hidden = reviews.length > 0;
  }, error => {
    setStatus(dashboardStatus, authErrorMessage(error), true);
    dashboardStatus.hidden = false;
  });
  liveDashboardUnsubscribers.push(unsubscribe);
}

if (window.gsap && window.ScrollTrigger && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  gsap.registerPlugin(ScrollTrigger);
  gsap.from(".hero-eyebrow, .hero h1, .hero-subtitle, .search-panel", {
    y: 22, opacity: 0, duration: 0.8, stagger: 0.13, ease: "power2.out", delay: 0.35
  });
}

$$("img").forEach(img => {
  img.addEventListener("error", () => {
    img.style.display = "none";
    img.parentElement?.classList.add("image-fallback");
  }, { once: true });
});

$("#exploreSearch")?.addEventListener("submit", event => {
  event.preventDefault();
  const params = new URLSearchParams();
  const place = $("#searchLocation").value.trim();
  const category = $("#searchCategory").value;
  if (place) params.set("location", place);
  if (category) params.set("type", category);
  const query = params.toString();
  history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}#listings`);
  applyCatalogFilters(place, category);
  document.querySelector("#listings")?.scrollIntoView({ behavior: "smooth" });
  toast("Showing matching local experiences.");
});

$("#newsletterForm")?.addEventListener("submit", event => {
  event.preventDefault();
  toast("Thanks for your interest! Newsletter subscriptions will be connected to the backend in a later part.");
  event.target.reset();
});

const firebaseConfig = window.FIREBASE_WEB_CONFIG || {};
const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
const firebaseApp = firebaseReady ? (getApps()[0] || initializeApp(firebaseConfig)) : null;
const auth = firebaseApp ? getAuth(firebaseApp) : null;
const db = firebaseApp ? getFirestore(firebaseApp) : null;
let catalogListings = [];
let currentDashboardRole = "";
let liveDashboardUnsubscribers = [];
let wishlistIds = [];

function stopDashboardListeners() {
  liveDashboardUnsubscribers.forEach(unsubscribe => unsubscribe());
  liveDashboardUnsubscribers = [];
}

window.addEventListener("pagehide", stopDashboardListeners);

const getSavedListingIds = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("roam-saved-listings") || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};
wishlistIds = getSavedListingIds();

function renderSavedListings() {
  const grid = $("#dashboardSavedGrid");
  if (!grid) return;
  const saved = catalogListings.filter(listing => wishlistIds.includes(listing.id));
  grid.replaceChildren(...saved.map(listing => makeListingCard(listing)));
  $("#savedEmpty").hidden = saved.length > 0;
}

function makeListingCard(listing, ownerMode = false) {
  const card = document.createElement("article");
  card.className = "listing-card";
  if (listing.imageUrl) {
    const image = document.createElement("img");
    image.src = listing.imageUrl;
    image.alt = listing.title;
    image.loading = "lazy";
    image.addEventListener("error", () => image.remove(), { once: true });
    if (ownerMode) card.append(image);
    else {
      const imageLink = document.createElement("a");
      imageLink.className = "listing-card-image";
      imageLink.href = `/listings/${encodeURIComponent(listing.id)}`;
      imageLink.append(image);
      card.append(imageLink);
    }
  }
  const content = document.createElement("div");
  content.className = "listing-card-copy";
  const category = document.createElement("span");
  category.className = "listing-category";
  category.textContent = listing.type || "Local experience";
  const title = document.createElement("h3");
  title.textContent = listing.title;
  const location = document.createElement("p");
  location.className = "listing-location";
  location.textContent = `${listing.location || "Karnataka"}${listing.ownerName ? ` · ${listing.ownerName}` : ""}`;
  const description = document.createElement("p");
  description.textContent = listing.description;
  const price = document.createElement("strong");
  price.className = "listing-price";
  price.textContent = `₹${Number(listing.price || 0).toLocaleString("en-IN")} `;
  const unit = document.createElement("small");
  unit.textContent = `/ ${listing.priceUnit || "person"}`;
  price.append(unit);
  content.append(category, title, location, description, price);
  if (ownerMode && listing.status) {
    const approval = document.createElement("span");
    approval.className = `listing-approval listing-approval-${listing.status}`;
    approval.textContent = `Admin review: ${listing.status}`;
    content.append(approval);
  }
  if (listing.sample) {
    const badge = document.createElement("span");
    badge.className = "sample-badge";
    badge.textContent = "SAMPLE LISTING";
    content.prepend(badge);
  }
  if (!ownerMode) {
    const detailLink = document.createElement("a");
    detailLink.className = "listing-card-link";
    detailLink.href = `/listings/${encodeURIComponent(listing.id)}`;
    detailLink.append(content);
    card.append(detailLink);
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "listing-save-button";
    saveButton.textContent = wishlistIds.includes(listing.id) ? "Saved" : "Save";
    saveButton.setAttribute("aria-pressed", String(wishlistIds.includes(listing.id)));
    saveButton.addEventListener("click", () => toggleWishlist(listing, saveButton));
    card.append(saveButton);
  } else {
    card.append(content);
  }
  return card;
}

async function toggleWishlist(listing, button) {
  const wasSaved = wishlistIds.includes(listing.id);
  button.disabled = true;
  try {
    if (firebaseReady && auth.currentUser && !listing.sample) {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`/api/wishlist/${encodeURIComponent(listing.id)}`, {
        method: wasSaved ? "DELETE" : "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update your saved experiences.");
    }
    wishlistIds = wasSaved
      ? wishlistIds.filter(id => id !== listing.id)
      : [...wishlistIds, listing.id];
    localStorage.setItem("roam-saved-listings", JSON.stringify(wishlistIds));
    button.textContent = wasSaved ? "Save" : "Saved";
    button.setAttribute("aria-pressed", String(!wasSaved));
    renderSavedListings();
    toast(wasSaved ? "Removed from saved experiences." : "Experience saved.");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function applyCatalogFilters(location = "", type = "") {
  const destinationGrid = $("#destinationGrid");
  if (destinationGrid) {
    const needle = location.trim().toLocaleLowerCase();
    $$(".destination-card", destinationGrid).forEach(card => {
      card.hidden = Boolean(needle) && !card.dataset.destinationName.includes(needle);
    });
  }
  const listingGrid = $("#listingGrid") || $("#destinationListings");
  if (!listingGrid) return;
  const status = $("#listingStatus") || $(".listing-results-status", listingGrid.parentElement);
  if (status) status.textContent = "Loading local experiences…";
  try {
    const response = await fetch("/api/listings");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load local experiences.");
    catalogListings = result.listings;
    const locationNeedle = location.trim().toLocaleLowerCase();
    const matches = result.listings.filter(listing =>
      (!locationNeedle || String(listing.location || "").toLocaleLowerCase().includes(locationNeedle)) &&
      (!type || listing.type === type)
    );
    listingGrid.replaceChildren();
    matches.forEach(listing => listingGrid.append(makeListingCard(listing)));
    renderSavedListings();
    if (status) status.textContent = matches.length
      ? `${matches.length} local ${matches.length === 1 ? "experience" : "experiences"} found${location ? ` near ${location}` : ""}.`
      : "No experiences match yet. Try another location or category.";
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

if ($("#listingGrid")) {
  const query = new URLSearchParams(window.location.search);
  applyCatalogFilters(query.get("location") || "", query.get("type") || "");
} else if ($("#destinationListings")) {
  applyCatalogFilters($("#destinationListings").dataset.location || "");
}

async function loadOwnerListings() {
  const grid = $("#ownerListingGrid");
  if (!grid || !auth.currentUser) return;
  try {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch("/api/listings/mine", { headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load your listings.");
    grid.replaceChildren();
    result.listings.forEach(listing => {
      const card = makeListingCard(listing, true);
      const actions = document.createElement("div");
      actions.className = "listing-card-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "account-text-button";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => populateListingForm(listing));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "account-text-button listing-delete";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteOwnerListing(listing.id));
      actions.append(edit, remove);
      card.append(actions);
      grid.append(card);
    });
    if (!result.listings.length) grid.textContent = "You haven’t added a listing yet.";
  } catch (error) {
    setStatus(dashboardStatus, error.message, true);
    dashboardStatus.hidden = false;
  }
}

function populateListingForm(listing) {
  const form = $("#listingForm");
  Object.entries(listing).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field && key !== "image") field.value = value;
  });
  form.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

$("#newListingButton")?.addEventListener("click", () => {
  const form = $("#listingForm");
  form.reset();
  form.elements.namedItem("id").value = "";
  form.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
});
$("#cancelListingButton")?.addEventListener("click", () => { $("#listingForm").hidden = true; });

let listingPreviewUrls = [];
$("#listingForm input[name='images']")?.addEventListener("change", event => {
  listingPreviewUrls.forEach(url => URL.revokeObjectURL(url));
  listingPreviewUrls = [];
  const preview = $("#listingImagePreviews");
  preview.replaceChildren();
  const files = [...event.target.files];
  if (files.length > 5) {
    event.target.value = "";
    setStatus(dashboardStatus, "Choose no more than five images.", true);
    dashboardStatus.hidden = false;
    return;
  }
  for (const file of files) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      event.target.value = "";
      preview.replaceChildren();
      setStatus(dashboardStatus, "Choose JPEG, PNG or WebP images no larger than 5 MB each.", true);
      dashboardStatus.hidden = false;
      return;
    }
    const url = URL.createObjectURL(file);
    listingPreviewUrls.push(url);
    const image = document.createElement("img");
    image.src = url;
    image.alt = `Preview: ${file.name}`;
    preview.append(image);
  }
});

function uploadListingForm(url, method, form, progressContainer) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    auth.currentUser.getIdToken().then(token => {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.addEventListener("progress", event => {
        if (!event.lengthComputable) return;
        const percent = Math.round(event.loaded / event.total * 100);
        progressContainer.hidden = false;
        $("progress", progressContainer).value = percent;
        $("#listingUploadPercent").textContent = `${percent}%`;
      });
      xhr.addEventListener("load", () => {
        let result;
        try {
          result = JSON.parse(xhr.responseText);
        } catch {
          reject(new Error("The server returned an invalid response."));
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(result.error || "Could not save your listing."));
          return;
        }
        resolve(result);
      });
      xhr.addEventListener("error", () => reject(new Error("Upload failed. Check your connection and storage configuration.")));
      xhr.addEventListener("abort", () => reject(new Error("Upload was cancelled.")));
      xhr.send(new FormData(form));
    }).catch(reject);
  });
}

$("#listingForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!auth.currentUser) return;
  const form = event.currentTarget;
  const id = form.elements.namedItem("id").value;
  const button = $('button[type="submit"]', form);
  const progress = $("#listingUploadProgress");
  progress.hidden = true;
  $("progress", progress).value = 0;
  $("#listingUploadPercent").textContent = "0%";
  button.disabled = true;
  try {
    const result = await uploadListingForm(
      id ? `/api/listings/${encodeURIComponent(id)}` : "/api/listings",
      id ? "PUT" : "POST",
      form,
      progress
    );
    form.reset();
    form.hidden = true;
    listingPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    listingPreviewUrls = [];
    $("#listingImagePreviews").replaceChildren();
    await loadOwnerListings();
    toast(id ? "Listing saved and sent for review." : "Listing submitted for review.");
  } catch (error) {
    setStatus(dashboardStatus, error.message, true);
    dashboardStatus.hidden = false;
  } finally {
    button.disabled = false;
  }
});

async function deleteOwnerListing(id) {
  if (!window.confirm("Delete this listing? This cannot be undone.")) return;
  try {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(`/api/listings/${encodeURIComponent(id)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not delete the listing.");
    await loadOwnerListings();
    toast("Listing deleted.");
  } catch (error) {
    setStatus(dashboardStatus, error.message, true);
    dashboardStatus.hidden = false;
  }
}

const authErrorMessage = (error) => {
  const messages = {
    "auth/email-already-in-use": "An account already uses this email. Try signing in instead.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "permission-denied": "Firebase denied this action. Check that the Firestore security rules are published."
  };
  return messages[error.code] || "Something went wrong. Check your Firebase setup and try again.";
};

const setStatus = (node, message, isError = false) => {
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("is-error", isError);
};

const authStatus = $("#authStatus");
const loginForm = $("#loginForm");
const signupForm = $("#signupForm");
let registrationInProgress = false;

const showAuthForm = (mode) => {
  const signup = mode === "signup";
  loginForm.hidden = signup;
  signupForm.hidden = !signup;
  $("#authTitle").textContent = signup ? "Find your place." : "Welcome back.";
  $("#authIntro").textContent = signup
    ? "Create an account to begin your local journey."
    : "Sign in to continue to your Roam Karnataka account.";
  setStatus(authStatus, "");
};

$$("[data-show-signup]").forEach(button => button.addEventListener("click", () => showAuthForm("signup")));
$$("[data-show-login]").forEach(button => button.addEventListener("click", () => showAuthForm("login")));

const requestedRole = new URLSearchParams(window.location.search).get("role");
if (requestedRole === "owner") {
  showAuthForm("signup");
  $("#signupRole").value = "owner";
}

if (loginForm) {
  if (!firebaseReady) {
    setStatus(authStatus, "Firebase is not configured. Add the web app values to your local .env file and restart Flask.", true);
    $$("input, select, button", loginForm).forEach(control => { control.disabled = true; });
    $$("input, select, button", signupForm).forEach(control => { control.disabled = true; });
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(loginForm);
    const button = $('button[type="submit"]', loginForm);
    button.disabled = true;
    setStatus(authStatus, "Signing in…");
    try {
      await signInWithEmailAndPassword(auth, form.get("email"), form.get("password"));
      window.location.assign("/dashboard");
    } catch (error) {
      setStatus(authStatus, authErrorMessage(error), true);
      button.disabled = false;
    }
  });

  signupForm.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(signupForm);
    const name = String(form.get("name")).trim();
    const role = form.get("role");
    if (!["tourist", "owner"].includes(role)) {
      setStatus(authStatus, "Choose a valid account type.", true);
      return;
    }
    const button = $('button[type="submit"]', signupForm);
    button.disabled = true;
    registrationInProgress = true;
    setStatus(authStatus, "Creating your account…");
    let createdUser = null;
    try {
      const credential = await createUserWithEmailAndPassword(auth, form.get("email"), form.get("password"));
      createdUser = credential.user;
      await updateProfile(credential.user, { displayName: name });
      await setDoc(doc(db, "users", credential.user.uid), {
        name,
        email: credential.user.email,
        role,
        createdAt: serverTimestamp()
      });
      registrationInProgress = false;
      window.location.assign("/dashboard");
    } catch (error) {
      if (createdUser) {
        let signOutWarning = "";
        try {
          await signOut(auth);
        } catch {
          signOutWarning = " Sign out manually before continuing.";
        }
        setStatus(authStatus, `Your login was created, but the profile could not be saved. ${authErrorMessage(error)} Publish firestore.rules and remove the incomplete account in Firebase Authentication before trying again.${signOutWarning}`, true);
      } else {
        setStatus(authStatus, authErrorMessage(error), true);
      }
      registrationInProgress = false;
      button.disabled = false;
    }
  });

  $("#forgotPassword").addEventListener("click", async () => {
    const email = new FormData(loginForm).get("email");
    if (!email) {
      setStatus(authStatus, "Enter your email address first, then choose Forgot password.", true);
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setStatus(authStatus, "If an account exists for that email, a password reset link has been sent.");
    } catch (error) {
      setStatus(authStatus, authErrorMessage(error), true);
    }
  });

  if (firebaseReady) {
    onAuthStateChanged(auth, user => {
      if (user && !registrationInProgress) window.location.replace("/dashboard");
    });
  }
}

function formatBookingStatus(status) {
  const labels = { pending: "Awaiting owner response", confirmed: "Confirmed", rejected: "Rejected", cancelled: "Cancelled", completed: "Completed" };
  return labels[status] || status;
}

function makeBookingCard(booking, ownerMode) {
  const card = document.createElement("article");
  card.className = "booking-card";
  if (booking.listingImageUrl) {
    const image = document.createElement("img");
    image.src = booking.listingImageUrl;
    image.alt = booking.listingTitle || "Booked experience";
    image.loading = "lazy";
    image.addEventListener("error", () => image.remove(), { once: true });
    card.append(image);
  }
  const content = document.createElement("div");
  content.className = "booking-card-content";
  const heading = document.createElement("h3");
  heading.textContent = booking.listingTitle || "Local experience";
  const detail = document.createElement("p");
  detail.textContent = `${booking.listingLocation || "Karnataka"} · ${booking.checkIn} to ${booking.checkOut} · ${booking.guests} guest${booking.guests === 1 ? "" : "s"}`;
  const amount = document.createElement("p");
  amount.textContent = booking.totalAmount == null ? "" : `Total: ₹${Number(booking.totalAmount).toLocaleString("en-IN")}`;
  const person = document.createElement("p");
  person.textContent = ownerMode
    ? `Requested by ${booking.touristName || "Traveller"} (${booking.touristEmail || "email unavailable"})`
    : `Hosted by ${booking.ownerName || "Local owner"}`;
  const note = document.createElement("p");
  note.textContent = booking.note ? `Note: ${booking.note}` : "";
  const status = document.createElement("span");
  status.className = `booking-status booking-status-${booking.status}`;
  status.textContent = formatBookingStatus(booking.status);
  content.append(heading, detail, amount, person);
  if (booking.note) content.append(note);
  content.append(status);
  if (ownerMode && booking.status === "pending") {
    const actions = document.createElement("div");
    actions.className = "booking-actions";
    [["confirmed", "Confirm"], ["rejected", "Reject"]].forEach(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = value === "confirmed" ? "account-submit" : "booking-decline";
      button.textContent = label;
      button.addEventListener("click", () => updateBooking(booking.id, value, button));
      actions.append(button);
    });
    content.append(actions);
  } else if (ownerMode && booking.status === "confirmed" && booking.checkOut <= new Date().toISOString().slice(0, 10)) {
    const complete = document.createElement("button");
    complete.type = "button";
    complete.className = "account-submit";
    complete.textContent = "Mark completed";
    complete.addEventListener("click", () => updateBooking(booking.id, "completed", complete));
    content.append(complete);
  } else if (!ownerMode && ["pending", "confirmed"].includes(booking.status)) {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "booking-decline";
    cancel.textContent = "Cancel request";
    cancel.addEventListener("click", () => updateBooking(booking.id, "cancelled", cancel));
    content.append(cancel);
  }
  card.append(content);
  return card;
}

async function fetchBookings(path) {
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not load booking requests.");
  return result.bookings;
}

async function loadTouristBookings() {
  const grid = $("#touristBookingGrid");
  const bookingsQuery = query(collection(db, "bookings"), where("touristId", "==", auth.currentUser.uid));
  const unsubscribe = onSnapshot(bookingsQuery, snapshot => {
    const bookings = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(b.checkIn).localeCompare(String(a.checkIn)));
    grid.replaceChildren(...bookings.map(booking => makeBookingCard(booking, false)));
    $("#touristBookingEmpty").hidden = bookings.length > 0;
  }, error => {
    setStatus(dashboardStatus, error.message, true);
    dashboardStatus.hidden = false;
  });
  liveDashboardUnsubscribers.push(unsubscribe);
}

async function loadOwnerBookings() {
  const grid = $("#ownerBookingGrid");
  const bookingsQuery = query(collection(db, "bookings"), where("ownerId", "==", auth.currentUser.uid));
  const unsubscribe = onSnapshot(bookingsQuery, snapshot => {
    const bookings = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(a.checkIn).localeCompare(String(b.checkIn)));
    grid.replaceChildren(...bookings.map(booking => makeBookingCard(booking, true)));
    $("#ownerBookingEmpty").hidden = bookings.length > 0;
  }, error => {
    setStatus(dashboardStatus, error.message, true);
    dashboardStatus.hidden = false;
  });
  liveDashboardUnsubscribers.push(unsubscribe);
}

async function updateBooking(id, status, button) {
  button.disabled = true;
  try {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(`/api/bookings/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not update the booking.");
    toast(`Booking ${status}.`);
  } catch (error) {
    button.disabled = false;
    setStatus(dashboardStatus, error.message, true);
    dashboardStatus.hidden = false;
  }
}

function listenToNotifications(userId) {
  const list = $("#notificationList");
  if (!list) return;
  const notificationsQuery = query(
    collection(db, "notifications"),
    where("recipientId", "==", userId),
    orderBy("createdAt", "desc")
  );
  const unsubscribe = onSnapshot(notificationsQuery, snapshot => {
    list.replaceChildren();
    $("#notificationEmpty").hidden = !snapshot.empty;
    snapshot.docs.forEach(item => {
      const notification = { id: item.id, ...item.data() };
      const card = document.createElement("article");
      card.className = `notification-card${notification.read ? "" : " notification-unread"}`;
      const message = document.createElement("p");
      message.textContent = notification.message || "You have an update.";
      const meta = document.createElement("span");
      meta.textContent = notification.type?.replaceAll("_", " ") || "Update";
      card.append(message, meta);
      if (!notification.read) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "account-text-button";
        button.textContent = "Mark as read";
        button.addEventListener("click", () => markNotificationRead(notification.id, button));
        card.append(button);
      }
      list.append(card);
    });
  }, error => {
    setStatus(dashboardStatus, authErrorMessage(error), true);
    dashboardStatus.hidden = false;
  });
  liveDashboardUnsubscribers.push(unsubscribe);
}

async function markNotificationRead(id, button) {
  button.disabled = true;
  try {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not update notification.");
  } catch (error) {
    button.disabled = false;
    setStatus(dashboardStatus, error.message, true);
    dashboardStatus.hidden = false;
  }
}

const bookingPanel = $("#bookingPanel");
if (bookingPanel) {
  const bookingForm = $("#bookingForm");
  const loginLink = $("#bookingLoginLink");
  const status = $("#bookingStatus");
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const checkInInput = bookingForm.elements.namedItem("checkIn");
  const checkOutInput = bookingForm.elements.namedItem("checkOut");
  const bookingListing = {
  price: Number(bookingPanel.dataset.price),
  priceUnit: bookingPanel.dataset.priceUnit
  };
  checkInInput.min = localToday;
  checkOutInput.min = localToday;
  const checkAvailability = async () => {
    const checkIn = checkInInput.value;
    const checkOut = checkOutInput.value;
    const availability = $("#bookingAvailability");
    const estimate = $("#bookingEstimate");
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      availability.textContent = "Choose a check-out date after check-in.";
      estimate.textContent = "";
      return;
    }
    try {
      availability.textContent = "Checking dates…";
      const response = await fetch(`/api/listings/${encodeURIComponent(bookingPanel.dataset.listingId)}/availability?${new URLSearchParams({ checkIn, checkOut })}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not check these dates.");
      availability.textContent = result.available ? "Dates look available. The owner confirms the final booking." : result.reason;
      availability.classList.toggle("availability-error", !result.available);
      if (Number.isFinite(bookingListing.price) && result.available) {
        const quantity = bookingListing.priceUnit === "night"
          ? (new Date(`${checkOut}T00:00:00`) - new Date(`${checkIn}T00:00:00`)) / 86400000
          : Number(bookingForm.elements.namedItem("guests").value);
        estimate.textContent = `Estimated total: ₹${(Number(bookingListing.price) * quantity).toLocaleString("en-IN")} (no payment collected)`;
      }
    } catch (error) {
      availability.textContent = error.message;
      availability.classList.add("availability-error");
    }
  };
  checkInInput.addEventListener("change", () => {
    checkOutInput.min = checkInInput.value || localToday;
    checkAvailability();
  });
  checkOutInput.addEventListener("change", checkAvailability);
  bookingForm.elements.namedItem("guests").addEventListener("change", checkAvailability);
  if (!firebaseReady) {
    loginLink.hidden = true;
    setStatus(status, "Firebase sign-in is not configured.", true);
  } else {
    onAuthStateChanged(auth, async user => {
      if (!user) {
        loginLink.hidden = false;
        bookingForm.hidden = true;
        return;
      }
      try {
        const profile = await getDoc(doc(db, "users", user.uid));
        if (!profile.exists() || profile.data().role !== "tourist") {
          loginLink.hidden = true;
          bookingForm.hidden = true;
          setStatus(status, "Sign in with a Tourist account to request a booking.", true);
          return;
        }
        loginLink.hidden = true;
        bookingForm.hidden = false;
      } catch (error) {
        setStatus(status, authErrorMessage(error), true);
      }
    });
  }
  bookingForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!auth.currentUser) return;
    const formData = new FormData(bookingForm);
    const checkIn = formData.get("checkIn");
    const checkOut = formData.get("checkOut");
    if (checkOut <= checkIn) {
      setStatus(status, "Check-out must be after check-in.", true);
      return;
    }
    const button = $('button[type="submit"]', bookingForm);
    button.disabled = true;
    setStatus(status, "Sending booking request…");
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: bookingPanel.dataset.listingId,
          checkIn,
          checkOut,
          guests: formData.get("guests"),
          note: formData.get("note")
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send booking request.");
      bookingForm.reset();
      setStatus(status, "Your request was sent. Track its status from your Tourist dashboard.");
    } catch (error) {
      setStatus(status, error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

function makeReviewCard(review) {
  const card = document.createElement("article");
  card.className = "review-card";
  const stars = document.createElement("div");
  stars.className = "review-stars";
  stars.textContent = `${"★".repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)))}${"☆".repeat(5 - Math.max(0, Math.min(5, Number(review.rating) || 0)))}`;
  stars.setAttribute("aria-label", `${review.rating} out of 5 stars`);
  const author = document.createElement("strong");
  author.textContent = review.touristName || "Verified traveller";
  const comment = document.createElement("p");
  comment.textContent = review.comment || "";
  card.append(stars, author, comment);
  return card;
}

function renderReviews(container, reviews) {
  container.replaceChildren(...reviews.map(makeReviewCard));
  const empty = $("#reviewEmpty");
  if (empty) {
    empty.hidden = reviews.length > 0;
    if (!reviews.length) empty.textContent = "No reviews yet.";
  }
}

const listingReviews = $("#listingReviews");
const reviewForm = $("#reviewForm");
if (listingReviews) {
  const listingId = listingReviews.dataset.listingId;
  const loadReviews = async () => {
    try {
      const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}/reviews`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load reviews.");
      renderReviews(listingReviews, result.reviews);
    } catch (error) {
      const empty = $("#reviewEmpty");
      empty.hidden = false;
      empty.textContent = error.message;
    }
  };
  if (firebaseReady) {
    const reviewsQuery = query(collection(db, "reviews"), where("listingId", "==", listingId));
    const unsubscribe = onSnapshot(reviewsQuery, snapshot => {
      const reviews = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(b.createdAt?.seconds || "").localeCompare(String(a.createdAt?.seconds || "")));
      renderReviews(listingReviews, reviews);
    }, () => loadReviews());
    liveDashboardUnsubscribers.push(unsubscribe);
  } else {
    loadReviews();
  }
  if (reviewForm && firebaseReady) {
    onAuthStateChanged(auth, async user => {
      if (!user) return;
      try {
        const profile = await getDoc(doc(db, "users", user.uid));
        if (!profile.exists() || profile.data().role !== "tourist") return;
        const token = await user.getIdToken();
        const response = await fetch("/api/bookings/mine", { headers: { Authorization: `Bearer ${token}` } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not check review eligibility.");
        const eligible = result.bookings.filter(booking => booking.listingId === listingId && booking.status === "completed");
        const select = reviewForm.elements.namedItem("bookingId");
        eligible.forEach(booking => {
          const option = document.createElement("option");
          option.value = booking.id;
          option.textContent = `${booking.checkIn} – ${booking.checkOut}`;
          select.append(option);
        });
        reviewForm.hidden = eligible.length === 0;
      } catch (error) {
        setStatus($("#reviewStatus"), error.message, true);
      }
    });
    reviewForm.addEventListener("submit", async event => {
      event.preventDefault();
      const button = $('button[type="submit"]', reviewForm);
      button.disabled = true;
      try {
        const formData = new FormData(reviewForm);
        const token = await auth.currentUser.getIdToken();
        const response = await fetch("/api/reviews", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId: formData.get("bookingId"),
            rating: formData.get("rating"),
            comment: formData.get("comment")
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not submit review.");
        reviewForm.reset();
        setStatus($("#reviewStatus"), "Thanks. Your review has been published.");
      } catch (error) {
        setStatus($("#reviewStatus"), error.message, true);
      } finally {
        button.disabled = false;
      }
    });
  }
}

const dashboardStatus = $("#dashboardStatus");
const dashboardContent = $("#dashboardContent");

function openDashboardPage(pageId) {
  $$(".dashboard-view").forEach(page => { page.hidden = page.id !== pageId; });
  $$(".dashboard-nav-button").forEach(button => {
    const active = button.dataset.dashboardPage === pageId;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
}

function setupDashboardPages(role) {
  const pages = {
    tourist: [
      ["Overview", "dashboardOverview"],
      ["Explore experiences", "touristExplore"],
      ["Saved experiences", "touristSaved"],
      ["My bookings", "touristBookings"],
      ["Notifications", "dashboardNotifications"],
      ["My profile", "dashboardProfile"]
    ],
    owner: [
      ["Overview", "dashboardOverview"],
      ["My listings", "ownerListings"],
      ["Booking requests", "ownerBookings"],
      ["Customer reviews", "ownerReviews"],
      ["Notifications", "dashboardNotifications"],
      ["My profile", "dashboardProfile"]
    ],
    admin: [
      ["Overview", "dashboardOverview"],
      ["Platform accounts", "adminUsers"],
      ["Business verification", "adminBusinesses"],
      ["All bookings", "adminBookings"],
      ["Analytics", "adminAnalytics"],
      ["Notifications", "dashboardNotifications"],
      ["My profile", "dashboardProfile"]
    ]
  }[role];
  const nav = $("#dashboardNav");
  nav.replaceChildren();
  pages.forEach(([label, pageId]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dashboard-nav-button";
    button.dataset.dashboardPage = pageId;
    button.textContent = label;
    button.addEventListener("click", () => openDashboardPage(pageId));
    nav.append(button);
  });
  const shortcuts = $("#dashboardShortcuts");
  shortcuts.replaceChildren();
  const shortcutPages = pages.filter(([, pageId]) => pageId !== "dashboardOverview" && pageId !== "dashboardProfile");
  shortcutPages.forEach(([label, pageId]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dashboard-shortcut";
    button.textContent = label;
    button.addEventListener("click", () => openDashboardPage(pageId));
    shortcuts.append(button);
  });
  $("#dashboardProfile").hidden = false;
  openDashboardPage("dashboardOverview");
}

async function loadTouristDashboard() {
  const response = await fetch("/api/listings");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not load local experiences.");
  catalogListings = result.listings;
  const exploreGrid = $("#dashboardExploreGrid");
  const overviewGrid = $("#dashboardOverviewListings");
  exploreGrid.replaceChildren(...catalogListings.map(listing => makeListingCard(listing)));
  overviewGrid.replaceChildren(...catalogListings.slice(0, 3).map(listing => makeListingCard(listing)));
  renderSavedListings();
}

if (dashboardStatus) {
  if (!firebaseReady) {
    setStatus(dashboardStatus, "Firebase is not configured. Add the web app values to your local .env file and restart Flask.", true);
  } else {
    onAuthStateChanged(auth, async user => {
      stopDashboardListeners();
      if (!user) {
        window.location.replace("/auth");
        return;
      }
      try {
        const profileSnapshot = await getDoc(doc(db, "users", user.uid));
        if (!profileSnapshot.exists()) {
          setStatus(dashboardStatus, "Your account profile is missing. Contact the platform administrator for help.", true);
          return;
        }
        const profile = profileSnapshot.data();
        if (!["tourist", "owner", "admin"].includes(profile.role)) {
          setStatus(dashboardStatus, "Your account has an invalid role. Contact the platform administrator.", true);
          return;
        }
        $("#userName").textContent = profile.name || user.displayName || user.email;
        $("#roleBadge").textContent = profile.role;
        $("#roleDescription").textContent = {
          tourist: "Discover local stays, guides and cultural experiences. Save the ones you love for later.",
          owner: "Manage your listings, images and business details from one place.",
          admin: "Manage platform accounts and keep the marketplace running smoothly."
        }[profile.role];
        $("#profileName").textContent = profile.name || user.displayName || "—";
        $("#profileEmail").textContent = user.email || "—";
        $("#profileRole").textContent = profile.role;
        currentDashboardRole = profile.role;
        setupDashboardPages(profile.role);
        listenToNotifications(user.uid);
        dashboardStatus.hidden = true;
        dashboardContent.hidden = false;
        if (profile.role === "tourist") {
          await loadTouristDashboard();
          listenToWishlist(user.uid);
          await loadTouristBookings();
        }
        listenToNotifications(user.uid);
        if (profile.role === "admin") await loadAdminUsers();
        if (profile.role === "admin") await loadAdminDashboard();
        if (profile.role === "owner") {
          $("#ownerListings").hidden = false;
          await loadOwnerListings();
          $("#ownerBookings").hidden = false;
          await loadOwnerBookings();
          $("#ownerReviews").hidden = false;
          await loadOwnerReviews();
        }
      } catch (error) {
        setStatus(dashboardStatus, authErrorMessage(error), true);
      }
    });
  }
}

const signOutButton = $("#signOutButton");
if (signOutButton && !firebaseReady) signOutButton.disabled = true;
signOutButton?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.replace("/");
  } catch (error) {
    setStatus(dashboardStatus, authErrorMessage(error), true);
  }
});

async function loadAdminUsers() {
  const panel = $("#adminUsers");
  const tbody = $("#userTableBody");
  panel.hidden = false;
  try {
    const users = await getDocs(collection(db, "users"));
    users.forEach(userSnapshot => {
      const user = userSnapshot.data();
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      const emailCell = document.createElement("td");
      const roleCell = document.createElement("td");
      const activeCell = document.createElement("td");
      const idCell = document.createElement("td");
      const roleSelect = document.createElement("select");
      roleSelect.className = "form-select form-select-sm";
      roleSelect.setAttribute("aria-label", `Role for ${user.email || userSnapshot.id}`);
      ["tourist", "owner", "admin"].forEach(role => {
        const option = document.createElement("option");
        option.value = role;
        option.textContent = role;
        option.selected = user.role === role;
        roleSelect.append(option);
      });
      if (userSnapshot.id === auth.currentUser.uid) roleSelect.disabled = true;
      roleSelect.addEventListener("change", async () => {
        roleSelect.disabled = true;
        try {
          await updateDoc(doc(db, "users", userSnapshot.id), { role: roleSelect.value });
          toast("Account role updated.");
        } catch (error) {
          roleSelect.value = user.role;
          dashboardStatus.hidden = false;
          setStatus(dashboardStatus, authErrorMessage(error), true);
        } finally {
          roleSelect.disabled = false;
        }
      });
      nameCell.textContent = user.name || "—";
      emailCell.textContent = user.email || "—";
      roleCell.append(roleSelect);
      const isActive = user.active !== false;
      const activeButton = document.createElement("button");
      activeButton.type = "button";
      activeButton.className = isActive ? "admin-user-active" : "admin-user-suspended";
      activeButton.textContent = isActive ? "Active" : "Suspended";
      activeButton.disabled = userSnapshot.id === auth.currentUser.uid;
      activeButton.addEventListener("click", async () => {
        activeButton.disabled = true;
        try {
          await adminRequest(`/api/admin/users/${encodeURIComponent(userSnapshot.id)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: user.active === false })
          });
          await loadAdminUsers();
        } catch (error) {
          dashboardStatus.hidden = false;
          setStatus(dashboardStatus, error.message, true);
          activeButton.disabled = false;
        }
      });
      activeCell.append(activeButton);
      idCell.textContent = userSnapshot.id;
      row.append(nameCell, emailCell, roleCell, activeCell, idCell);
      tbody.append(row);
    });
    if (users.empty) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "No accounts found.";
      row.append(cell);
      tbody.append(row);
    }

    async function adminRequest(path, options = {}) {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(path, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${token}` }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Administrator request failed.");
      return result;
    }

    async function loadAdminDashboard() {
      try {
        const [summary, pending, bookings] = await Promise.all([
          adminRequest("/api/admin/summary"),
          adminRequest("/api/admin/listings?status=pending"),
          adminRequest("/api/admin/bookings")
        ]);
        const stats = {
          statUsers: summary.users,
          statTourists: summary.tourists,
          statOwners: summary.owners,
          statDestinations: summary.destinations,
          statListings: summary.listings,
          statPending: summary.pendingListings,
          statApproved: summary.approvedListings,
          statBookings: summary.bookings,
          statConfirmed: summary.confirmedBookings,
          statCancelled: summary.cancelledBookings,
          statBookingValue: `₹${Number(summary.demoConfirmedValue).toLocaleString("en-IN")}`
        };
        Object.entries(stats).forEach(([id, value]) => { $(`#${id}`).textContent = value; });
        renderPendingListings(pending.listings);
        renderAdminBookings(bookings.bookings);
        if (window.Chart) {
          window.adminCategoryChart?.destroy();
          window.userGrowthChart?.destroy();
          window.bookingActivityChart?.destroy();
          window.adminCategoryChart = new Chart($("#listingCategoryChart"), {
            type: "doughnut",
            data: {
              labels: Object.keys(summary.listingCategories),
              datasets: [{ data: Object.values(summary.listingCategories), backgroundColor: ["#173d2c", "#d8a65c", "#789078"] }]
            },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: "bottom" } } }
          });
          window.userGrowthChart = new Chart($("#userGrowthChart"), {
            type: "bar",
            data: { labels: summary.monthLabels, datasets: [{ label: "New accounts", data: summary.userGrowth, backgroundColor: "#789078" }] },
            options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
          });
          window.bookingActivityChart = new Chart($("#bookingActivityChart"), {
            type: "line",
            data: { labels: summary.monthLabels, datasets: [{ label: "Bookings", data: summary.bookingActivity, borderColor: "#173d2c", backgroundColor: "#173d2c22", fill: true, tension: 0.3 }] },
            options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
          });
        }
      } catch (error) {
        dashboardStatus.hidden = false;
        setStatus(dashboardStatus, error.message, true);
      }
    }

    function renderPendingListings(listings) {
      const tbody = $("#pendingListingBody");
      tbody.replaceChildren();
      $("#pendingListingEmpty").hidden = listings.length > 0;
      listings.forEach(listing => {
        const row = document.createElement("tr");
        [listing.title, listing.type, listing.location, listing.ownerName, `₹${Number(listing.price || 0).toLocaleString("en-IN")}`]
          .forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value || "—";
            row.append(cell);
          });
        const actions = document.createElement("td");
        [["published", "Approve"], ["rejected", "Reject"]].forEach(([status, label]) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = status === "published" ? "admin-approve" : "admin-reject";
          button.textContent = label;
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              await adminRequest(`/api/admin/listings/${encodeURIComponent(listing.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status })
              });
              await loadAdminDashboard();
              toast(`Listing ${status}.`);
            } catch (error) {
              dashboardStatus.hidden = false;
              setStatus(dashboardStatus, error.message, true);
              button.disabled = false;
            }
          });
          actions.append(button);
        });
        row.append(actions);
        tbody.append(row);
      });
    }

    function renderAdminBookings(bookings) {
      const tbody = $("#adminBookingBody");
      tbody.replaceChildren();
      bookings.forEach(booking => {
        const row = document.createElement("tr");
        [
          booking.listingTitle,
          booking.touristName || booking.touristEmail,
          `${booking.checkIn} – ${booking.checkOut}`,
          `₹${Number(booking.totalAmount || 0).toLocaleString("en-IN")}`,
          formatBookingStatus(booking.status)
        ].forEach(value => {
          const cell = document.createElement("td");
          cell.textContent = value || "—";
          row.append(cell);
        });
        tbody.append(row);
      });
    }
  } catch (error) {
    dashboardStatus.hidden = false;
    dashboardStatus.hidden = false;
    setStatus(dashboardStatus, authErrorMessage(error), true);
  }
}
