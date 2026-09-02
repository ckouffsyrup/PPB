/* PrintBook 5.20.0 — direct checkout with global payment details and no quote workflow. */
(() => {
  const PUBLIC_PAYMENT_METHODS_URL="https://dljauobtomijmtaxvkvv.supabase.co/functions/v1/public-payment-methods";
  let globalPaymentMethods=null;
  let globalPaymentLoadPromise=null;

  function hasPaymentMethodData(raw){return !!raw&&typeof raw==="object"&&!Array.isArray(raw)&&Object.values(raw).some(m=>m&&String(m.detail||"").trim())}
  function cacheGlobalPaymentMethods(raw){const methods=normalizedPaymentMethods(raw||{});globalPaymentMethods=methods;storeAvailability={...storeAvailability,payment_methods:methods};if(!publicVisitorMode){settings.paymentMethods=methods;try{localStorage.setItem(K.settings,JSON.stringify(settings))}catch{}}return methods}
  async function loadGlobalPaymentMethods(force=false){if(globalPaymentLoadPromise&&!force)return globalPaymentLoadPromise;globalPaymentLoadPromise=(async()=>{try{const res=await fetch(`${PUBLIC_PAYMENT_METHODS_URL}?t=${Date.now()}`,{method:"GET",headers:{Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(8000)});let data={};try{data=await res.json()}catch{}if(!res.ok)throw new Error(data?.error||`Payment methods request failed (${res.status})`);return cacheGlobalPaymentMethods(data?.payment_methods||{})}catch(err){console.error("Global payment methods load failed",err);const fallback=storeAvailability?.payment_methods||settings?.paymentMethods||{};if(hasPaymentMethodData(fallback))return cacheGlobalPaymentMethods(fallback);globalPaymentMethods=normalizedPaymentMethods({});return globalPaymentMethods}finally{globalPaymentLoadPromise=null}})();return globalPaymentLoadPromise}
  function paymentRows(){const source=globalPaymentMethods||storeAvailability?.payment_methods||settings?.paymentMethods||{},methods=normalizedPaymentMethods(source);return Object.entries(methods).filter(([,m])=>m?.enabled&&String(m.detail||"").trim()).map(([key,m])=>({label:PAYMENT_METHOD_DEFS?.[key]?.label||m.label||key,detail:String(m.detail||"").trim()}))}

  function ensureCheckoutPayment({loading=false}={}){
    const checkout=document.querySelector('.customer-cart-checkout');if(!checkout)return null;
    let box=$("customerCheckoutPayment");
    if(!box){box=document.createElement('section');box.id='customerCheckoutPayment';box.className='customer-checkout-payment';const total=document.querySelector('.customer-cart-total');if(total)total.insertAdjacentElement('afterend',box);else checkout.prepend(box)}
    const rows=paymentRows();
    const emptyCopy=loading?'Loading your saved payment methods…':'Payment methods are temporarily unavailable. Please refresh before submitting.';
    box.innerHTML=`<div class="customer-checkout-payment-head"><div><small>HOW TO PAY</small><strong>Payment details</strong></div><span>Pay after submitting</span></div><div class="customer-checkout-payment-methods">${rows.length?rows.map(r=>`<div><strong>${safe(r.label)}</strong><span>${safe(r.detail)}</span></div>`).join(''):`<p>${safe(emptyCopy)}</p>`}</div><p class="customer-checkout-agreement">By submitting this order, you agree to the total shown above and the print options in your cart. After submitting, you'll receive a <strong>KP order number</strong>. <strong>Use that exact order number as the subject, note, or memo on your payment</strong> so it can be matched to your order.</p>`;
    const totalLabel=document.querySelector('.customer-cart-total span');if(totalLabel)totalLabel.textContent='Order total';
    const submit=$("submitCustomerCartBtn");if(submit&&!submit.dataset.submitting){submit.textContent='Submit Order';submit.disabled=false}
    const oldNote=checkout.querySelector(':scope > small.muted');if(oldNote)oldNote.textContent='Submitting places your order. No separate quote or quote-acceptance step is required.';
    return box;
  }
  async function refreshCheckoutPayment(){ensureCheckoutPayment({loading:true});await loadGlobalPaymentMethods(true);ensureCheckoutPayment({loading:false})}

  submitPublicPrintRequest=async function(payload){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
    try{const res=await fetch(CUSTOMER_ORDERS_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"request_print",...payload}),signal:controller.signal});let data={};try{data=await res.json()}catch{}if(!res.ok)throw new Error(data.error||data.detail||`Request failed (${res.status})`);return data}
    catch(err){if(err?.name==="AbortError")throw new Error("Order submission timed out. Please try again — your cart is still saved.");throw err}
    finally{clearTimeout(timer)}
  };

  function renderPaymentReferenceReminder(number){
    const clean=String(number||'').trim();if(!clean||clean==='KP-0000'||clean==='—')return;
    const numberEl=$("customerOrderConfirmNumber");const card=numberEl?.closest('.customer-order-number-card');
    if(card){let reminder=$("customerPaymentOrderNumberReminder");if(!reminder){reminder=document.createElement('div');reminder.id='customerPaymentOrderNumberReminder';reminder.className='customer-payment-order-number-reminder';card.insertAdjacentElement('afterend',reminder)}reminder.innerHTML=`<small>IMPORTANT FOR PAYMENT</small><strong>USE ORDER NUMBER <span>${safe(clean)}</span> AS YOUR PAYMENT SUBJECT / NOTE</strong><p>Please include it exactly as shown so your payment can be matched to your order.</p>`}
  }
  function renderPortalPaymentReference(){const portalNumber=$("customerPortalNumber"),paymentBox=$("customerPortalPaymentBox");const clean=String(portalNumber?.textContent||'').trim();if(!paymentBox||!clean||clean==='—')return;let reminder=$("customerPortalPaymentOrderNumberReminder");if(!reminder){reminder=document.createElement('div');reminder.id='customerPortalPaymentOrderNumberReminder';reminder.className='customer-payment-order-number-reminder portal-reminder';paymentBox.insertAdjacentElement('beforebegin',reminder)}reminder.innerHTML=`<small>WHEN YOU PAY</small><strong>USE ORDER NUMBER <span>${safe(clean)}</span> AS YOUR PAYMENT SUBJECT / NOTE</strong><p>Please include it exactly as shown so your payment can be matched to this order.</p>`}

  try{const originalConfirmation=showCustomerOrderConfirmation;showCustomerOrderConfirmation=function(result,itemName){const out=originalConfirmation(result,itemName);setTimeout(()=>renderPaymentReferenceReminder(result?.order_number||$("customerOrderConfirmNumber")?.textContent),0);return out}}catch{}
  try{const originalPortalRender=renderCustomerPortalOrder;renderCustomerPortalOrder=function(order){const out=originalPortalRender(order);setTimeout(renderPortalPaymentReference,0);return out}}catch{}

  const originalRenderCart=renderCustomerOrderCart;renderCustomerOrderCart=function(){originalRenderCart();ensureCheckoutPayment({loading:!globalPaymentMethods})};
  const originalOpenCart=openCustomerOrderCart;openCustomerOrderCart=function(){const r=originalOpenCart();refreshCheckoutPayment().catch(()=>ensureCheckoutPayment({loading:false}));return r};

  try{orderNextStep=function(status){return status==="Requested"?["Approved","Approve order"]:status==="Approved"?["Printing","Start printing"]:status==="Printing"?["Ready","Mark ready"]:status==="Ready"?["Completed","Complete"]:null}}catch{}

  function stripQuoteAdminUI(){
    document.querySelectorAll('#orderFilter [data-status="Quoted"],#orderFilter [data-status="Accepted"]').forEach(x=>x.remove());
    const status=$("orderStatus");if(status){[...status.options].forEach(o=>{if(['Quoted','Accepted'].includes(o.value))o.remove()});if(['Quoted','Accepted'].includes(status.value))status.value='Approved'}
    const quotedCount=$("orderQuotedCount"),acceptedCount=$("orderAcceptedCount");quotedCount?.closest('.stat-card')?.remove();acceptedCount?.closest('.stat-card')?.remove();
    document.querySelectorAll('.order-board-column').forEach(col=>{const label=col.querySelector('.order-board-heading span')?.textContent?.trim();if(label==='Quoted'||label==='Accepted')col.remove()});
    document.querySelectorAll('button').forEach(btn=>{const t=String(btn.textContent||'').trim().toLowerCase();const click=String(btn.getAttribute?.('onclick')||'');if(t==='send quote'||t==='resend quote'||click.includes('sendQuoteEmailForOrder'))btn.remove()});
    const title=document.querySelector('[data-view="orders"] .page-title .muted');if(title)title.textContent='Review new orders, move them into production, and mark them ready when finished.';
    const todayLabel=$("todayNeedQuotes")?.nextElementSibling;if(todayLabel)todayLabel.textContent='New requests';
    const priceLabel=$("orderPrice")?.closest('label');if(priceLabel&&priceLabel.childNodes[0])priceLabel.childNodes[0].textContent='Order price';
    const lineHelp=$("orderLineItemsPanel")?.querySelector('.order-line-items-head small');if(lineHelp)lineHelp.textContent="Set each item's price. The order total updates automatically.";
    const picker=$("orderPaymentMethodChoices")?.closest('.order-payment-method-picker');if(picker)picker.classList.add('hidden');
    const tiny=$("orderPaymentSection")?.querySelector('.tiny-note');if(tiny)tiny.classList.add('hidden');
    const quoteAccept=$("customerQuoteAcceptWrap");if(quoteAccept)quoteAccept.classList.add('hidden');
  }
  try{const originalRenderOrders=renderOrders;renderOrders=function(){originalRenderOrders();stripQuoteAdminUI()}}catch{}
  try{const originalOpenOrder=openOrder;openOrder=function(id){const out=originalOpenOrder(id);setTimeout(stripQuoteAdminUI,0);return out}}catch{}

  stripQuoteAdminUI();
  const style=document.createElement('style');style.textContent=`
    .customer-checkout-payment{margin:14px 0 16px;padding:17px;border-radius:16px;background:rgba(255,255,255,.035);border:1px solid color-mix(in srgb,var(--store-accent,#8b5cf6) 34%,rgba(255,255,255,.08))}.customer-checkout-payment-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px}.customer-checkout-payment-head small{display:block;color:var(--store-accent,#a78bfa);font-size:.68rem;font-weight:950;letter-spacing:.13em}.customer-checkout-payment-head strong{display:block;margin-top:3px;font-size:1.05rem}.customer-checkout-payment-head>span{color:#aaa2b2;font-size:.76rem;font-weight:750}.customer-checkout-payment-methods{display:grid;gap:8px}.customer-checkout-payment-methods>div{display:grid;grid-template-columns:minmax(90px,.7fr) 1.3fr;gap:12px;padding:11px 12px;border-radius:11px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06)}.customer-checkout-payment-methods span{overflow-wrap:anywhere;color:#ddd6e8}.customer-checkout-agreement{margin:12px 0 0;color:#aaa2b2;font-size:.8rem;line-height:1.5}.customer-checkout-agreement strong{color:#fff}.customer-payment-order-number-reminder{margin:14px 0;padding:16px 17px;border-radius:15px;text-align:center;background:color-mix(in srgb,var(--store-accent,#8b5cf6) 15%,rgba(255,255,255,.025));border:2px solid color-mix(in srgb,var(--store-accent,#8b5cf6) 62%,rgba(255,255,255,.12));box-shadow:0 0 0 3px color-mix(in srgb,var(--store-accent,#8b5cf6) 7%,transparent)}.customer-payment-order-number-reminder small{display:block;color:var(--store-accent,#a78bfa);font-size:.68rem;font-weight:950;letter-spacing:.14em;margin-bottom:7px}.customer-payment-order-number-reminder strong{display:block;font-size:1rem;line-height:1.45}.customer-payment-order-number-reminder strong span{color:var(--store-accent,#c4b5fd);font-size:1.12em;white-space:nowrap}.customer-payment-order-number-reminder p{margin:7px 0 0;color:#aaa2b2;font-size:.78rem;line-height:1.4}.customer-payment-order-number-reminder.portal-reminder{text-align:left;margin-top:16px}@media(max-width:520px){.customer-checkout-payment-head{align-items:flex-start;flex-direction:column}.customer-checkout-payment-methods>div{grid-template-columns:1fr;gap:4px}.customer-payment-order-number-reminder{padding:14px}}
  `;document.head.appendChild(style);window.PRINTBOOK_BUILD='5.20.0';renderCustomerOrderCart();renderOrders();loadGlobalPaymentMethods().then(()=>{if($("customerCartDialog")?.open)ensureCheckoutPayment({loading:false})}).catch(()=>{});
})();
