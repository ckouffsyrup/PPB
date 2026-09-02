/* PrintBook 5.19.6 — permanent no-quote workflow, centered order editor, safe submit watchdog. */
(() => {
  const DIRECT_ORDER_FLOW={Requested:["Approved","Approve order"],Quoted:["Approved","Approve order"],Accepted:["Approved","Approve order"],Approved:["Printing","Start printing"],Printing:["Ready","Mark ready"],Ready:["Completed","Complete"]};
  try{orderNextStep=function(status){return DIRECT_ORDER_FLOW[status]||null}}catch{}

  function stripQuoteEraUi(){
    document.querySelectorAll('#orderFilter [data-status="Quoted"],#orderFilter [data-status="Accepted"]').forEach(el=>el.remove());
    const quotedCount=$("orderQuotedCount"),acceptedCount=$("orderAcceptedCount");quotedCount?.closest('.stat-card')?.remove();acceptedCount?.closest('.stat-card')?.remove();
    const title=document.querySelector('[data-view="orders"] .page-title .muted');if(title)title.textContent='Review new orders, move them into production, and mark them ready when finished.';
    document.querySelectorAll('.order-board-column').forEach(col=>{const label=col.querySelector('.order-board-heading span')?.textContent?.trim();if(label==='Quoted'||label==='Accepted')col.remove()});
    document.querySelectorAll('[onclick*="sendQuoteEmailForOrder"],button').forEach(btn=>{const text=String(btn.textContent||'').trim().toLowerCase(),click=String(btn.getAttribute?.('onclick')||'');if(click.includes('sendQuoteEmailForOrder')||text==='send quote'||text==='resend quote')btn.remove()});
    document.querySelectorAll('.order-card p').forEach(p=>{const text=String(p.textContent||'').toLowerCase();if(text.includes('waiting for acceptance')||text.includes('customer accepted'))p.remove()});
  }

  try{const originalOrderCardHTML=orderCardHTML;orderCardHTML=function(order,opts={}){let html=originalOrderCardHTML(order,opts);html=html.replace(/<p class="muted">Waiting for acceptance[^<]*<\/p>/g,'').replace(/<p class="order-accepted-note">[\s\S]*?<\/p>/g,'').replace(/<button class="secondary order-advance-btn" type="button" onclick="event\.stopPropagation\(\);sendQuoteEmailForOrder\([^<]*?<\/button>/g,'');return html}}catch{}
  try{const originalRenderOrders=renderOrders;renderOrders=function(){originalRenderOrders();stripQuoteEraUi()}}catch{}

  function cleanOrderEditorCopy(){
    const dialog=$("orderDialog");if(!dialog)return;
    dialog.querySelectorAll('small,p,span').forEach(el=>{const text=String(el.textContent||'').trim();if(text==='Set each item’s price. The quote total updates automatically.'||text==="Set each item's price. The quote total updates automatically.")el.textContent='Set each item’s price. The order total updates automatically.'});
  }
  try{const originalOpenOrder=openOrder;openOrder=function(id){const out=originalOpenOrder(id);setTimeout(cleanOrderEditorCopy,0);return out}}catch{}

  function paymentReferenceReminder(number){
    const clean=String(number||'').trim();if(!clean||clean==='KP-0000'||clean==='—')return;
    const numberEl=$("customerOrderConfirmNumber"),card=numberEl?.closest('.customer-order-number-card');if(!card)return;
    let reminder=$("customerPaymentOrderNumberReminder");if(!reminder){reminder=document.createElement('div');reminder.id='customerPaymentOrderNumberReminder';reminder.className='customer-payment-order-number-reminder';card.insertAdjacentElement('afterend',reminder)}
    reminder.innerHTML=`<small>IMPORTANT FOR PAYMENT</small><strong>USE ORDER NUMBER <span>${safe(clean)}</span> AS YOUR PAYMENT SUBJECT / NOTE</strong><p>Please include it exactly as shown so your payment can be matched to this order.</p>`;
  }
  try{const originalConfirmation=showCustomerOrderConfirmation;showCustomerOrderConfirmation=function(result,itemName){const out=originalConfirmation(result,itemName);paymentReferenceReminder(result?.order_number||$("customerOrderConfirmNumber")?.textContent);return out}}catch{}

  // Take ownership of the actual checkout button after app.js has already wired it.
  // This guarantees the UI can never remain on "Submitting…" forever.
  try{
    const submitBtn=$("submitCustomerCartBtn");
    const originalSubmitCustomerOrderCart=submitCustomerOrderCart;
    let submitRunning=false;
    async function guardedSubmitCustomerOrderCart(){
      if(submitRunning)return;
      submitRunning=true;
      if(submitBtn){submitBtn.dataset.submitting='1';submitBtn.disabled=true;submitBtn.textContent='Submitting…'}
      let timedOut=false,timer=null;
      try{
        await Promise.race([
          Promise.resolve(originalSubmitCustomerOrderCart()),
          new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;reject(new Error('Order submission took too long. Your cart is still saved — please try again.'))},18000)})
        ]);
      }catch(err){
        console.error('Customer checkout watchdog',err);
        if(timedOut)toast('Order submission timed out. Your cart is still saved.');
      }finally{
        if(timer)clearTimeout(timer);
        submitRunning=false;
        if(submitBtn){delete submitBtn.dataset.submitting;submitBtn.disabled=false;if(!$("customerOrderConfirmationDialog")?.open)submitBtn.textContent='Submit Order'}
      }
    }
    submitCustomerOrderCart=guardedSubmitCustomerOrderCart;
    if(submitBtn)submitBtn.onclick=guardedSubmitCustomerOrderCart;
  }catch(err){console.error('Could not install checkout watchdog',err)}

  stripQuoteEraUi();cleanOrderEditorCopy();
  const style=document.createElement('style');style.textContent=`
    .customer-payment-order-number-reminder{margin:14px 0 18px;padding:16px 17px;border-radius:15px;text-align:center;background:color-mix(in srgb,var(--store-accent,#8b5cf6) 15%,rgba(255,255,255,.025));border:2px solid color-mix(in srgb,var(--store-accent,#8b5cf6) 62%,rgba(255,255,255,.12));box-shadow:0 0 0 3px color-mix(in srgb,var(--store-accent,#8b5cf6) 7%,transparent)}
    .customer-payment-order-number-reminder small{display:block;color:var(--store-accent,#a78bfa);font-size:.68rem;font-weight:950;letter-spacing:.14em;margin-bottom:7px}.customer-payment-order-number-reminder strong{display:block;font-size:1rem;line-height:1.45}.customer-payment-order-number-reminder strong span{color:var(--store-accent,#c4b5fd);font-size:1.15em;white-space:nowrap}.customer-payment-order-number-reminder p{margin:7px 0 0;color:#aaa2b2;font-size:.78rem;line-height:1.4}
    /* Keep the main Edit Order sheet centered. Returning-customer info is a sidecar and must never shift the sheet. */
    #orderDialog[open]{width:min(700px,calc(100vw - 32px))!important;max-width:700px!important;margin:auto!important;overflow:visible!important;left:0!important;right:0!important}
    #orderDialog[open]>.sheet,#orderDialog[open] .sheet{width:100%!important;max-width:700px!important;margin:0!important}
    #customerHistoryCard:not(.hidden){position:fixed!important;left:calc(50vw + 370px)!important;top:50%!important;transform:translateY(-50%)!important;width:290px!important;max-width:calc(50vw - 390px)!important;z-index:2147483000!important;margin:0!important}
    @media(max-width:1100px){#customerHistoryCard:not(.hidden){position:static!important;transform:none!important;width:auto!important;max-width:none!important;margin:14px 0 0!important}#orderDialog[open]{overflow:auto!important}}
  `;document.head.appendChild(style);window.PRINTBOOK_BUILD='5.19.6';
})();
