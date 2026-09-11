/* PrintBook 5.24.0 — premade variants carry their saved colors; custom colors are an explicit opt-in. */
(() => {
  let customColorsOverride=false;

  function currentItem(){return items.find(i=>i.id===currentRequestPrintId)||null}
  function currentVariant(){
    const item=currentItem();
    if(!item)return null;
    return (item.variants||[]).find(v=>String(v.id)===String($("requestVariant")?.value||""))||null;
  }
  function presetUsage(v){
    try{return Array.isArray(variantUsage(v))?variantUsage(v).filter(x=>x?.filament_id):[]}catch{return Array.isArray(v?.filament_usage)?v.filament_usage.filter(x=>x?.filament_id):[]}
  }
  function presetColors(v){
    const usage=presetUsage(v);
    return usage.map(u=>getFilament(u.filament_id)).filter(Boolean).map(f=>({
      id:f.id,
      name:[f.color,f.material].filter(Boolean).join(" · ")||f.brand||"Saved color",
      hex:f.visual_color||"#777777"
    }));
  }
  function hasPresetColors(v){return !!v && (!!v.colorway_id || presetUsage(v).length>0)}

  function ensureChoiceUI(){
    let box=$("requestVariantColorChoice");
    if(box)return box;
    const anchor=$("requestColorModeField")||$("requestSingleColorField")||$("requestMulticolorSection");
    if(!anchor)return null;
    box=document.createElement("section");
    box.id="requestVariantColorChoice";
    box.className="request-variant-color-choice hidden";
    box.innerHTML=`
      <div class="request-preset-color-head"><div><small>COLOR OPTION</small><strong id="requestPresetColorTitle">Colors included</strong></div><span class="request-preset-badge">READY TO GO</span></div>
      <div class="request-preset-swatches" id="requestPresetSwatches"></div>
      <p id="requestPresetColorText">This premade option already includes its saved colors. You don't need to choose filament again.</p>
      <button type="button" class="request-custom-colors-btn" id="requestCustomColorsBtn">🎨 Choose my own colors instead</button>
      <button type="button" class="request-use-preset-btn hidden" id="requestUsePresetColorsBtn">← Use the premade colors</button>`;
    anchor.insertAdjacentElement("beforebegin",box);
    $("requestCustomColorsBtn").onclick=()=>{customColorsOverride=true;syncVariantColorUI(true)};
    $("requestUsePresetColorsBtn").onclick=()=>{customColorsOverride=false;clearCustomSelections();syncVariantColorUI(true)};
    return box;
  }

  function clearCustomSelections(){
    if($("requestColorMode"))$("requestColorMode").value="single";
    if($("requestFilament"))$("requestFilament").value="";
    document.querySelectorAll('#requestColorGrid input[type="checkbox"]').forEach(x=>x.checked=false);
  }

  function makeCustomSectionObvious(show){
    let intro=$("requestCustomColorIntro");
    const first=$("requestColorModeField")||$("requestSingleColorField")||$("requestMulticolorSection");
    if(!intro&&first){
      intro=document.createElement("div");intro.id="requestCustomColorIntro";intro.className="request-custom-color-intro";
      intro.innerHTML=`<span>🎨</span><div><strong>Choose your own colors</strong><small>Want something different? Pick from the filament colors currently available.</small></div>`;
      first.insertAdjacentElement("beforebegin",intro);
    }
    intro?.classList.toggle("hidden",!show);
  }

  function showCustomControls(show){
    const item=currentItem();
    const capable=!!item?.multicolor_capable;
    $("requestColorModeField")?.classList.toggle("hidden",!show||!capable);
    if(!show){
      $("requestSingleColorField")?.classList.add("hidden");
      $("requestMulticolorSection")?.classList.add("hidden");
      return;
    }
    try{updateRequestColorMode()}catch{}
  }

  function syncVariantColorUI(fromClick=false){
    const item=currentItem(),variant=currentVariant();
    const preset=hasPresetColors(variant);
    const box=ensureChoiceUI();
    if(!box)return;

    if(!preset){
      customColorsOverride=true;
      box.classList.add("hidden");
      makeCustomSectionObvious(true);
      showCustomControls(true);
      return;
    }

    const colors=presetColors(variant);
    box.classList.remove("hidden");
    $("requestPresetColorTitle").textContent=variant?.name?`${variant.name} colors included`:"Colors included";
    $("requestPresetSwatches").innerHTML=colors.length?colors.map(c=>`<span class="request-preset-swatch"><i style="background:${safe(c.hex)}"></i>${safe(c.name)}</span>`).join(""):`<span class="request-preset-swatch text-only">Saved color set</span>`;

    if(customColorsOverride){
      $("requestPresetColorText").textContent="You're overriding the premade color set for this print.";
      $("requestCustomColorsBtn").classList.add("hidden");
      $("requestUsePresetColorsBtn").classList.remove("hidden");
      makeCustomSectionObvious(true);
      showCustomControls(true);
    }else{
      $("requestPresetColorText").textContent="This premade option already includes its saved colors. No extra color selection is needed.";
      $("requestCustomColorsBtn").classList.remove("hidden");
      $("requestUsePresetColorsBtn").classList.add("hidden");
      makeCustomSectionObvious(false);
      clearCustomSelections();
      showCustomControls(false);
    }
    if(fromClick){try{updateRequestEstimate()}catch{}}
  }

  const coreOpenRequestPrint=openRequestPrint;
  openRequestPrint=function(){
    customColorsOverride=false;
    const out=coreOpenRequestPrint();
    ensureChoiceUI();
    setTimeout(()=>syncVariantColorUI(false),0);
    return out;
  };

  const variantSelect=$("requestVariant");
  if(variantSelect){
    variantSelect.addEventListener("change",()=>{
      customColorsOverride=false;
      setTimeout(()=>syncVariantColorUI(false),0);
    });
  }

  const coreAddToCart=addCurrentRequestToCustomerCart;
  addCurrentRequestToCustomerCart=function(){
    const variant=currentVariant();
    const usePreset=hasPresetColors(variant)&&!customColorsOverride;
    if(usePreset)clearCustomSelections();
    const before=customerOrderCart.length;
    const out=coreAddToCart();
    if(usePreset&&customerOrderCart.length>before){
      const line=customerOrderCart[customerOrderCart.length-1];
      const names=presetColors(variant).map(x=>x.name);
      line.preset_color_label=names.join(" + ")||variant?.name||"Premade color set";
      line.color_mode="preset";
      try{saveCustomerCart()}catch{}
      try{renderCustomerOrderCart()}catch{}
    }
    return out;
  };

  const coreCartColorLabel=customerCartColorLabel;
  customerCartColorLabel=function(line){
    if(line?.color_mode==="preset"&&line?.preset_color_label)return line.preset_color_label;
    return coreCartColorLabel(line);
  };

  const style=document.createElement("style");
  style.textContent=`
    .request-variant-color-choice{margin:14px 0;padding:15px;border-radius:16px;border:1px solid color-mix(in srgb,var(--store-accent,#8b5cf6) 38%,rgba(255,255,255,.08));background:color-mix(in srgb,var(--store-accent,#8b5cf6) 8%,rgba(255,255,255,.025))}.request-preset-color-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.request-preset-color-head small{display:block;color:var(--store-accent,#a78bfa);font-size:.65rem;font-weight:950;letter-spacing:.13em}.request-preset-color-head strong{display:block;margin-top:3px;font-size:.95rem}.request-preset-badge{padding:5px 7px;border-radius:999px;background:rgba(255,255,255,.06);color:#cfc7d8;font-size:.58rem;font-weight:900;letter-spacing:.08em}.request-preset-swatches{display:flex;flex-wrap:wrap;gap:7px;margin:11px 0}.request-preset-swatch{display:inline-flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid rgba(255,255,255,.08);border-radius:999px;background:rgba(255,255,255,.035);font-size:.72rem;font-weight:750}.request-preset-swatch i{width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,.22);box-shadow:0 0 0 1px rgba(0,0,0,.25)}.request-variant-color-choice p{margin:7px 0 12px;color:#aaa2b2;font-size:.77rem;line-height:1.45}.request-custom-colors-btn,.request-use-preset-btn{width:100%;min-height:43px;border:1px solid color-mix(in srgb,var(--store-accent,#8b5cf6) 42%,rgba(255,255,255,.1));border-radius:11px;background:rgba(255,255,255,.045);color:#f3edf8;font:inherit;font-weight:850}.request-custom-color-intro{display:flex;gap:10px;align-items:flex-start;margin:14px 0 10px;padding:12px 13px;border-radius:13px;background:color-mix(in srgb,var(--store-accent,#8b5cf6) 11%,transparent);border:1px solid color-mix(in srgb,var(--store-accent,#8b5cf6) 25%,rgba(255,255,255,.06))}.request-custom-color-intro>span{font-size:1.15rem}.request-custom-color-intro strong{display:block;font-size:.85rem}.request-custom-color-intro small{display:block;margin-top:3px;color:#aaa2b2;font-size:.7rem;line-height:1.4}
  `;
  document.head.appendChild(style);
  window.PRINTBOOK_BUILD="5.24.0";
})();
