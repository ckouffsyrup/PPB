/* PrintBook 5.24.2 — UI-only request configurator. Keeps existing request/open/submit logic intact. */
(() => {
  const byId=id=>document.getElementById(id);
  const dialog=byId('requestPrintDialog');
  if(!dialog)return;

  let customOverride=false;
  let transformed=false;

  function currentItem(){try{return items.find(i=>i.id===currentRequestPrintId)||null}catch{return null}}
  function currentVariant(){const item=currentItem(); if(!item)return null; return (item.variants||[]).find(v=>String(v.id)===String(byId('requestVariant')?.value||''))||null}
  function presetUsage(v){try{return Array.isArray(variantUsage(v))?variantUsage(v).filter(x=>x?.filament_id):[]}catch{return Array.isArray(v?.filament_usage)?v.filament_usage.filter(x=>x?.filament_id):[]}}
  function looksLikeColors(name=''){return /\s*(?:\/|\+|&|\band\b)\s*/i.test(String(name))}
  function cleanVariantName(text=''){return String(text).replace(/\s*·\s*\d+\s+available$/i,'').replace(/\s*·\s*made to order$/i,'').trim()||'Standard'}
  function presetColors(v){
    if(!v)return [];
    const usage=presetUsage(v);
    const fromUsage=usage.map(u=>{try{return getFilament(u.filament_id)}catch{return null}}).filter(Boolean).map(f=>({name:f.color||f.name||f.material||'Color',hex:f.visual_color||'#777'}));
    if(fromUsage.length)return fromUsage;
    if(looksLikeColors(v.name))return String(v.name).split(/\s*(?:\/|\+|&|\band\b)\s*/i).filter(Boolean).map(name=>({name,hex:guessHex(name)}));
    return [];
  }
  function hasPreset(v){return !!v && (!!v.colorway_id || presetUsage(v).length>0 || looksLikeColors(v.name))}
  function guessHex(name=''){
    const n=String(name).toLowerCase();
    const map={black:'#191919',white:'#f4f4f5',pink:'#f472b6',purple:'#a855f7',blue:'#3b82f6',red:'#ef4444',green:'#22c55e',yellow:'#eab308',orange:'#f97316',gray:'#737373',grey:'#737373',brown:'#92400e',tan:'#d6b98c',gold:'#d4a017',silver:'#a1a1aa'};
    return Object.entries(map).find(([k])=>n.includes(k))?.[1]||'#5e5668';
  }
  function fire(el,type='change'){el?.dispatchEvent(new Event(type,{bubbles:true}))}

  function transform(){
    if(transformed)return;
    const sheet=dialog.querySelector('.request-print-sheet');
    const grid=sheet?.querySelector('.form-grid');
    const estimate=sheet?.querySelector('.request-estimate');
    const submit=byId('submitPrintRequestBtn');
    const name=byId('requestCustomerName')?.closest('label');
    const email=byId('requestCustomerEmail')?.closest('label');
    const qty=byId('requestQty');
    const variant=byId('requestVariant');
    const variantLabel=variant?.closest('label');
    const single=byId('requestSingleColorField');
    const mode=byId('requestColorModeField');
    const multi=byId('requestMulticolorSection');
    const contact=byId('requestContact')?.closest('label');
    const notes=byId('requestNotes')?.closest('label');
    if(!sheet||!grid||!estimate||!submit||!name||!email||!qty||!variant||!variantLabel||!single||!mode||!multi||!contact||!notes)return;

    const ui=document.createElement('div');
    ui.className='request-config-ui';
    ui.innerHTML=`
      <section class="rc-step">
        <div class="rc-head"><span>1</span><strong>Quantity</strong><small id="rcEach"></small></div>
        <div class="rc-qty"><button type="button" id="rcMinus">−</button><div id="rcQtyHome"></div><button type="button" id="rcPlus">+</button></div>
      </section>
      <section class="rc-step">
        <div class="rc-head"><span>2</span><strong>Choose a version</strong></div>
        <div class="rc-versions" id="rcVersions"></div>
        <div class="rc-native-hidden" id="rcVariantHome"></div>
      </section>
      <section class="rc-step">
        <div class="rc-head"><span>3</span><strong>Colors</strong><em id="rcColorBadge"></em></div>
        <div id="rcPreset" class="rc-preset hidden"></div>
        <button type="button" class="rc-customize hidden" id="rcCustomize"><span>🎨</span><span><strong>Want something different?</strong><small>Customize colors or filament.</small></span><b>›</b></button>
        <button type="button" class="rc-use-preset hidden" id="rcUsePreset">← Use included colors</button>
        <div id="rcCustomHome" class="rc-custom-home"></div>
      </section>
      <section class="rc-step">
        <div class="rc-head"><span>4</span><strong>Your details</strong></div>
        <div class="rc-details" id="rcDetails"></div>
        <button type="button" class="rc-toggle" id="rcContactToggle">+ Add phone / contact <small>(optional)</small></button>
        <div id="rcContactHome" class="hidden"></div>
      </section>
      <section class="rc-step">
        <div class="rc-head"><span>5</span><strong>Special instructions</strong><em>optional</em></div>
        <button type="button" class="rc-toggle" id="rcNotesToggle">+ Add special instructions</button>
        <div id="rcNotesHome" class="hidden"></div>
      </section>`;
    grid.replaceWith(ui);
    byId('rcQtyHome').appendChild(qty);
    byId('rcVariantHome').appendChild(variantLabel);
    byId('rcCustomHome').append(single,mode,multi);
    byId('rcDetails').append(name,email);
    byId('rcContactHome').appendChild(contact);
    byId('rcNotesHome').appendChild(notes);

    const footer=document.createElement('div'); footer.className='rc-footer';
    estimate.insertAdjacentElement('beforebegin',footer); footer.append(estimate,submit);

    byId('rcMinus').onclick=()=>setQty(-1);
    byId('rcPlus').onclick=()=>setQty(1);
    byId('rcCustomize').onclick=()=>{customOverride=true; syncColors()};
    byId('rcUsePreset').onclick=()=>{customOverride=false; clearCustom(); syncColors()};
    byId('rcContactToggle').onclick=()=>byId('rcContactHome').classList.toggle('hidden');
    byId('rcNotesToggle').onclick=()=>byId('rcNotesHome').classList.toggle('hidden');
    variant.addEventListener('change',()=>{customOverride=false;renderVersions();syncColors();syncPrice()});
    qty.addEventListener('input',syncPrice);
    transformed=true;
  }

  function setQty(delta){const q=byId('requestQty'); q.value=String(Math.max(1,Number(q.value||1)+delta)); fire(q,'input'); fire(q,'change'); syncPrice()}
  function syncPrice(){
    const qty=Math.max(1,Number(byId('requestQty')?.value||1));
    const text=byId('requestEstimate')?.textContent||'$0';
    const total=Number(String(text).replace(/[^0-9.]/g,''))||0;
    const each=qty?total/qty:total;
    if(byId('rcEach'))byId('rcEach').textContent=`$${each.toFixed(each%1?2:0)} each`;
  }
  function renderVersions(){
    if(!transformed)return;
    const select=byId('requestVariant'),wrap=byId('rcVersions'); if(!select||!wrap)return;
    wrap.innerHTML='';
    [...select.options].forEach(opt=>{
      const btn=document.createElement('button'); btn.type='button'; btn.className='rc-version'+(String(opt.value)===String(select.value)?' active':'');
      const name=cleanVariantName(opt.textContent); btn.innerHTML=`<strong>${safe(name)}</strong>${String(opt.value)===String(select.value)?'<b>✓</b>':''}`;
      const colors=looksLikeColors(name)?name.split(/\s*(?:\/|\+|&|\band\b)\s*/i).filter(Boolean):[];
      if(colors.length){const row=document.createElement('span');row.className='rc-mini-colors';row.innerHTML=colors.slice(0,3).map(c=>`<i style="background:${guessHex(c)}"></i>`).join('');btn.appendChild(row)}
      btn.onclick=()=>{select.value=opt.value;customOverride=false;fire(select);renderVersions();syncColors();syncPrice()};
      wrap.appendChild(btn);
    });
    const custom=document.createElement('button'); custom.type='button'; custom.className='rc-version rc-version-custom'; custom.innerHTML='<strong>Custom</strong><span>🎨</span><small>Choose your own colors</small>';
    custom.onclick=()=>{customOverride=true;syncColors()}; wrap.appendChild(custom);
  }
  function clearCustom(){if(byId('requestColorMode'))byId('requestColorMode').value='single';if(byId('requestFilament'))byId('requestFilament').value='';dialog.querySelectorAll('#requestColorGrid input[type="checkbox"]').forEach(x=>x.checked=false)}
  function syncColors(){
    if(!transformed)return;
    const v=currentVariant(),preset=hasPreset(v)&&!customOverride;
    const box=byId('rcPreset'),customHome=byId('rcCustomHome'),customBtn=byId('rcCustomize'),useBtn=byId('rcUsePreset'),badge=byId('rcColorBadge');
    if(preset){
      const colors=presetColors(v); box.classList.remove('hidden'); customHome.classList.add('hidden'); customBtn.classList.remove('hidden'); useBtn.classList.add('hidden'); badge.textContent='Preset colors included'; clearCustom();
      box.innerHTML=`<div class="rc-color-chips">${colors.map(c=>`<div class="rc-color-chip"><i style="background:${safe(c.hex||guessHex(c.name))}"></i><strong>${safe(c.name)}</strong></div>`).join('')}</div><small>Included with ${safe(v?.name||'this version')}. No extra color selection needed.</small>`;
    }else{
      box.classList.add('hidden'); customHome.classList.remove('hidden'); customBtn.classList.add('hidden'); useBtn.classList.toggle('hidden',!hasPreset(v)); badge.textContent=customOverride?'Custom colors':'Choose your colors';
      try{updateRequestColorMode()}catch{}
    }
  }
  function refresh(){
    transform(); if(!transformed)return;
    customOverride=false; renderVersions(); syncColors(); syncPrice();
    if(byId('requestContact')?.value)byId('rcContactHome')?.classList.remove('hidden');
  }

  const obs=new MutationObserver(()=>{if(dialog.open)requestAnimationFrame(refresh)}); obs.observe(dialog,{attributes:true,attributeFilter:['open']});
  transform();

  /* Preserve premade-color cart labeling from 5.24.1 without changing request submission itself. */
  try{
    const coreAdd=addCurrentRequestToCustomerCart;
    addCurrentRequestToCustomerCart=function(){
      const v=currentVariant(),usePreset=hasPreset(v)&&!customOverride; if(usePreset)clearCustom();
      const before=customerOrderCart.length,out=coreAdd();
      if(usePreset&&customerOrderCart.length>before){const line=customerOrderCart[customerOrderCart.length-1];const names=presetColors(v).map(x=>x.name);line.preset_color_label=names.join(' + ')||v?.name||'Premade color set';line.color_mode='preset';try{saveCustomerCart();renderCustomerOrderCart()}catch{}}
      return out;
    };
    const coreLabel=customerCartColorLabel;
    customerCartColorLabel=function(line){return line?.color_mode==='preset'&&line?.preset_color_label?line.preset_color_label:coreLabel(line)};
  }catch{}

  const style=document.createElement('style');
  style.textContent=`
  #requestPrintDialog .request-print-sheet{width:min(760px,calc(100vw - 28px));max-width:760px;padding:20px 22px 0;overflow:auto}
  #requestPrintDialog .request-product-summary{margin:8px 0 12px}
  .request-config-ui{display:grid;gap:10px;margin-top:8px}.rc-step{padding:12px 13px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.022)}
  .rc-head{display:flex;align-items:center;gap:9px;margin-bottom:10px}.rc-head>span{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#a78bfa,#7c3aed);color:white;font-size:.7rem;font-weight:900}.rc-head strong{font-size:.86rem}.rc-head small,.rc-head em{margin-left:auto;color:#9991a3;font-size:.65rem;font-style:normal}.rc-head #rcColorBadge{margin-left:3px;padding:4px 7px;border-radius:999px;background:rgba(139,92,246,.15);color:#c4b5fd;font-weight:800}
  .rc-qty{display:flex;align-items:center;gap:8px}.rc-qty button{width:38px;height:38px;border-radius:9px;border:1px solid rgba(255,255,255,.1);background:#211a2d;color:#fff;font-size:1.05rem;font-weight:900}.rc-qty #requestQty{width:62px;height:38px;text-align:center;padding:0;margin:0}.rc-native-hidden{display:none}
  .rc-versions{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}.rc-version{position:relative;min-height:72px;padding:10px;border-radius:11px;border:1px solid rgba(255,255,255,.09);background:#15121c;color:#f7f3fb;text-align:left}.rc-version strong{display:block;padding-right:22px;font-size:.76rem}.rc-version b{position:absolute;top:8px;right:8px;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#a855f7;color:white;font-size:.68rem}.rc-version.active{border-color:#a855f7;background:rgba(124,58,237,.12);box-shadow:0 0 0 2px rgba(168,85,247,.12)}.rc-mini-colors{display:flex;gap:4px;margin-top:12px}.rc-mini-colors i{width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,.3)}.rc-version-custom span{display:block;margin-top:8px}.rc-version-custom small{display:block;margin-top:4px;color:#938b9e;font-size:.61rem}
  .rc-preset{padding:10px;border-radius:11px;background:rgba(124,58,237,.07);border:1px solid rgba(167,139,250,.17)}.rc-color-chips{display:flex;gap:8px;flex-wrap:wrap}.rc-color-chip{display:flex;align-items:center;gap:8px;min-width:108px;padding:9px 11px;border-radius:10px;background:#15121c;border:1px solid rgba(255,255,255,.08)}.rc-color-chip i{width:25px;height:25px;border-radius:50%;border:1px solid rgba(255,255,255,.25)}.rc-color-chip strong{font-size:.72rem}.rc-preset>small{display:block;margin-top:8px;color:#a69eae;font-size:.65rem}.rc-customize,.rc-use-preset,.rc-toggle{width:100%;margin-top:8px;border:1px solid rgba(167,139,250,.24);border-radius:10px;background:rgba(124,58,237,.055);color:#f2ecf7}.rc-customize{display:flex;align-items:center;gap:10px;padding:9px 11px;text-align:left}.rc-customize>span:nth-child(2){flex:1}.rc-customize strong,.rc-customize small{display:block}.rc-customize small{margin-top:2px;color:#a39baa;font-size:.62rem}.rc-customize b{font-size:1.2rem}.rc-use-preset,.rc-toggle{min-height:40px;padding:8px 11px;text-align:left;font-weight:800}.rc-custom-home{margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:10px}.rc-custom-home #requestMulticolorSection{grid-column:1/-1}.rc-details{display:grid;grid-template-columns:1fr 1fr;gap:10px}.rc-details label,.rc-custom-home label,#rcContactHome label,#rcNotesHome label{margin:0}.rc-details label,.rc-custom-home label{font-size:.68rem}.rc-details input,.rc-custom-home select{margin-top:5px}
  .rc-footer{position:sticky;bottom:0;z-index:6;display:grid;grid-template-columns:minmax(180px,.72fr) 1fr;gap:10px;margin:12px -22px 0;padding:11px 22px max(11px,env(safe-area-inset-bottom));background:rgba(13,11,20,.96);border-top:1px solid rgba(255,255,255,.08);backdrop-filter:blur(14px)}.rc-footer .request-estimate{margin:0;min-height:54px;padding:9px 12px}.rc-footer #submitPrintRequestBtn{margin:0;min-height:54px}.rc-footer .request-estimate>div{display:flex;align-items:center;justify-content:space-between}.rc-footer .request-estimate strong{font-size:1.4rem}.rc-footer .request-estimate small{font-size:.58rem}
  @media(max-width:620px){#requestPrintDialog .request-print-sheet{width:100%;max-width:none;padding:16px 14px 0}.rc-versions{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:2px}.rc-version{min-width:126px;scroll-snap-align:start}.rc-details{grid-template-columns:1fr}.rc-custom-home{grid-template-columns:1fr}.rc-footer{grid-template-columns:120px 1fr;margin:10px -14px 0;padding:10px 14px max(10px,env(safe-area-inset-bottom))}.rc-footer .request-estimate small{display:none}}
  `;
  document.head.appendChild(style);
  window.PRINTBOOK_BUILD='5.24.2';
})();
