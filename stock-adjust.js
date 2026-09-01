/* PrintBook 5.18.7 — direct finished-stock editing for stocked products. */
(() => {
  function clampStock(value){
    const n=Math.floor(Number(value));
    return Number.isFinite(n)?Math.max(0,n):0;
  }

  function currentCalculatedStock(){
    const made=Math.max(0,Number($("madeInput")?.value||0));
    const sold=Math.max(0,Number($("soldInput")?.value||0));
    return Math.max(0,Math.floor(made-sold));
  }

  function ensureCurrentStockControl(){
    if($("currentStockInput"))return;
    const made=$("madeInput"),sold=$("soldInput");
    if(!made||!sold)return;
    const madeLabel=made.closest("label");
    const soldLabel=sold.closest("label");
    if(!madeLabel||!soldLabel)return;

    const label=document.createElement("label");
    label.className="manual-stock-field";
    label.innerHTML=`Current stock
      <div class="manual-stock-control">
        <button type="button" class="secondary manual-stock-step" id="stockMinusBtn" aria-label="Reduce stock by one">−</button>
        <input id="currentStockInput" type="number" min="0" step="1" inputmode="numeric" value="0" />
        <button type="button" class="secondary manual-stock-step" id="stockPlusBtn" aria-label="Increase stock by one">+</button>
      </div>
      <small>Use this for giveaways, damaged items, corrections, or anything that wasn't a sale.</small>`;

    soldLabel.insertAdjacentElement("afterend",label);

    const input=$("currentStockInput");
    const commit=()=>{
      input.value=String(clampStock(input.value));
      updateStockPreview();
    };
    input.addEventListener("input",commit);
    $("stockMinusBtn").onclick=()=>{input.value=String(Math.max(0,clampStock(input.value)-1));updateStockPreview()};
    $("stockPlusBtn").onclick=()=>{input.value=String(clampStock(input.value)+1);updateStockPreview()};

    made.addEventListener("input",syncCurrentStockFromLegacy);
    sold.addEventListener("input",syncCurrentStockFromLegacy);
  }

  function syncCurrentStockFromLegacy(){
    const input=$("currentStockInput");
    if(input)input.value=String(currentCalculatedStock());
  }

  function updateStockPreview(){
    const input=$("currentStockInput");
    if(!input)return;
    const stock=clampStock(input.value);
    const sold=Math.max(0,Math.floor(Number($("soldInput")?.value||0)));
    // Preserve historical sold count. Setting stock directly changes only the
    // produced/available side: made = sold + current stock.
    $("madeInput").value=String(sold+stock);
    if(typeof updatePricingPreviews==="function")updatePricingPreviews();
  }

  function refreshManualStockUI(){
    ensureCurrentStockControl();
    const field=document.querySelector(".manual-stock-field");
    if(field){
      const madeToOrder=$("inventoryModeInput")?.value==="made_to_order";
      field.classList.toggle("hidden",madeToOrder);
    }
    syncCurrentStockFromLegacy();
  }

  const originalOpenEditor=openEditor;
  openEditor=function(id){
    const result=originalOpenEditor(id);
    refreshManualStockUI();
    return result;
  };

  const inventoryMode=$("inventoryModeInput");
  if(inventoryMode)inventoryMode.addEventListener("change",refreshManualStockUI);

  // Make sure a directly-entered stock count is translated to made_qty before
  // the existing savePrint handler reads the form.
  const saveBtn=$("savePrintBtn");
  if(saveBtn)saveBtn.addEventListener("click",updateStockPreview,true);

  ensureCurrentStockControl();

  const style=document.createElement("style");
  style.textContent=`
    .manual-stock-field{grid-column:1/-1}
    .manual-stock-control{display:grid;grid-template-columns:48px minmax(90px,1fr) 48px;gap:9px;align-items:center;margin-top:6px;max-width:290px}
    .manual-stock-control input{text-align:center;font-size:1.05rem;font-weight:850}
    .manual-stock-step{height:44px!important;min-width:44px!important;padding:0!important;font-size:1.35rem!important;font-weight:900!important;border-radius:12px!important}
    .manual-stock-field small{display:block;margin-top:7px;line-height:1.4}
  `;
  document.head.appendChild(style);
  window.PRINTBOOK_BUILD="5.18.7";
})();
