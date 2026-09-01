/* PrintBook 5.18.4 — make ready quotes impossible to miss in My Order. */
(() => {
  function quotePaymentText(order){
    if(order?.payment_instructions) return String(order.payment_instructions).trim();
    const rawNotes=Array.isArray(order?.notes)?order.notes.filter(Boolean):[];
    const paymentNote=rawNotes.find(n=>String(n).trim().toLowerCase().startsWith(PAYMENT_NOTE_PREFIX.toLowerCase()));
    return paymentNote?String(paymentNote).slice(String(paymentNote).indexOf(":")+1).trim():"";
  }

  function ensureCustomerQuoteCard(){
    let card=$("customerQuoteReadyCard");
    if(card)return card;
    const content=$("customerPortalContent");
    const progress=$("customerPortalProgress");
    if(!content||!progress)return null;

    card=document.createElement("section");
    card.id="customerQuoteReadyCard";
    card.className="customer-quote-ready-card hidden";
    card.innerHTML=`
      <div class="customer-quote-ready-head">
        <div>
          <span class="customer-quote-ready-kicker">YOUR QUOTE IS READY</span>
          <h3>Review your order</h3>
        </div>
        <div class="customer-quote-ready-price">
          <small>FINAL PRICE</small>
          <strong id="customerQuoteReadyPrice">$0</strong>
        </div>
      </div>
      <div class="customer-quote-ready-payment">
        <small>HOW TO PAY</small>
        <div id="customerQuoteReadyPayment">Payment details will appear here.</div>
      </div>
      <p class="customer-quote-ready-help">If everything looks right, accept the quote below. Your payment details stay available on this private order page even if you miss the email.</p>
      <div class="customer-quote-ready-actions" id="customerQuoteReadyActions"></div>`;
    content.insertBefore(card,progress);
    return card;
  }

  function renderCustomerQuoteReadyCard(order){
    const card=ensureCustomerQuoteCard();
    if(!card)return;
    const quoted=order?.status==="Quoted" || !!order?.can_accept_quote;
    card.classList.toggle("hidden",!quoted);
    if(!quoted)return;

    $("customerQuoteReadyPrice").textContent=money(order?.quoted_price||0);
    const payment=quotePaymentText(order);
    const paymentBox=$("customerQuoteReadyPayment");
    if(paymentBox){
      paymentBox.innerHTML=payment
        ? payment.split("\n").filter(Boolean).map(line=>`<div>${safe(line)}</div>`).join("")
        : `<div class="customer-quote-payment-missing">Payment instructions are being prepared. Check back shortly.</div>`;
    }

    const actions=$("customerQuoteReadyActions");
    if(!actions)return;
    actions.innerHTML="";

    const accept=$("acceptCustomerQuoteBtn");
    const oldWrap=$("customerQuoteAcceptWrap");
    if(accept){
      accept.classList.add("customer-quote-ready-accept");
      actions.appendChild(accept);
      if(oldWrap)oldWrap.classList.add("hidden");
    }

    const paymentLink=String(order?.payment_link||"").trim();
    if(paymentLink){
      const pay=document.createElement("button");
      pay.type="button";
      pay.className="secondary customer-quote-ready-pay";
      pay.textContent="Open payment link";
      pay.onclick=()=>{location.href=paymentLink};
      actions.appendChild(pay);
    }
  }

  const originalRenderCustomerPortalOrder=renderCustomerPortalOrder;
  renderCustomerPortalOrder=function(order){
    originalRenderCustomerPortalOrder(order);
    renderCustomerQuoteReadyCard(order);
  };

  const style=document.createElement("style");
  style.textContent=`
    .customer-quote-ready-card{
      margin:18px 0 22px;
      padding:22px;
      border:1px solid color-mix(in srgb,var(--store-accent,#8b5cf6) 48%,rgba(255,255,255,.10));
      border-radius:20px;
      background:
        radial-gradient(circle at 92% 8%,color-mix(in srgb,var(--store-accent,#8b5cf6) 18%,transparent),transparent 44%),
        linear-gradient(145deg,#171220,#100d17);
      box-shadow:0 18px 48px rgba(0,0,0,.26);
    }
    .customer-quote-ready-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding-bottom:17px;border-bottom:1px solid rgba(255,255,255,.08)}
    .customer-quote-ready-kicker{display:block;margin-bottom:7px;color:var(--store-accent,#a78bfa);font-size:.7rem;font-weight:950;letter-spacing:.14em}
    .customer-quote-ready-head h3{margin:0;font-size:1.35rem;letter-spacing:-.025em}
    .customer-quote-ready-price{text-align:right;flex:0 0 auto}
    .customer-quote-ready-price small,.customer-quote-ready-payment>small{display:block;color:#92899f;font-size:.68rem;font-weight:900;letter-spacing:.12em}
    .customer-quote-ready-price strong{display:block;margin-top:4px;color:#fff;font-size:2rem;line-height:1;font-weight:950;letter-spacing:-.04em}
    .customer-quote-ready-payment{margin-top:17px;padding:16px;border-radius:15px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07)}
    #customerQuoteReadyPayment{display:grid;gap:7px;margin-top:9px;color:#f0ebf6;font-size:.95rem;line-height:1.45;font-weight:650;white-space:normal;overflow-wrap:anywhere}
    .customer-quote-payment-missing{color:#aaa2b2;font-weight:550}
    .customer-quote-ready-help{margin:14px 0 0;color:#9e96aa;font-size:.8rem;line-height:1.5}
    .customer-quote-ready-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:17px}
    .customer-quote-ready-actions:has(.customer-quote-ready-accept:only-child){grid-template-columns:1fr}
    .customer-quote-ready-actions button{min-height:48px;margin:0!important}
    .customer-quote-ready-accept{background:var(--store-accent,#8b5cf6)!important;border-color:var(--store-accent,#8b5cf6)!important}
    @media(max-width:520px){
      .customer-quote-ready-card{padding:18px 16px;margin:15px 0 19px}
      .customer-quote-ready-head{align-items:center}
      .customer-quote-ready-price strong{font-size:1.65rem}
      .customer-quote-ready-actions{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(style);
  window.PRINTBOOK_BUILD="5.18.4";
})();
