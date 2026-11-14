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

window.addEventListener("load", () => {
  window.setTimeout(() => $("#preloader")?.classList.add("done"), 350);
});

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
  const place = $("#searchLocation").value.trim();
  const category = $("#searchCategory").value;
  const date = $("#searchDate").value;
  const params = new URLSearchParams();
  if (place) params.set("location", place);
  if (category) params.set("category", category);
  if (date) params.set("date", date);
  toast("Search interface is ready. Live destination filtering will be connected in Part 3.");
  history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
});

$("#newsletterForm")?.addEventListener("submit", event => {
  event.preventDefault();
  toast("Thanks for your interest! Newsletter subscriptions will be connected to the backend in a later part.");
  event.target.reset();
});

$$("[data-demo-action]").forEach(button => {
  button.addEventListener("click", event => {
    event.preventDefault();
    toast(button.dataset.demoAction);
  });
});

// Firebase web config is injected by Flask. The actual SDK/Auth integration is Part 2.
const firebaseConfig = window.FIREBASE_WEB_CONFIG || {};
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.info("Firebase web configuration is not set yet. Follow the Firebase setup steps in the project guide.");
}
