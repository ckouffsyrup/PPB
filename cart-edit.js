/* PrintBook 5.18.0 — edit customer cart print requests before submission. */
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
      editBtn.textContent = "Edit";
      editBtn.className = "customer-cart-edit-btn";
      editBtn.onclick = () => openCustomerCartLineEditor(cartId);
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

  const style = document.createElement("style");
  style.textContent = `
    .customer-cart-line-price{gap:6px}
    .customer-cart-line-price .customer-cart-edit-btn{color:var(--store-accent,#a78bfa)}
    .customer-cart-line-price button{min-height:30px}
  `;
  document.head.appendChild(style);

  window.PRINTBOOK_BUILD = "5.18.0";
  renderCustomerOrderCart();
})();
