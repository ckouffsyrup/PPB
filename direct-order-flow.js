/* PrintBook 5.19.5 — permanent no-quote admin workflow + confirmation payment reminder. */
(() => {
  const DIRECT_ORDER_FLOW = {
    Requested:["Approved","Approve order"],
    Quoted:["Approved","Approve order"],
    Accepted:["Approved","Approve order"],
    Approved:["Printing","Start printing"],
    Printing:["Ready","Mark ready"],
    Ready:["Completed","Complete"]
  };

  // The checkout itself is the customer's agreement. Quotes/acceptance are no
  // longer part of the active workflow.
  try{orderNextStep=function(status){return DIRECT_ORDER_FLOW[status]||null}}catch{}

  function stripQuoteEraUi(){
    document.querySelectorAll('#orderFilter [data-status="Quoted"],#orderFilter [data-status="Accepted"]').forEach(el=>el.remove());

    const quotedCount=$("orderQuotedCount"),acceptedCount=$("orderAcceptedCount");
    quotedCount?.closest('.stat-card')?.remove();
    acceptedCount?.closest('.stat-card')?.remove();

    const title=document.querySelector('[data-view="orders"] .page-title .muted');
    if(title)title.textContent='Review new orders, move them into production, and mark them ready when finished.';

    document.querySelectorAll('.order-board-column').forEach(col=>{
      const label=col.querySelector('.order-board-heading span')?.textContent?.trim();
      if(label==='Quoted'||label==='Accepted')col.remove();
    });

    document.querySelectorAll('[onclick*="sendQuoteEmailForOrder"],button').forEach(btn=>{
      const text=String(btn.textContent||'').trim().toLowerCase();
      const click=String(btn.getAttribute?.('onclick')||'');
      if(click.includes('sendQuoteEmailForOrder')||text==='send quote'||text==='resend quote')btn.remove();
    });

    document.querySelectorAll('.order-card p').forEach(p=>{
      const text=String(p.textContent||'').toLowerCase();
      if(text.includes('waiting for acceptance')||text.includes('customer accepted'))p.remove();
    });
  }

  // Existing card renderer still contains old quote-only markup for legacy
  // records. Remove only that obsolete markup after it renders.
  try{
    const originalOrderCardHTML=orderCardHTML;
    orderCardHTML=function(order,opts={}){
      let html=originalOrderCardHTML(order,opts);
      html=html.replace(/<p class="muted">Waiting for acceptance[^<]*<\/p>/g,'');
      html=html.replace(/<p class="order-accepted-note">[\s\S]*?<\/p>/g,'');
      html=html.replace(/<button class="secondary order-advance-btn" type="button" onclick="event\.stopPropagation\(\);sendQuoteEmailForOrder\([^<]*?<\/button>/g,'');
      return html;
    };
  }catch{}

  try{
    const originalRenderOrders=renderOrders;
    renderOrders=function(){
      originalRenderOrders();
      stripQuoteEraUi();
    };
  }catch{}

  function paymentReferenceReminder(number){
    const clean=String(number||'').trim();
    if(!clean||clean==='KP-0000'||clean==='—')return;
    const numberEl=$("customerOrderConfirmNumber");
    const card=numberEl?.closest('.customer-order-number-card');
    if(!card)return;
    let reminder=$("customerPaymentOrderNumberReminder");
    if(!reminder){
      reminder=document.createElement('div');
      reminder.id='customerPaymentOrderNumberReminder';
      reminder.className='customer-payment-order-number-reminder';
      card.insertAdjacentElement('afterend',reminder);
    }
    reminder.innerHTML=`<small>IMPORTANT FOR PAYMENT</small><strong>USE ORDER NUMBER <span>${safe(clean)}</span> AS YOUR PAYMENT SUBJECT / NOTE</strong><p>Please include it exactly as shown so your payment can be matched to this order.</p>`;
  }

  // Attach to the exact function that receives the returned KP number. This is
  // reliable across desktop/mobile and does not depend on dialog toggle events.
  try{
    const originalConfirmation=showCustomerOrderConfirmation;
    showCustomerOrderConfirmation=function(result,itemName){
      const out=originalConfirmation(result,itemName);
      paymentReferenceReminder(result?.order_number||$("customerOrderConfirmNumber")?.textContent);
      return out;
    };
  }catch{}

  stripQuoteEraUi();
  const style=document.createElement('style');
  style.textContent=`
    .customer-payment-order-number-reminder{margin:14px 0 18px;padding:16px 17px;border-radius:15px;text-align:center;background:color-mix(in srgb,var(--store-accent,#8b5cf6) 15%,rgba(255,255,255,.025));border:2px solid color-mix(in srgb,var(--store-accent,#8b5cf6) 62%,rgba(255,255,255,.12));box-shadow:0 0 0 3px color-mix(in srgb,var(--store-accent,#8b5cf6) 7%,transparent)}
    .customer-payment-order-number-reminder small{display:block;color:var(--store-accent,#a78bfa);font-size:.68rem;font-weight:950;letter-spacing:.14em;margin-bottom:7px}.customer-payment-order-number-reminder strong{display:block;font-size:1rem;line-height:1.45}.customer-payment-order-number-reminder strong span{color:var(--store-accent,#c4b5fd);font-size:1.15em;white-space:nowrap}.customer-payment-order-number-reminder p{margin:7px 0 0;color:#aaa2b2;font-size:.78rem;line-height:1.4}
  `;
  document.head.appendChild(style);
  window.PRINTBOOK_BUILD='5.19.5';
})();
