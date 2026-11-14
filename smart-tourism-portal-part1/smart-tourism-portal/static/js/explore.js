const $ = s => document.querySelector(s);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let destinations=[], businesses=[];
function cardImage(url, alt) { return `<img src="${escapeHtml(url || '')}" alt="${escapeHtml(alt)}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('image-fallback')">`; }
function renderDestinations() {
 const q=$("#destinationSearch").value.toLowerCase(), cat=$("#destinationCategory").value.toLowerCase();
 const rows=destinations.filter(x=>(`${x.name} ${x.city} ${x.description}`.toLowerCase().includes(q)) && (!cat || String(x.category).toLowerCase()===cat));
 $("#destinationGrid").innerHTML=rows.map(x=>`<a class="listing-card" href="/destinations/${encodeURIComponent(x.destinationId)}">${cardImage(x.imageUrls?.[0],x.name)}<div class="listing-card-body"><div class="card-kicker">${escapeHtml(x.category)} · ${escapeHtml(x.city)}</div><h3>${escapeHtml(x.name)}</h3><p>${escapeHtml(x.description)}</p>${x.isSample?'<span class="sample-badge">Sample destination</span>':''}<span class="card-more">Discover place ↗</span></div></a>`).join("");
 $("#destinationStatus").textContent=rows.length?`${rows.length} destinations found.`:"No destinations match those filters.";
}
function renderBusinesses() {
 const q=$("#businessSearch").value.toLowerCase(), type=$("#businessType").value;
 const rows=businesses.filter(x=>(`${x.businessName} ${x.city} ${x.description}`.toLowerCase().includes(q))&&(!type||x.businessType===type));
 $("#businessGrid").innerHTML=rows.map(x=>`<a class="listing-card" href="/businesses/${encodeURIComponent(x.businessId)}">${cardImage(x.imageUrls?.[0],x.businessName)}<div class="listing-card-body"><div class="card-kicker">${escapeHtml(x.businessType)} · ${escapeHtml(x.city)}</div><h3>${escapeHtml(x.businessName)}</h3><p>${escapeHtml(x.description)}</p><div class="card-bottom"><strong>₹${Number(x.price||0).toLocaleString("en-IN")}</strong>${x.isSample?'<span class="sample-badge">Sample listing</span>':x.verified?'<span class="verified-badge">Verified</span>':'<span class="review-badge">Awaiting review</span>'}</div><span class="card-more">View details ↗</span></div></a>`).join("");
 $("#businessStatus").textContent=rows.length?`${rows.length} local listings found.`:"No published business listings yet. Owners can add their own after signing in.";
}
const initialParams = new URLSearchParams(location.search);
$("#destinationSearch").value = initialParams.get("location") || "";
$("#destinationCategory").value = initialParams.get("category") || "";
async function load() {
 try { const [d,b]=await Promise.all([fetch("/api/destinations"),fetch("/api/businesses")]); if(!d.ok) throw new Error("Could not load destinations."); const dj=await d.json(), bj=await b.json(); destinations=dj.destinations||[]; businesses=bj.businesses||[]; renderDestinations(); renderBusinesses(); }
 catch(e){ $("#destinationStatus").textContent=e.message; $("#businessStatus").textContent="Business listings are temporarily unavailable."; }
}
["#destinationSearch","#destinationCategory"].forEach(s=>$(s).addEventListener("input",renderDestinations));
["#businessSearch","#businessType"].forEach(s=>$(s).addEventListener("input",renderBusinesses));
load();
