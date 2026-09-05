/* PrintBook 5.22.0 — additional listing photos without changing the existing main photo path. */
(() => {
  const MAX_GALLERY_IMAGES=8;
  const PUBLIC_GALLERY_URL="https://dljauobtomijmtaxvkvv.supabase.co/functions/v1/public-product-gallery";
  let galleryExistingUrls=[];
  let galleryPending=[];
  let galleryEditorProductId="";
  let galleryDirty=false;
  let galleryLoadPromise=null;

  const cleanGalleryUrls=value=>Array.isArray(value)?[...new Set(value.map(x=>String(x||"").trim()).filter(Boolean))].slice(0,MAX_GALLERY_IMAGES):[];

  function releasePendingPreviews(){
    galleryPending.forEach(x=>{try{URL.revokeObjectURL(x.preview)}catch{}});
    galleryPending=[];
  }
  function resetGalleryState(){
    releasePendingPreviews();
    galleryExistingUrls=[];
    galleryEditorProductId="";
    galleryDirty=false;
    galleryLoadPromise=null;
    renderEditorGallery();
  }

  function ensureEditorGalleryUI(){
    if($("productGalleryEditor"))return $("productGalleryEditor");
    const actions=document.querySelector("#editorDialog .photo-actions");
    if(!actions)return null;
    const section=document.createElement("section");
    section.id="productGalleryEditor";
    section.className="product-gallery-editor";
    section.innerHTML=`
      <div class="product-gallery-editor-head">
        <div><strong>More listing photos</strong><small>Your main photo above stays the cover image. Add up to ${MAX_GALLERY_IMAGES} extra angles.</small></div>
        <label class="secondary small product-gallery-add">+ Add photos<input id="productGalleryInput" type="file" accept="image/*" multiple hidden></label>
      </div>
      <div class="product-gallery-editor-grid" id="productGalleryEditorGrid"></div>`;
    actions.insertAdjacentElement("afterend",section);
    $("productGalleryInput").onchange=e=>addGalleryFiles(e.target.files);
    return section;
  }

  function renderEditorGallery(){
    const grid=$("productGalleryEditorGrid");
    if(!grid)return;
    grid.innerHTML="";
    const total=galleryExistingUrls.length+galleryPending.length;
    if(!total){
      const empty=document.createElement("div");
      empty.className="product-gallery-editor-empty";
      empty.textContent="No extra photos yet.";
      grid.appendChild(empty);
      return;
    }
    galleryExistingUrls.forEach((url,index)=>{
      const card=document.createElement("div");card.className="product-gallery-editor-thumb";
      const img=document.createElement("img");img.src=url;img.alt=`Extra listing photo ${index+1}`;
      const remove=document.createElement("button");remove.type="button";remove.textContent="×";remove.setAttribute("aria-label","Remove extra photo");
      remove.onclick=()=>{galleryExistingUrls.splice(index,1);galleryDirty=true;renderEditorGallery()};
      card.append(img,remove);grid.appendChild(card);
    });
    galleryPending.forEach((entry,index)=>{
      const card=document.createElement("div");card.className="product-gallery-editor-thumb pending";
      const img=document.createElement("img");img.src=entry.preview;img.alt="New extra listing photo";
      const badge=document.createElement("span");badge.textContent="NEW";
      const remove=document.createElement("button");remove.type="button";remove.textContent="×";remove.setAttribute("aria-label","Remove new extra photo");
      remove.onclick=()=>{const [gone]=galleryPending.splice(index,1);try{URL.revokeObjectURL(gone.preview)}catch{};galleryDirty=true;renderEditorGallery()};
      card.append(img,badge,remove);grid.appendChild(card);
    });
  }

  function addGalleryFiles(fileList){
    const files=[...(fileList||[])].filter(file=>String(file.type||"").startsWith("image/"));
    const room=Math.max(0,MAX_GALLERY_IMAGES-galleryExistingUrls.length-galleryPending.length);
    if(!room){toast(`You can add up to ${MAX_GALLERY_IMAGES} extra photos`);if($("productGalleryInput"))$("productGalleryInput").value="";return}
    files.slice(0,room).forEach(file=>galleryPending.push({file,preview:URL.createObjectURL(file)}));
    if(files.length>room)toast(`Only the first ${room} photo${room===1?"":"s"} fit in this listing`);
    if(files.length)galleryDirty=true;
    if($("productGalleryInput"))$("productGalleryInput").value="";
    renderEditorGallery();
  }

  async function loadEditorGallery(productId){
    ensureEditorGalleryUI();
    releasePendingPreviews();
    galleryEditorProductId=productId||"";
    galleryDirty=false;
    const item=productId?items.find(x=>x.id===productId):null;
    galleryExistingUrls=cleanGalleryUrls(item?.gallery_urls);
    renderEditorGallery();
    if(!productId||!currentUser||!supabaseClient)return galleryExistingUrls;
    galleryLoadPromise=(async()=>{
      try{
        const {data,error}=await supabaseClient.from("prints").select("gallery_urls").eq("id",productId).eq("user_id",currentUser.id).maybeSingle();
        if(error)throw error;
        if(galleryEditorProductId!==productId)return galleryExistingUrls;
        galleryExistingUrls=cleanGalleryUrls(data?.gallery_urls);
        const current=items.find(x=>x.id===productId);if(current)current.gallery_urls=[...galleryExistingUrls];
        renderEditorGallery();
      }catch(err){console.warn("Could not load listing gallery",err)}
      return galleryExistingUrls;
    })();
    return galleryLoadPromise;
  }

  async function uploadGalleryFiles(productId,files){
    const urls=[],failed=[];
    for(const file of files){
      try{
        const rawExt=(String(file.name||"").split(".").pop()||"jpg").toLowerCase();
        const ext=/^(jpe?g|png|webp|gif|heic|heif|avif)$/.test(rawExt)?rawExt:"jpg";
        const path=`${currentUser.id}/${productId}/gallery/${Date.now()}-${crypto.randomUUID().slice(0,8)}.${ext}`;
        const {error}=await supabaseClient.storage.from("print-images").upload(path,file,{upsert:false,contentType:file.type||`image/${ext}`,cacheControl:"31536000"});
        if(error)throw error;
        const url=supabaseClient.storage.from("print-images").getPublicUrl(path).data.publicUrl;
        if(url)urls.push(url);
      }catch(err){console.error("Gallery photo upload failed",err);failed.push(file)}
    }
    return {urls,failed};
  }

  async function writeGalleryUrls(productId,urls){
    const clean=cleanGalleryUrls(urls);
    const {error}=await supabaseClient.from("prints").update({gallery_urls:clean,updated_at:nowISO()}).eq("id",productId).eq("user_id",currentUser.id);
    if(error)throw error;
    const item=items.find(x=>x.id===productId);
    if(item){item.gallery_urls=[...clean];item.updated_at=nowISO();try{localStorage.setItem(K.items,JSON.stringify(items))}catch(err){console.warn("Could not cache gallery locally",err)}}
    return clean;
  }

  const coreOpenEditor=window.openEditor;
  window.openEditor=function(id){
    const out=coreOpenEditor(id);
    loadEditorGallery(id||"").catch(()=>{});
    return out;
  };

  const coreSavePrint=savePrint;
  async function savePrintWithGallery(){
    if(galleryLoadPromise){try{await Promise.race([galleryLoadPromise,new Promise(r=>setTimeout(r,2500))])}catch{}}
    const beforeIds=new Set(items.map(x=>x.id));
    const editingBefore=editingId||galleryEditorProductId||"";
    const keptUrls=[...galleryExistingUrls];
    const pendingFiles=galleryPending.map(x=>x.file);
    const dirtyBefore=galleryDirty;

    await coreSavePrint();

    const productId=editingBefore||(items.find(x=>!beforeIds.has(x.id))?.id||"");
    if(!productId)return;
    const item=items.find(x=>x.id===productId);
    if(item){
      item.gallery_urls=[...keptUrls];
      try{localStorage.setItem(K.items,JSON.stringify(items))}catch{}
    }
    if(!dirtyBefore&&!pendingFiles.length)return;
    if(!currentUser||!supabaseClient)return;

    try{
      setSyncState("syncing",pendingFiles.length?"Uploading listing photos…":"Saving listing photos…");
      const uploaded=pendingFiles.length?await uploadGalleryFiles(productId,pendingFiles):{urls:[],failed:[]};
      const finalUrls=cleanGalleryUrls([...keptUrls,...uploaded.urls]);
      await writeGalleryUrls(productId,finalUrls);
      setSyncState("synced","Synced",nowISO());
      if(uploaded.failed.length)toast(`Listing saved · ${uploaded.failed.length} extra photo${uploaded.failed.length===1?"":"s"} failed to upload`);
      else toast(finalUrls.length?`Listing saved with ${finalUrls.length+1} photo${finalUrls.length+1===1?"":"s"}`:"Listing photos updated");
    }catch(err){
      console.error("Could not save listing gallery",err);
      setSyncState("error","Listing saved — extra photos need retry");
      toast("Listing saved, but extra photos didn't finish syncing");
    }
  }
  savePrint=savePrintWithGallery;
  if($("savePrintBtn"))$("savePrintBtn").onclick=savePrintWithGallery;

  const editorDialog=$("editorDialog");
  if(editorDialog)editorDialog.addEventListener("close",()=>{setTimeout(resetGalleryState,0)});

  function ensureCustomerGalleryUI(){
    let wrap=$("customerProductGalleryThumbs");
    if(wrap)return wrap;
    const media=document.querySelector("#customerProductDialog .storefront-product-media");
    if(!media)return null;
    wrap=document.createElement("div");wrap.id="customerProductGalleryThumbs";wrap.className="customer-product-gallery-thumbs hidden";
    media.appendChild(wrap);return wrap;
  }

  function renderCustomerGallery(item,galleryUrls){
    const wrap=ensureCustomerGalleryUI();if(!wrap)return;
    const all=[...new Set([item?.photo_url,...cleanGalleryUrls(galleryUrls)].map(x=>String(x||"").trim()).filter(Boolean))];
    wrap.innerHTML="";
    wrap.classList.toggle("hidden",all.length<=1);
    const hero=$("customerProductPhoto");
    if(all.length&&hero&&(!hero.src||hero.classList.contains("hidden"))){hero.src=all[0];hero.alt=item?.name||"Product photo";hero.classList.remove("hidden");$("customerProductPhotoFallback")?.classList.add("hidden")}
    if(all.length<=1)return;
    all.forEach((url,index)=>{
      const btn=document.createElement("button");btn.type="button";btn.className="customer-product-gallery-thumb"+(index===0?" active":"");btn.setAttribute("aria-label",`View photo ${index+1}`);
      const img=document.createElement("img");img.src=url;img.alt="";btn.appendChild(img);
      btn.onclick=()=>{if(hero){hero.src=url;hero.classList.remove("hidden");$("customerProductPhotoFallback")?.classList.add("hidden")};wrap.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===btn))};
      wrap.appendChild(btn);
    });
  }

  async function loadPublicGallery(productId){
    try{
      const res=await fetch(`${PUBLIC_GALLERY_URL}?product_id=${encodeURIComponent(productId)}&t=${Date.now()}`,{headers:{Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(7000)});
      let data={};try{data=await res.json()}catch{}
      if(!res.ok)throw new Error(data?.error||`Gallery request failed (${res.status})`);
      return cleanGalleryUrls(data?.gallery_urls);
    }catch(err){console.warn("Could not load public product gallery",err);return []}
  }

  const coreOpenCustomerProduct=openCustomerProduct;
  openCustomerProduct=function(id){
    const out=coreOpenCustomerProduct(id);
    const item=items.find(x=>x.id===id);if(!item)return out;
    const localGallery=cleanGalleryUrls(item.gallery_urls);
    renderCustomerGallery(item,localGallery);
    loadPublicGallery(id).then(urls=>{if(currentRequestPrintId===id)renderCustomerGallery(item,urls.length?urls:localGallery)}).catch(()=>{});
    return out;
  };

  ensureEditorGalleryUI();
  ensureCustomerGalleryUI();

  const style=document.createElement("style");
  style.textContent=`
    .product-gallery-editor{margin:14px 0 18px;padding:14px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.025)}
    .product-gallery-editor-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:11px}.product-gallery-editor-head strong{display:block;font-size:.9rem}.product-gallery-editor-head small{display:block;margin-top:3px;color:var(--muted);font-size:.72rem;line-height:1.4}.product-gallery-add{cursor:pointer;white-space:nowrap;margin:0}
    .product-gallery-editor-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.product-gallery-editor-empty{grid-column:1/-1;padding:15px;text-align:center;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:.75rem}
    .product-gallery-editor-thumb{position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:#0e0b13}.product-gallery-editor-thumb img{width:100%;height:100%;object-fit:cover}.product-gallery-editor-thumb button{position:absolute;right:5px;top:5px;width:28px;height:28px;border:1px solid rgba(255,255,255,.18);border-radius:9px;background:rgba(12,9,17,.82);color:#fff;font-size:18px;line-height:1}.product-gallery-editor-thumb span{position:absolute;left:6px;bottom:6px;padding:4px 6px;border-radius:7px;background:rgba(12,9,17,.82);font-size:.55rem;font-weight:900;letter-spacing:.08em;color:var(--purpleSoft)}
    .customer-product-gallery-thumbs{display:flex;gap:8px;margin-top:10px;overflow-x:auto;padding:2px 1px 5px;scrollbar-width:thin}.customer-product-gallery-thumb{flex:0 0 68px;width:68px;height:68px;padding:0;border-radius:12px;overflow:hidden;border:2px solid transparent;background:#0d0b12;opacity:.7}.customer-product-gallery-thumb.active{border-color:var(--store-accent,var(--purple));opacity:1}.customer-product-gallery-thumb img{width:100%;height:100%;object-fit:cover;display:block}
    @media(max-width:560px){.product-gallery-editor-head{align-items:flex-start;flex-direction:column}.product-gallery-add{width:100%}.product-gallery-editor-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.customer-product-gallery-thumb{flex-basis:58px;width:58px;height:58px}}
  `;
  document.head.appendChild(style);
  window.PRINTBOOK_BUILD="5.22.0";
})();
