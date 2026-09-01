/* PrintBook 5.19.0 — checkout is the agreement; show total + payment before submit. */
(() => {
  function paymentRows(){
    const methods=normalizedPaymentMethods(storeAvailability?.payment_methods||settings?.paymentMethods||{});
    return Object.entries(methods).filter(([,m])=>m?.enabled&&String(m.detail||"").trim()).map(([key,m])=>({label:PAYMENT_METHOD_DEFS?.[key]?.label||m.label||key,detail:String(m.detail||"").trim()}));
  }
  function ensureCheckoutPayment(){
    const checkout=document.querySelector('.customer-cart-checkout');
    if(!checkout)return null;
    let box=$("customerCheckoutPayment");
    if(!box){
      box=document.createElement('section');box.id='customerCheckoutPayment';box.className='customer-checkout-payment';
      const total=document.querySelector('.customer-cart-total');
      if(total)total.insertAdjacentElement('afterend',box);else checkout.prepend(box);
    }
    const rows=paymentRows();
    box.innerHTML=`<div class="customer-checkout-payment-head"><div><small>HOW TO PAY</small><strong>Payment details</strong></div><span>Pay after submitting</span></div><div class="customer-checkout-payment-methods">${rows.length?rows.map(r=>`<div><strong>${safe(r.label)}</strong><span>${safe(r.detail)}</span></div>`).join(''):'<p>Payment instructions will be available with your order.</p>'}</div><p class="customer-checkout-agreement">By submitting this order, you agree to the total shown above and the print options in your cart. After submitting, use your new <strong>KP order number</strong> in the payment note so the payment can be matched to your order.</p>`;
    const totalLabel=document.querySelector('.customer-cart-total span');if(totalLabel)totalLabel.textContent='Order total';
    const submit=$("submitCustomerCartBtn");if(submit)submit.textContent='Submit Order';
    const oldNote=checkout.querySelector(':scope > small.muted');if(oldNote)oldNote.textContent='Submitting places your order. No separate quote or quote-acceptance step is required.';
    return box;
  }
  const originalRender=renderCustomerOrderCart;
  renderCustomerOrderCart=function(){originalRender();ensureCheckoutPayment()};
  const originalOpen=openCustomerOrderCart;
  openCustomerOrderCart=function(){const r=originalOpen();ensureCheckoutPayment();return r};
  function removeQuoteUI(){
    document.querySelectorAll('#orderFilter [data-status="Quoted"],#orderFilter [data-status="Accepted"],#orderFilter [data-status="Approved"]').forEach(x=>x.remove());
    const status=$("orderStatus");if(status){[...status.options].forEach(o=>{if(['Quoted','Accepted'].includes(o.value))o.remove()});if(['Quoted','Accepted'].includes(status.value))status.value='Approved'}
    const quoteCard=$("customerQuoteReadyCard");if(quoteCard)quoteCard.classList.add('hidden');
    const accept=$("customerQuoteAcceptWrap");if(accept)accept.classList.add('hidden');
  }
  removeQuoteUI();
  const style=document.createElement('style');style.textContent=`
    .customer-checkout-payment{margin:14px 0 16px;padding:17px;border-radius:16px;background:rgba(255,255,255,.035);border:1px solid color-mix(in srgb,var(--store-accent,#8b5cf6) 34%,rgba(255,255,255,.08))}.customer-checkout-payment-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px}.customer-checkout-payment-head small{display:block;color:var(--store-accent,#a78bfa);font-size:.68rem;font-weight:950;letter-spacing:.13em}.customer-checkout-payment-head strong{display:block;margin-top:3px;font-size:1.05rem}.customer-checkout-payment-head>span{color:#aaa2b2;font-size:.76rem;font-weight:750}.customer-checkout-payment-methods{display:grid;gap:8px}.customer-checkout-payment-methods>div{display:grid;grid-template-columns:minmax(90px,.7fr) 1.3fr;gap:12px;padding:11px 12px;border-radius:11px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06)}.customer-checkout-payment-methods span{overflow-wrap:anywhere;color:#ddd6e8}.customer-checkout-agreement{margin:12px 0 0;color:#aaa2b2;font-size:.8rem;line-height:1.5}.customer-checkout-agreement strong{color:#fff}@media(max-width:520px){.customer-checkout-payment-head{align-items:flex-start;flex-direction:column}.customer-checkout-payment-methods>div{grid-template-columns:1fr;gap:4px}}
  `;document.head.appendChild(style);window.PRINTBOOK_BUILD='5.19.0';renderCustomerOrderCart();
})();
