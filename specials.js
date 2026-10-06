/* PrintBook Specials v1 — seasonal storefront collections. UI-only integration; order flow untouched. */
(() => {
  if(!document.querySelector('link[data-printbook-specials]')){const l=document.createElement("link");l.rel="stylesheet";l.href="./specials.css?v=5.25.3";l.dataset.printbookSpecials="1";document.head.appendChild(l);}
  let specials = [];
  let editingSpecialId = null;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const today = () => new Date().toISOString().slice(0,10);
  const isActive = s => (!s.start_date || s.start_date <= today()) && (!s.end_date || s.end_date >= today());
  const themeIcon = t => ({halloween:"🎃",thanksgiving:"🍂",christmas:"🎄",valentine:"♥",spring:"✿",summer:"☀"}[t] || "✦");

  function ensureUI(){
    const actions=document.querySelector(".admin-shop-hero .shop-hero-actions");
    if(actions && !document.getElementById("manageSpecialsBtn")){
      const b=document.createElement("button"); b.id="manageSpecialsBtn"; b.className="secondary admin-only"; b.type="button"; b.textContent="✦ Specials";
      actions.insertBefore(b,document.getElementById("shopAddBtn")||null);
      b.onclick=openManager;
    }
    const grid=document.getElementById("shopGrid");
    if(grid && !document.getElementById("storefrontSpecials")){
      const section=document.createElement("section"); section.id="storefrontSpecials"; section.className="storefront-specials hidden customer-only";
      // Specials are the first product content customers see: after the hero/perks,
      // before Featured Prints on both desktop and mobile.
      const featured=document.getElementById("customerFeaturedSection");
      if(featured?.parentNode) featured.parentNode.insertBefore(section,featured);
      else grid.parentNode.insertBefore(section,grid);
    }
    if(!document.getElementById("specialsDialog")){
      document.body.insertAdjacentHTML("beforeend",`
      <dialog id="specialsDialog" class="specials-dialog">
        <div class="sheet specials-sheet">
          <div class="sheet-head"><div><p class="eyebrow">SEASONAL COLLECTIONS</p><h2>Specials</h2><p class="muted">Feature seasonal products on the storefront without duplicating listings or inventory.</p></div><button class="icon-btn" type="button" id="closeSpecialsBtn">✕</button></div>
          <div class="specials-manager-actions"><button class="primary" type="button" id="newSpecialBtn">+ New special</button></div>
          <div id="specialsAdminList" class="specials-admin-list"></div>
        </div>
      </dialog>
      <dialog id="specialEditorDialog" class="specials-dialog">
        <div class="sheet specials-editor-sheet">
          <div class="sheet-head"><div><p class="eyebrow">SPECIAL</p><h2 id="specialEditorTitle">New special</h2></div><button class="icon-btn" type="button" id="closeSpecialEditorBtn">✕</button></div>
          <div class="special-form">
            <label class="full">Name<input id="specialName" maxlength="80" placeholder="Halloween Specials"></label>
            <label class="full">Description<textarea id="specialDescription" maxlength="240" placeholder="Limited seasonal prints available for a short time."></textarea></label>
            <label>Starts<input id="specialStart" type="date"></label>
            <label>Ends<input id="specialEnd" type="date"></label>
            <label>Theme<select id="specialTheme"><option value="halloween">🎃 Halloween</option><option value="thanksgiving">🍂 Thanksgiving</option><option value="christmas">🎄 Christmas</option><option value="valentine">♥ Valentine's</option><option value="spring">✿ Spring</option><option value="summer">☀ Summer</option><option value="seasonal">✦ Seasonal</option></select></label>
            <label class="special-feature-toggle"><input id="specialFeatured" type="checkbox" checked> Feature on storefront</label>
            <div class="full"><div class="special-products-head"><strong>Products in this special</strong><small>Select existing listings. Stock and pricing stay linked to the original product.</small></div><div id="specialProductChoices" class="special-product-choices"></div></div>
          </div>
          <div class="sheet-actions"><button class="danger secondary hidden" type="button" id="deleteSpecialBtn">Delete</button><button class="primary" type="button" id="saveSpecialBtn">Save special</button></div>
        </div>
      </dialog>`);
      document.getElementById("closeSpecialsBtn").onclick=()=>document.getElementById("specialsDialog").close();
      document.getElementById("closeSpecialEditorBtn").onclick=()=>document.getElementById("specialEditorDialog").close();
      document.getElementById("newSpecialBtn").onclick=()=>openEditor();
      document.getElementById("saveSpecialBtn").onclick=saveSpecial;
      document.getElementById("deleteSpecialBtn").onclick=deleteSpecial;
    }
  }

  async function loadAdminSpecials(){
    if(!supabaseClient || !currentUser) return [];
    const {data,error}=await supabaseClient.from("specials").select("*").eq("user_id",currentUser.id).order("start_date",{ascending:false});
    if(error){ console.error(error); toast("Couldn't load specials"); return specials; }
    specials=data||[]; renderAdminList(); renderStorefrontSpecials(); return specials;
  }

  async function loadPublicSpecials(){
    try{
      const res=await fetch(`${PUBLIC_STOREFRONT_URL}?specials=1&t=${Date.now()}`,{headers:{Accept:"application/json"},cache:"no-store"});
      if(!res.ok)return;
      const data=await res.json();
      specials=Array.isArray(data.specials)?data.specials:[];
      renderStorefrontSpecials();
    }catch(e){ console.warn("Specials load skipped",e); }
  }

  function renderStorefrontSpecials(){
    ensureUI();
    const host=document.getElementById("storefrontSpecials"); if(!host)return;
    const visible=specials.filter(s=>s.featured!==false && isActive(s) && Array.isArray(s.product_ids) && s.product_ids.length);
    if(!visible.length || (!customerMode && !publicVisitorMode)){host.classList.add("hidden");host.innerHTML="";return;}
    host.classList.remove("hidden");
    host.innerHTML=visible.map(s=>{
      const products=s.product_ids.map(id=>items.find(i=>i.id===id)).filter(Boolean);
      if(!products.length)return "";
      const until=s.end_date?new Date(s.end_date+"T12:00:00").toLocaleDateString([],{month:"short",day:"numeric"}):"";
      return `<section class="special-collection theme-${esc(s.theme)}">
        <div class="special-collection-head"><div><p class="special-kicker">${themeIcon(s.theme)} LIMITED COLLECTION</p><h2>${esc(s.name)}</h2><p>${esc(s.description||"Seasonal prints available for a limited time.")}</p></div>${until?`<span class="special-until">Through ${esc(until)}</span>`:""}</div>
        <div class="special-product-grid">${products.map(i=>storefrontProductCardHTML(i,{featured:true})).join("")}</div>
      </section>`;
    }).join("");
    host.querySelectorAll(".special-product-grid").forEach(el=>{wireStorefrontProductCards(el);wireProductImageFallbacks(el)});
  }

  function renderAdminList(){
    ensureUI(); const host=document.getElementById("specialsAdminList"); if(!host)return;
    if(!specials.length){host.innerHTML='<div class="empty-state"><h3>No specials yet</h3><p>Create your first seasonal collection and add existing listings to it.</p></div>';return;}
    host.innerHTML=specials.map(s=>{
      const count=Array.isArray(s.product_ids)?s.product_ids.length:0, active=isActive(s);
      return `<button type="button" class="special-admin-card" data-special-id="${esc(s.id)}"><span class="special-admin-icon">${themeIcon(s.theme)}</span><span class="special-admin-copy"><strong>${esc(s.name)}</strong><small>${count} product${count===1?"":"s"} · ${s.start_date||"Any time"} → ${s.end_date||"No end"}</small></span><span class="special-state ${active?"active":""}">${active?"ACTIVE":"SCHEDULED"}</span></button>`;
    }).join("");
    host.querySelectorAll("[data-special-id]").forEach(b=>b.onclick=()=>openEditor(b.dataset.specialId));
  }

  async function openManager(){
    ensureUI(); document.getElementById("specialsDialog").showModal();
    document.getElementById("specialsAdminList").innerHTML='<div class="empty-state"><p>Loading specials…</p></div>';
    await loadAdminSpecials();
  }

  function openEditor(id=null){
    ensureUI(); editingSpecialId=id;
    const s=id?specials.find(x=>x.id===id):null;
    document.getElementById("specialEditorTitle").textContent=s?"Edit special":"New special";
    document.getElementById("specialName").value=s?.name||"";
    document.getElementById("specialDescription").value=s?.description||"";
    document.getElementById("specialStart").value=s?.start_date||"";
    document.getElementById("specialEnd").value=s?.end_date||"";
    document.getElementById("specialTheme").value=s?.theme||"halloween";
    document.getElementById("specialFeatured").checked=s?.featured!==false;
    document.getElementById("deleteSpecialBtn").classList.toggle("hidden",!s);
    const selected=new Set(s?.product_ids||[]);
    const choices=document.getElementById("specialProductChoices");
    choices.innerHTML=items.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(i=>`<label class="special-product-choice"><input type="checkbox" value="${esc(i.id)}" ${selected.has(i.id)?"checked":""}><span>${i.photo_url?`<img src="${esc(i.photo_url)}" alt="">`:'<i>◌</i>'}</span><strong>${esc(i.name)}</strong><small>${money(i.price)}</small></label>`).join("");
    document.getElementById("specialsDialog")?.close();
    document.getElementById("specialEditorDialog").showModal();
  }

  async function saveSpecial(){
    if(!supabaseClient||!currentUser)return toast("Sign in to save specials");
    const name=document.getElementById("specialName").value.trim(); if(!name)return toast("Name the special");
    const start=document.getElementById("specialStart").value||null,end=document.getElementById("specialEnd").value||null;
    if(start&&end&&end<start)return toast("End date must be after start date");
    const product_ids=[...document.querySelectorAll("#specialProductChoices input:checked")].map(x=>x.value);
    if(!product_ids.length)return toast("Choose at least one product");
    const row={user_id:currentUser.id,name,description:document.getElementById("specialDescription").value.trim()||null,theme:document.getElementById("specialTheme").value,start_date:start,end_date:end,featured:document.getElementById("specialFeatured").checked,product_ids,updated_at:new Date().toISOString()};
    const btn=document.getElementById("saveSpecialBtn");btn.disabled=true;btn.textContent="Saving…";
    let error;
    if(editingSpecialId)({error}=await supabaseClient.from("specials").update(row).eq("id",editingSpecialId).eq("user_id",currentUser.id));
    else ({error}=await supabaseClient.from("specials").insert({...row,created_at:new Date().toISOString()}));
    btn.disabled=false;btn.textContent="Save special";
    if(error){console.error(error);return toast("Couldn't save special")}
    document.getElementById("specialEditorDialog").close();toast("Special saved");await loadAdminSpecials();
  }

  async function deleteSpecial(){
    if(!editingSpecialId||!supabaseClient||!currentUser)return;
    if(!confirm("Delete this special? Your product listings and inventory will not be deleted."))return;
    const {error}=await supabaseClient.from("specials").delete().eq("id",editingSpecialId).eq("user_id",currentUser.id);
    if(error){console.error(error);return toast("Couldn't delete special")}
    document.getElementById("specialEditorDialog").close();toast("Special deleted");await loadAdminSpecials();
  }

  const originalRenderShop=renderShop;
  renderShop=function(){originalRenderShop();ensureUI();renderStorefrontSpecials();};

  const originalLoadPublicStorefront=loadPublicStorefront;
  loadPublicStorefront=async function(...args){const ok=await originalLoadPublicStorefront(...args);if(ok)await loadPublicSpecials();return ok;};

  ensureUI();
  if(publicVisitorMode) loadPublicSpecials();
  window.PrintBookSpecials={open:openManager,reload:loadAdminSpecials};
})();
