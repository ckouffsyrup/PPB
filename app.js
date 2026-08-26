const K={
 items:"printbook_items_v3", settings:"printbook_settings_v3", filaments:"printbook_filaments_v3",
 sales:"printbook_sales_v3", orders:"printbook_orders_v3", presets:"printbook_presets_v3"
};
const uid=()=>crypto.randomUUID();
const TODAY=()=>new Date().toISOString().slice(0,10);
const money=v=>"$"+Number(v||0).toFixed(2).replace(".00","");
const safe=s=>String(s??"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const $=id=>document.getElementById(id);

const defaultPresets=[
 {id:"normal",name:"Normal",machineRate:2,markup:1.5,minimum:8,roundTo:1},
 {id:"friend",name:"Friend",machineRate:1.5,markup:1.25,minimum:6,roundTo:1},
 {id:"event",name:"Event / Market",machineRate:2.5,markup:1.7,minimum:10,roundTo:1},
 {id:"bulk",name:"Bulk",machineRate:1.5,markup:1.25,minimum:7,roundTo:.5}
];
const defaultSettings={supabaseUrl:"",supabaseKey:"",defaultPresetId:"normal"};
let settings={...defaultSettings,...JSON.parse(localStorage.getItem(K.settings)||"{}")};
let presets=JSON.parse(localStorage.getItem(K.presets)||"null")||defaultPresets;
let filaments=JSON.parse(localStorage.getItem(K.filaments)||"null")||[];
let sales=JSON.parse(localStorage.getItem(K.sales)||"null")||[];
let orders=JSON.parse(localStorage.getItem(K.orders)||"null")||[];

const firstItem={
 id:uid(),name:"Small multicolor articulated figure",category:"Figures",price:10,hours:2,extra_cost:0,
 notes:"Multicolor, no painting. Suggested range: $8–$10. $10 is a good starting price; 2 for $18 could work well.",
 photo_url:"assets/first-print.jpeg",favorite:true,model_source:"",made_qty:1,sold_qty:0,preset_id:"normal",
 filament_usage:[],created_at:new Date().toISOString()
};
let items=JSON.parse(localStorage.getItem(K.items)||"null")||[firstItem];

let editingId=null, editingFilamentId=null, editingOrderId=null, editingPresetId=null;
let pendingPhotoFile=null,pendingPhotoData="",editorFavorite=false;
let currentView="dashboard",orderStatusFilter="";
let supabaseClient=null,currentUser=null;

function persist(){
 localStorage.setItem(K.items,JSON.stringify(items));
 localStorage.setItem(K.filaments,JSON.stringify(filaments));
 localStorage.setItem(K.sales,JSON.stringify(sales));
 localStorage.setItem(K.orders,JSON.stringify(orders));
 localStorage.setItem(K.presets,JSON.stringify(presets));
 localStorage.setItem(K.settings,JSON.stringify(settings));
 renderAll();
}
function toast(msg){const e=$("toast");e.textContent=msg;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2200)}
function getPreset(id){return presets.find(p=>p.id===id)||presets[0]||defaultPresets[0]}
function roundUp(v,step){step=Number(step)||1;return Math.ceil(v/step)*step}
function filamentCost(id,grams){
 const f=filaments.find(x=>x.id===id); if(!f)return 0;
 return (Number(f.purchase_price)||0)/(Number(f.spool_size)||1000)*(Number(grams)||0)
}
function usageCost(usage=[]){return usage.reduce((a,u)=>a+filamentCost(u.filament_id,u.grams),0)}
function itemMaterialCost(item){return usageCost(item.filament_usage||[])+(Number(item.extra_cost)||0)}
function suggestedPrice(hours,material,presetId,complexity=1){
 const p=getPreset(presetId); const raw=(Number(material||0)+Number(hours||0)*Number(p.machineRate||0))*Number(p.markup||1)*Number(complexity||1);
 return roundUp(Math.max(raw,Number(p.minimum)||0),Number(p.roundTo)||1)
}
function itemStock(i){return Math.max(0,(Number(i.made_qty)||0)-(Number(i.sold_qty)||0))}
function saleProfit(s){
 const item=items.find(i=>i.id===s.print_id); const cost=item?itemMaterialCost(item):Number(s.unit_cost||0);
 return (Number(s.unit_price)||0)*Number(s.quantity||0)-cost*Number(s.quantity||0)
}
function showView(name){
 currentView=name;document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.dataset.view===name));
 document.querySelectorAll("[data-nav]").forEach(b=>b.classList.toggle("active",b.dataset.nav===name));
 window.scrollTo({top:0,behavior:"smooth"});renderAll()
}
document.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>showView(b.dataset.nav));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>showView(b.dataset.go));

function renderAll(){renderDashboard();renderPrints();renderFilaments();renderOrders();renderPresets();populatePrintSelects();populatePresetSelects()}
function renderDashboard(){
 const revenue=sales.reduce((a,s)=>a+Number(s.unit_price||0)*Number(s.quantity||0),0);
 const profit=sales.reduce((a,s)=>a+saleProfit(s),0);
 const stock=items.reduce((a,i)=>a+itemStock(i),0);
 const open=orders.filter(o=>!["Paid","Cancelled"].includes(o.status));
 $("dashRevenue").textContent=money(revenue);$("dashSalesCount").textContent=`${sales.length} sale${sales.length===1?"":"s"}`;
 $("dashProfit").textContent=money(profit);$("dashStock").textContent=stock;$("dashPrintTypes").textContent=`${items.length} print types`;
 $("dashOrders").textContent=open.length;$("dashOrderValue").textContent=`${money(open.reduce((a,o)=>a+Number(o.quoted_price||0),0))} quoted`;
 const fav=items.filter(i=>i.favorite).slice(0,5);
 $("favoriteList").innerHTML=fav.length?fav.map(i=>miniRow(i.name,`${itemStock(i)} in stock`,money(i.price))).join(""):emptyMini("No favorites yet");
 const rs=[...sales].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5);
 $("recentSales").innerHTML=rs.length?rs.map(s=>{const i=items.find(x=>x.id===s.print_id);return miniRow(i?.name||"Deleted print",`${s.quantity} sold · ${s.date}`,money(Number(s.unit_price)*Number(s.quantity)))}).join(""):emptyMini("No sales recorded");
 const low=filaments.filter(f=>Number(f.remaining)<=Math.max(100,Number(f.spool_size)*.15)).sort((a,b)=>Number(a.remaining)-Number(b.remaining)).slice(0,5);
 $("lowFilamentList").innerHTML=low.length?low.map(f=>miniRow(`${f.brand||""} ${f.color||f.material}`.trim(),`${f.remaining||0}g left`,`${Math.round((Number(f.remaining)||0)/(Number(f.spool_size)||1000)*100)}%`)).join(""):emptyMini("Nothing running low");
 $("activeOrderList").innerHTML=open.slice(0,5).map(o=>miniRow(o.item||"Custom order",`${o.customer||"Customer"} · ${o.status}`,money(o.quoted_price))).join("")||emptyMini("No active orders");
}
function miniRow(title,sub,right){return `<div class="mini-row"><div class="left"><strong>${safe(title)}</strong><small>${safe(sub)}</small></div><div class="mini-price">${safe(right)}</div></div>`}
function emptyMini(t){return `<div class="mini-row"><div class="left"><small>${safe(t)}</small></div></div>`}

function renderPrints(){
 const q=$("search").value.trim().toLowerCase(),cat=$("categoryFilter").value,sf=$("stockFilter").value;
 const filtered=items.filter(i=>{
  const hay=[i.name,i.category,i.notes,i.model_source].join(" ").toLowerCase();if(!hay.includes(q)|| (cat&&i.category!==cat))return false;
  if(sf==="in"&&itemStock(i)<=0)return false;if(sf==="out"&&itemStock(i)>0)return false;if(sf==="fav"&&!i.favorite)return false;return true
 });
 $("printGrid").innerHTML=filtered.map(i=>{
  const mat=itemMaterialCost(i),stock=itemStock(i);
  return `<article class="print-card" onclick="openEditor('${i.id}')"><div class="card-photo">${i.photo_url?`<img src="${safe(i.photo_url)}">`:`<div class="photo-fallback">◌</div>`}${i.favorite?`<div class="fav-chip">★</div>`:""}<div class="stock-chip">${stock} in stock</div><div class="price-chip">${money(i.price)}</div></div><div class="card-body"><h4>${safe(i.name)}</h4><div class="card-sub">${safe(i.category||"Uncategorized")} · ${safe((i.filament_usage||[]).length?`${i.filament_usage.length} filament${i.filament_usage.length===1?"":"s"}`:"No filament data")}</div><div class="card-meta"><div><span>PRINT</span><strong>${i.hours?i.hours+" hr":"—"}</strong></div><div><span>MATERIAL</span><strong>${money(mat)}</strong></div><div><span>PROFIT</span><strong>${money(Number(i.price)-mat)}</strong></div></div></div></article>`
 }).join("");
 $("emptyState").classList.toggle("hidden",!!filtered.length);
 const cats=[...new Set(items.map(i=>i.category).filter(Boolean))].sort(),cur=$("categoryFilter").value;
 $("categoryFilter").innerHTML=`<option value="">All categories</option>`+cats.map(c=>`<option ${c===cur?"selected":""}>${safe(c)}</option>`).join("");
 $("modeBadge").textContent=currentUser?"Cloud synced":"Local";
}
function renderFilaments(){
 $("filamentCount").textContent=filaments.length;
 const rem=filaments.reduce((a,f)=>a+Number(f.remaining||0),0);$("filamentRemaining").textContent=Math.round(rem)+"g";
 const val=filaments.reduce((a,f)=>a+filamentCost(f.id,f.remaining),0);$("filamentValue").textContent=money(val);
 $("filamentGrid").innerHTML=filaments.map(f=>{
  const pct=Math.max(0,Math.min(100,Number(f.remaining||0)/Number(f.spool_size||1000)*100));
  return `<article class="filament-card" onclick="openFilament('${f.id}')"><div class="filament-top"><div><strong>${safe(f.brand||"Filament")} · ${safe(f.color||"Unknown color")}</strong><small>${safe(f.material||"Material")}</small></div><div class="filament-color">◉</div></div><div class="progress"><span style="width:${pct}%"></span></div><div class="card-meta"><div><span>LEFT</span><strong>${Math.round(Number(f.remaining||0))}g</strong></div><div><span>COST/G</span><strong>${money(filamentCost(f.id,1))}</strong></div><div><span>VALUE</span><strong>${money(filamentCost(f.id,f.remaining))}</strong></div></div></article>`
 }).join("");
 $("filamentEmpty").classList.toggle("hidden",!!filaments.length)
}
function renderOrders(){
 const list=orders.filter(o=>!orderStatusFilter||o.status===orderStatusFilter).sort((a,b)=>String(a.due_date||"9999").localeCompare(String(b.due_date||"9999")));
 $("orderList").innerHTML=list.map(o=>`<article class="order-card" onclick="openOrder('${o.id}')"><div class="order-main"><h4>${safe(o.item||"Custom order")}</h4><p>${safe(o.customer||"Customer")} · Qty ${o.quantity||1}${o.due_date?` · Due ${safe(o.due_date)}`:""}</p></div><div class="order-side"><span class="status">${safe(o.status)}</span><strong>${money(o.quoted_price)}</strong></div></article>`).join("");
 $("orderEmpty").classList.toggle("hidden",!!list.length)
}
function renderPresets(){
 $("presetList").innerHTML=presets.map(p=>`<div class="preset-row" onclick="openPreset('${p.id}')"><div><strong>${safe(p.name)}</strong><small>$${p.machineRate}/hr · ${p.markup}× · min ${money(p.minimum)}</small></div><span>›</span></div>`).join("")
}
function populatePrintSelects(){
 const opts=items.map(i=>`<option value="${i.id}">${safe(i.name)}</option>`).join("");
 const curSale=$("salePrint").value,curOrder=$("orderPrint").value;
 $("salePrint").innerHTML=opts||`<option value="">No prints</option>`;$("orderPrint").innerHTML=`<option value="">None / custom</option>`+opts;
 if(curSale&&items.some(i=>i.id===curSale))$("salePrint").value=curSale;if(curOrder)$("orderPrint").value=curOrder
}
function populatePresetSelects(){
 const opts=presets.map(p=>`<option value="${p.id}">${safe(p.name)}</option>`).join("");
 [$("presetInput"),$("hpPreset")].forEach(s=>{const c=s.value;s.innerHTML=opts;if(c&&presets.some(p=>p.id===c))s.value=c;else s.value=settings.defaultPresetId||presets[0]?.id})
}

function usageRowHTML(u={},prefix="pf"){
 const opts=filaments.map(f=>`<option value="${f.id}" ${u.filament_id===f.id?"selected":""}>${safe(`${f.brand||""} ${f.material||""} ${f.color||""}`.trim())}</option>`).join("");
 return `<div class="usage-row" data-prefix="${prefix}"><label class="usage-select">Spool<select class="u-filament"><option value="">Select filament</option>${opts}</select></label><label>Grams<input class="u-grams" type="number" min="0" step="1" value="${u.grams??""}"></label><label>Cost<input class="u-cost" value="${money(filamentCost(u.filament_id,u.grams))}" disabled></label><button type="button" class="remove-row">✕</button></div>`
}
function addUsageRow(containerId,u={},prefix="pf"){const d=document.createElement("div");d.innerHTML=usageRowHTML(u,prefix);const row=d.firstElementChild;$(containerId).appendChild(row);row.querySelector(".remove-row").onclick=()=>{row.remove();updatePricingPreviews()};row.querySelectorAll("select,input").forEach(x=>x.oninput=updatePricingPreviews)}
function collectUsage(containerId){return [...$(containerId).querySelectorAll(".usage-row")].map(r=>({filament_id:r.querySelector(".u-filament").value,grams:Number(r.querySelector(".u-grams").value||0)})).filter(u=>u.filament_id&&u.grams>0)}
function refreshUsageCosts(){document.querySelectorAll(".usage-row").forEach(r=>{const f=r.querySelector(".u-filament")?.value,g=Number(r.querySelector(".u-grams")?.value||0),c=r.querySelector(".u-cost");if(c)c.value=money(filamentCost(f,g))})}

function resetEditor(){
 editingId=null;pendingPhotoFile=null;pendingPhotoData="";editorFavorite=false;
 ["nameInput","categoryInput","modelSourceInput","priceInput","hoursInput","extraCostInput","notesInput"].forEach(id=>$(id).value="");
 $("madeInput").value=0;$("soldInput").value=0;$("presetInput").value=settings.defaultPresetId||presets[0]?.id;$("photoPreview").classList.add("hidden");$("photoPlaceholder").classList.remove("hidden");$("printFilamentRows").innerHTML="";$("deleteBtn").style.visibility="hidden";$("recordSaleFromPrintBtn").style.visibility="hidden";updateFavoriteButton();updatePricingPreviews()
}
function updateFavoriteButton(){$("favoriteToggle").classList.toggle("active",editorFavorite);$("favoriteToggle").textContent=editorFavorite?"★ Favorite":"☆ Favorite"}
window.openEditor=id=>{
 resetEditor();
 if(id){const i=items.find(x=>x.id===id);if(!i)return;editingId=id;$("editorTitle").textContent="Edit print";$("nameInput").value=i.name||"";$("categoryInput").value=i.category||"";$("modelSourceInput").value=i.model_source||"";$("priceInput").value=i.price??"";$("presetInput").value=i.preset_id||settings.defaultPresetId;$("hoursInput").value=i.hours??"";$("extraCostInput").value=i.extra_cost??0;$("notesInput").value=i.notes||"";$("madeInput").value=i.made_qty??0;$("soldInput").value=i.sold_qty??0;editorFavorite=!!i.favorite;updateFavoriteButton();if(i.photo_url){$("photoPreview").src=i.photo_url;$("photoPreview").classList.remove("hidden");$("photoPlaceholder").classList.add("hidden")} (i.filament_usage||[]).forEach(u=>addUsageRow("printFilamentRows",u));$("deleteBtn").style.visibility="visible";$("recordSaleFromPrintBtn").style.visibility="visible"}else{$("editorTitle").textContent="Add print"}
 updateModelLink();updatePricingPreviews();$("editorDialog").showModal()
}
function updateModelLink(){const url=$("modelSourceInput").value.trim(),a=$("modelSourceOpen");if(url){a.href=url;a.classList.remove("hidden")}else a.classList.add("hidden")}
function updatePricingPreviews(){
 refreshUsageCosts();const usage=collectUsage("printFilamentRows"),mat=usageCost(usage)+Number($("extraCostInput").value||0),suggest=suggestedPrice($("hoursInput").value,mat,$("presetInput").value),price=$("priceInput").value===""?suggest:Number($("priceInput").value);
 $("materialCostPreview").textContent=money(mat);$("suggestedPrice").textContent=money(suggest);$("profitPreview").textContent=money(price-mat);$("stockPreview").textContent=Math.max(0,Number($("madeInput").value||0)-Number($("soldInput").value||0));updateHelperPreview()
}
async function fileToDataUrl(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
$("photoInput").onchange=async e=>{const f=e.target.files[0];if(!f)return;pendingPhotoFile=f;pendingPhotoData=await fileToDataUrl(f);$("photoPreview").src=pendingPhotoData;$("photoPreview").classList.remove("hidden");$("photoPlaceholder").classList.add("hidden")}
async function savePrint(){
 const name=$("nameInput").value.trim();if(!name)return toast("Give the print a name");
 const old=editingId?items.find(i=>i.id===editingId):null,id=editingId||uid(),usage=collectUsage("printFilamentRows");
 const mat=usageCost(usage)+Number($("extraCostInput").value||0),suggest=suggestedPrice($("hoursInput").value,mat,$("presetInput").value);
 let item={id,name,category:$("categoryInput").value.trim(),model_source:$("modelSourceInput").value.trim(),price:Number($("priceInput").value||suggest),preset_id:$("presetInput").value,hours:$("hoursInput").value===""?"":Number($("hoursInput").value),extra_cost:Number($("extraCostInput").value||0),made_qty:Number($("madeInput").value||0),sold_qty:Number($("soldInput").value||0),notes:$("notesInput").value.trim(),favorite:editorFavorite,filament_usage:usage,photo_url:old?.photo_url||"",created_at:old?.created_at||new Date().toISOString()};
 if(currentUser&&supabaseClient){try{if(pendingPhotoFile){const ext=(pendingPhotoFile.name.split(".").pop()||"jpg").toLowerCase(),path=`${currentUser.id}/${id}.${ext}`;const {error}=await supabaseClient.storage.from("print-images").upload(path,pendingPhotoFile,{upsert:true});if(error)throw error;item.photo_url=supabaseClient.storage.from("print-images").getPublicUrl(path).data.publicUrl}await syncUpsert("prints",dbPrint(item))}catch(e){console.error(e);toast("Cloud save failed — saved locally");if(pendingPhotoData)item.photo_url=pendingPhotoData}}else if(pendingPhotoData)item.photo_url=pendingPhotoData;
 const idx=items.findIndex(i=>i.id===id);if(idx>=0)items[idx]=item;else items.unshift(item);persist();$("editorDialog").close();toast("Print saved")
}
async function deletePrint(){if(!editingId||!confirm("Delete this print?"))return;if(currentUser)await syncDelete("prints",editingId);items=items.filter(i=>i.id!==editingId);persist();$("editorDialog").close();toast("Print deleted")}

function resetFilament(){editingFilamentId=null;["filBrand","filMaterial","filColor","filPrice","filNotes"].forEach(id=>$(id).value="");$("filSpoolSize").value=1000;$("filRemainingInput").value=1000;$("deleteFilamentBtn").style.visibility="hidden";updateFilamentPreview()}
window.openFilament=id=>{resetFilament();if(id){const f=filaments.find(x=>x.id===id);if(!f)return;editingFilamentId=id;$("filamentTitle").textContent="Edit spool";$("filBrand").value=f.brand||"";$("filMaterial").value=f.material||"";$("filColor").value=f.color||"";$("filSpoolSize").value=f.spool_size||1000;$("filPrice").value=f.purchase_price??"";$("filRemainingInput").value=f.remaining??"";$("filNotes").value=f.notes||"";$("deleteFilamentBtn").style.visibility="visible"}else $("filamentTitle").textContent="Add spool";updateFilamentPreview();$("filamentDialog").showModal()}
function updateFilamentPreview(){const size=Number($("filSpoolSize").value||1000),price=Number($("filPrice").value||0),rem=Number($("filRemainingInput").value||0),cpg=price/size;$("costPerGramPreview").textContent="$"+cpg.toFixed(3);$("remainingValuePreview").textContent=money(cpg*rem)}
async function saveFilament(){const id=editingFilamentId||uid(),f={id,brand:$("filBrand").value.trim(),material:$("filMaterial").value.trim(),color:$("filColor").value.trim(),spool_size:Number($("filSpoolSize").value||1000),purchase_price:Number($("filPrice").value||0),remaining:Number($("filRemainingInput").value||0),notes:$("filNotes").value.trim(),created_at:filaments.find(x=>x.id===id)?.created_at||new Date().toISOString()};if(currentUser)await syncUpsert("filaments",{...f,user_id:currentUser.id});const idx=filaments.findIndex(x=>x.id===id);if(idx>=0)filaments[idx]=f;else filaments.unshift(f);persist();$("filamentDialog").close();toast("Spool saved")}
async function deleteFilament(){if(!editingFilamentId||!confirm("Delete this spool?"))return;if(currentUser)await syncDelete("filaments",editingFilamentId);filaments=filaments.filter(f=>f.id!==editingFilamentId);persist();$("filamentDialog").close()}

function openSale(printId=null){populatePrintSelects();$("salePrint").value=printId||items[0]?.id||"";syncSalePrice();$("saleQty").value=1;$("saleDate").value=TODAY();$("saleChannel").value="";$("saleNotes").value="";updateSalePreview();$("saleDialog").showModal()}
function syncSalePrice(){const i=items.find(x=>x.id===$("salePrint").value);$("salePrice").value=i?.price??0;updateSalePreview()}
function updateSalePreview(){const q=Number($("saleQty").value||1),p=Number($("salePrice").value||0),i=items.find(x=>x.id===$("salePrint").value),cost=i?itemMaterialCost(i):0;$("saleTotalPreview").textContent=money(q*p);$("saleProfitPreview").textContent=money(q*(p-cost))}
async function saveSale(){const print_id=$("salePrint").value;if(!print_id)return toast("Choose a print");const s={id:uid(),print_id,quantity:Number($("saleQty").value||1),unit_price:Number($("salePrice").value||0),date:$("saleDate").value||TODAY(),channel:$("saleChannel").value.trim(),notes:$("saleNotes").value.trim(),created_at:new Date().toISOString()};sales.unshift(s);const i=items.find(x=>x.id===print_id);if(i)i.sold_qty=Number(i.sold_qty||0)+s.quantity;if(currentUser){await syncUpsert("sales",{...s,user_id:currentUser.id});if(i)await syncUpsert("prints",dbPrint(i))}persist();$("saleDialog").close();toast("Sale recorded")}
function openSalesHistory(){const sorted=[...sales].sort((a,b)=>String(b.date).localeCompare(String(a.date)));$("salesHistoryList").innerHTML=sorted.map(s=>{const i=items.find(x=>x.id===s.print_id);return `<article class="order-card"><div class="order-main"><h4>${safe(i?.name||"Deleted print")}</h4><p>${safe(s.date)} · Qty ${s.quantity}${s.channel?` · ${safe(s.channel)}`:""}</p></div><div class="order-side"><strong>${money(Number(s.unit_price)*Number(s.quantity))}</strong><p class="muted">Profit ${money(saleProfit(s))}</p></div></article>`}).join("")||`<div class="empty-state"><p>No sales yet.</p></div>`;$("salesHistoryDialog").showModal()}

function resetOrder(){editingOrderId=null;["orderCustomer","orderItem","orderPrice","orderDue","orderNotes"].forEach(id=>$(id).value="");$("orderQty").value=1;$("orderStatus").value="Requested";$("orderPrint").value="";$("deleteOrderBtn").style.visibility="hidden"}
window.openOrder=id=>{resetOrder();populatePrintSelects();if(id){const o=orders.find(x=>x.id===id);if(!o)return;editingOrderId=id;$("orderTitle").textContent="Edit order";$("orderCustomer").value=o.customer||"";$("orderStatus").value=o.status||"Requested";$("orderItem").value=o.item||"";$("orderQty").value=o.quantity||1;$("orderPrice").value=o.quoted_price??"";$("orderDue").value=o.due_date||"";$("orderPrint").value=o.print_id||"";$("orderNotes").value=o.notes||"";$("deleteOrderBtn").style.visibility="visible"}else $("orderTitle").textContent="New order";$("orderDialog").showModal()}
async function saveOrder(){const item=$("orderItem").value.trim();if(!item)return toast("Describe the order");const id=editingOrderId||uid(),o={id,customer:$("orderCustomer").value.trim(),status:$("orderStatus").value,item,quantity:Number($("orderQty").value||1),quoted_price:Number($("orderPrice").value||0),due_date:$("orderDue").value,print_id:$("orderPrint").value||"",notes:$("orderNotes").value.trim(),created_at:orders.find(x=>x.id===id)?.created_at||new Date().toISOString()};if(currentUser)await syncUpsert("orders",{...o,user_id:currentUser.id,print_id:o.print_id||null});const idx=orders.findIndex(x=>x.id===id);if(idx>=0)orders[idx]=o;else orders.unshift(o);persist();$("orderDialog").close();toast("Order saved")}
async function deleteOrder(){if(!editingOrderId||!confirm("Delete this order?"))return;if(currentUser)await syncDelete("orders",editingOrderId);orders=orders.filter(o=>o.id!==editingOrderId);persist();$("orderDialog").close()}

function resetPreset(){editingPresetId=null;$("prName").value="";$("prRate").value=2;$("prMarkup").value=1.5;$("prMinimum").value=8;$("prRound").value="1";$("deletePresetBtn").style.visibility="hidden"}
window.openPreset=id=>{resetPreset();if(id){const p=presets.find(x=>x.id===id);if(!p)return;editingPresetId=id;$("presetTitle").textContent="Edit preset";$("prName").value=p.name;$("prRate").value=p.machineRate;$("prMarkup").value=p.markup;$("prMinimum").value=p.minimum;$("prRound").value=String(p.roundTo);$("deletePresetBtn").style.visibility=presets.length>1?"visible":"hidden"}else $("presetTitle").textContent="Add preset";$("presetDialog").showModal()}
function savePreset(){const name=$("prName").value.trim();if(!name)return toast("Name the preset");const id=editingPresetId||uid(),p={id,name,machineRate:Number($("prRate").value||0),markup:Number($("prMarkup").value||1),minimum:Number($("prMinimum").value||0),roundTo:Number($("prRound").value||1)};const idx=presets.findIndex(x=>x.id===id);if(idx>=0)presets[idx]=p;else presets.push(p);persist();$("presetDialog").close();toast("Preset saved")}
function deletePreset(){if(!editingPresetId||presets.length<=1)return;if(!confirm("Delete this pricing preset?"))return;presets=presets.filter(p=>p.id!==editingPresetId);if(settings.defaultPresetId===editingPresetId)settings.defaultPresetId=presets[0].id;persist();$("presetDialog").close()}

function openPriceHelper(){populatePresetSelects();$("hpHours").value="";$("hpExtra").value=0;$("hpComplexity").value="1";$("hpFilamentRows").innerHTML="";addUsageRow("hpFilamentRows",{},"hp");updateHelperPreview();$("priceHelperDialog").showModal()}
function updateHelperPreview(){
 if(!$("hpHours"))return;refreshUsageCosts();const mat=usageCost(collectUsage("hpFilamentRows"))+Number($("hpExtra").value||0),hours=Number($("hpHours").value||0),preset=$("hpPreset").value||settings.defaultPresetId,complex=Number($("hpComplexity").value||1),p=getPreset(preset),base=mat+hours*Number(p.machineRate||0),rec=suggestedPrice(hours,mat,preset,complex),high=roundUp(rec*1.2,p.roundTo),bulk=Math.max(p.minimum,roundUp(rec*.85,p.roundTo));
 $("hpMaterial").textContent=money(mat);$("hpBase").textContent=money(base);$("hpRecommended").textContent=money(rec);$("hpHigh").textContent=money(high);$("hpBulk").textContent=money(bulk);$("hpProfit").textContent=money(rec-mat)
}
function helperToPrint(){const mat=usageCost(collectUsage("hpFilamentRows"))+Number($("hpExtra").value||0),rec=suggestedPrice($("hpHours").value,mat,$("hpPreset").value,Number($("hpComplexity").value||1)),usage=collectUsage("hpFilamentRows");$("priceHelperDialog").close();openEditor();$("hoursInput").value=$("hpHours").value;$("extraCostInput").value=$("hpExtra").value;$("presetInput").value=$("hpPreset").value;$("priceInput").value=rec;$("printFilamentRows").innerHTML="";usage.forEach(u=>addUsageRow("printFilamentRows",u));updatePricingPreviews()}

function openSettings(){$("supabaseUrlInput").value=settings.supabaseUrl||"";$("supabaseKeyInput").value=settings.supabaseKey||"";renderPresets();updateCloudUI();$("settingsDialog").showModal()}
function saveSettings(){settings.supabaseUrl=$("supabaseUrlInput").value.trim();settings.supabaseKey=$("supabaseKeyInput").value.trim();persist();setupSupabase();$("settingsDialog").close();toast("Settings saved")}

function dbPrint(i){return {id:i.id,user_id:currentUser.id,name:i.name,category:i.category,price:i.price,hours:i.hours||null,extra_cost:i.extra_cost||0,notes:i.notes,favorite:!!i.favorite,model_source:i.model_source||null,made_qty:i.made_qty||0,sold_qty:i.sold_qty||0,preset_id:i.preset_id||null,filament_usage:i.filament_usage||[],photo_url:i.photo_url||null,created_at:i.created_at}}
async function syncUpsert(table,row){if(!supabaseClient||!currentUser)return;const {error}=await supabaseClient.from(table).upsert(row);if(error){console.error(error);toast(`Cloud ${table} save failed`)}}
async function syncDelete(table,id){if(!supabaseClient||!currentUser)return;const {error}=await supabaseClient.from(table).delete().eq("id",id).eq("user_id",currentUser.id);if(error)console.error(error)}
async function setupSupabase(){if(!settings.supabaseUrl||!settings.supabaseKey||!window.supabase){supabaseClient=null;currentUser=null;updateCloudUI();return}try{supabaseClient=window.supabase.createClient(settings.supabaseUrl,settings.supabaseKey);currentUser=(await supabaseClient.auth.getUser()).data.user||null;updateCloudUI();if(currentUser)await pullCloud()}catch(e){console.error(e);currentUser=null;updateCloudUI()}}
function updateCloudUI(){const c=!!currentUser;$("cloudStatus").textContent=c?"Connected":"Not connected";$("authFields").classList.toggle("hidden",c);$("signedInBox").classList.toggle("hidden",!c);$("signedInEmail").textContent=currentUser?.email||"";$("modeBadge").textContent=c?"Cloud synced":"Local"}
async function signIn(){settings.supabaseUrl=$("supabaseUrlInput").value.trim();settings.supabaseKey=$("supabaseKeyInput").value.trim();localStorage.setItem(K.settings,JSON.stringify(settings));await setupSupabase();if(!supabaseClient)return toast("Add Supabase URL and key first");const {data,error}=await supabaseClient.auth.signInWithPassword({email:$("emailInput").value.trim(),password:$("passwordInput").value});if(error)return toast(error.message);currentUser=data.user;updateCloudUI();await pullCloud();toast("Signed in")}
async function signUp(){settings.supabaseUrl=$("supabaseUrlInput").value.trim();settings.supabaseKey=$("supabaseKeyInput").value.trim();localStorage.setItem(K.settings,JSON.stringify(settings));await setupSupabase();if(!supabaseClient)return toast("Add Supabase URL and key first");const {error}=await supabaseClient.auth.signUp({email:$("emailInput").value.trim(),password:$("passwordInput").value});if(error)return toast(error.message);toast("Account created — check email if required")}
async function signOut(){if(supabaseClient)await supabaseClient.auth.signOut();currentUser=null;updateCloudUI();toast("Signed out")}
async function pushLocal(){if(!currentUser)return;for(const i of items)await syncUpsert("prints",dbPrint(i));for(const f of filaments)await syncUpsert("filaments",{...f,user_id:currentUser.id});for(const s of sales)await syncUpsert("sales",{...s,user_id:currentUser.id});for(const o of orders)await syncUpsert("orders",{...o,user_id:currentUser.id,print_id:o.print_id||null});toast("Local data uploaded");await pullCloud()}
async function pullCloud(){if(!currentUser)return;const [pr,fi,sa,or]=await Promise.all([supabaseClient.from("prints").select("*").eq("user_id",currentUser.id),supabaseClient.from("filaments").select("*").eq("user_id",currentUser.id),supabaseClient.from("sales").select("*").eq("user_id",currentUser.id),supabaseClient.from("orders").select("*").eq("user_id",currentUser.id)]);if(pr.data?.length)items=pr.data.map(({user_id,...x})=>x);if(fi.data?.length)filaments=fi.data.map(({user_id,...x})=>x);if(sa.data?.length)sales=sa.data.map(({user_id,...x})=>x);if(or.data?.length)orders=or.data.map(({user_id,...x})=>({...x,print_id:x.print_id||""}));persist()}
function exportData(){const payload={version:3,exported_at:new Date().toISOString(),settings:{...settings,supabaseKey:""},presets,filaments,items,sales,orders};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="printbook-v3-backup.json";a.click();URL.revokeObjectURL(a.href)}
async function importData(e){const f=e.target.files[0];if(!f)return;try{const d=JSON.parse(await f.text());if(d.items)items=d.items;if(d.filaments)filaments=d.filaments;if(d.sales)sales=d.sales;if(d.orders)orders=d.orders;if(d.presets)presets=d.presets;if(d.settings)settings={...settings,...d.settings,supabaseKey:settings.supabaseKey};persist();toast("Backup imported")}catch{toast("Invalid backup")}}

$("dashboardAddBtn").onclick=$("addBtn").onclick=$("mobileAddBtn").onclick=()=>openEditor();
$("dashboardPriceBtn").onclick=$("helpPriceBtn").onclick=openPriceHelper;
$("settingsBtn").onclick=openSettings;$("syncBtn").onclick=async()=>{if(currentUser){await pullCloud();toast("Synced")}else toast("Cloud sync not connected")};
$("search").oninput=renderPrints;$("categoryFilter").onchange=renderPrints;$("stockFilter").onchange=renderPrints;
$("closeEditor").onclick=()=>$("editorDialog").close();$("savePrintBtn").onclick=savePrint;$("deleteBtn").onclick=deletePrint;$("favoriteToggle").onclick=()=>{editorFavorite=!editorFavorite;updateFavoriteButton()};$("modelSourceInput").oninput=updateModelLink;$("addPrintFilamentBtn").onclick=()=>addUsageRow("printFilamentRows");
["hoursInput","extraCostInput","priceInput","madeInput","soldInput","presetInput"].forEach(id=>$(id).oninput=updatePricingPreviews);
$("recordSaleFromPrintBtn").onclick=()=>{const id=editingId;$("editorDialog").close();openSale(id)};
$("addFilamentBtn").onclick=()=>openFilament();$("closeFilament").onclick=()=>$("filamentDialog").close();$("saveFilamentBtn").onclick=saveFilament;$("deleteFilamentBtn").onclick=deleteFilament;["filSpoolSize","filPrice","filRemainingInput"].forEach(id=>$(id).oninput=updateFilamentPreview);
$("openSalesBtn").onclick=openSalesHistory;$("closeSalesHistory").onclick=()=>$("salesHistoryDialog").close();$("closeSale").onclick=()=>$("saleDialog").close();$("salePrint").onchange=syncSalePrice;["saleQty","salePrice"].forEach(id=>$(id).oninput=updateSalePreview);$("saveSaleBtn").onclick=saveSale;
$("addOrderBtn").onclick=()=>openOrder();$("closeOrder").onclick=()=>$("orderDialog").close();$("saveOrderBtn").onclick=saveOrder;$("deleteOrderBtn").onclick=deleteOrder;document.querySelectorAll("#orderFilter button").forEach(b=>b.onclick=()=>{document.querySelectorAll("#orderFilter button").forEach(x=>x.classList.remove("active"));b.classList.add("active");orderStatusFilter=b.dataset.status;renderOrders()});
$("closePriceHelper").onclick=()=>$("priceHelperDialog").close();$("hpAddFilament").onclick=()=>addUsageRow("hpFilamentRows",{},"hp");["hpHours","hpExtra","hpComplexity","hpPreset"].forEach(id=>$(id).oninput=updateHelperPreview);$("hpUsePriceBtn").onclick=helperToPrint;
$("closeSettings").onclick=()=>$("settingsDialog").close();$("saveSettingsBtn").onclick=saveSettings;$("addPresetBtn").onclick=()=>openPreset();$("closePreset").onclick=()=>$("presetDialog").close();$("savePresetBtn").onclick=savePreset;$("deletePresetBtn").onclick=deletePreset;
$("signInBtn").onclick=signIn;$("signUpBtn").onclick=signUp;$("signOutBtn").onclick=signOut;$("pushLocalBtn").onclick=pushLocal;$("exportBtn").onclick=exportData;$("importInput").onchange=importData;
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
populatePresetSelects();renderAll();setupSupabase();showView("dashboard");
