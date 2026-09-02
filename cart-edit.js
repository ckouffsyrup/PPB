/* PrintBook 5.20.1 — customer cart editing, durable payment methods, simpler order flow. */
(() => {
  let editingCustomerCartId = null;

  function resetCustomerCartEditState(){
    editingCustomerCartId = null;
    const submit = $("submitPrintRequestBtn");
    if(submit) submit.textContent = "Add to Order";
  }

  function attachCustomerCartEditButtons(){
    const list = $("customerCartList");
    if(!list) return;
    list.querySelectorAll("[data-remove-cart-line]").forEach(removeBtn => {
      const cartId = removeBtn.dataset.removeCartLine;
      if(!cartId || removeBtn.parentElement?.querySelector(`[data-edit-cart-line="${CSS.escape(cartId)}"]`)) return;
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.dataset.editCartLine = cartId;
      editBtn.textContent = "✎ Edit";
      editBtn.className = "customer-cart-edit-btn";
      editBtn.onclick = () => openCustomerCartLineEditor(cartId);
      removeBtn.textContent = "Remove";
      removeBtn.classList.add("customer-cart-remove-btn");
      removeBtn.parentElement?.insertBefore(editBtn, removeBtn);
    });
  }

  const originalRenderCustomerOrderCart = renderCustomerOrderCart;
  renderCustomerOrderCart = function(){
    originalRenderCustomerOrderCart();
    attachCustomerCartEditButtons();
  };

  const originalOpenRequestPrint = openRequestPrint;

  function openCustomerCartLineEditor(cartId){
    const line = customerOrderCart.find(x => x.cart_id === cartId);
    if(!line) return toast("That print is no longer in your order");
    const item = items.find(i => String(i.id) === String(line.print_id));
    if(!item) return toast("That product could not be found");

    editingCustomerCartId = cartId;
    currentRequestPrintId = line.print_id;
    if($("customerCartDialog")?.open) $("customerCartDialog").close();
    originalOpenRequestPrint();

    $("requestPrintTitle").textContent = `Edit ${item.name}`;
    $("requestQty").value = Math.max(1, Number(line.quantity || 1));
    $("requestNotes").value = line.notes || "";

    if(line.variant_id && [...$("requestVariant").options].some(o => o.value === String(line.variant_id))){
      $("requestVariant").value = String(line.variant_id);
    }

    const wantsMulticolor = line.color_mode === "multi" && !!item.multicolor_capable;
    $("requestColorMode").value = wantsMulticolor ? "multi" : "single";
    updateRequestColorMode();

    if(wantsMulticolor){
      const selected = new Set(Array.isArray(line.color_ids) ? line.color_ids.map(String) : []);
      document.querySelectorAll('#requestColorGrid input[type="checkbox"]').forEach(input => {
        input.checked = selected.has(String(input.value));
      });
      updateRequestColorCount();
    } else {
      const filamentValue = String(line.filament_id || "");
      if([...$("requestFilament").options].some(o => o.value === filamentValue)){
        $("requestFilament").value = filamentValue;
      }
      updateRequestEstimate();
    }

    const submit = $("submitPrintRequestBtn");
    if(submit) submit.textContent = "Save Changes";
  }

  const originalAddCurrentRequestToCustomerCart = addCurrentRequestToCustomerCart;

  function saveCurrentRequestToCustomerCart(){
    if(!editingCustomerCartId) return originalAddCurrentRequestToCustomerCart();

    const item = items.find(i => i.id === currentRequestPrintId);
    if(!item) return toast("That product could not be found");
    if(storeAvailability.accepting_requests === false) return toast(storeAvailability.at_capacity ? "The store is at order capacity right now" : "New print requests are temporarily paused");

    const customer = $("requestCustomerName").value.trim();
    if(!customer) return toast("Enter your name");
    const email = $("requestCustomerEmail").value.trim().toLowerCase();
    if(!isValidCustomerEmail(email)) return toast("Enter a valid email so you can recover your order");

    const qty = Math.max(1, Number($("requestQty").value || 1));
    const variantId = $("requestVariant").value;
    const filamentId = $("requestFilament").value;
    const userNotes = $("requestNotes").value.trim();
    const wantsMulticolor = !!item.multicolor_capable && $("requestColorMode").value === "multi";
    const colorIds = wantsMulticolor ? selectedRequestColorIds() : [];
    const maxColors = productMaxColors(item);
    if(wantsMulticolor && colorIds.length < 2) return toast("Choose at least 2 colors");
    if(wantsMulticolor && colorIds.length > maxColors) return toast(`Choose no more than ${maxColors} colors`);

    syncCustomerCartDraftFromRequest();
    const unitPrice = requestUnitPrice();
    const index = customerOrderCart.findIndex(x => x.cart_id === editingCustomerCartId);
    if(index < 0){
      resetCustomerCartEditState();
      return toast("That print is no longer in your order");
    }

    customerOrderCart[index] = {
      ...customerOrderCart[index],
      print_id: item.id,
      name: item.name,
      variant_id: variantId || "",
      filament_id: wantsMulticolor ? "" : (filamentId || ""),
      color_mode: wantsMulticolor ? "multi" : "single",
      color_ids: colorIds,
      quantity: qty,
      notes: userNotes,
      unit_price: unitPrice,
      estimated_total: unitPrice * qty
    };
    saveCustomerCart();

    $("requestPrintDialog").close();
    renderCustomerOrderCart();
    openCustomerOrderCart();
    toast(`${item.name} updated`);
  }

  const submitRequestBtn = $("submitPrintRequestBtn");
  if(submitRequestBtn){
    submitRequestBtn.onclick = () => ((publicVisitorMode || customerMode) ? saveCurrentRequestToCustomerCart() : submitPrintRequest());
  }

  const requestPrintBtn = $("requestPrintBtn");
  if(requestPrintBtn){
    const originalRequestClick = requestPrintBtn.onclick;
    requestPrintBtn.onclick = function(event){
      resetCustomerCartEditState();
      return originalRequestClick?.call(this, event);
    };
  }

  $("requestPrintDialog")?.addEventListener("close", () => resetCustomerCartEditState());

  function paymentMethodsHaveData(methods){
    return !!methods && typeof methods === "object" && Object.values(methods).some(v => v && (v.enabled || String(v.detail || "").trim()));
  }

  function cachePaymentMethods(raw){
    const normalized = normalizedPaymentMethods(raw || {});
    storeAvailability = {...storeAvailability, payment_methods: normalized};
    settings.paymentMethods = normalized;
    localStorage.setItem(K.settings, JSON.stringify(settings));
    paymentMethodsCloudLoaded = true;
    return normalized;
  }

  ensurePaymentMethodsLoaded = async function(){
    const local = normalizedPaymentMethods(settings?.paymentMethods || {});
    if(!supabaseClient || !currentUser) return activePaymentMethods();
    try{
      const {data,error} = await supabaseClient.from("store_settings").select("payment_methods").eq("user_id", currentUser.id).maybeSingle();
      if(error) throw error;

      const cloudRaw = data?.payment_methods || {};
      if(paymentMethodsHaveData(cloudRaw)) return cachePaymentMethods(cloudRaw);

      if(paymentMethodsHaveData(local)){
        const {error:repairError} = await supabaseClient.from("store_settings").upsert({user_id:currentUser.id,payment_methods:local,updated_at:nowISO()});
        if(repairError) throw repairError;
        return cachePaymentMethods(local);
      }

      return cachePaymentMethods(cloudRaw);
    }catch(err){
      console.error("Payment methods load/repair failed", err);
      paymentMethodsCloudLoaded = false;
      return activePaymentMethods();
    }
  };

  savePaymentMethods = async function(){
    if(!supabaseClient || !currentUser) return toast("Sign in to save payment methods");
    const payment_methods = {};
    for(const key of Object.keys(PAYMENT_METHOD_DEFS)){
      payment_methods[key] = {
        enabled: !!$(`payment_${key}_enabled`)?.checked,
        detail: $(`payment_${key}_detail`)?.value.trim() || ""
      };
    }

    const btn = $("savePaymentMethodsBtn");
    const old = btn?.textContent || "Save payment methods";
    if(btn){btn.disabled=true;btn.textContent="Saving…";}
    try{
      const {error} = await supabaseClient.from("store_settings").upsert({user_id:currentUser.id,payment_methods,updated_at:nowISO()});
      if(error) throw error;

      paymentMethodsCloudLoaded = false;
      const verified = await ensurePaymentMethodsLoaded();
      if(!paymentMethodsHaveData(verified) && paymentMethodsHaveData(payment_methods)){
        throw new Error("Payment methods did not verify after saving");
      }
      cachePaymentMethods(payment_methods);
      if($("orderDialog")?.open) renderOrderPaymentMethodChoices(selectedOrderPaymentMethods());
      toast("Payment methods saved everywhere");
    }catch(err){
      console.error(err);
      toast(err?.message || "Couldn't save payment methods");
    }finally{
      if(btn){btn.disabled=false;btn.textContent=old;}
    }
  };

  function simplifyOrderStatusUI(){
    const status = $("orderStatus");
    if(status){
      [...status.options].forEach(option => {
        if(option.value === "Quoted" || option.value === "Accepted") option.remove();
      });
      if(status.value === "Quoted" || status.value === "Accepted") status.value = "Approved";
    }

    document.querySelectorAll('#orderFilter [data-status="Quoted"], #orderFilter [data-status="Approved"]').forEach(button => button.remove());
    if(orderStatusFilter === "Quoted" || orderStatusFilter === "Approved"){
      orderStatusFilter = "";
      document.querySelectorAll("#orderFilter button").forEach(button => button.classList.toggle("active", button.dataset.status === ""));
    }

    const price = $("orderPrice")?.closest("label");
    if(price){
      for(const node of [...price.childNodes]){
        if(node.nodeType === Node.TEXT_NODE && node.textContent.includes("Quoted price")) node.textContent = node.textContent.replace("Quoted price","Order price");
      }
    }

    const pickerHead = document.querySelector(".order-payment-picker-head");
    if(pickerHead){
      const strong = pickerHead.querySelector("strong");
      const small = pickerHead.querySelector("small");
      if(strong) strong.textContent = "Payment options for this order";
      if(small) small.textContent = "Choose from the methods saved in Settings → Storefront.";
    }

    const paymentNote = $("orderPaymentSection")?.querySelector(".tiny-note");
    if(paymentNote) paymentNote.textContent = "These instructions are shown directly on the customer's private order page.";
  }

  const originalOpenOrder = openOrder;
  openOrder = async function(id){
    await originalOpenOrder(id);
    simplifyOrderStatusUI();
  };

  const originalSaveOrder = saveOrder;
  saveOrder = async function(){
    const status = $("orderStatus");
    if(status && (status.value === "Quoted" || status.value === "Accepted")) status.value = "Approved";
    return originalSaveOrder();
  };
  if($("saveOrderBtn")) $("saveOrderBtn").onclick = saveOrder;

  simplifyOrderStatusUI();

  const style = document.createElement("style");
  style.textContent = `
    .customer-cart-line-price{display:grid!important;grid-template-columns:1fr 1fr;gap:10px 12px!important;min-width:180px;align-items:center;}
    .customer-cart-line-price>strong{grid-column:1/-1;text-align:right;margin-bottom:2px;font-size:1.05rem;}
    .customer-cart-line-price button{min-height:44px!important;min-width:78px;padding:10px 14px!important;border-radius:12px!important;font-weight:850!important;font-size:.9rem!important;border:1px solid rgba(255,255,255,.12)!important;}
    .customer-cart-line-price .customer-cart-edit-btn{color:#fff!important;background:color-mix(in srgb,var(--store-accent,#8b5cf6) 28%,#18131f)!important;border-color:color-mix(in srgb,var(--store-accent,#8b5cf6) 55%,transparent)!important;}
    .customer-cart-line-price .customer-cart-remove-btn{color:#ffb3bc!important;background:rgba(255,80,105,.11)!important;border-color:rgba(255,105,125,.28)!important;}
    @media(max-width:560px){.customer-cart-line-price{grid-column:1/-1;width:100%;min-width:0;}.customer-cart-line-price>strong{text-align:left;}.customer-cart-line-price button{width:100%;}}
  `;
  document.head.appendChild(style);

  window.PRINTBOOK_BUILD = "5.20.1";
  renderCustomerOrderCart();
})();
