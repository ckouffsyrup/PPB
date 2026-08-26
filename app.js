const STORAGE_KEY = "printbook_items_v2";
const SETTINGS_KEY = "printbook_settings_v2";

const DEFAULT_SETTINGS = {
  machineRate: 2,
  markup: 1.5,
  minimum: 8,
  roundTo: 1,
  supabaseUrl: "",
  supabaseKey: ""
};

const FIRST_ITEM = {
  id: crypto.randomUUID(),
  name: "Small multicolor articulated figure",
  category: "Figures",
  price: 10,
  hours: 2,
  cost: 0.8,
  grams: "",
  colors: "White + pink PLA",
  notes: "Multicolor, no painting. Suggested range: $8–$10. $10 is a good starting price; 2 for $18 could work well.",
  photo_url: "assets/first-print.jpeg",
  created_at: new Date().toISOString()
};

let settings = {...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")};
let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || [FIRST_ITEM];
let editingId = null;
let pendingPhotoFile = null;
let pendingPhotoData = "";
let supabaseClient = null;
let currentUser = null;

const $ = id => document.getElementById(id);
const money = value => "$" + Number(value || 0).toFixed(2).replace(".00","");
const safe = s => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

function toast(msg){
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"), 2200);
}

function persistLocal(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  render();
}

function saveSettingsLocal(){
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function suggestedPrice(hours, cost){
  const raw = ((Number(cost)||0) + (Number(hours)||0) * Number(settings.machineRate||0)) * Number(settings.markup||1);
  const floor = Math.max(raw, Number(settings.minimum)||0);
  const round = Number(settings.roundTo)||1;
  return Math.ceil(floor / round) * round;
}

function updatePreview(){
  const hours = $("hoursInput").value;
  const cost = $("costInput").value;
  const price = $("priceInput").value;
  const suggested = suggestedPrice(hours, cost);
  const chosen = price === "" ? suggested : Number(price);
  $("suggestedPrice").textContent = money(suggested);
  $("profitPreview").textContent = money(Math.max(0, chosen - Number(cost||0)));
}

function render(){
  const q = $("search").value.trim().toLowerCase();
  const cat = $("categoryFilter").value;
  const filtered = items.filter(x => {
    const hay = [x.name,x.category,x.colors,x.notes].join(" ").toLowerCase();
    return hay.includes(q) && (!cat || x.category === cat);
  });

  $("printGrid").innerHTML = filtered.map(item => `
    <article class="print-card" onclick="openEditor('${item.id}')">
      <div class="card-photo">
        ${item.photo_url ? `<img src="${safe(item.photo_url)}" alt="${safe(item.name)}">` : `<div class="photo-fallback">◌</div>`}
        <div class="price-chip">${money(item.price)}</div>
      </div>
      <div class="card-body">
        <h4>${safe(item.name)}</h4>
        <div class="card-sub">${safe(item.category || "Uncategorized")} · ${safe(item.colors || "No material notes")}</div>
        <div class="card-meta">
          <div><span>PRINT TIME</span><strong>${item.hours ? safe(item.hours)+" hr" : "—"}</strong></div>
          <div><span>MATERIAL</span><strong>${item.cost !== "" && item.cost != null ? money(item.cost) : "—"}</strong></div>
          <div><span>PROFIT</span><strong>${money((Number(item.price)||0)-(Number(item.cost)||0))}</strong></div>
        </div>
      </div>
    </article>
  `).join("");

  $("emptyState").classList.toggle("hidden", filtered.length > 0);

  const cats = [...new Set(items.map(x=>x.category).filter(Boolean))].sort();
  const current = $("categoryFilter").value;
  $("categoryFilter").innerHTML = `<option value="">All categories</option>` + cats.map(c=>`<option ${c===current?"selected":""}>${safe(c)}</option>`).join("");

  $("statCount").textContent = items.length;
  const avg = items.length ? items.reduce((a,b)=>a+Number(b.price||0),0)/items.length : 0;
  const profit = items.reduce((a,b)=>a+Math.max(0,Number(b.price||0)-Number(b.cost||0)),0);
  $("statAvg").textContent = money(avg);
  $("statProfit").textContent = money(profit);

  $("modeBadge").textContent = currentUser ? "Cloud synced" : "Local";
}

function resetEditor(){
  editingId = null;
  pendingPhotoFile = null;
  pendingPhotoData = "";
  ["nameInput","categoryInput","priceInput","hoursInput","costInput","gramsInput","colorsInput","notesInput"].forEach(id=>$(id).value="");
  $("photoPreview").classList.add("hidden");
  $("photoPlaceholder").classList.remove("hidden");
  $("deleteBtn").style.visibility="hidden";
  $("editorTitle").textContent="Add print";
  updatePreview();
}

window.openEditor = function(id=null){
  resetEditor();
  if(id){
    const item = items.find(x=>x.id===id);
    if(!item) return;
    editingId = id;
    $("editorTitle").textContent="Edit print";
    $("nameInput").value=item.name||"";
    $("categoryInput").value=item.category||"";
    $("priceInput").value=item.price??"";
    $("hoursInput").value=item.hours??"";
    $("costInput").value=item.cost??"";
    $("gramsInput").value=item.grams??"";
    $("colorsInput").value=item.colors||"";
    $("notesInput").value=item.notes||"";
    if(item.photo_url){
      $("photoPreview").src=item.photo_url;
      $("photoPreview").classList.remove("hidden");
      $("photoPlaceholder").classList.add("hidden");
    }
    $("deleteBtn").style.visibility="visible";
    updatePreview();
  }
  $("editorDialog").showModal();
}

async function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(r.result);
    r.onerror=reject;
    r.readAsDataURL(file);
  });
}

$("photoInput").addEventListener("change", async e=>{
  const file=e.target.files[0];
  if(!file) return;
  pendingPhotoFile=file;
  pendingPhotoData=await fileToDataUrl(file);
  $("photoPreview").src=pendingPhotoData;
  $("photoPreview").classList.remove("hidden");
  $("photoPlaceholder").classList.add("hidden");
});

async function savePrint(){
  const name=$("nameInput").value.trim();
  if(!name){toast("Give the print a name"); return;}

  const existing=editingId ? items.find(x=>x.id===editingId) : null;
  const item={
    id: editingId || crypto.randomUUID(),
    name,
    category:$("categoryInput").value.trim(),
    price:Number($("priceInput").value || suggestedPrice($("hoursInput").value,$("costInput").value)),
    hours:$("hoursInput").value===""?"":Number($("hoursInput").value),
    cost:$("costInput").value===""?"":Number($("costInput").value),
    grams:$("gramsInput").value===""?"":Number($("gramsInput").value),
    colors:$("colorsInput").value.trim(),
    notes:$("notesInput").value.trim(),
    photo_url: existing?.photo_url || "",
    created_at: existing?.created_at || new Date().toISOString()
  };

  if(currentUser && supabaseClient){
    try{
      if(pendingPhotoFile){
        const ext=(pendingPhotoFile.name.split(".").pop()||"jpg").toLowerCase();
        const path=`${currentUser.id}/${item.id}.${ext}`;
        const {error:uploadError}=await supabaseClient.storage.from("print-images").upload(path,pendingPhotoFile,{upsert:true});
        if(uploadError) throw uploadError;
        const {data}=supabaseClient.storage.from("print-images").getPublicUrl(path);
        item.photo_url=data.publicUrl;
      }
      const dbRow={...item,user_id:currentUser.id};
      const {error}=await supabaseClient.from("prints").upsert(dbRow);
      if(error) throw error;
    }catch(err){
      console.error(err);
      toast("Cloud save failed — saved locally");
      if(pendingPhotoData) item.photo_url=pendingPhotoData;
    }
  } else if(pendingPhotoData){
    item.photo_url=pendingPhotoData;
  }

  const i=items.findIndex(x=>x.id===item.id);
  if(i>=0) items[i]=item; else items.unshift(item);
  persistLocal();
  $("editorDialog").close();
  toast("Print saved");
}

async function deleteCurrent(){
  if(!editingId) return;
  if(!confirm("Delete this print?")) return;
  if(currentUser && supabaseClient){
    const {error}=await supabaseClient.from("prints").delete().eq("id",editingId).eq("user_id",currentUser.id);
    if(error){toast("Cloud delete failed"); return;}
  }
  items=items.filter(x=>x.id!==editingId);
  persistLocal();
  $("editorDialog").close();
  toast("Print deleted");
}

async function setupSupabase(){
  if(!settings.supabaseUrl || !settings.supabaseKey || !window.supabase){
    supabaseClient=null; currentUser=null; updateCloudUI(); return;
  }
  try{
    supabaseClient=window.supabase.createClient(settings.supabaseUrl,settings.supabaseKey);
    const {data}=await supabaseClient.auth.getUser();
    currentUser=data.user||null;
    updateCloudUI();
    if(currentUser) await pullCloud();
  }catch(e){
    console.error(e); supabaseClient=null; currentUser=null; updateCloudUI();
  }
}

function updateCloudUI(){
  const connected=!!currentUser;
  $("cloudStatus").textContent=connected?"Connected":"Not connected";
  $("authFields").classList.toggle("hidden",connected);
  $("signedInBox").classList.toggle("hidden",!connected);
  $("signedInEmail").textContent=currentUser?.email||"";
  $("modeBadge").textContent=connected?"Cloud synced":"Local";
}

async function pullCloud(){
  if(!currentUser||!supabaseClient) return;
  const {data,error}=await supabaseClient.from("prints").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:false});
  if(error){console.error(error);toast("Couldn't sync from cloud");return;}
  if(data?.length){
    items=data.map(({user_id,...rest})=>rest);
    persistLocal();
  }
}

async function pushLocal(){
  if(!currentUser||!supabaseClient) return;
  const rows=items.map(x=>({...x,user_id:currentUser.id,photo_url:x.photo_url?.startsWith("data:")?"":x.photo_url}));
  const {error}=await supabaseClient.from("prints").upsert(rows);
  if(error){console.error(error);toast("Upload failed");return;}
  toast("Local prints uploaded");
  await pullCloud();
}

async function signUp(){
  saveConnectionFields();
  await setupSupabase();
  if(!supabaseClient){toast("Add your Supabase URL and key first");return;}
  const email=$("emailInput").value.trim(),password=$("passwordInput").value;
  const {error}=await supabaseClient.auth.signUp({email,password});
  if(error){toast(error.message);return;}
  toast("Account created — check email if confirmation is enabled");
}

async function signIn(){
  saveConnectionFields();
  await setupSupabase();
  if(!supabaseClient){toast("Add your Supabase URL and key first");return;}
  const email=$("emailInput").value.trim(),password=$("passwordInput").value;
  const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error){toast(error.message);return;}
  currentUser=data.user;
  updateCloudUI();
  await pullCloud();
  toast("Signed in");
}

async function signOut(){
  if(supabaseClient) await supabaseClient.auth.signOut();
  currentUser=null; updateCloudUI(); toast("Signed out");
}

function saveConnectionFields(){
  settings.supabaseUrl=$("supabaseUrlInput").value.trim();
  settings.supabaseKey=$("supabaseKeyInput").value.trim();
  saveSettingsLocal();
}

function openSettings(){
  $("rateInput").value=settings.machineRate;
  $("markupInput").value=settings.markup;
  $("minimumInput").value=settings.minimum;
  $("roundInput").value=String(settings.roundTo);
  $("supabaseUrlInput").value=settings.supabaseUrl||"";
  $("supabaseKeyInput").value=settings.supabaseKey||"";
  updateCloudUI();
  $("settingsDialog").showModal();
}

$("saveSettingsBtn").onclick=async()=>{
  settings.machineRate=Number($("rateInput").value||0);
  settings.markup=Number($("markupInput").value||1);
  settings.minimum=Number($("minimumInput").value||0);
  settings.roundTo=Number($("roundInput").value||1);
  saveConnectionFields();
  saveSettingsLocal();
  await setupSupabase();
  $("settingsDialog").close();
  toast("Settings saved");
};

$("exportBtn").onclick=()=>{
  const payload={version:2,exported_at:new Date().toISOString(),settings:{...settings,supabaseKey:""},items};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="printbook-backup.json";a.click();URL.revokeObjectURL(a.href);
};

$("importInput").onchange=async e=>{
  const file=e.target.files[0]; if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    if(!Array.isArray(data.items)) throw new Error();
    items=data.items;
    if(data.settings) settings={...settings,...data.settings,supabaseKey:settings.supabaseKey};
    persistLocal(); saveSettingsLocal(); toast("Backup imported");
  }catch{toast("That backup file isn't valid");}
};

["hoursInput","costInput","priceInput"].forEach(id=>$(id).addEventListener("input",updatePreview));
$("addBtn").onclick=()=>openEditor();
$("mobileAddBtn").onclick=()=>openEditor();
$("savePrintBtn").onclick=savePrint;
$("deleteBtn").onclick=deleteCurrent;
$("closeEditor").onclick=()=>$("editorDialog").close();
$("search").oninput=render;
$("categoryFilter").onchange=render;
$("settingsBtn").onclick=openSettings;
document.querySelector('[data-action="settings"]').onclick=openSettings;
$("closeSettings").onclick=()=>$("settingsDialog").close();
$("signUpBtn").onclick=signUp;
$("signInBtn").onclick=signIn;
$("signOutBtn").onclick=signOut;
$("pushLocalBtn").onclick=pushLocal;
$("syncBtn").onclick=async()=>{await pullCloud();toast(currentUser?"Synced":"Cloud sync isn't connected");};

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
}

render();
setupSupabase();
