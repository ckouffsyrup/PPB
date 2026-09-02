/* PrintBook 5.21.0 — direct order flow, no quote stage. */
(() => {
  const legacyStatus = status => (status === "Quoted" || status === "Accepted") ? "Approved" : (status || "Requested");

  function patchNoQuoteUI(){
    // Orders page wording + pipeline.
    const ordersView = document.querySelector('[data-view="orders"]');
    if(ordersView){
      const intro = ordersView.querySelector('.page-title .muted');
      if(intro) intro.textContent = "Review requests, approve them, then move them through production and completion.";
    }

    const status = $("orderStatus");
    if(status){
      [...status.options].forEach(option => {
        if(option.value === "Quoted" || option.value === "Accepted" || option.textContent === "Quoted" || option.textContent === "Accepted") option.remove();
      });
      if(status.value === "Quoted" || status.value === "Accepted") status.value = "Approved";
    }

    // Remove quote-only pipeline cards and filters.
    $("orderQuotedCount")?.closest('.stat-card')?.remove();
    $("orderAcceptedCount")?.closest('.stat-card')?.remove();
    document.querySelectorAll('#orderFilter [data-status="Quoted"], #orderFilter [data-status="Accepted"]').forEach(el => el.remove());

    // Dashboard: requests simply need review/approval now.
    const needReview = $("todayNeedQuotes");
    if(needReview){
      const label = needReview.parentElement?.querySelector('span');
      if(label) label.textContent = "Needs review";
    }
    const orderValue = $("dashOrderValue");
    if(orderValue && /quoted/i.test(orderValue.textContent || "")) orderValue.textContent = (orderValue.textContent || "").replace(/quoted/ig,"open value");

    // Order editor: prices are final order prices, not quotes.
    const priceLabel = $("orderPrice")?.closest('label');
    if(priceLabel){
      [...priceLabel.childNodes].forEach(node => {
        if(node.nodeType === Node.TEXT_NODE && /quoted price/i.test(node.textContent || "")) node.textContent = (node.textContent || "").replace(/Quoted price/i,"Order price");
      });
    }
    const lineHead = $("orderLineItemsPanel")?.querySelector('.order-line-items-head small');
    if(lineHead) lineHead.textContent = "Set each item's price. The order total updates automatically.";
    const lineSummary = $("orderLineItemsQuoteTotal")?.parentElement?.querySelector('span');
    if(lineSummary) lineSummary.textContent = "Items subtotal";

    // Payment settings are general order payment options.
    const pickerHead = document.querySelector('.order-payment-picker-head');
    if(pickerHead){
      const strong = pickerHead.querySelector('strong');
      const small = pickerHead.querySelector('small');
      if(strong) strong.textContent = "Payment options for this order";
      if(small) small.textContent = "Choose from the methods saved in Settings → Storefront.";
    }
    const paymentNote = $("orderPaymentSection")?.querySelector('.tiny-note');
    if(paymentNote) paymentNote.textContent = "These instructions are shown directly on the customer's private order page.";

    const paymentSettings = document.querySelector('.payment-methods-settings');
    if(paymentSettings){
      const desc = paymentSettings.querySelector('.section-heading .muted');
      if(desc) desc.textContent = "Enter these once, then choose which ones to use for each order.";
      const note = paymentSettings.querySelector('.tiny-note');
      if(note) note.textContent = "Only enabled methods appear when you edit an order.";
    }

    // Cart/price helper wording.
    const cartNote = $("submitCustomerCartBtn")?.closest('.customer-cart-actions')?.nextElementSibling;
    if(cartNote && /quote/i.test(cartNote.textContent || "")) cartNote.textContent = "You will receive one order number for the whole order.";
    const hp = $("priceHelperDialog")?.querySelector(':scope > .sheet > .muted');
    if(hp) hp.textContent = "Build a quick price before you create a catalog entry.";

    // Customer portal has no quote acceptance stage anymore.
    const acceptWrap = $("customerQuoteAcceptWrap");
    if(acceptWrap) acceptWrap.remove();
    const paymentMessage = $("customerPortalPaymentMessage");
    const paymentHint = $("customerPortalPaymentHint");
    if(paymentMessage && /quote/i.test(paymentMessage.textContent || "")) paymentMessage.textContent = "Your order is waiting for review.";
    if(paymentHint && /quote/i.test(paymentHint.textContent || "")) paymentHint.textContent = "ORDER REVIEW";

    // Clean any remaining visible quote wording that belongs to this old workflow.
    document.querySelectorAll('small, p, span, strong, button').forEach(el => {
      if(el.closest('#priceHelperResult')) return;
      const t = (el.textContent || "").trim();
      if(t === "QUOTE APPROVAL") el.textContent = "ORDER APPROVAL";
      else if(t === "Accept quote") el.textContent = "Approve order";
      else if(t === "Resend quote") el.remove();
      else if(t === "Send quote") el.textContent = "Approve";
      else if(t === "Need quotes") el.textContent = "Needs review";
    });
  }

  // Existing records from the retired quote flow should keep working.
  function normalizeLegacyOrders(){
    let changed = false;
    orders.forEach(order => {
      const normalized = legacyStatus(order.status);
      if(order.status !== normalized){ order.status = normalized; changed = true; }
    });
    if(changed){
      try{ localStorage.setItem(K.orders, JSON.stringify(orders)); }catch{}
    }
  }

  normalizeLegacyOrders();

  // Direct workflow: Requested -> Approved -> Printing -> Ready -> Completed.
  orderNextStep = function(status){
    const s = legacyStatus(status);
    return ({Requested:["Approved","Approve"],Approved:["Printing","Start printing"],Printing:["Ready","Mark ready"],Ready:["Completed","Complete"]})[s] || null;
  };

  const originalRenderDashboard = renderDashboard;
  renderDashboard = function(){
    normalizeLegacyOrders();
    originalRenderDashboard();
    patchNoQuoteUI();
    document.querySelectorAll('.dashboard-attention-row').forEach(row => {
      const text = row.textContent || "";
      if(/need a quote/i.test(text)){
        const strong = row.querySelector('strong');
        const action = row.querySelector('span:last-child');
        if(strong) strong.textContent = strong.textContent.replace(/need a quote/i,"need review");
        if(action) action.textContent = "Review requests →";
      }
      if(/accepted quotes/i.test(text) || /quotes are waiting/i.test(text)) row.remove();
    });
  };

  const originalRenderOrders = renderOrders;
  renderOrders = function(){
    normalizeLegacyOrders();
    originalRenderOrders();
    patchNoQuoteUI();
    document.querySelectorAll('.order-board-column').forEach(col => {
      const status = col.querySelector('.order-board-heading span')?.textContent?.trim();
      if(status === "Quoted" || status === "Accepted") col.remove();
    });
  };

  const originalOpenOrder = openOrder;
  openOrder = async function(id){
    const order = orders.find(x => x.id === id);
    if(order && (order.status === "Quoted" || order.status === "Accepted")) order.status = "Approved";
    await originalOpenOrder(id);
    patchNoQuoteUI();
  };

  const originalSaveOrder = saveOrder;
  saveOrder = async function(){
    const status = $("orderStatus");
    if(status && (status.value === "Quoted" || status.value === "Accepted")) status.value = "Approved";
    return originalSaveOrder();
  };
  if($("saveOrderBtn")) $("saveOrderBtn").onclick = saveOrder;

  customerOrderTimeline = function(order){
    const status = legacyStatus(order?.status);
    const stages = ["Requested","Approved","Printing","Ready","Completed"];
    const cur = Math.max(0, stages.indexOf(status));
    return `<div class="customer-order-timeline">${stages.map((st,i)=>`<div class="customer-order-step ${i<cur?"done":i===cur?"current":""}"><span>${i<cur?"✓":i+1}</span><small>${safe(st)}</small></div>`).join("")}</div>`;
  };

  customerOrderProgress = function(status){
    const s = legacyStatus(status);
    if(s === "Cancelled") return `<div class="customer-order-cancelled">Order cancelled</div>`;
    const stages = ["Requested","Approved","Printing","Ready","Completed"];
    const cur = Math.max(0, stages.indexOf(s));
    return stages.map((step,i)=>`<div class="customer-order-progress-step ${i<=cur?"done":""} ${i===cur?"current":""}"><i></i><span>${safe(step)}</span></div>`).join("");
  };

  customerStatusMeta = function(status){
    const s = legacyStatus(status);
    const copy = {
      Requested:["Request received","Your order is waiting for review."],
      Approved:["Order approved","Everything is confirmed and your print is in the production queue."],
      Printing:["Printing now","Your order is actively being made."],
      Ready:["Ready for you","Your order is finished and ready for pickup or delivery."],
      Completed:["Order complete","This order has been completed. Thank you!"],
      Cancelled:["Order cancelled","This order is no longer active."]
    };
    const stages = ["Requested","Approved","Printing","Ready","Completed"];
    const c = copy[s] || [s || "Order update","Check back for the latest progress."];
    const index = stages.indexOf(s);
    return {title:c[0],detail:c[1],percent:s==="Cancelled"?0:index<0?0:Math.round((index/(stages.length-1))*100)};
  };

  const originalRenderCustomerPortalOrder = renderCustomerPortalOrder;
  renderCustomerPortalOrder = function(order){
    const normalized = {...order,status:legacyStatus(order?.status),can_accept_quote:false};
    originalRenderCustomerPortalOrder(normalized);
    patchNoQuoteUI();
    if($("customerPortalStatus")) $("customerPortalStatus").textContent = normalized.status;
    if(normalized.status === "Requested"){
      if($("customerPortalPaymentHint")) $("customerPortalPaymentHint").textContent = "ORDER REVIEW";
      if($("customerPortalPaymentMessage")) $("customerPortalPaymentMessage").textContent = "Your order is in. Payment instructions will appear here when they are ready.";
    }
  };

  const style=document.createElement('style');
  style.textContent=`
    #orderDialog[open] > .sheet{position:fixed!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;margin:0!important;}
    #customerQuoteAcceptWrap,[data-status="Quoted"],[data-status="Accepted"]{display:none!important;}
  `;
  document.head.appendChild(style);

  patchNoQuoteUI();
  renderOrders();
  renderDashboard();
  window.PRINTBOOK_BUILD = "5.21.0";
})();
