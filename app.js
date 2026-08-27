const K={
  items:"printbook_items_v4",settings:"printbook_settings_v4",filaments:"printbook_filaments_v4",
  sales:"printbook_sales_v4",orders:"printbook_orders_v4",presets:"printbook_presets_v4",
  colorways:"printbook_colorways_v4", notified:"printbook_notified_v4"
};
const uid=()=>crypto.randomUUID();
const TODAY=()=>new Date().toISOString().slice(0,10);
const nowISO=()=>new Date().toISOString();
const money=v=>"$"+Number(v||0).toFixed(2).replace(".00","");
const safe=s=>String(s??"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const $=id=>document.getElementById(id);

const defaultPresets=[
  {id:"normal",name:"Normal",machineRate:2,markup:1.5,minimum:8,roundTo:1},
  {id:"friend",name:"Friend",machineRate:1.5,markup:1.25,minimum:6,roundTo:1},
  {id:"event",name:"Event / Market",machineRate:2.5,markup:1.7,minimum:10,roundTo:1},
  {id:"bulk",name:"Bulk",machineRate:1.5,markup:1.25,minimum:7,roundTo:.5}
];
const defaultSettings={
  supabaseUrl:"",supabaseKey:"",defaultPresetId:"normal",
  browserNotifications:false,pushEnabled:false,lowFilamentPct:15,
  customerModePin:""
};

function migrateArray(newKey,oldKeys,fallback=[]){
  const current=localStorage.getItem(newKey);
  if(current) return JSON.parse(current);
  for(const k of oldKeys){
    const raw=localStorage.getItem(k);
    if(raw){
      const data=JSON.parse(raw);
      localStorage.setItem(newKey,JSON.stringify(data));
      return data;
    }
  }
  return fallback;
}
function migrateObject(newKey,oldKeys,fallback={}){
  const current=localStorage.getItem(newKey);
  if(current) return {...fallback,...JSON.parse(current)};
  for(const k of oldKeys){
    const raw=localStorage.getItem(k);
    if(raw){
      const data={...fallback,...JSON.parse(raw)};
      localStorage.setItem(newKey,JSON.stringify(data));
      return data;
    }
  }
  return {...fallback};
}

let settings=migrateObject(K.settings,["printbook_settings_v3","printbook_settings_v2"],defaultSettings);
let presets=migrateArray(K.presets,["printbook_presets_v3"],defaultPresets);
let filaments=migrateArray(K.filaments,["printbook_filaments_v3"],[]);
let sales=migrateArray(K.sales,["printbook_sales_v3"],[]);
let orders=migrateArray(K.orders,["printbook_orders_v3"],[]);
let colorways=migrateArray(K.colorways,[],[]);
const firstItem={
  id:uid(),name:"Small multicolor articulated figure",category:"Figures",price:10,hours:2,extra_cost:0,
  notes:"Multicolor, no painting. Suggested range: $8–$10. $10 is a good starting price; 2 for $18 could work well.",
  photo_url:"assets/first-print.jpeg",favorite:true,model_source:"",made_qty:1,sold_qty:0,preset_id:"normal",
  filament_usage:[],variants:[],deal_qty:2,deal_price:18,out_of_stock_behavior:"show",
  created_at:nowISO(),updated_at:nowISO()
};
let items=migrateArray(K.items,["printbook_items_v3","printbook_items_v2"],[firstItem]);

// Normalize legacy data without destroying it.
items=items.map(i=>({
  variants:[],deal_qty:0,deal_price:0,out_of_stock_behavior:"show",filament_usage:[],
  made_qty:0,sold_qty:0,updated_at:i.updated_at||i.created_at||nowISO(),...i
}));
filaments=filaments.map(f=>({visual_color:"#ffffff",updated_at:f.updated_at||f.created_at||nowISO(),...f}));
sales=sales.map(s=>({variant_id:"",discount_type:"none",discount_value:0,discount_amount:0,total:Number(s.unit_price||0)*Number(s.quantity||0),updated_at:s.updated_at||s.created_at||nowISO(),...s}));
orders=orders.map(o=>({updated_at:o.updated_at||o.created_at||nowISO(),...o}));

let editingId=null,editingFilamentId=null,editingOrderId=null,editingPresetId=null,editingColorwayId=null;
let pendingPhotoFile=null,pendingPhotoData="",editorFavorite=false,currentView="shop",orderStatusFilter="";
let savePrintInFlight=false;
let supabaseClient=null,currentUser=null,realtimeChannel=null,realtimeTimer=null;
let syncState="local",lastSyncAt=null,syncMessage="Local only",customerMode=false,currentMakePrintId=null;
let customerStoreTab="products",customerTitleTapCount=0,customerTitleTapTimer=null;
let currentRequestPrintId=null;
const PUBLIC_STOREFRONT_URL="https://dljauobtomijmtaxvkvv.supabase.co/functions/v1/public-storefront";
let publicVisitorMode=false;
let publicStoreLoaded=false;
let publicStoreLoading=false;
let publicStoreLastDiagnostic="";
let brandOwnerTapCount=0,brandOwnerTapTimer=null;
let publicRequestRefreshTimer=null;
let waitingServiceWorker=null;
let appUpdateReady=false;
let updateReloadArmed=false;
const pendingLocalProductIds=new Set();

function persist(){
  if(publicVisitorMode){renderAll();return}
  localStorage.setItem(K.items,JSON.stringify(items));
  localStorage.setItem(K.filaments,JSON.stringify(filaments));
  localStorage.setItem(K.sales,JSON.stringify(sales));
  localStorage.setItem(K.orders,JSON.stringify(orders));
  localStorage.setItem(K.presets,JSON.stringify(presets));
  localStorage.setItem(K.colorways,JSON.stringify(colorways));
  localStorage.setItem(K.settings,JSON.stringify(settings));
  renderAll();
}
function toast(msg){const e=$("toast");e.textContent=msg;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2300)}
function getPreset(id){return presets.find(p=>p.id===id)||presets[0]||defaultPresets[0]}
function roundUp(v,step){step=Number(step)||1;return Math.ceil(v/step)*step}
function getFilament(id){return filaments.find(f=>f.id===id)}
function filamentCost(id,grams){const f=getFilament(id);if(!f)return 0;return (Number(f.purchase_price)||0)/(Number(f.spool_size)||1000)*(Number(grams)||0)}
function usageCost(usage=[]){return usage.reduce((a,u)=>a+filamentCost(u.filament_id,u.grams),0)}
function getColorway(id){return colorways.find(c=>c.id===id)}
function variantUsage(v){const c=getColorway(v?.colorway_id);return c?.usage?.length?c.usage:(v?.filament_usage||[])}
function itemMaterialCost(item,variantId=""){
  if(variantId){
    const v=(item.variants||[]).find(x=>x.id===variantId);
    if(v) return usageCost(variantUsage(v))+(Number(item.extra_cost)||0);
  }
  return usageCost(item.filament_usage||[])+(Number(item.extra_cost)||0)
}
function variantPrice(item,variantId=""){const v=(item.variants||[]).find(x=>x.id===variantId);return v&&v.price!==""&&v.price!=null?Number(v.price):Number(item.price||0)}
function itemStock(i){return (i.variants||[]).length?i.variants.reduce((a,v)=>a+Number(v.stock||0),0):Math.max(0,(Number(i.made_qty)||0)-(Number(i.sold_qty)||0))}
function variantStock(i,variantId=""){if(!variantId)return itemStock(i);const v=(i.variants||[]).find(x=>x.id===variantId);return Number(v?.stock||0)}
function suggestedPrice(hours,material,presetId,complexity=1){const p=getPreset(presetId);const raw=(Number(material||0)+Number(hours||0)*Number(p.machineRate||0))*Number(p.markup||1)*Number(complexity||1);return roundUp(Math.max(raw,Number(p.minimum)||0),Number(p.roundTo)||1)}
function saleProfit(s){const item=items.find(i=>i.id===s.print_id);const cost=Number(s.unit_cost ?? (item?itemMaterialCost(item,s.variant_id):0));return Number(s.total ?? Number(s.unit_price||0)*Number(s.quantity||0))-cost*Number(s.quantity||0)}
function dateDiffDays(dateStr){if(!dateStr)return null;const [y,m,d]=dateStr.split("-").map(Number);const target=Date.UTC(y,m-1,d);const t=new Date();const today=Date.UTC(t.getFullYear(),t.getMonth(),t.getDate());return Math.round((target-today)/86400000)}

function setSyncState(state,msg,last=null){
  syncState=state;syncMessage=msg||state;if(last)lastSyncAt=last;
  const pill=$("syncStatusPill"),dot=$("drawerSyncDot");
  if(pill){pill.className="sync-pill "+state;pill.textContent=state==="synced"?"Synced":state==="syncing"?"Syncing…":state==="offline"?"Offline":state==="error"?"Sync issue":currentUser?"Connected":"Local"}
  if(dot){dot.className="status-dot "+state}
  if($("drawerSyncStatus"))$("drawerSyncStatus").textContent=msg||syncMessage;
  const lastText=lastSyncAt?`Last sync ${new Date(lastSyncAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`:"Not synced yet";
  if($("drawerLastSync"))$("drawerLastSync").textContent=lastText;
  if($("settingsSyncState"))$("settingsSyncState").textContent=msg||syncMessage;
  if($("settingsLastSync"))$("settingsLastSync").textContent=lastText;
  if($("cloudStatus"))$("cloudStatus").textContent=currentUser?"Connected":"Not connected";
  if($("modeBadge"))$("modeBadge").textContent=currentUser?(state==="synced"?"Cloud synced":msg||"Connected"):"Local";
}

function clearLegacyMenuLock(){
  // v4.1 used position:fixed on <body> to lock the background.
  // iOS can retain that state after the drawer closes, which effectively
  // shifts the whole app upward and can make the header impossible to reach.
  document.body.classList.remove("menu-open");
  document.documentElement.classList.remove("menu-open");
  document.body.style.position="";
  document.body.style.top="";
  document.body.style.left="";
  document.body.style.right="";
  document.body.style.width="";
  document.body.style.overflow="";
  document.documentElement.style.overflow="";
}

function openMenu(){
  if(publicVisitorMode||customerMode)return;
  if($("sideDrawer").classList.contains("open"))return;
  clearLegacyMenuLock();

  // Lock scrolling without moving the document. No position:fixed / top hacks.
  document.documentElement.classList.add("menu-open");
  document.body.classList.add("menu-open");

  $("sideDrawer").classList.add("open");
  $("drawerBackdrop").classList.add("open");
  $("sideDrawer").setAttribute("aria-hidden","false");
  $("sideDrawer").scrollTop=0;
}

function closeMenu(){
  $("sideDrawer").classList.remove("open");
  $("drawerBackdrop").classList.remove("open");
  $("sideDrawer").setAttribute("aria-hidden","true");

  document.documentElement.classList.remove("menu-open");
  document.body.classList.remove("menu-open");
  document.documentElement.style.overflow="";
  document.body.style.overflow="";
  // Do NOT call scrollTo here. The page never moved, so its natural
  // iOS scroll position stays exactly where the user left it.
}
function showView(name){
  currentView=name;
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.dataset.view===name));
  document.querySelectorAll("[data-nav]").forEach(b=>b.classList.toggle("active",b.dataset.nav===name));
  closeMenu();window.scrollTo({top:0,behavior:"smooth"});renderAll()
}

function renderAll(){
  renderShop();renderDashboard();renderPrints();renderFilaments();renderColorways();renderOrders();renderPresets();
  populatePrintSelects();populatePresetSelects();renderNotificationsBadge();updateCloudUI();
}
function miniRow(title,sub,right){return `<div class="mini-row"><div class="left"><strong>${safe(title)}</strong><small>${safe(sub)}</small></div><div class="mini-price">${safe(right)}</div></div>`}
function emptyMini(t){return `<div class="mini-row"><div class="left"><small>${safe(t)}</small></div></div>`}

function renderCustomerFilaments(){
  const grid=$("customerFilamentGrid");
  if(!grid)return;
  const available=filaments.filter(f=>Number(f.remaining||0)>0).sort((a,b)=>String(a.color||a.material||"").localeCompare(String(b.color||b.material||"")));
  grid.innerHTML=available.map(f=>{
    const remaining=Number(f.remaining||0),size=Number(f.spool_size||1000),pct=size?remaining/size*100:0,low=f.low_stock===true||remaining<=100||pct<=15;
    return `<article class="customer-filament-card"><div class="customer-filament-color" style="background:${safe(f.visual_color||'#777777')}"></div><h3>${safe(f.color||"Unnamed color")}</h3><p>${safe([f.brand,f.material].filter(Boolean).join(" · ")||"Filament")}</p><span class="customer-filament-availability ${low?"low":""}">${low?"LOW STOCK":"AVAILABLE"}</span></article>`
  }).join("");
  if(!available.length)grid.innerHTML=`<div class="empty-state"><h3>No filament available</h3><p>There are no in-stock filament colors to show right now.</p></div>`;
}
function setCustomerStoreTab(tab){
  customerStoreTab=tab==="filaments"?"filaments":"products";
  document.querySelectorAll("[data-customer-tab]").forEach(b=>b.classList.toggle("active",b.dataset.customerTab===customerStoreTab));
  $("shopGrid").classList.toggle("hidden",customerMode&&customerStoreTab==="filaments");
  $("shopEmpty").classList.toggle("customer-tab-hidden",customerMode&&customerStoreTab==="filaments");
  $("customerFilamentGrid").classList.toggle("hidden",!customerMode||customerStoreTab!=="filaments");
  renderCustomerFilaments();
}

function setPublicStoreState(message="",isError=false,showActions=false){
  const el=$("publicStoreState"),text=$("publicStoreStateText"),actions=$("publicStoreActions");
  if(!el||!text)return;
  text.textContent=message;
  el.classList.toggle("hidden",!message);
  el.classList.toggle("error",!!isError);
  if(actions)actions.classList.toggle("hidden",!showActions);
}
function clearPublicCatalogForFailure(){
  // Never expose stale/local admin catalog to a public visitor when the live
  // storefront cannot be reached.
  items=[];
  filaments=[];
  publicStoreLoaded=false;
  $("shopGrid").innerHTML=`<div class="public-store-unavailable"><h3>Store temporarily unavailable</h3><p>Live inventory could not be loaded. No stale products are being shown.</p></div>`;
  $("customerFilamentGrid").innerHTML="";
  $("shopEmpty").classList.add("hidden");
  $("shopProductCount").textContent="0";
  $("shopStockCount").textContent="0";
  $("shopFavCount").textContent="0";
}

async function getPublicSupabaseConfig(){
  const res=await fetch(`${PUBLIC_STOREFRONT_URL}?config=1&t=${Date.now()}`,{
    headers:{"Accept":"application/json"},cache:"no-store"
  });
  let data={};try{data=await res.json()}catch{}
  if(!res.ok)throw new Error(data.error||`Couldn't load login config (${res.status})`);
  if(!data.supabase_url||!data.anon_key)throw new Error("Admin login config is unavailable.");
  return data;
}
function openOwnerLogin(){
  $("ownerLoginEmail").value="";
  $("ownerLoginPassword").value="";
  $("ownerLoginStatus").textContent="Use your normal PrintBook admin account.";
  $("ownerLoginDialog").showModal();
  setTimeout(()=>$("ownerLoginEmail").focus(),100);
}
async function ownerLogin(){
  const email=$("ownerLoginEmail").value.trim();
  const password=$("ownerLoginPassword").value;
  if(!email||!password)return toast("Enter your email and password");

  const btn=$("ownerLoginBtn"),old=btn.textContent;
  btn.disabled=true;btn.textContent="Signing in…";
  $("ownerLoginStatus").textContent="Connecting to PrintBook…";

  try{
    const cfg=await getPublicSupabaseConfig();

    // The anon/publishable key is intended for browser clients.
    settings.supabaseUrl=cfg.supabase_url;
    settings.supabaseKey=cfg.anon_key;
    localStorage.setItem(K.settings,JSON.stringify(settings));

    supabaseClient=window.supabase.createClient(settings.supabaseUrl,settings.supabaseKey,{
      auth:{persistSession:true,autoRefreshToken:true}
    });

    const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
    if(error)throw error;
    if(!data?.user)throw new Error("Sign-in did not return a user.");

    currentUser=data.user;
    deactivatePublicVisitorMode();
    customerMode=false;
    $("ownerLoginDialog").close();

    // Re-run our normal setup so realtime/sync/auth listeners are attached.
    await setupSupabase();
    currentView="shop";
    renderAll();
    toast("Admin signed in");
  }catch(err){
    console.error("Owner login failed",err);
    $("ownerLoginStatus").textContent=err?.message||"Sign-in failed.";
    toast(err?.message||"Couldn't sign in");
  }finally{
    btn.disabled=false;btn.textContent=old
  }
}

function normalizePublicPrint(p){
  return {id:p.id,name:p.name||"Print",category:p.category||"",price:Number(p.price||0),hours:p.hours??"",notes:p.notes||"",photo_url:p.photo_url||"",favorite:!!p.favorite,variants:Array.isArray(p.variants)?p.variants:[],deal_qty:Number(p.deal_qty||0),deal_price:Number(p.deal_price||0),out_of_stock_behavior:p.out_of_stock_behavior||"show",made_qty:Number(p.made_qty||0),sold_qty:Number(p.sold_qty||0),multicolor_capable:!!p.multicolor_capable,filament_usage:[],extra_cost:0,model_source:"",created_at:p.created_at||"",updated_at:p.updated_at||""}
}
function normalizePublicFilament(f){
  return {id:f.id,brand:f.brand||"",material:f.material||"",color:f.color||"",visual_color:f.visual_color||"#777777",remaining:f.available?1:0,spool_size:1,low_stock:!!f.low_stock,public_only:true}
}
async function loadPublicStorefront(showError=true){
  if(publicStoreLoading)return false;
  publicStoreLoading=true;
  setPublicStoreState("Loading the latest shop inventory…",false,false);

  const url=`${PUBLIC_STOREFRONT_URL}?t=${Date.now()}`;
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    let res;
    try{
      res=await fetch(url,{
        method:"GET",
        headers:{"Accept":"application/json"},
        cache:"no-store",
        signal:controller.signal
      });
    }finally{
      clearTimeout(timer);
    }

    const raw=await res.text();
    let data={};
    try{data=raw?JSON.parse(raw):{}}catch{}

    publicStoreLastDiagnostic=[
      `URL: ${url}`,
      `HTTP: ${res.status} ${res.statusText}`,
      `Response: ${raw.slice(0,500)||"(empty)"}`
    ].join("\n");

    if(!res.ok)throw new Error(data.error||`HTTP ${res.status} ${res.statusText}`);

    items=(data.products||[]).map(normalizePublicPrint);
    filaments=(data.filaments||[]).map(normalizePublicFilament);
    publicStoreLoaded=true;
    setPublicStoreState("",false,false);
    renderAll();
    return true
  }catch(err){
    const kind=err?.name==="AbortError"?"Request timed out":(err?.message||String(err));
    if(!publicStoreLastDiagnostic){
      publicStoreLastDiagnostic=[
        `URL: ${url}`,
        `Browser error: ${kind}`,
        `Online: ${navigator.onLine}`,
        `Origin: ${location.origin}`,
        `User agent: ${navigator.userAgent}`
      ].join("\n");
    }else{
      publicStoreLastDiagnostic += `\nBrowser error: ${kind}`;
    }

    console.error("Public storefront load failed",err,publicStoreLastDiagnostic);
    clearPublicCatalogForFailure();
    if(showError)setPublicStoreState(`Couldn't load the live storefront: ${kind}`,true,true);
    return false
  }finally{
    publicStoreLoading=false
  }
}

async function activatePublicVisitorMode(){
  publicVisitorMode=true;customerMode=true;customerStoreTab="products";currentView="shop";
  document.body.classList.add("public-visitor");
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.dataset.view==="shop"));
  $("customerModeBarTitle").textContent="Live Customer Store";
  $("customerModeBarText").textContent="Products and filament availability are synced from PrintBook.";
  $("customerModeBadge").textContent="LIVE";
  renderAll();await loadPublicStorefront(true)
}
function deactivatePublicVisitorMode(){
  publicVisitorMode=false;document.body.classList.remove("public-visitor");
  $("customerModeBarTitle").textContent="Customer Store Mode";
  $("customerModeBarText").textContent="Browse products and available filament colors.";
  $("customerModeBadge").textContent="LOCKED"
}
async function submitPublicPrintRequest(payload){
  const res=await fetch(PUBLIC_STOREFRONT_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"request_print",...payload})});
  let data={};try{data=await res.json()}catch{}
  if(!res.ok)throw new Error(data.error||`Request failed (${res.status})`);
  return data
}

function renderShop(){
  if(publicVisitorMode&&!publicStoreLoaded){
    document.body.classList.toggle("customer-mode",true);
    document.body.classList.toggle("public-visitor",true);
    $("customerModeBar").classList.remove("hidden");
    $("customerStoreTabs").classList.remove("hidden");
    $("customerModeBarTitle").textContent="Live Customer Store";
    $("customerModeBarText").textContent="Products and filament availability are synced from PrintBook.";
    $("customerModeBadge").textContent="LIVE";
    if(!$("shopGrid").querySelector(".public-store-unavailable")){
      $("shopGrid").innerHTML=`<div class="public-store-unavailable"><h3>Loading live store…</h3><p>Please wait while PrintBook loads current inventory.</p></div>`;
    }
    return;
  }

  const q=$("shopSearch")?.value.trim().toLowerCase()||"",cat=$("shopCategoryFilter")?.value||"";
  let list=items.filter(i=>{
    const stock=itemStock(i);
    if(stock<=0&&i.out_of_stock_behavior==="hide")return false;
    const hay=[i.name,i.category,i.notes,i.model_source].join(" ").toLowerCase();
    return hay.includes(q)&&(!cat||i.category===cat);
  });
  $("shopGrid").innerHTML=list.map(i=>{
    const stock=itemStock(i),mat=itemMaterialCost(i),isOut=stock<=0;
    const deal=Number(i.deal_qty)>1&&Number(i.deal_price)>0?`<div class="shop-deal">${i.deal_qty} for ${money(i.deal_price)}</div>`:"";
    return `<article class="shop-card" data-product-id="${i.id}">
      <div class="shop-card-photo">
        ${i.photo_url?`<img src="${safe(i.photo_url)}" alt="${safe(i.name)}">`:`<div class="photo-fallback">◌</div>`}
        ${i.favorite&&!customerMode?`<div class="fav-chip">★</div>`:""}
        ${isOut?`<div class="out-badge">OUT OF STOCK</div>`:""}
        <div class="price-chip">${money(i.price)}</div>
      </div>
      <div class="shop-card-body">
        <h3>${safe(i.name)}</h3>
        <p>${safe(i.category||"Uncategorized")}${!customerMode&&i.hours?` · ${safe(i.hours)} hr print`:""}</p>
        ${deal}
        <div class="shop-card-footer">
          <div><div class="shop-price">${money(i.price)}</div>${customerMode?"":`<small>${money(Math.max(0,Number(i.price||0)-mat))} est. profit</small>`}</div>
          <div class="shop-stock"><strong>${stock}</strong><br>${isOut?"out of stock":"in stock"}</div>
        </div>
      </div>
    </article>`
  }).join("");
  document.querySelectorAll(".shop-card").forEach(card=>card.onclick=()=>customerMode?openCustomerProduct(card.dataset.productId):openEditor(card.dataset.productId));
  $("shopEmpty").classList.toggle("hidden",!!list.length);
  $("shopProductCount").textContent=list.length;$("shopStockCount").textContent=list.reduce((a,i)=>a+itemStock(i),0);$("shopFavCount").textContent=items.filter(i=>i.favorite).length;
  const cats=[...new Set(items.map(i=>i.category).filter(Boolean))].sort(),cur=$("shopCategoryFilter").value;
  $("shopCategoryFilter").innerHTML=`<option value="">All categories</option>`+cats.map(c=>`<option ${c===cur?"selected":""}>${safe(c)}</option>`).join("");
  $("customerModeBtn").textContent="◫ Customer Store Mode";
  $("drawerCustomerBtn").textContent="◫ Customer Store Mode";
  $("customerModeBar").classList.toggle("hidden",!customerMode);
  $("customerStoreTabs").classList.toggle("hidden",!customerMode);
  document.body.classList.toggle("customer-mode",customerMode);
  document.body.classList.toggle("public-visitor",publicVisitorMode);
  if(publicVisitorMode){$("customerModeBarTitle").textContent="Live Customer Store";$("customerModeBarText").textContent="Products and filament availability are synced from PrintBook.";$("customerModeBadge").textContent="LIVE"}
  setCustomerStoreTab(customerStoreTab);
}

function restockSuggestions(){
  return filaments.map(f=>{
    const perUnit=[];
    for(const i of items){
      for(const u of i.filament_usage||[])if(u.filament_id===f.id&&Number(u.grams)>0)perUnit.push(Number(u.grams));
      for(const v of i.variants||[])for(const u of variantUsage(v))if(u.filament_id===f.id&&Number(u.grams)>0)perUnit.push(Number(u.grams));
    }
    const avg=perUnit.length?perUnit.reduce((a,b)=>a+b,0)/perUnit.length:0;
    const pct=Number(f.remaining||0)/Number(f.spool_size||1000)*100;
    const units=avg?Math.floor(Number(f.remaining||0)/avg):null;
    return {f,pct,avg,units,low:Number(f.remaining||0)<=100||pct<=Number(settings.lowFilamentPct||15)};
  }).filter(x=>x.low).sort((a,b)=>a.pct-b.pct);
}
function renderDashboard(){
  const revenue=sales.reduce((a,s)=>a+Number(s.total ?? Number(s.unit_price||0)*Number(s.quantity||0)),0),profit=sales.reduce((a,s)=>a+saleProfit(s),0),stock=items.reduce((a,i)=>a+itemStock(i),0),open=orders.filter(o=>!["Paid","Cancelled"].includes(o.status));
  $("dashRevenue").textContent=money(revenue);$("dashSalesCount").textContent=`${sales.length} sale${sales.length===1?"":"s"}`;$("dashProfit").textContent=money(profit);$("dashStock").textContent=stock;$("dashPrintTypes").textContent=`${items.length} print types`;$("dashOrders").textContent=open.length;$("dashOrderValue").textContent=`${money(open.reduce((a,o)=>a+Number(o.quoted_price||0),0))} quoted`;
  const fav=items.filter(i=>i.favorite).slice(0,5);$("favoriteList").innerHTML=fav.length?fav.map(i=>miniRow(i.name,`${itemStock(i)} in stock`,money(i.price))).join(""):emptyMini("No favorites yet");
  const rs=[...sales].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5);$("recentSales").innerHTML=rs.length?rs.map(s=>{const i=items.find(x=>x.id===s.print_id);return miniRow(i?.name||"Deleted print",`${s.quantity} sold · ${s.date}`,money(s.total ?? Number(s.unit_price)*Number(s.quantity)))}).join(""):emptyMini("No sales recorded");
  const restock=restockSuggestions().slice(0,5);$("lowFilamentList").innerHTML=restock.length?restock.map(x=>miniRow(`${x.f.brand||""} ${x.f.color||x.f.material}`.trim(),`${Math.round(x.f.remaining||0)}g left${x.units!=null?` · ~${x.units} prints`:""}`,"BUY SOON")).join(""):emptyMini("No restocks suggested");
  $("activeOrderList").innerHTML=open.slice(0,5).map(o=>miniRow(o.item||"Custom order",`${o.customer||"Customer"} · ${o.status}`,money(o.quoted_price))).join("")||emptyMini("No active orders");
}
function renderPrints(){
  const q=$("search").value.trim().toLowerCase(),cat=$("categoryFilter").value,sf=$("stockFilter").value;
  const filtered=items.filter(i=>{const hay=[i.name,i.category,i.notes,i.model_source].join(" ").toLowerCase();if(!hay.includes(q)||(cat&&i.category!==cat))return false;if(sf==="in"&&itemStock(i)<=0)return false;if(sf==="out"&&itemStock(i)>0)return false;if(sf==="fav"&&!i.favorite)return false;return true});
  $("printGrid").innerHTML=filtered.map(i=>{const mat=itemMaterialCost(i),stock=itemStock(i);return `<article class="print-card" onclick="openEditor('${i.id}')"><div class="card-photo">${i.photo_url?`<img src="${safe(i.photo_url)}">`:`<div class="photo-fallback">◌</div>`}${i.favorite?`<div class="fav-chip">★</div>`:""}${stock<=0?`<div class="out-badge">OUT</div>`:""}<div class="stock-chip">${stock} in stock</div><div class="price-chip">${money(i.price)}</div></div><div class="card-body"><h4>${safe(i.name)}</h4><div class="card-sub">${safe(i.category||"Uncategorized")} · ${(i.variants||[]).length?`${i.variants.length} variants`:`${(i.filament_usage||[]).length} filaments`}</div><div class="card-meta"><div><span>PRINT</span><strong>${i.hours?i.hours+" hr":"—"}</strong></div><div><span>MATERIAL</span><strong>${money(mat)}</strong></div><div><span>PROFIT</span><strong>${money(Number(i.price)-mat)}</strong></div></div></div></article>`}).join("");
  $("emptyState").classList.toggle("hidden",!!filtered.length);
  const cats=[...new Set(items.map(i=>i.category).filter(Boolean))].sort(),cur=$("categoryFilter").value;$("categoryFilter").innerHTML=`<option value="">All categories</option>`+cats.map(c=>`<option ${c===cur?"selected":""}>${safe(c)}</option>`).join("")
}
function renderFilaments(){
  $("filamentCount").textContent=filaments.length;$("filamentRemaining").textContent=Math.round(filaments.reduce((a,f)=>a+Number(f.remaining||0),0))+"g";$("filamentValue").textContent=money(filaments.reduce((a,f)=>a+filamentCost(f.id,f.remaining),0));
  const suggestions=new Map(restockSuggestions().map(x=>[x.f.id,x]));
  $("filamentGrid").innerHTML=filaments.map(f=>{const pct=Math.max(0,Math.min(100,Number(f.remaining||0)/Number(f.spool_size||1000)*100)),s=suggestions.get(f.id);return `<article class="filament-card" onclick="openFilament('${f.id}')"><div class="filament-top"><div><strong>${safe(f.brand||"Filament")} · ${safe(f.color||"Unknown color")}</strong><small>${safe(f.material||"Material")}</small></div><div class="filament-color" style="--spool-color:${safe(f.visual_color||'#ffffff')}">◉</div></div><div class="progress"><span style="width:${pct}%"></span></div><div class="card-meta"><div><span>LEFT</span><strong>${Math.round(Number(f.remaining||0))}g</strong></div><div><span>COST/G</span><strong>${money(filamentCost(f.id,1))}</strong></div><div><span>VALUE</span><strong>${money(filamentCost(f.id,f.remaining))}</strong></div></div>${s?`<div class="restock-note">Restock suggested${s.units!=null?` · roughly ${s.units} average prints left`:""}.</div>`:""}</article>`}).join("");
  $("filamentEmpty").classList.toggle("hidden",!!filaments.length)
}
function renderColorways(){
  $("colorwayGrid").innerHTML=colorways.map(c=>{
    const swatches=(c.usage||[]).map(u=>{const f=getFilament(u.filament_id);return `<span class="swatch" title="${safe(f?.color||"Unknown")}" style="background:${safe(f?.visual_color||'#777777')}"></span>`}).join("");
    const grams=(c.usage||[]).reduce((a,u)=>a+Number(u.grams||0),0);
    return `<article class="colorway-card" onclick="openColorway('${c.id}')"><h3>${safe(c.name)}</h3><div class="swatch-row">${swatches||"<small class='muted'>No filaments</small>"}</div><div class="colorway-meta">${(c.usage||[]).length} filaments · ${grams}g / print · ${money(usageCost(c.usage||[]))}</div></article>`
  }).join("");
  $("colorwayEmpty").classList.toggle("hidden",!!colorways.length)
}
function renderOrders(){
  const list=orders.filter(o=>!orderStatusFilter||o.status===orderStatusFilter).sort((a,b)=>String(a.due_date||"9999").localeCompare(String(b.due_date||"9999")));
  $("orderList").innerHTML=list.map(o=>`<article class="order-card" onclick="openOrder('${o.id}')"><div class="order-main"><h4>${safe(o.item||"Custom order")}</h4><p>${safe(o.customer||"Customer")} · Qty ${o.quantity||1}${o.due_date?` · Due ${safe(o.due_date)}`:""}</p></div><div class="order-side"><span class="status">${safe(o.status)}</span><strong>${money(o.quoted_price)}</strong></div></article>`).join("");$("orderEmpty").classList.toggle("hidden",!!list.length)
}
function renderPresets(){$("presetList").innerHTML=presets.map(p=>`<div class="preset-row" onclick="openPreset('${p.id}')"><div><strong>${safe(p.name)}</strong><small>$${p.machineRate}/hr · ${p.markup}× · min ${money(p.minimum)}</small></div><span>›</span></div>`).join("")}
function populatePrintSelects(){
  const opts=items.map(i=>`<option value="${i.id}">${safe(i.name)}</option>`).join("");const curSale=$("salePrint").value,curOrder=$("orderPrint").value;$("salePrint").innerHTML=opts||`<option value="">No prints</option>`;$("orderPrint").innerHTML=`<option value="">None / custom</option>`+opts;if(curSale&&items.some(i=>i.id===curSale))$("salePrint").value=curSale;if(curOrder)$("orderPrint").value=curOrder
}
function populatePresetSelects(){const opts=presets.map(p=>`<option value="${p.id}">${safe(p.name)}</option>`).join("");[$("presetInput"),$("hpPreset")].forEach(s=>{const c=s.value;s.innerHTML=opts;if(c&&presets.some(p=>p.id===c))s.value=c;else s.value=settings.defaultPresetId||presets[0]?.id})}

function usageRowHTML(u={}){const opts=filaments.map(f=>`<option value="${f.id}" ${u.filament_id===f.id?"selected":""}>${safe(`${f.brand||""} ${f.material||""} ${f.color||""}`.trim())}</option>`).join("");return `<div class="usage-row"><label class="usage-select">Spool<select class="u-filament"><option value="">Select filament</option>${opts}</select></label><label>Grams<input class="u-grams" type="number" min="0" step="1" value="${u.grams??""}"></label><label>Cost<input class="u-cost" value="${money(filamentCost(u.filament_id,u.grams))}" disabled></label><button type="button" class="remove-row">✕</button></div>`}
function addUsageRow(containerId,u={}){const d=document.createElement("div");d.innerHTML=usageRowHTML(u);const row=d.firstElementChild;$(containerId).appendChild(row);row.querySelector(".remove-row").onclick=()=>{row.remove();updatePricingPreviews();updateHelperPreview()};row.querySelectorAll("select,input").forEach(x=>x.oninput=()=>{refreshUsageCosts();updatePricingPreviews();updateHelperPreview()})}
function collectUsage(containerId){return [...$(containerId).querySelectorAll(".usage-row")].map(r=>({filament_id:r.querySelector(".u-filament").value,grams:Number(r.querySelector(".u-grams").value||0)})).filter(u=>u.filament_id&&u.grams>0)}
function refreshUsageCosts(){document.querySelectorAll(".usage-row").forEach(r=>{const f=r.querySelector(".u-filament")?.value,g=Number(r.querySelector(".u-grams")?.value||0),c=r.querySelector(".u-cost");if(c)c.value=money(filamentCost(f,g))})}

function variantRowHTML(v={}){
  const cOpts=colorways.map(c=>`<option value="${c.id}" ${v.colorway_id===c.id?"selected":""}>${safe(c.name)}</option>`).join("");
  return `<div class="variant-row" data-id="${safe(v.id||uid())}">
    <label class="variant-name">Name<input class="v-name" placeholder="Pink / White" value="${safe(v.name||"")}"></label>
    <label>Price<input class="v-price" type="number" min="0" step=".01" value="${v.price??""}" placeholder="Base"></label>
    <label>Stock<input class="v-stock" type="number" min="0" step="1" value="${Number(v.stock||0)}"></label>
    <label class="variant-colorway">Colorway<select class="v-colorway"><option value="">Use base filament</option>${cOpts}</select></label>
    <button type="button" class="remove-variant">✕</button>
  </div>`
}
function addVariantRow(v={}){const d=document.createElement("div");d.innerHTML=variantRowHTML(v);const row=d.firstElementChild;$("variantRows").appendChild(row);row.querySelector(".remove-variant").onclick=()=>{row.remove();updatePricingPreviews()};row.querySelectorAll("input,select").forEach(x=>x.oninput=updatePricingPreviews)}
function collectVariants(){return [...$("variantRows").querySelectorAll(".variant-row")].map(r=>({id:r.dataset.id||uid(),name:r.querySelector(".v-name").value.trim()||"Variant",price:r.querySelector(".v-price").value===""?"":Number(r.querySelector(".v-price").value),stock:Number(r.querySelector(".v-stock").value||0),colorway_id:r.querySelector(".v-colorway").value,filament_usage:[]}))}

function resetEditor(){
  editingId=null;pendingPhotoFile=null;pendingPhotoData="";editorFavorite=false;
  ["nameInput","categoryInput","modelSourceInput","priceInput","hoursInput","extraCostInput","notesInput","dealQtyInput","dealPriceInput"].forEach(id=>$(id).value="");
  $("madeInput").value=0;$("soldInput").value=0;$("outOfStockInput").value="show";$("multicolorCapableInput").value="false";$("presetInput").value=settings.defaultPresetId||presets[0]?.id;
  $("photoPreview").classList.add("hidden");$("photoPlaceholder").classList.remove("hidden");if($("photoCameraInput"))$("photoCameraInput").value="";if($("photoLibraryInput"))$("photoLibraryInput").value="";$("printFilamentRows").innerHTML="";$("variantRows").innerHTML="";
  $("deleteBtn").style.visibility="hidden";$("recordSaleFromPrintBtn").style.visibility="hidden";$("makePrintBtn").style.visibility="hidden";updateFavoriteButton();updatePricingPreviews()
}
function updateFavoriteButton(){$("favoriteToggle").classList.toggle("active",editorFavorite);$("favoriteToggle").textContent=editorFavorite?"★ Favorite":"☆ Favorite"}
window.openEditor=id=>{
  resetEditor();
  if(id){
    const i=items.find(x=>x.id===id);if(!i)return;editingId=id;$("editorTitle").textContent="Edit print";$("nameInput").value=i.name||"";$("categoryInput").value=i.category||"";$("modelSourceInput").value=i.model_source||"";$("priceInput").value=i.price??"";$("presetInput").value=i.preset_id||settings.defaultPresetId;$("hoursInput").value=i.hours??"";$("extraCostInput").value=i.extra_cost??0;$("notesInput").value=i.notes||"";$("madeInput").value=i.made_qty??0;$("soldInput").value=i.sold_qty??0;$("dealQtyInput").value=i.deal_qty||"";$("dealPriceInput").value=i.deal_price||"";$("outOfStockInput").value=i.out_of_stock_behavior||"show";$("multicolorCapableInput").value=i.multicolor_capable?"true":"false";editorFavorite=!!i.favorite;updateFavoriteButton();
    if(i.photo_url){$("photoPreview").src=i.photo_url;$("photoPreview").classList.remove("hidden");$("photoPlaceholder").classList.add("hidden")}
    (i.filament_usage||[]).forEach(u=>addUsageRow("printFilamentRows",u));(i.variants||[]).forEach(v=>addVariantRow(v));
    $("deleteBtn").style.visibility="visible";$("recordSaleFromPrintBtn").style.visibility="visible";$("makePrintBtn").style.visibility="visible"
  } else $("editorTitle").textContent="Add print";
  updateModelLink();updatePricingPreviews();$("editorDialog").showModal()
}
function updateModelLink(){const url=$("modelSourceInput").value.trim(),a=$("modelSourceOpen");if(url){a.href=url;a.classList.remove("hidden")}else a.classList.add("hidden")}
function updatePricingPreviews(){refreshUsageCosts();const usage=collectUsage("printFilamentRows"),mat=usageCost(usage)+Number($("extraCostInput").value||0),suggest=suggestedPrice($("hoursInput").value,mat,$("presetInput").value),price=$("priceInput").value===""?suggest:Number($("priceInput").value),variants=collectVariants();$("materialCostPreview").textContent=money(mat);$("suggestedPrice").textContent=money(suggest);$("profitPreview").textContent=money(price-mat);$("stockPreview").textContent=variants.length?variants.reduce((a,v)=>a+v.stock,0):Math.max(0,Number($("madeInput").value||0)-Number($("soldInput").value||0))}
async function fileToDataUrl(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=rej;
    r.readAsDataURL(file)
  })
}
async function compressedPhotoDataUrl(file){
  // Phone camera photos can be several MB. Saving the raw base64 image into
  // localStorage can exceed Safari's quota and make the Save button appear broken.
  // Keep the original File for Supabase upload, but store a lightweight local preview.
  try{
    const objectUrl=URL.createObjectURL(file);
    const img=await new Promise((resolve,reject)=>{
      const el=new Image();
      el.onload=()=>resolve(el);
      el.onerror=reject;
      el.src=objectUrl;
    });
    const maxSide=1200;
    const scale=Math.min(1,maxSide/Math.max(img.naturalWidth||1,img.naturalHeight||1));
    const w=Math.max(1,Math.round(img.naturalWidth*scale));
    const h=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement("canvas");
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{alpha:false});
    ctx.drawImage(img,0,0,w,h);
    URL.revokeObjectURL(objectUrl);
    return canvas.toDataURL("image/jpeg",0.78);
  }catch(err){
    console.warn("Photo compression failed, using FileReader fallback",err);
    return fileToDataUrl(file);
  }
}
async function handleChosenPhoto(file){
  if(!file)return;pendingPhotoFile=file;$("photoPlaceholder").classList.add("hidden");$("photoPreview").classList.remove("hidden");$("photoPreview").removeAttribute("src");
  try{pendingPhotoData=await compressedPhotoDataUrl(file);$("photoPreview").src=pendingPhotoData}
  catch(err){console.error(err);pendingPhotoData="";pendingPhotoFile=null;$("photoPreview").classList.add("hidden");$("photoPlaceholder").classList.remove("hidden");toast("Couldn't prepare that photo — try another one")}
}
$("photoCameraInput").onchange=e=>handleChosenPhoto(e.target.files?.[0]);
$("photoLibraryInput").onchange=e=>handleChosenPhoto(e.target.files?.[0]);

async function savePrint(){
  if(savePrintInFlight)return;
  const name=$("nameInput").value.trim();
  if(!name)return toast("Give the print a name");

  savePrintInFlight=true;
  const saveBtn=$("savePrintBtn");
  const oldLabel=saveBtn.textContent;
  saveBtn.disabled=true;
  saveBtn.textContent="Saving…";

  try{
    const old=editingId?items.find(i=>i.id===editingId):null;
    const id=editingId||uid();
    const usage=collectUsage("printFilamentRows");
    const variants=collectVariants();
    const mat=usageCost(usage)+Number($("extraCostInput").value||0);
    const suggest=suggestedPrice($("hoursInput").value,mat,$("presetInput").value);

    // Capture globals now. The user can start another item while cloud work finishes.
    const photoFile=pendingPhotoFile;
    const localPhoto=pendingPhotoData;
    const previousCloudPhoto=(old?.photo_url && !String(old.photo_url).startsWith("data:")) ? old.photo_url : "";

    let item={
      id,
      name,
      category:$("categoryInput").value.trim(),
      model_source:$("modelSourceInput").value.trim(),
      price:Number($("priceInput").value||suggest),
      preset_id:$("presetInput").value,
      hours:$("hoursInput").value===""?"":Number($("hoursInput").value),
      extra_cost:Number($("extraCostInput").value||0),
      made_qty:Number($("madeInput").value||0),
      sold_qty:Number($("soldInput").value||0),
      notes:$("notesInput").value.trim(),
      favorite:editorFavorite,
      filament_usage:usage,
      variants,
      deal_qty:Number($("dealQtyInput").value||0),
      deal_price:Number($("dealPriceInput").value||0),
      out_of_stock_behavior:$("outOfStockInput").value,
      multicolor_capable:$("multicolorCapableInput").value==="true",
      photo_url:localPhoto || old?.photo_url || "",
      created_at:old?.created_at||nowISO(),
      updated_at:nowISO()
    };

    // LOCAL FIRST: make Save feel instant on mobile. Do not wait for photo upload
    // or Supabase before closing the editor.
    // Protect this product from an older realtime cloud snapshot until upload finishes.
    pendingLocalProductIds.add(id);
    const idx=items.findIndex(i=>i.id===id);
    if(idx>=0)items[idx]=item;
    else items.unshift(item);

    try{
      persist();
    }catch(err){
      // Safari localStorage can throw QuotaExceededError when a camera image is too large.
      // The print itself is more important than the local photo, so retry without data URL.
      console.error("Local save failed; retrying without embedded photo",err);
      if(String(item.photo_url||"").startsWith("data:")){
        item.photo_url=previousCloudPhoto;
        const retryIdx=items.findIndex(i=>i.id===id);
        if(retryIdx>=0)items[retryIdx]=item;
        persist();
      }else{
        throw err;
      }
    }

    $("editorDialog").close();
    toast(currentUser?"Print saved — syncing photo in background":"Print saved");

    // Restore the button now, because the editor is already saved and closed.
    savePrintInFlight=false;
    saveBtn.disabled=false;
    saveBtn.textContent=oldLabel;

    // CLOUD SECOND: finish network/photo work without blocking the mobile UI.
    if(currentUser&&supabaseClient){
      (async()=>{
        try{
          setSyncState("syncing",photoFile?"Uploading photo…":"Saving print…");

          let cloudPhoto=previousCloudPhoto;
          if(photoFile){
            const ext=(photoFile.name.split(".").pop()||"jpg").toLowerCase();
            const path=`${currentUser.id}/${id}.${ext}`;
            const {error}=await supabaseClient.storage
              .from("print-images")
              .upload(path,photoFile,{upsert:true,cacheControl:"3600"});
            if(error)throw error;
            cloudPhoto=supabaseClient.storage.from("print-images").getPublicUrl(path).data.publicUrl;
          }

          // Grab the newest local record in case it was edited while the upload ran.
          const latest=items.find(i=>i.id===id);
          if(!latest)return;

          if(cloudPhoto){
            latest.photo_url=cloudPhoto;
            latest.updated_at=nowISO();
            try{persist()}catch(err){console.warn("Could not cache cloud photo URL locally",err)}
          }

          // Never put a base64 camera image into the prints table.
          const cloudRecord={
            ...latest,
            photo_url:String(latest.photo_url||"").startsWith("data:") ? (cloudPhoto||"") : latest.photo_url
          };
          const ok=await syncUpsert("prints",dbPrint(cloudRecord));
          if(ok!==false){
            pendingLocalProductIds.delete(id);
            setSyncState("synced","Synced",nowISO());
          }
        }catch(err){
          console.error("Background print sync failed",err);
          setSyncState("error","Print saved locally — cloud/photo sync failed");
          toast("Print saved locally; cloud photo sync failed")
        }
      })();
    }

  }catch(err){
    console.error("Save print failed",err);
    if(editingId)pendingLocalProductIds.delete(editingId);
    toast("Couldn't save this print");
    savePrintInFlight=false;
    saveBtn.disabled=false;
    saveBtn.textContent=oldLabel;
  }
}
async function deletePrint(){if(!editingId||!confirm("Delete this print?"))return;if(currentUser)await syncDelete("prints",editingId);items=items.filter(i=>i.id!==editingId);persist();$("editorDialog").close();toast("Print deleted")}

function resetFilament(){editingFilamentId=null;["filBrand","filMaterial","filColor","filPrice","filNotes"].forEach(id=>$(id).value="");$("filVisualColor").value="#ffffff";$("filVisualHex").value="#ffffff";$("filSpoolSize").value=1000;$("filRemainingInput").value=1000;$("deleteFilamentBtn").style.visibility="hidden";updateFilamentPreview()}
window.openFilament=id=>{resetFilament();if(id){const f=filaments.find(x=>x.id===id);if(!f)return;editingFilamentId=id;$("filamentTitle").textContent="Edit spool";$("filBrand").value=f.brand||"";$("filMaterial").value=f.material||"";$("filColor").value=f.color||"";$("filVisualColor").value=f.visual_color||"#ffffff";$("filVisualHex").value=f.visual_color||"#ffffff";$("filSpoolSize").value=f.spool_size||1000;$("filPrice").value=f.purchase_price??"";$("filRemainingInput").value=f.remaining??"";$("filNotes").value=f.notes||"";$("deleteFilamentBtn").style.visibility="visible"}else $("filamentTitle").textContent="Add spool";updateFilamentPreview();$("filamentDialog").showModal()}
function updateFilamentPreview(){const size=Number($("filSpoolSize").value||1000),price=Number($("filPrice").value||0),rem=Number($("filRemainingInput").value||0),cpg=price/size;$("costPerGramPreview").textContent="$"+cpg.toFixed(3);$("remainingValuePreview").textContent=money(cpg*rem)}
async function saveFilament(){const id=editingFilamentId||uid(),f={id,brand:$("filBrand").value.trim(),material:$("filMaterial").value.trim(),color:$("filColor").value.trim(),visual_color:$("filVisualColor").value||"#ffffff",spool_size:Number($("filSpoolSize").value||1000),purchase_price:Number($("filPrice").value||0),remaining:Number($("filRemainingInput").value||0),notes:$("filNotes").value.trim(),created_at:filaments.find(x=>x.id===id)?.created_at||nowISO(),updated_at:nowISO()};if(currentUser)await syncUpsert("filaments",{...f,user_id:currentUser.id});const idx=filaments.findIndex(x=>x.id===id);if(idx>=0)filaments[idx]=f;else filaments.unshift(f);persist();$("filamentDialog").close();toast("Spool saved")}
async function deleteFilament(){if(!editingFilamentId||!confirm("Delete this spool?"))return;if(currentUser)await syncDelete("filaments",editingFilamentId);filaments=filaments.filter(f=>f.id!==editingFilamentId);persist();$("filamentDialog").close()}

function resetColorway(){editingColorwayId=null;$("colorwayName").value="";$("colorwayFilamentRows").innerHTML="";$("deleteColorwayBtn").style.visibility="hidden"}
window.openColorway=id=>{resetColorway();if(id){const c=colorways.find(x=>x.id===id);if(!c)return;editingColorwayId=id;$("colorwayTitle").textContent="Edit colorway";$("colorwayName").value=c.name||"";(c.usage||[]).forEach(u=>addUsageRow("colorwayFilamentRows",u));$("deleteColorwayBtn").style.visibility="visible"}else{$("colorwayTitle").textContent="New colorway";addUsageRow("colorwayFilamentRows")}$("colorwayDialog").showModal()}
async function saveColorway(){const name=$("colorwayName").value.trim();if(!name)return toast("Name the colorway");const id=editingColorwayId||uid(),c={id,name,usage:collectUsage("colorwayFilamentRows"),created_at:colorways.find(x=>x.id===id)?.created_at||nowISO(),updated_at:nowISO()};if(currentUser)await syncUpsert("colorways",{...c,user_id:currentUser.id});const idx=colorways.findIndex(x=>x.id===id);if(idx>=0)colorways[idx]=c;else colorways.unshift(c);persist();$("colorwayDialog").close();toast("Colorway saved")}
async function deleteColorway(){if(!editingColorwayId||!confirm("Delete this colorway?"))return;if(currentUser)await syncDelete("colorways",editingColorwayId);colorways=colorways.filter(c=>c.id!==editingColorwayId);for(const i of items)for(const v of i.variants||[])if(v.colorway_id===editingColorwayId)v.colorway_id="";persist();$("colorwayDialog").close()}

function openMake(printId){
  const item=items.find(i=>i.id===printId);if(!item)return;currentMakePrintId=printId;$("makeProductName").textContent=item.name;$("makeQty").value=1;
  $("makeVariant").innerHTML=`<option value="">Standard</option>`+(item.variants||[]).map(v=>`<option value="${v.id}">${safe(v.name)}</option>`).join("");
  if((item.variants||[]).length)$("makeVariant").value=item.variants[0].id;updateMakeCheck();$("makeDialog").showModal()
}
function makeUsage(){const item=items.find(i=>i.id===currentMakePrintId);if(!item)return[];const vid=$("makeVariant").value;if(vid){const v=(item.variants||[]).find(x=>x.id===vid);return variantUsage(v)}return item.filament_usage||[]}
function updateMakeCheck(){
  const qty=Math.max(1,Number($("makeQty").value||1)),usage=makeUsage(),checks=usage.map(u=>{const f=getFilament(u.filament_id),need=Number(u.grams||0)*qty,have=Number(f?.remaining||0);return {f,need,have,ok:!!f&&have>=need}});
  $("makeCheckList").innerHTML=checks.length?checks.map(c=>`<div class="check-row"><div><strong>${safe(c.f?`${c.f.brand||""} ${c.f.color||c.f.material}`.trim():"Missing spool")}</strong><small>Need ${Math.round(c.need)}g · Have ${Math.round(c.have)}g</small></div><span class="${c.ok?"ok":"bad"}">${c.ok?"Enough":"Short"}</span></div>`).join(""):`<div class="check-row"><div><strong>No filament recipe</strong><small>This print has no saved filament usage, so nothing will be deducted.</small></div><span class="ok">OK</span></div>`;
  const shortages=checks.filter(c=>!c.ok);$("makeWarning").classList.toggle("hidden",!shortages.length);$("makeWarning").textContent=shortages.length?`Not enough filament for this batch. Add/restock the listed spool${shortages.length===1?"":"s"} before printing.`:"";$("confirmMakeBtn").disabled=!!shortages.length;$("confirmMakeBtn").style.opacity=shortages.length?".45":"1"
}
async function confirmMake(){
  const item=items.find(i=>i.id===currentMakePrintId);if(!item)return;const qty=Math.max(1,Number($("makeQty").value||1)),vid=$("makeVariant").value,usage=makeUsage();
  for(const u of usage){const f=getFilament(u.filament_id),need=Number(u.grams||0)*qty;if(!f||Number(f.remaining||0)<need)return toast("Not enough filament")}
  for(const u of usage){const f=getFilament(u.filament_id);f.remaining=Math.max(0,Number(f.remaining||0)-Number(u.grams||0)*qty);f.updated_at=nowISO()}
  if(vid){const v=(item.variants||[]).find(x=>x.id===vid);if(v)v.stock=Number(v.stock||0)+qty}else item.made_qty=Number(item.made_qty||0)+qty;
  item.updated_at=nowISO();
  if(currentUser){await syncUpsert("prints",dbPrint(item));for(const u of usage){const f=getFilament(u.filament_id);if(f)await syncUpsert("filaments",{...f,user_id:currentUser.id})}}
  persist();$("makeDialog").close();toast(`Added ${qty} to stock and deducted filament`)
}

function openSale(printId=null){
  populatePrintSelects();$("salePrint").value=printId||items[0]?.id||"";$("saleQty").value=1;$("saleDate").value=TODAY();$("saleChannel").value="";$("saleNotes").value="";$("saleDiscountType").value="none";$("saleDiscountValue").value=0;populateSaleVariants();syncSalePrice();$("saleDialog").showModal()
}
function populateSaleVariants(){
  const i=items.find(x=>x.id===$("salePrint").value),cur=$("saleVariant").value;$("saleVariant").innerHTML=`<option value="">Standard</option>`+(i?.variants||[]).map(v=>`<option value="${v.id}">${safe(v.name)} (${v.stock||0} in stock)</option>`).join("");if(cur&&(i?.variants||[]).some(v=>v.id===cur))$("saleVariant").value=cur;else if((i?.variants||[]).length)$("saleVariant").value=i.variants[0].id;
}
function syncSalePrice(){const i=items.find(x=>x.id===$("salePrint").value);$("salePrice").value=i?variantPrice(i,$("saleVariant").value):0;autoDeal();updateSalePreview()}
function autoDeal(){const i=items.find(x=>x.id===$("salePrint").value),q=Number($("saleQty").value||1);if(i&&Number(i.deal_qty)>1&&Number(i.deal_price)>0&&q>=Number(i.deal_qty)&&$("saleDiscountType").value==="none")$("saleDiscountType").value="deal"}
function calcSale(){
  const i=items.find(x=>x.id===$("salePrint").value),q=Math.max(1,Number($("saleQty").value||1)),unit=Number($("salePrice").value||0),subtotal=q*unit,type=$("saleDiscountType").value,val=Number($("saleDiscountValue").value||0);let discount=0;
  if(type==="percent")discount=subtotal*Math.min(100,Math.max(0,val))/100;else if(type==="flat")discount=Math.min(subtotal,Math.max(0,val));else if(type==="deal"&&i&&Number(i.deal_qty)>1&&Number(i.deal_price)>0){const groups=Math.floor(q/Number(i.deal_qty));discount=Math.max(0,groups*Number(i.deal_qty)*unit-groups*Number(i.deal_price))}
  const total=Math.max(0,subtotal-discount),cost=i?itemMaterialCost(i,$("saleVariant").value):0;return {i,q,unit,subtotal,discount,total,cost}
}
function updateSalePreview(){const c=calcSale();$("saleSubtotalPreview").textContent=money(c.subtotal);$("saleDiscountPreview").textContent="-"+money(c.discount);$("saleTotalPreview").textContent=money(c.total);$("saleProfitPreview").textContent=money(c.total-c.cost*c.q)}
async function saveSale(){
  const c=calcSale(),print_id=$("salePrint").value,variant_id=$("saleVariant").value;if(!print_id)return toast("Choose a print");const available=variant_id?variantStock(c.i,variant_id):itemStock(c.i);if(c.q>available&&!confirm(`Only ${available} in stock. Record the sale anyway?`))return;
  const s={id:uid(),print_id,variant_id,quantity:c.q,unit_price:c.unit,discount_type:$("saleDiscountType").value,discount_value:Number($("saleDiscountValue").value||0),discount_amount:c.discount,total:c.total,unit_cost:c.cost,date:$("saleDate").value||TODAY(),channel:$("saleChannel").value.trim(),notes:$("saleNotes").value.trim(),created_at:nowISO(),updated_at:nowISO()};sales.unshift(s);
  if(variant_id){const v=(c.i.variants||[]).find(x=>x.id===variant_id);if(v)v.stock=Math.max(0,Number(v.stock||0)-c.q)}else c.i.sold_qty=Number(c.i.sold_qty||0)+c.q;c.i.updated_at=nowISO();
  if(currentUser){await syncUpsert("sales",{...s,user_id:currentUser.id});await syncUpsert("prints",dbPrint(c.i))}
  persist();$("saleDialog").close();toast("Sale recorded")
}
function openSalesHistory(){const sorted=[...sales].sort((a,b)=>String(b.date).localeCompare(String(a.date)));$("salesHistoryList").innerHTML=sorted.map(s=>{const i=items.find(x=>x.id===s.print_id),v=(i?.variants||[]).find(x=>x.id===s.variant_id);return `<article class="order-card"><div class="order-main"><h4>${safe(i?.name||"Deleted print")}${v?` · ${safe(v.name)}`:""}</h4><p>${safe(s.date)} · Qty ${s.quantity}${s.channel?` · ${safe(s.channel)}`:""}${Number(s.discount_amount)>0?` · ${money(s.discount_amount)} off`:""}</p></div><div class="order-side"><strong>${money(s.total ?? Number(s.unit_price)*Number(s.quantity))}</strong><p class="muted">Profit ${money(saleProfit(s))}</p></div></article>`}).join("")||`<div class="empty-state"><p>No sales yet.</p></div>`;$("salesHistoryDialog").showModal()}

function resetOrder(){editingOrderId=null;["orderCustomer","orderItem","orderPrice","orderDue","orderNotes"].forEach(id=>$(id).value="");$("orderQty").value=1;$("orderStatus").value="Requested";$("orderPrint").value="";$("deleteOrderBtn").style.visibility="hidden"}
window.openOrder=id=>{resetOrder();populatePrintSelects();if(id){const o=orders.find(x=>x.id===id);if(!o)return;editingOrderId=id;$("orderTitle").textContent="Edit order";$("orderCustomer").value=o.customer||"";$("orderStatus").value=o.status||"Requested";$("orderItem").value=o.item||"";$("orderQty").value=o.quantity||1;$("orderPrice").value=o.quoted_price??"";$("orderDue").value=o.due_date||"";$("orderPrint").value=o.print_id||"";$("orderNotes").value=o.notes||"";$("deleteOrderBtn").style.visibility="visible"}else $("orderTitle").textContent="New order";$("orderDialog").showModal()}
async function saveOrder(){const item=$("orderItem").value.trim();if(!item)return toast("Describe the order");const id=editingOrderId||uid(),o={id,customer:$("orderCustomer").value.trim(),status:$("orderStatus").value,item,quantity:Number($("orderQty").value||1),quoted_price:Number($("orderPrice").value||0),due_date:$("orderDue").value,print_id:$("orderPrint").value||"",notes:$("orderNotes").value.trim(),created_at:orders.find(x=>x.id===id)?.created_at||nowISO(),updated_at:nowISO()};if(currentUser)await syncUpsert("orders",{...o,user_id:currentUser.id,print_id:o.print_id||null});const idx=orders.findIndex(x=>x.id===id);if(idx>=0)orders[idx]=o;else orders.unshift(o);persist();$("orderDialog").close();toast("Order saved")}
async function deleteOrder(){if(!editingOrderId||!confirm("Delete this order?"))return;if(currentUser)await syncDelete("orders",editingOrderId);orders=orders.filter(o=>o.id!==editingOrderId);persist();$("orderDialog").close()}

function resetPreset(){editingPresetId=null;$("prName").value="";$("prRate").value=2;$("prMarkup").value=1.5;$("prMinimum").value=8;$("prRound").value="1";$("deletePresetBtn").style.visibility="hidden"}
window.openPreset=id=>{resetPreset();if(id){const p=presets.find(x=>x.id===id);if(!p)return;editingPresetId=id;$("presetTitle").textContent="Edit preset";$("prName").value=p.name;$("prRate").value=p.machineRate;$("prMarkup").value=p.markup;$("prMinimum").value=p.minimum;$("prRound").value=String(p.roundTo);$("deletePresetBtn").style.visibility=presets.length>1?"visible":"hidden"}else $("presetTitle").textContent="Add preset";$("presetDialog").showModal()}
function savePreset(){const name=$("prName").value.trim();if(!name)return toast("Name the preset");const id=editingPresetId||uid(),p={id,name,machineRate:Number($("prRate").value||0),markup:Number($("prMarkup").value||1),minimum:Number($("prMinimum").value||0),roundTo:Number($("prRound").value||1)};const idx=presets.findIndex(x=>x.id===id);if(idx>=0)presets[idx]=p;else presets.push(p);persist();$("presetDialog").close();toast("Preset saved")}
function deletePreset(){if(!editingPresetId||presets.length<=1)return;if(!confirm("Delete this pricing preset?"))return;presets=presets.filter(p=>p.id!==editingPresetId);if(settings.defaultPresetId===editingPresetId)settings.defaultPresetId=presets[0].id;persist();$("presetDialog").close()}

function openPriceHelper(){populatePresetSelects();$("hpHours").value="";$("hpExtra").value=0;$("hpComplexity").value="1";$("hpFilamentRows").innerHTML="";addUsageRow("hpFilamentRows");updateHelperPreview();$("priceHelperDialog").showModal()}
function updateHelperPreview(){if(!$("hpHours"))return;refreshUsageCosts();const mat=usageCost(collectUsage("hpFilamentRows"))+Number($("hpExtra").value||0),hours=Number($("hpHours").value||0),preset=$("hpPreset").value||settings.defaultPresetId,complex=Number($("hpComplexity").value||1),p=getPreset(preset),base=mat+hours*Number(p.machineRate||0),rec=suggestedPrice(hours,mat,preset,complex),high=roundUp(rec*1.2,p.roundTo),bulk=Math.max(p.minimum,roundUp(rec*.85,p.roundTo));$("hpMaterial").textContent=money(mat);$("hpBase").textContent=money(base);$("hpRecommended").textContent=money(rec);$("hpHigh").textContent=money(high);$("hpBulk").textContent=money(bulk);$("hpProfit").textContent=money(rec-mat)}
function helperToPrint(){const mat=usageCost(collectUsage("hpFilamentRows"))+Number($("hpExtra").value||0),rec=suggestedPrice($("hpHours").value,mat,$("hpPreset").value,Number($("hpComplexity").value||1)),usage=collectUsage("hpFilamentRows");$("priceHelperDialog").close();openEditor();$("hoursInput").value=$("hpHours").value;$("extraCostInput").value=$("hpExtra").value;$("presetInput").value=$("hpPreset").value;$("priceInput").value=rec;$("printFilamentRows").innerHTML="";usage.forEach(u=>addUsageRow("printFilamentRows",u));updatePricingPreviews()}

function openCustomerProduct(id){
  const i=items.find(x=>x.id===id);if(!i)return;
  currentRequestPrintId=id;$("customerProductName").textContent=i.name;$("customerProductPrice").textContent=money(i.price);$("customerProductNotes").textContent=i.notes||i.category||"";
  if(i.photo_url){$("customerProductPhoto").src=i.photo_url;$("customerProductPhoto").alt=i.name;$("customerProductPhoto").classList.remove("hidden")}else $("customerProductPhoto").classList.add("hidden");
  const deal=Number(i.deal_qty)>1&&Number(i.deal_price)>0;$("customerProductDeal").classList.toggle("hidden",!deal);$("customerProductDeal").textContent=deal?`Deal: ${i.deal_qty} for ${money(i.deal_price)}`:"";
  $("customerVariantList").innerHTML=(i.variants||[]).map(v=>`<div class="customer-variant"><span>${safe(v.name)}</span><strong>${money(variantPrice(i,v.id))} · ${v.stock||0} available</strong></div>`).join("");
  const stock=itemStock(i);$("customerAvailability").textContent=stock>0?`${stock} available right now`:"Currently out of stock";$("customerAvailability").classList.toggle("out",stock<=0);$("customerProductDialog").showModal()
}

function populateRequestFilaments(){
  const select=$("requestFilament");
  if(!select)return;
  select.innerHTML=`<option value="">No preference</option>`+
    filaments
      .filter(f=>Number(f.remaining||0)>0)
      .sort((a,b)=>String(a.color||"").localeCompare(String(b.color||"")))
      .map(f=>`<option value="${f.id}">${safe(f.color||f.material||"Filament")}${f.material?` · ${safe(f.material)}`:""}</option>`)
      .join("");
}
function requestVariantObject(){
  const item=items.find(i=>i.id===currentRequestPrintId);
  if(!item)return null;
  return (item.variants||[]).find(v=>v.id===$("requestVariant").value)||null;
}
function selectedRequestColorIds(){
  return [...document.querySelectorAll('#requestColorGrid input[type="checkbox"]:checked')].map(x=>x.value);
}
function renderRequestColorChoices(){
  const grid=$("requestColorGrid");
  if(!grid)return;
  const available=filaments
    .filter(f=>Number(f.remaining||0)>0)
    .sort((a,b)=>String(a.color||a.material||"").localeCompare(String(b.color||b.material||"")));

  grid.innerHTML=available.map(f=>`
    <label class="request-color-choice">
      <input type="checkbox" value="${safe(f.id)}">
      <span class="request-color-swatch" style="background:${safe(f.visual_color||'#777777')}"></span>
      <span>
        <strong>${safe(f.color||f.material||"Filament")}</strong>
        <small>${safe([f.material,f.brand].filter(Boolean).join(" · "))}</small>
      </span>
    </label>`).join("");

  grid.querySelectorAll('input[type="checkbox"]').forEach(x=>x.onchange=updateRequestColorCount);
  updateRequestColorCount();
}
function updateRequestColorCount(){
  const n=selectedRequestColorIds().length;
  $("requestColorCount").textContent=`${n} selected`;
}
function updateRequestColorMode(){
  const item=items.find(i=>i.id===currentRequestPrintId);
  const capable=!!item?.multicolor_capable;

  $("requestColorModeField").classList.toggle("hidden",!capable);

  if(!capable){
    $("requestColorMode").value="single";
  }

  const multi=capable && $("requestColorMode").value==="multi";
  $("requestMulticolorSection").classList.toggle("hidden",!multi);
  $("requestSingleColorField").classList.toggle("hidden",multi);

  if(multi)renderRequestColorChoices();
}
function requestUnitPrice(){
  const item=items.find(i=>i.id===currentRequestPrintId);
  if(!item)return 0;
  const vid=$("requestVariant").value;
  return variantPrice(item,vid);
}
function updateRequestEstimate(){
  const qty=Math.max(1,Number($("requestQty").value||1));
  $("requestEstimate").textContent=money(requestUnitPrice()*qty);
}
function openRequestPrint(){
  const item=items.find(i=>i.id===currentRequestPrintId);
  if(!item)return;

  $("customerProductDialog").close();

  $("requestPrintTitle").textContent=`Request ${item.name}`;
  $("requestCustomerName").value="";
  $("requestContact").value="";
  $("requestNotes").value="";
  $("requestQty").value=1;

  $("requestVariant").innerHTML=`<option value="">Standard</option>`+
    (item.variants||[]).map(v=>`<option value="${v.id}">${safe(v.name)}${Number(v.stock||0)>0?` · ${v.stock} available`:""}</option>`).join("");

  if((item.variants||[]).length)$("requestVariant").value=item.variants[0].id;
  populateRequestFilaments();
  $("requestColorMode").value="single";
  updateRequestColorMode();

  $("requestProductSummary").innerHTML=`
    ${item.photo_url?`<img class="request-product-thumb" src="${safe(item.photo_url)}" alt="">`:`<div class="request-product-thumb"></div>`}
    <div>
      <strong>${safe(item.name)}</strong>
      <small>Starting at ${money(item.price)}</small>
    </div>`;

  updateRequestEstimate();
  $("requestPrintDialog").showModal();
}
async function submitPrintRequest(){
  const item=items.find(i=>i.id===currentRequestPrintId);if(!item)return toast("That product could not be found");
  const customer=$("requestCustomerName").value.trim();if(!customer)return toast("Enter your name");
  const qty=Math.max(1,Number($("requestQty").value||1)),variantId=$("requestVariant").value,variant=(item.variants||[]).find(v=>v.id===variantId),filamentId=$("requestFilament").value,filament=getFilament(filamentId),contact=$("requestContact").value.trim(),userNotes=$("requestNotes").value.trim(),estimate=requestUnitPrice()*qty;
  const wantsMulticolor=!!item.multicolor_capable && $("requestColorMode").value==="multi";
  const colorIds=wantsMulticolor?selectedRequestColorIds():[];
  if(wantsMulticolor&&colorIds.length<2)return toast("Choose at least 2 colors");

  if(publicVisitorMode){
    const btn=$("submitPrintRequestBtn"),oldLabel=btn.textContent;btn.disabled=true;btn.textContent="Submitting…";
    try{
      await submitPublicPrintRequest({print_id:item.id,variant_id:variantId||"",filament_id:wantsMulticolor?"":(filamentId||""),color_mode:wantsMulticolor?"multi":"single",color_ids:colorIds,customer,contact,quantity:qty,notes:userNotes});
      $("requestPrintDialog").close();toast("Print request sent");return
    }catch(err){console.error("Public request failed",err);toast(err?.message||"Couldn't send the print request");return}
    finally{btn.disabled=false;btn.textContent=oldLabel}
  }

  const chosenColors=colorIds.map(id=>getFilament(id)).filter(Boolean);
  const colorDetail=wantsMulticolor
    ?`Multicolor: ${chosenColors.map(f=>f.color||f.material||"Color").join(" + ")}`
    :(filament?`Preferred filament: ${filament.color||filament.material||"Selected filament"}`:"Filament: No preference");
  const details=[variant?`Variant: ${variant.name}`:"Version: Standard",colorDetail,contact?`Contact: ${contact}`:"",userNotes?`Customer notes: ${userNotes}`:""].filter(Boolean).join("\n");
  const order={id:uid(),customer,status:"Requested",item:item.name,quantity:qty,quoted_price:estimate,due_date:"",print_id:item.id,notes:`Customer Store request\n${details}`,created_at:nowISO(),updated_at:nowISO()};
  orders.unshift(order);persist();$("requestPrintDialog").close();toast("Print request submitted");
  if(currentUser&&supabaseClient){(async()=>{try{await syncUpsert("orders",{...order,user_id:currentUser.id,print_id:order.print_id||null})}catch(err){console.error("Customer request sync failed",err);setSyncState("error","Request saved locally — cloud sync failed")}})()}
}

function normalizeCustomerPin(v){return String(v||"").replace(/\D/g,"").slice(0,8)}
function enterCustomerMode(){
  if(customerMode)return;
  const pin=normalizeCustomerPin(settings.customerModePin);
  if(pin.length<4){toast("Set a 4–8 digit Customer Mode PIN in Settings first");openSettings();setTimeout(()=>$("customerModePinInput")?.focus(),120);return}
  customerMode=true;customerStoreTab="products";closeMenu();currentView="shop";
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.dataset.view==="shop"));
  renderAll();window.scrollTo({top:0,behavior:"auto"});toast("Customer Store Mode locked");
}
function openCustomerUnlock(){if(!customerMode)return;$("customerUnlockPin").value="";$("customerUnlockDialog").showModal();setTimeout(()=>$("customerUnlockPin").focus(),100)}
function confirmCustomerUnlock(){
  const entered=normalizeCustomerPin($("customerUnlockPin").value),pin=normalizeCustomerPin(settings.customerModePin);
  if(!pin||entered!==pin){$("customerUnlockPin").value="";toast("Wrong owner PIN");return}
  $("customerUnlockDialog").close();customerMode=false;customerStoreTab="products";customerTitleTapCount=0;renderAll();toast("Admin mode unlocked");
}
function brandOwnerTap(){
  brandOwnerTapCount++;
  clearTimeout(brandOwnerTapTimer);
  brandOwnerTapTimer=setTimeout(()=>brandOwnerTapCount=0,1700);
  if(brandOwnerTapCount<5)return;

  brandOwnerTapCount=0;
  clearTimeout(brandOwnerTapTimer);

  if(publicVisitorMode){
    openOwnerLogin();
    return;
  }
  if(customerMode){
    openCustomerUnlock();
  }
}
function customerOwnerTap(){brandOwnerTap()}

function generateNotifications(){
  const notices=[];
  for(const x of restockSuggestions()){
    notices.push({id:`fil-${x.f.id}`,type:"warn",icon:"◉",title:`Restock ${x.f.color||x.f.material||"filament"}`,text:`${Math.round(x.f.remaining||0)}g remains${x.units!=null?`; about ${x.units} average prints left`:""}`});
  }
  for(const i of items){
    if(itemStock(i)<=0&&i.out_of_stock_behavior==="show")notices.push({id:`stock-${i.id}`,type:"danger",icon:"□",title:`${i.name} is out of stock`,text:"It is still visible in your store."});
  }
  for(const o of orders){
    if(["Paid","Cancelled"].includes(o.status)||!o.due_date)continue;const d=dateDiffDays(o.due_date);
    if(d<0)notices.push({id:`order-${o.id}-overdue`,type:"danger",icon:"!",title:`Order overdue: ${o.item}`,text:`Due ${o.due_date} · ${o.customer||"Customer"}`});
    else if(d===0)notices.push({id:`order-${o.id}-today`,type:"warn",icon:"!",title:`Order due today: ${o.item}`,text:o.customer||"Customer"});
    else if(d<=2)notices.push({id:`order-${o.id}-soon`,type:"warn",icon:"!",title:`Order due in ${d} day${d===1?"":"s"}`,text:`${o.item} · ${o.customer||"Customer"}`});
  }
  if(currentUser&&syncState==="error")notices.push({id:"sync-error",type:"danger",icon:"↻",title:"Cloud sync needs attention",text:syncMessage||"A recent cloud sync failed."});
  if(currentUser&&!navigator.onLine)notices.push({id:"offline",type:"info",icon:"↻",title:"You are offline",text:"Changes stay local until the connection returns."});
  return notices;
}
function renderNotificationsBadge(){
  const n=generateNotifications(),b=$("notificationBadge");b.textContent=n.length;b.classList.toggle("hidden",!n.length);maybeBrowserNotify(n)
}
function openNotifications(){
  const n=generateNotifications();$("notificationList").innerHTML=n.length?n.map(x=>`<div class="notice-card ${x.type}"><div class="notice-icon">${x.icon}</div><div><h4>${safe(x.title)}</h4><p>${safe(x.text)}</p></div></div>`).join(""):`<div class="empty-state"><h3>All clear</h3><p>Nothing needs your attention right now.</p></div>`;$("notificationsDialog").showModal()
}
function maybeBrowserNotify(){/* superseded by real Web Push in v4.2 */}

function isIOS(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
}
function isStandalonePWA(){
  return window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone===true;
}
function pushSupported(){
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
function urlBase64ToUint8Array(base64String){
  const padding="=".repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}
function pushFunctionUrl(){
  return `${String(settings.supabaseUrl||"").replace(/\/$/,"")}/functions/v1/push-notifications`;
}
async function getPushPublicKey(){
  if(!settings.supabaseUrl) throw new Error("Supabase URL is missing.");
  const headers={"Content-Type":"application/json"};
  if(settings.supabaseKey) headers.apikey=settings.supabaseKey;
  const res=await fetch(pushFunctionUrl(),{method:"GET",headers});
  let data={};try{data=await res.json()}catch{}
  if(!res.ok) throw new Error(data.error||`Push backend returned ${res.status}`);
  if(!data.publicKey) throw new Error("VAPID public key is not configured in Supabase.");
  return data.publicKey;
}
async function getCurrentPushSubscription(){
  if(!pushSupported())return null;
  const reg=await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
function deviceLabel(){
  if(isIOS())return isStandalonePWA()?"iPhone / iPad Home Screen":"iPhone / iPad";
  if(/Android/i.test(navigator.userAgent))return "Android";
  if(/Windows/i.test(navigator.userAgent))return "Windows";
  if(/Macintosh/i.test(navigator.userAgent))return "Mac";
  return "Web device";
}
async function savePushSubscription(subscription){
  if(!currentUser||!supabaseClient)throw new Error("Sign in to PrintBook first.");
  const row={
    user_id:currentUser.id,
    endpoint:subscription.endpoint,
    subscription:subscription.toJSON(),
    device_name:deviceLabel(),
    user_agent:navigator.userAgent,
    active:true,
    last_seen_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  };
  const {error}=await supabaseClient.from("push_subscriptions").upsert(row,{onConflict:"user_id,endpoint"});
  if(error)throw error;
}
async function resolveCurrentUser(){
  if(currentUser)return currentUser;
  if(!supabaseClient)return null;
  try{
    const {data}=await supabaseClient.auth.getSession();
    if(data?.session?.user){
      currentUser=data.session.user;
      updateCloudUI();
      return currentUser;
    }
  }catch(err){
    console.warn("Could not restore Supabase session",err);
  }
  return null;
}

async function refreshPushStatus(){
  const badge=$("pushStatusBadge"),title=$("pushStatusTitle"),text=$("pushStatusText");
  if(!badge||!title||!text)return;

  badge.className="badge";
  $("iosPushHelp").classList.add("hidden");
  $("testPushBtn").classList.add("hidden");
  $("disablePushBtn").classList.add("hidden");
  $("enableNotificationsBtn").disabled=false;
  $("enableNotificationsBtn").textContent="Enable Mobile Push";

  await resolveCurrentUser();

  if(!currentUser){
    badge.textContent="Sign in first";
    badge.classList.add("problem");
    title.textContent="Push needs your PrintBook account";
    text.textContent="Sign in under Cloud Sync first so this device can be linked to your account.";
    return;
  }

  if(!pushSupported()){
    badge.textContent="Unsupported";
    badge.classList.add("problem");
    title.textContent="Push isn't available in this browser";
    text.textContent=isIOS()
      ?"On iPhone, install PrintBook to the Home Screen and open it from the icon."
      :"This browser does not expose the Web Push APIs.";
    if(isIOS())$("iosPushHelp").classList.remove("hidden");
    return;
  }

  if(isIOS()&&!isStandalonePWA()){
    badge.textContent="Install app";
    badge.classList.add("problem");
    title.textContent="Add PrintBook to your iPhone Home Screen";
    text.textContent="Apple enables Web Push for installed Home Screen web apps. Open the installed icon, then enable notifications here.";
    $("iosPushHelp").classList.remove("hidden");
    return;
  }

  const permission=Notification.permission;
  let sub=null;
  try{
    sub=await getCurrentPushSubscription();
  }catch(err){
    console.warn("Could not inspect push subscription",err);
  }

  // iOS can grant notification permission before PushManager.subscribe finishes.
  // Treat those as two separate states instead of incorrectly saying notifications
  // are simply "not enabled".
  if(permission==="granted" && !sub){
    badge.textContent="Permission allowed";
    title.textContent="iPhone permission is on — finishing device registration";
    text.textContent="Notification permission is already granted, but this device still needs its Push subscription registered with PrintBook.";
    $("enableNotificationsBtn").textContent="Finish Push Setup";
    settings.pushEnabled=false;
    localStorage.setItem(K.settings,JSON.stringify(settings));
    return;
  }

  if(sub && permission==="granted"){
    // A real PushManager subscription is the source of truth. Re-register it in
    // Supabase if the browser has it but our database row was lost/stale.
    try{
      await savePushSubscription(sub);
      badge.textContent="Enabled";
      badge.classList.add("enabled");
      title.textContent="Mobile push is enabled on this device";
      text.textContent=`${deviceLabel()} is registered. PrintBook can receive background alerts when the site is closed.`;
      $("enableNotificationsBtn").textContent="Push Enabled";
      $("enableNotificationsBtn").disabled=true;
      $("testPushBtn").classList.remove("hidden");
      $("disablePushBtn").classList.remove("hidden");
      settings.pushEnabled=true;
      localStorage.setItem(K.settings,JSON.stringify(settings));
      return;
    }catch(err){
      console.error("Push subscription exists but cloud registration failed",err);
      badge.textContent="Needs repair";
      badge.classList.add("problem");
      title.textContent="iPhone notifications are allowed, but PrintBook registration failed";
      text.textContent="Tap Repair Push Registration. Your iPhone permission will stay enabled.";
      $("enableNotificationsBtn").textContent="Repair Push Registration";
      settings.pushEnabled=false;
      localStorage.setItem(K.settings,JSON.stringify(settings));
      return;
    }
  }

  badge.textContent=permission==="denied"?"Blocked":"Not enabled";
  if(permission==="denied")badge.classList.add("problem");
  title.textContent=permission==="denied"
    ?"Notifications are blocked for PrintBook"
    :"Push notifications are ready to set up";
  text.textContent=permission==="denied"
    ?"Allow notifications for PrintBook in your device settings, then return here."
    :"Tap Enable Mobile Push. Your browser will ask for notification permission.";
  $("enableNotificationsBtn").disabled=permission==="denied";
  settings.pushEnabled=false;
  localStorage.setItem(K.settings,JSON.stringify(settings));
}
async function enableBrowserNotifications(){
  try{
    await resolveCurrentUser();
    if(!currentUser)return toast("Sign in to Cloud Sync first");

    if(!pushSupported()){
      if(isIOS())$("iosPushHelp").classList.remove("hidden");
      return toast(isIOS()?"Add PrintBook to your Home Screen first":"This browser does not support Web Push");
    }

    if(isIOS()&&!isStandalonePWA()){
      $("iosPushHelp").classList.remove("hidden");
      return toast("Open PrintBook from its Home Screen icon first");
    }

    let permission=Notification.permission;
    if(permission==="default"){
      permission=await Notification.requestPermission();
    }

    if(permission!=="granted"){
      settings.pushEnabled=false;
      localStorage.setItem(K.settings,JSON.stringify(settings));
      await refreshPushStatus();
      return toast("Notification permission wasn't granted");
    }

    const reg=await navigator.serviceWorker.ready;

    // If permission is already granted (common after the iOS prompt), don't ask
    // again; just repair/create the actual Web Push subscription.
    let sub=await reg.pushManager.getSubscription();

    if(!sub){
      const publicKey=await getPushPublicKey();
      sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:urlBase64ToUint8Array(publicKey)
      });
    }

    if(!sub)throw new Error("iPhone allowed notifications, but no push subscription was created.");

    await savePushSubscription(sub);

    settings.pushEnabled=true;
    settings.browserNotifications=false;
    localStorage.setItem(K.settings,JSON.stringify(settings));

    await refreshPushStatus();
    toast("Mobile push is enabled");
  }catch(err){
    console.error("Enable/repair push failed",err);
    settings.pushEnabled=false;
    localStorage.setItem(K.settings,JSON.stringify(settings));
    await refreshPushStatus().catch(()=>{});
    toast(err?.message||"Couldn't finish push setup");
  }
}
async function disablePush(){
  try{
    const sub=await getCurrentPushSubscription();
    if(sub&&currentUser&&supabaseClient){
      await supabaseClient.from("push_subscriptions").delete().eq("user_id",currentUser.id).eq("endpoint",sub.endpoint);
    }
    if(sub)await sub.unsubscribe();
    settings.pushEnabled=false;persist();await refreshPushStatus();toast("Push disabled on this device");
  }catch(err){console.error(err);toast("Couldn't disable push")}
}
async function sendTestPush(){
  try{
    await resolveCurrentUser();
    if(!currentUser||!supabaseClient)return toast("Sign in first");
    const session=(await supabaseClient.auth.getSession()).data.session;
    if(!session?.access_token)return toast("Your session expired — sign in again");
    const res=await fetch(pushFunctionUrl(),{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${session.access_token}`,...(settings.supabaseKey?{apikey:settings.supabaseKey}:{})},
      body:JSON.stringify({action:"test"})
    });
    let data={};try{data=await res.json()}catch{}
    if(!res.ok)throw new Error(data.error||`Test failed (${res.status})`);
    toast(data.sent?`Test push sent to ${data.sent} device${data.sent===1?"":"s"}`:"No registered push device found");
  }catch(err){console.error(err);toast(err?.message||"Couldn't send test push")}
}

function openSettings(){
  $("supabaseUrlInput").value=settings.supabaseUrl||"";
  $("supabaseKeyInput").value=settings.supabaseKey||"";
  $("customerModePinInput").value=settings.customerModePin||"";
  renderPresets();updateCloudUI();
  $("settingsDialog").showModal();
  resolveCurrentUser().then(()=>refreshPushStatus()).catch(()=>refreshPushStatus().catch(()=>{}));
}
function saveSettings(){settings.supabaseUrl=$("supabaseUrlInput").value.trim();settings.supabaseKey=$("supabaseKeyInput").value.trim();settings.customerModePin=normalizeCustomerPin($("customerModePinInput").value);persist();setupSupabase();$("settingsDialog").close();toast("Settings saved")}

function dbPrint(i){return {id:i.id,user_id:currentUser.id,name:i.name,category:i.category,price:i.price,hours:i.hours||null,extra_cost:i.extra_cost||0,notes:i.notes,favorite:!!i.favorite,model_source:i.model_source||null,made_qty:i.made_qty||0,sold_qty:i.sold_qty||0,preset_id:i.preset_id||null,filament_usage:i.filament_usage||[],variants:i.variants||[],deal_qty:i.deal_qty||0,deal_price:i.deal_price||0,out_of_stock_behavior:i.out_of_stock_behavior||"show",multicolor_capable:!!i.multicolor_capable,photo_url:i.photo_url||null,created_at:i.created_at,updated_at:i.updated_at||nowISO()}}
async function syncUpsert(table,row){
  if(!supabaseClient||!currentUser)return; if(!navigator.onLine){setSyncState("offline","Offline — changes saved locally");return}
  setSyncState("syncing","Syncing…");const {error}=await supabaseClient.from(table).upsert(row);if(error){console.error(error);setSyncState("error",`Couldn't sync ${table}`);return false}setSyncState("synced","Synced",nowISO());return true
}
async function syncDelete(table,id){
  if(!supabaseClient||!currentUser)return;if(!navigator.onLine){setSyncState("offline","Offline — deletion not uploaded");return false}
  setSyncState("syncing","Syncing…");const {error}=await supabaseClient.from(table).delete().eq("id",id).eq("user_id",currentUser.id);if(error){console.error(error);setSyncState("error",`Couldn't delete ${table}`);return false}setSyncState("synced","Synced",nowISO());return true
}
async function setupSupabase(){
  if(!settings.supabaseUrl||!settings.supabaseKey||!window.supabase){
    supabaseClient=null;currentUser=null;stopRealtime();setSyncState("local","Public storefront");updateCloudUI();
    await activatePublicVisitorMode();return
  }
  try{
    supabaseClient=window.supabase.createClient(settings.supabaseUrl,settings.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true}});
    const {data:sessionData}=await supabaseClient.auth.getSession();
    currentUser=sessionData?.session?.user||null;
    if(currentUser)deactivatePublicVisitorMode();
    updateCloudUI();
    supabaseClient.auth.onAuthStateChange((event,session)=>{
      currentUser=session?.user||null;updateCloudUI();
      if(currentUser){deactivatePublicVisitorMode();customerMode=false;startRealtime();setTimeout(()=>pullCloud(false),50)}
      else{stopRealtime();setTimeout(()=>activatePublicVisitorMode(),0)}
      setTimeout(()=>refreshPushStatus().catch(()=>{}),0);
    });
    if(currentUser){deactivatePublicVisitorMode();customerMode=false;startRealtime();await pullCloud(false)}
    else{setSyncState("local","Public storefront");await activatePublicVisitorMode()}
  }catch(e){console.error(e);currentUser=null;setSyncState("error","Supabase setup failed");updateCloudUI()}
}
function updateCloudUI(){
  const c=!!currentUser;$("cloudStatus").textContent=c?"Connected":"Not connected";$("authFields").classList.toggle("hidden",c);$("signedInBox").classList.toggle("hidden",!c);$("signedInEmail").textContent=currentUser?.email||"";
  if(!c&&syncState!=="error")setSyncState("local",settings.supabaseUrl?"Ready to sign in":"Local only")
}
async function signIn(){
  settings.supabaseUrl=$("supabaseUrlInput").value.trim();settings.supabaseKey=$("supabaseKeyInput").value.trim();localStorage.setItem(K.settings,JSON.stringify(settings));await setupSupabase();if(!supabaseClient)return toast("Add Supabase URL and key first");
  setSyncState("syncing","Signing in…");const {data,error}=await supabaseClient.auth.signInWithPassword({email:$("emailInput").value.trim(),password:$("passwordInput").value});if(error){setSyncState("error",error.message);return toast(error.message)}currentUser=data.user;updateCloudUI();startRealtime();await pullCloud(false);toast("Signed in")
}
async function signUp(){
  settings.supabaseUrl=$("supabaseUrlInput").value.trim();settings.supabaseKey=$("supabaseKeyInput").value.trim();localStorage.setItem(K.settings,JSON.stringify(settings));await setupSupabase();if(!supabaseClient)return toast("Add Supabase URL and key first");
  const {error}=await supabaseClient.auth.signUp({email:$("emailInput").value.trim(),password:$("passwordInput").value});if(error)return toast(error.message);toast("Account created — check email if required")
}
async function signOut(){if(supabaseClient)await supabaseClient.auth.signOut();currentUser=null;stopRealtime();setSyncState("local","Public storefront");updateCloudUI();await activatePublicVisitorMode();toast("Signed out")}
async function pushLocal(){
  if(!currentUser)return;setSyncState("syncing","Uploading local data…");
  for(const i of items)await syncUpsert("prints",dbPrint(i));
  for(const f of filaments)await syncUpsert("filaments",{...f,user_id:currentUser.id});
  for(const s of sales)await syncUpsert("sales",{...s,user_id:currentUser.id});
  for(const o of orders)await syncUpsert("orders",{...o,user_id:currentUser.id,print_id:o.print_id||null});
  for(const c of colorways)await syncUpsert("colorways",{...c,user_id:currentUser.id});
  setSyncState("synced","Synced",nowISO());toast("Local data uploaded");await pullCloud(false)
}
function rowTime(row){
  const raw=row?.updated_at||row?.created_at||"";
  const t=Date.parse(raw);
  return Number.isFinite(t)?t:0;
}
function mergeCloudCollection(localRows,remoteRows,{normalize=x=>x,preferLocalIds=null}={}){
  // Never replace the whole local list with a cloud snapshot.
  // A realtime pull can arrive before a newly-created product finishes uploading.
  // Merge by id instead so local-only/newer rows survive.
  const merged=new Map();

  for(const raw of localRows||[]){
    const row=normalize(raw);
    if(row?.id)merged.set(row.id,row);
  }

  for(const raw of remoteRows||[]){
    const remote=normalize(raw);
    if(!remote?.id)continue;

    const local=merged.get(remote.id);
    if(!local){
      merged.set(remote.id,remote);
      continue;
    }

    if(preferLocalIds?.has(remote.id)){
      continue;
    }

    const localTime=rowTime(local);
    const remoteTime=rowTime(remote);

    // Equal timestamps favor local to prevent a same-moment cloud snapshot
    // from stripping recently-entered local fields.
    if(remoteTime>localTime){
      merged.set(remote.id,remote);
    }
  }

  return [...merged.values()].sort((a,b)=>rowTime(b)-rowTime(a));
}

async function pullCloud(showToast=true){
  if(!currentUser||!supabaseClient)return;if(!navigator.onLine){setSyncState("offline","Offline — using local data");return}
  setSyncState("syncing","Syncing…");
  const [pr,fi,sa,or,cw]=await Promise.all([
    supabaseClient.from("prints").select("*").eq("user_id",currentUser.id),
    supabaseClient.from("filaments").select("*").eq("user_id",currentUser.id),
    supabaseClient.from("sales").select("*").eq("user_id",currentUser.id),
    supabaseClient.from("orders").select("*").eq("user_id",currentUser.id),
    supabaseClient.from("colorways").select("*").eq("user_id",currentUser.id)
  ]);
  const errs=[pr,fi,sa,or,cw].map(x=>x.error).filter(Boolean);if(errs.length){console.error(errs);setSyncState("error","Cloud sync failed — run the v4 SQL migration");return toast("Sync failed — database may need the v4 SQL update")}
  const remoteHasData=[pr.data,fi.data,sa.data,or.data,cw.data].some(a=>a&&a.length);
  const localHasData=[items,filaments,sales,orders,colorways].some(a=>a&&a.length);
  if(!remoteHasData&&localHasData){setSyncState("synced","Cloud empty — upload local data",nowISO());if(showToast)toast("Cloud is empty — use Upload local data");return}
  const remoteItems=(pr.data||[]).map(({user_id,...x})=>({...x,multicolor_capable:!!x.multicolor_capable,variants:x.variants||[],filament_usage:x.filament_usage||[]}));
  const remoteFilaments=(fi.data||[]).map(({user_id,...x})=>x);
  const remoteSales=(sa.data||[]).map(({user_id,...x})=>x);
  const remoteOrders=(or.data||[]).map(({user_id,...x})=>({...x,print_id:x.print_id||""}));
  const remoteColorways=(cw.data||[]).map(({user_id,...x})=>x);

  items=mergeCloudCollection(items,remoteItems,{
    normalize:x=>({...x,multicolor_capable:!!x.multicolor_capable,variants:x.variants||[],filament_usage:x.filament_usage||[]}),
    preferLocalIds:pendingLocalProductIds
  });
  filaments=mergeCloudCollection(filaments,remoteFilaments);
  sales=mergeCloudCollection(sales,remoteSales);
  orders=mergeCloudCollection(orders,remoteOrders,{normalize:x=>({...x,print_id:x.print_id||""})});
  colorways=mergeCloudCollection(colorways,remoteColorways);

  persist();setSyncState("synced","Synced",nowISO());if(showToast)toast("Synced")
}
async function refreshOrdersFromCloud({showToast=false}={}){
  if(!supabaseClient||!currentUser||publicVisitorMode)return false;
  try{
    const {data,error}=await supabaseClient
      .from("orders")
      .select("*")
      .eq("user_id",currentUser.id)
      .order("created_at",{ascending:false});
    if(error)throw error;

    const beforeIds=new Set(orders.map(o=>o.id));
    const remote=(data||[]).map(({user_id,...x})=>({...x,print_id:x.print_id||""}));
    orders=mergeCloudCollection(orders,remote,{normalize:x=>({...x,print_id:x.print_id||""})});
    persist();

    const newRequested=orders.filter(o=>!beforeIds.has(o.id)&&String(o.status||"").toLowerCase()==="requested");
    if(newRequested.length){
      renderAll();
      toast(newRequested.length===1
        ?`New print request from ${newRequested[0].customer||"customer"}`
        :`${newRequested.length} new print requests`);
    }else if(showToast){
      toast("Requests refreshed");
    }
    return true;
  }catch(err){
    console.warn("Could not refresh print requests",err);
    if(showToast)toast("Couldn't refresh requests");
    return false;
  }
}
function startPublicRequestRefresh(){
  stopPublicRequestRefresh();
  if(!currentUser||publicVisitorMode)return;
  publicRequestRefreshTimer=setInterval(()=>{
    if(document.visibilityState==="visible")refreshOrdersFromCloud().catch(()=>{});
  },15000);
}
function stopPublicRequestRefresh(){
  if(publicRequestRefreshTimer)clearInterval(publicRequestRefreshTimer);
  publicRequestRefreshTimer=null;
}

function startRealtime(){
  if(!supabaseClient||!currentUser)return;stopRealtime();
  startPublicRequestRefresh();
  realtimeChannel=supabaseClient.channel(`printbook-${currentUser.id}`);
  for(const table of ["prints","filaments","sales","orders","colorways"]){
    realtimeChannel.on("postgres_changes",{event:"*",schema:"public",table,filter:`user_id=eq.${currentUser.id}`},()=>{
      clearTimeout(realtimeTimer);
      realtimeTimer=setTimeout(()=>{
        if(table==="orders")refreshOrdersFromCloud().catch(()=>{});
        else pullCloud(false)
      },250)
    })
  }
  realtimeChannel.subscribe()
}
function stopRealtime(){
  stopPublicRequestRefresh();
  if(realtimeChannel&&supabaseClient)supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel=null
}


function setAppUpdateUI(ready,message=""){
  appUpdateReady=!!ready;
  const banner=$("appUpdateBanner");
  if(banner)banner.classList.toggle("hidden",!ready);
  if($("applyAppUpdateSettingsBtn"))$("applyAppUpdateSettingsBtn").classList.toggle("hidden",!ready);
  if($("appVersionBadge")){
    $("appVersionBadge").textContent=ready?"Update ready":"Current";
    $("appVersionBadge").classList.toggle("enabled",ready);
  }
  if($("appUpdateStatusText")){
    $("appUpdateStatusText").textContent=message||(ready
      ?"A new version is ready. Updating will reload PrintBook without clearing your login or local data."
      :"PrintBook is up to date.");
  }
}
function rememberWaitingWorker(reg){
  const worker=reg?.waiting;
  if(!worker)return false;
  waitingServiceWorker=worker;
  setAppUpdateUI(true,"A new PrintBook version is ready to install.");
  return true;
}
function watchServiceWorkerRegistration(reg){
  if(!reg)return;
  if(rememberWaitingWorker(reg))return;

  reg.addEventListener("updatefound",()=>{
    const worker=reg.installing;
    if(!worker)return;
    worker.addEventListener("statechange",()=>{
      if(worker.state==="installed"&&navigator.serviceWorker.controller){
        waitingServiceWorker=reg.waiting||worker;
        setAppUpdateUI(true,"A new PrintBook version finished downloading.");
      }
    });
  });
}
async function checkForAppUpdate(showToast=true){
  if(!("serviceWorker" in navigator)){
    if(showToast)toast("App updates aren't supported in this browser");
    return false;
  }
  try{
    const reg=await navigator.serviceWorker.getRegistration();
    if(!reg){
      if(showToast)toast("PrintBook service worker isn't installed yet");
      return false;
    }
    setAppUpdateUI(false,"Checking GitHub Pages for a new version…");
    await reg.update();
    watchServiceWorkerRegistration(reg);
    if(reg.waiting||waitingServiceWorker){
      rememberWaitingWorker(reg);
      if(showToast)toast("Update ready");
      return true;
    }
    // Give a newly-found worker a short moment to install.
    await new Promise(r=>setTimeout(r,700));
    if(reg.waiting||waitingServiceWorker){
      rememberWaitingWorker(reg);
      if(showToast)toast("Update ready");
      return true;
    }
    setAppUpdateUI(false,"PrintBook is up to date.");
    if(showToast)toast("You're on the latest version");
    return false;
  }catch(err){
    console.error("Update check failed",err);
    if($("appUpdateStatusText"))$("appUpdateStatusText").textContent="Couldn't check for updates right now.";
    if(showToast)toast("Couldn't check for updates");
    return false;
  }
}
async function applyAppUpdate(){
  if(updateReloadArmed)return;
  updateReloadArmed=true;
  try{
    const reg=await navigator.serviceWorker.getRegistration();
    waitingServiceWorker=waitingServiceWorker||reg?.waiting||null;
    if(!waitingServiceWorker){
      updateReloadArmed=false;
      const found=await checkForAppUpdate(false);
      if(!found){
        toast("No update is waiting");
        return;
      }
    }
    if($("applyAppUpdateBtn")){
      $("applyAppUpdateBtn").disabled=true;
      $("applyAppUpdateBtn").textContent="Restarting…";
    }
    if($("applyAppUpdateSettingsBtn")){
      $("applyAppUpdateSettingsBtn").disabled=true;
      $("applyAppUpdateSettingsBtn").textContent="Restarting…";
    }

    // localStorage / IndexedDB / Supabase auth are intentionally untouched.
    // Only activate the already-downloaded worker, then reload once.
    waitingServiceWorker.postMessage({type:"SKIP_WAITING"});
  }catch(err){
    console.error("Apply update failed",err);
    updateReloadArmed=false;
    toast("Couldn't apply the update");
  }
}
async function initAppUpdateFlow(){
  if(!("serviceWorker" in navigator))return;
  try{
    const reg=await navigator.serviceWorker.ready;
    watchServiceWorkerRegistration(reg);
    rememberWaitingWorker(reg);
    // Always ask the browser to check once at launch. This does not clear auth/data.
    reg.update().catch(()=>{});
  }catch(err){
    console.warn("Update flow init failed",err);
  }
}
navigator.serviceWorker?.addEventListener("controllerchange",()=>{
  if(!updateReloadArmed)return;
  // New worker owns the page. Reload exactly once into the new version.
  window.location.reload();
});

function exportData(){const payload={version:4,exported_at:nowISO(),settings:{...settings,supabaseKey:""},presets,filaments,colorways,items,sales,orders};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="printbook-v4-backup.json";a.click();URL.revokeObjectURL(a.href)}
async function importData(e){const f=e.target.files[0];if(!f)return;try{const d=JSON.parse(await f.text());if(d.items)items=d.items;if(d.filaments)filaments=d.filaments;if(d.colorways)colorways=d.colorways;if(d.sales)sales=d.sales;if(d.orders)orders=d.orders;if(d.presets)presets=d.presets;if(d.settings)settings={...settings,...d.settings,supabaseKey:settings.supabaseKey};persist();toast("Backup imported")}catch{toast("Invalid backup")}}

document.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>showView(b.dataset.nav));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>showView(b.dataset.go));
$("menuBtn").onclick=openMenu;$("mobileMenuBtn").onclick=openMenu;$("closeMenuBtn").onclick=closeMenu;$("drawerBackdrop").onclick=closeMenu;
$("drawerBackdrop").addEventListener("touchmove",e=>e.preventDefault(),{passive:false});
$("sideDrawer").addEventListener("touchmove",e=>e.stopPropagation(),{passive:true});
$("drawerPriceBtn").onclick=()=>{closeMenu();openPriceHelper()};$("drawerSalesBtn").onclick=()=>{closeMenu();openSalesHistory()};$("drawerSettingsBtn").onclick=()=>{closeMenu();openSettings()};$("drawerCustomerBtn").onclick=enterCustomerMode;$("drawerNotificationsBtn").onclick=()=>{closeMenu();openNotifications()};
$("dashboardAddBtn").onclick=$("addBtn").onclick=$("mobileAddBtn").onclick=$("shopAddBtn").onclick=()=>openEditor();$("dashboardPriceBtn").onclick=$("helpPriceBtn").onclick=openPriceHelper;$("customerModeBtn").onclick=enterCustomerMode;
$("notificationBtn").onclick=openNotifications;$("closeNotifications").onclick=()=>$("notificationsDialog").close();$("openNotificationsFromSettingsBtn").onclick=openNotifications;$("enableNotificationsBtn").onclick=enableBrowserNotifications;$("testPushBtn").onclick=sendTestPush;$("disablePushBtn").onclick=disablePush;
$("settingsBtn").onclick=openSettings;$("syncBtn").onclick=()=>pullCloud(true);
$("applyAppUpdateBtn").onclick=applyAppUpdate;
$("checkForUpdateBtn").onclick=()=>checkForAppUpdate(true);
$("applyAppUpdateSettingsBtn").onclick=applyAppUpdate;
$("retryPublicStoreBtn").onclick=()=>loadPublicStorefront(true);
$("copyStoreDiagBtn").onclick=async()=>{
  try{
    await navigator.clipboard.writeText(publicStoreLastDiagnostic||"No diagnostics captured.");
    toast("Store diagnostics copied");
  }catch{
    toast(publicStoreLastDiagnostic||"No diagnostics captured.")
  }
};
$("shopSearch").oninput=renderShop;$("shopCategoryFilter").onchange=renderShop;$("search").oninput=renderPrints;$("categoryFilter").onchange=renderPrints;$("stockFilter").onchange=renderPrints;
$("closeCustomerProduct").onclick=()=>$("customerProductDialog").close();
$("requestPrintBtn").onclick=openRequestPrint;
$("closeRequestPrint").onclick=()=>$("requestPrintDialog").close();
$("requestVariant").onchange=()=>{updateRequestEstimate();updateRequestColorMode()};
$("requestColorMode").onchange=updateRequestColorMode;
$("requestQty").oninput=updateRequestEstimate;
$("submitPrintRequestBtn").onclick=submitPrintRequest;
if($("refreshRequestsBtn"))$("refreshRequestsBtn").onclick=()=>refreshOrdersFromCloud({showToast:true});
document.querySelectorAll("[data-customer-tab]").forEach(b=>b.onclick=()=>setCustomerStoreTab(b.dataset.customerTab));
$("closeCustomerUnlock").onclick=()=>$("customerUnlockDialog").close();
$("confirmCustomerUnlock").onclick=confirmCustomerUnlock;
$("customerUnlockPin").addEventListener("keydown",e=>{if(e.key==="Enter")confirmCustomerUnlock()});
$("brandOwnerTrigger").addEventListener("click",brandOwnerTap);
$("brandOwnerTrigger").addEventListener("dblclick",e=>e.preventDefault());
$("brandOwnerTrigger").addEventListener("selectstart",e=>e.preventDefault());
$("closeOwnerLogin").onclick=()=>$("ownerLoginDialog").close();
$("ownerLoginBtn").onclick=ownerLogin;
$("ownerLoginPassword").addEventListener("keydown",e=>{if(e.key==="Enter")ownerLogin()});
$("closeEditor").onclick=()=>{savePrintInFlight=false;$("savePrintBtn").disabled=false;$("savePrintBtn").textContent="Save print";$("editorDialog").close()};$("savePrintBtn").onclick=savePrint;$("deleteBtn").onclick=deletePrint;$("favoriteToggle").onclick=()=>{editorFavorite=!editorFavorite;updateFavoriteButton()};$("modelSourceInput").oninput=updateModelLink;$("addPrintFilamentBtn").onclick=()=>addUsageRow("printFilamentRows");$("addVariantBtn").onclick=()=>addVariantRow();
["hoursInput","extraCostInput","priceInput","madeInput","soldInput","presetInput","dealQtyInput","dealPriceInput"].forEach(id=>$(id).oninput=updatePricingPreviews);
$("recordSaleFromPrintBtn").onclick=()=>{const id=editingId;$("editorDialog").close();openSale(id)};$("makePrintBtn").onclick=()=>{const id=editingId;$("editorDialog").close();openMake(id)};
$("closeMake").onclick=()=>$("makeDialog").close();$("makeVariant").onchange=updateMakeCheck;$("makeQty").oninput=updateMakeCheck;$("confirmMakeBtn").onclick=confirmMake;
$("addFilamentBtn").onclick=()=>openFilament();$("closeFilament").onclick=()=>$("filamentDialog").close();$("saveFilamentBtn").onclick=saveFilament;$("deleteFilamentBtn").onclick=deleteFilament;["filSpoolSize","filPrice","filRemainingInput"].forEach(id=>$(id).oninput=updateFilamentPreview);$("filVisualColor").oninput=()=>{$("filVisualHex").value=$("filVisualColor").value};$("filVisualHex").oninput=()=>{const v=$("filVisualHex").value.trim();if(/^#[0-9a-fA-F]{6}$/.test(v))$("filVisualColor").value=v};
$("addColorwayBtn").onclick=()=>openColorway();$("closeColorway").onclick=()=>$("colorwayDialog").close();$("addColorwayFilamentBtn").onclick=()=>addUsageRow("colorwayFilamentRows");$("saveColorwayBtn").onclick=saveColorway;$("deleteColorwayBtn").onclick=deleteColorway;
$("openSalesBtn").onclick=openSalesHistory;$("closeSalesHistory").onclick=()=>$("salesHistoryDialog").close();$("closeSale").onclick=()=>$("saleDialog").close();$("salePrint").onchange=()=>{populateSaleVariants();syncSalePrice()};$("saleVariant").onchange=syncSalePrice;$("saleQty").oninput=()=>{autoDeal();updateSalePreview()};["salePrice","saleDiscountValue"].forEach(id=>$(id).oninput=updateSalePreview);$("saleDiscountType").onchange=updateSalePreview;$("saveSaleBtn").onclick=saveSale;
$("addOrderBtn").onclick=()=>openOrder();$("closeOrder").onclick=()=>$("orderDialog").close();$("saveOrderBtn").onclick=saveOrder;$("deleteOrderBtn").onclick=deleteOrder;document.querySelectorAll("#orderFilter button").forEach(b=>b.onclick=()=>{document.querySelectorAll("#orderFilter button").forEach(x=>x.classList.remove("active"));b.classList.add("active");orderStatusFilter=b.dataset.status;renderOrders()});
$("closePriceHelper").onclick=()=>$("priceHelperDialog").close();$("hpAddFilament").onclick=()=>addUsageRow("hpFilamentRows");["hpHours","hpExtra","hpComplexity","hpPreset"].forEach(id=>$(id).oninput=updateHelperPreview);$("hpUsePriceBtn").onclick=helperToPrint;
$("closeSettings").onclick=()=>$("settingsDialog").close();$("saveSettingsBtn").onclick=saveSettings;$("addPresetBtn").onclick=()=>openPreset();$("closePreset").onclick=()=>$("presetDialog").close();$("savePresetBtn").onclick=savePreset;$("deletePresetBtn").onclick=deletePreset;$("signInBtn").onclick=signIn;$("signUpBtn").onclick=signUp;$("signOutBtn").onclick=signOut;$("pushLocalBtn").onclick=pushLocal;$("exportBtn").onclick=exportData;$("importInput").onchange=importData;
window.addEventListener("online",()=>{if(currentUser)pullCloud(false);else setSyncState("local","Back online")});window.addEventListener("offline",()=>setSyncState("offline","Offline — changes saved locally"));
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible"){
    refreshPushStatus().catch(()=>{});
    refreshOrdersFromCloud().catch(()=>{});
  }
});
window.addEventListener("load",()=>{if("serviceWorker" in navigator)navigator.serviceWorker.ready.then(()=>refreshPushStatus().catch(()=>{})).catch(()=>{})});
// Defensive recovery from older installed builds that may have left the
// body fixed/offset. This runs before normal interaction and on page restore.
clearLegacyMenuLock();
window.addEventListener("pageshow",()=>clearLegacyMenuLock());
window.addEventListener("orientationchange",()=>setTimeout(clearLegacyMenuLock,80));

document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&$("sideDrawer").classList.contains("open")) closeMenu();
});
if("serviceWorker" in navigator)window.addEventListener("load",async()=>{
  try{
    const reg=await navigator.serviceWorker.register("sw.js");
    watchServiceWorkerRegistration(reg);
    rememberWaitingWorker(reg);
    initAppUpdateFlow();
  }catch(err){console.warn("Service worker registration failed",err)}
});
populatePresetSelects();renderAll();setupSupabase();showView("shop");
