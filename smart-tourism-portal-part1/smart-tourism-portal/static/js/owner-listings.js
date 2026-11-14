import {auth,onAuthStateChanged,apiRequest} from "./firebase-client.js";
import {getStorage,ref,uploadBytesResumable,getDownloadURL,deleteObject} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";
import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
const $=s=>document.querySelector(s), msg=$("#ownerListingMessage");
const say=(t,bad=false)=>{msg.textContent=t;msg.classList.toggle("error",bad)};
const cfg=window.FIREBASE_WEB_CONFIG||{}, app=getApps()[0]||initializeApp(cfg), storage=getStorage(app);
let currentUser=null, currentItems=[];
const MAX_FILE=5*1024*1024, ALLOWED=["image/jpeg","image/png","image/webp"];
async function uploadSelected(files) {
 if(files.length>8) throw new Error("Choose no more than 8 photos.");
 const urls=[];
 for(const file of files) {
  if(!ALLOWED.includes(file.type)||file.size>MAX_FILE) throw new Error(`${file.name}: choose JPG, PNG or WebP under 5 MB.`);
  const path=`businesses/${currentUser.uid}/${Date.now()}-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
  const task=uploadBytesResumable(ref(storage,path),file,{contentType:file.type});
  const url=await new Promise((resolve,reject)=>{task.on("state_changed",s=>{$("#uploadProgress").textContent=`Uploading ${file.name}: ${Math.round(s.bytesTransferred/s.totalBytes*100)}%`;},reject,async()=>{try{resolve(await getDownloadURL(task.snapshot.ref));}catch(e){reject(e);}});});
  urls.push(url);
 }
 $("#uploadProgress").textContent=urls.length?`${urls.length} photo(s) uploaded.`:"";
 return urls;
}
function resetForm(){ $("#businessForm").reset(); $("#businessId").value=""; $("#ownerFormHeading").textContent="Add a new listing"; $("#saveBusinessButton").textContent="Save listing ↗"; $("#cancelEditButton").hidden=true; }
function render(items){
 currentItems=items;
 $("#ownerBusinessGrid").innerHTML=items.map(x=>`<article class="listing-card owner-card"><div class="listing-card-body"><div class="card-kicker">${x.businessType} · ${x.city}</div><h3>${x.businessName}</h3><p>${x.description}</p><span class="${x.verified?'verified-badge':'review-badge'}">${x.verified?'Verified':'Awaiting verification'}</span><div class="owner-card-actions"><button type="button" data-edit="${x.businessId}">Edit</button><button type="button" data-delete="${x.businessId}">Delete</button></div></div></article>`).join("")||"<p>You haven't added a listing yet.</p>";
}
async function refresh(){const r=await apiRequest("/api/businesses/mine",currentUser);render(r.businesses||[]);}
onAuthStateChanged(auth,async user=>{if(!user)return location.replace("/login");currentUser=user;try{const me=await apiRequest("/api/auth/me",user);if(me.profile.role!=="owner"){say("This workspace is only available to business owner accounts.",true);return;}await refresh();}catch(e){say(e.message,true);}});
$("#businessForm").addEventListener("submit",async e=>{
 e.preventDefault();const button=$("#saveBusinessButton");button.disabled=true;
 try{
  const chosen=[...$("#businessImages").files], newUrls=chosen.length?await uploadSelected(chosen):[];
  const id=$("#businessId").value, old=currentItems.find(x=>x.businessId===id);
  const payload={businessName:$("#businessName").value.trim(),businessType:$("#businessTypeInput").value,city:$("#businessCity").value.trim(),state:"Karnataka",price:$("#businessPrice").value,description:$("#businessDescription").value.trim(),imageUrls:[...(old?.imageUrls||[]),...newUrls]};
  const token=await currentUser.getIdToken(), response=await fetch(id?`/api/businesses/${encodeURIComponent(id)}`:"/api/businesses",{method:id?"PUT":"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(payload)}),data=await response.json();
  if(!response.ok)throw new Error(data.error||"Could not save listing.");
  say(data.message);resetForm();await refresh();
 }catch(err){say(err.message||"Upload failed.",true);}finally{button.disabled=false;}
});
$("#ownerBusinessGrid").addEventListener("click",async e=>{
 const edit=e.target.closest("[data-edit]"), del=e.target.closest("[data-delete]");
 if(edit){const x=currentItems.find(v=>v.businessId===edit.dataset.edit);if(!x)return;$("#businessId").value=x.businessId;$("#businessName").value=x.businessName;$("#businessTypeInput").value=x.businessType;$("#businessCity").value=x.city;$("#businessPrice").value=x.price;$("#businessDescription").value=x.description;$("#ownerFormHeading").textContent="Edit your listing";$("#saveBusinessButton").textContent="Update listing ↗";$("#cancelEditButton").hidden=false;window.scrollTo({top:0,behavior:"smooth"});}
 if(del&&confirm("Delete this listing? This cannot be undone.")){try{const token=await currentUser.getIdToken();const response=await fetch(`/api/businesses/${encodeURIComponent(del.dataset.delete)}`,{method:"DELETE",headers:{Authorization:`Bearer ${token}`}});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not delete listing.");say(data.message||"Listing deleted.");await refresh();}catch(err){say(err.message,true);}}
});
$("#cancelEditButton").addEventListener("click",resetForm);
