/* PrintBook request configurator UI helpers only. Does not override request/order core functions. */
(()=>{
  const $=id=>document.getElementById(id);
  const dialog=$("requestPrintDialog");
  if(!dialog)return;

  const colorMap={pink:"#f28ac4",black:"#151515",white:"#f3f3f3",blue:"#5b8cff",red:"#ef5350",green:"#55b56a",purple:"#a56bff",orange:"#ff9b4a",yellow:"#ffd95a",gray:"#888888",grey:"#888888",brown:"#8b5f45",cyan:"#54d7e8",teal:"#4dc2b1",gold:"#d9ae52",silver:"#b9bec7"};
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

  function optionLabel(opt){return (opt?.textContent||"").replace(/\s*·\s*\d+\s+available\s*$/i,"").trim()||"Standard"}
  function selectedName(){return optionLabel($("requestVariant")?.selectedOptions?.[0])}
  function splitPresetColors(name){
    if(!name||/^standard$/i.test(name))return [];
    if(!/[\/\+&]|\band\b/i.test(name))return [];
    return name.split(/\s*(?:\/|\+|&|\band\b)\s*/i).map(x=>x.trim()).filter(Boolean);
  }
  function hexFor(name){
    const key=String(name||"").trim().toLowerCase();
    for(const [k,v] of Object.entries(colorMap))if(key.includes(k))return v;
    return "#6f6878";
  }
  function dispatch(el,type){if(el)el.dispatchEvent(new Event(type,{bubbles:true}))}

  function setQty(delta){
    const input=$("requestQty"); if(!input)return;
    const min=Math.max(1,Number(input.min||1));
    input.value=String(Math.max(min,Number(input.value||1)+delta));
    dispatch(input,"input");dispatch(input,"change");syncMiniPrice();
  }

  function renderVersions(){
    const select=$("requestVariant"),wrap=$("requestVersionCards");
    if(!select||!wrap)return;
    const value=select.value;
    wrap.innerHTML=Array.from(select.options).map(opt=>{
      const active=String(opt.value)===String(value);
      const text=optionLabel(opt);
      const extra=(opt.textContent||"").match(/(\d+\s+available)/i)?.[1]||"";
      return `<button type="button" class="request-version-card${active?" active":""}" data-value="${esc(opt.value)}"><span class="request-version-check">✓</span><strong>${esc(text)}</strong><small>${extra?esc(extra):active?"Selected":"Tap to choose"}</small></button>`;
    }).join("");
    wrap.querySelectorAll(".request-version-card").forEach(btn=>btn.addEventListener("click",()=>{
      select.value=btn.dataset.value||"";
      dispatch(select,"change");
      renderVersions();
      setTimeout(()=>{syncColors();syncMiniPrice()},0);
    }));
  }

  function syncColors(){
    const name=selectedName();
    const colors=splitPresetColors(name);
    const presetWrap=$("requestPresetColorsUI"),list=$("requestPresetColorList"),copy=$("requestIncludedCopy"),customPanel=$("requestCustomPanel"),toggle=$("requestCustomColorsToggle");
    if(!presetWrap||!list||!copy||!customPanel||!toggle)return;
    if(colors.length){
      presetWrap.classList.remove("hidden");
      list.innerHTML=colors.map(c=>`<span class="request-preset-color-chip"><i class="request-preset-color-dot" style="background:${hexFor(c)}"></i>${esc(c)}</span>`).join("");
      copy.textContent=`Included with ${name}. No need to choose colors again.`;
      if(!customPanel.dataset.userOpened)customPanel.classList.add("collapsed");
      toggle.innerHTML='<span>🎨 Want something different?</span><span>›</span>';
    }else{
      presetWrap.classList.add("hidden");
      customPanel.classList.remove("collapsed");
      toggle.innerHTML='<span>🎨 Choose your colors</span><span>›</span>';
    }
  }

  function syncMiniPrice(){
    const mini=$("requestMiniPrice"),est=$("requestEstimate");
    if(mini&&est)mini.textContent=est.textContent||"$0";
  }

  function openToggle(buttonId,panelId){
    const btn=$(buttonId),panel=$(panelId);if(!btn||!panel)return;
    btn.addEventListener("click",()=>{
      panel.classList.toggle("collapsed");
      if(buttonId==="requestCustomColorsToggle"){
        const open=!panel.classList.contains("collapsed");
        panel.dataset.userOpened=open?"1":"";
        if(open){
          const bridge=$("requestCustomColorsBtn");
          if(bridge&&!bridge.classList.contains("hidden"))bridge.click();
          $("requestSingleColorField")?.classList.remove("hidden");
          if(currentItemMulticolor())$("requestColorModeField")?.classList.remove("hidden");
        }else{
          const bridge=$("requestUsePresetColorsBtn");
          if(bridge&&!bridge.classList.contains("hidden"))bridge.click();
        }
      }
    });
  }

  function currentItemMulticolor(){
    try{
      const select=$("requestColorModeField");
      return !!select && !select.dataset.forceSingle;
    }catch{return false}
  }

  openToggle("requestCustomColorsToggle","requestCustomPanel");
  openToggle("requestContactToggle","requestContactPanel");
  openToggle("requestNotesToggle","requestNotesPanel");
  $("requestQtyMinus")?.addEventListener("click",()=>setQty(-1));
  $("requestQtyPlus")?.addEventListener("click",()=>setQty(1));
  $("requestQty")?.addEventListener("input",syncMiniPrice);
  $("requestVariant")?.addEventListener("change",()=>{renderVersions();syncColors();syncMiniPrice()});

  const observer=new MutationObserver(()=>{if(dialog.open){renderVersions();syncColors();syncMiniPrice()}});
  observer.observe(dialog,{attributes:true,attributeFilter:["open"]});
  const optionObserver=new MutationObserver(()=>{if(dialog.open)renderVersions()});
  if($("requestVariant"))optionObserver.observe($("requestVariant"),{childList:true,subtree:true,characterData:true});
  const estimateObserver=new MutationObserver(syncMiniPrice);
  if($("requestEstimate"))estimateObserver.observe($("requestEstimate"),{childList:true,subtree:true,characterData:true});

  $("requestPrintBtn")?.addEventListener("click",()=>setTimeout(()=>{renderVersions();syncColors();syncMiniPrice()},0));
})();
