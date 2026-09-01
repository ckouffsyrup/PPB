/* PrintBook 5.18.3 — restore quote workflow while keeping cart/payment fixes. */
(() => {
  function ensureStatusOption(select,value,label=value,beforeValue=""){
    if(!select || [...select.options].some(o=>o.value===value)) return;
    const option=document.createElement("option");
    option.value=value;option.textContent=label;
    const before=[...select.options].find(o=>o.value===beforeValue);
    if(before)select.insertBefore(option,before);else select.appendChild(option);
  }

  function restoreQuoteUI(){
    const status=$("orderStatus");
    if(status){
      ensureStatusOption(status,"Quoted","Quoted","Accepted");
      ensureStatusOption(status,"Accepted","Accepted","Approved");
      ensureStatusOption(status,"Approved","Approved","Printing");
    }

    const filter=$("orderFilter");
    if(filter){
      const addFilter=(value,label,beforeValue)=>{
        if(filter.querySelector(`[data-status="${value}"]`))return;
        const button=document.createElement("button");
        button.type="button";button.dataset.status=value;button.textContent=label;
        const before=filter.querySelector(`[data-status="${beforeValue}"]`);
        if(before)filter.insertBefore(button,before);else filter.appendChild(button);
        button.onclick=()=>{
          filter.querySelectorAll("button").forEach(x=>x.classList.remove("active"));
          button.classList.add("active");
          orderStatusFilter=value;
          renderOrders();
        };
      };
      addFilter("Quoted","Quoted","Accepted");
      addFilter("Approved","Approved","Printing");
    }

    const price=$("orderPrice")?.closest("label");
    if(price){
      for(const node of [...price.childNodes]){
        if(node.nodeType===Node.TEXT_NODE && node.textContent.includes("Order price")) node.textContent=node.textContent.replace("Order price","Quoted price");
      }
    }

    const pickerHead=document.querySelector(".order-payment-picker-head");
    if(pickerHead){
      const strong=pickerHead.querySelector("strong"),small=pickerHead.querySelector("small");
      if(strong)strong.textContent="Payment options for this quote";
      if(small)small.textContent="Choose from the methods saved in Settings → Storefront.";
    }
    const paymentNote=$("orderPaymentSection")?.querySelector(".tiny-note");
    if(paymentNote)paymentNote.textContent="These instructions are included with the quote and shown in the customer's private order page.";
  }

  const simplifiedOpenOrder=openOrder;
  openOrder=async function(id){
    await simplifiedOpenOrder(id);
    restoreQuoteUI();
    if(id){
      const o=orders.find(x=>x.id===id);
      if(o && ["Quoted","Accepted","Approved"].includes(o.status)) $("orderStatus").value=o.status;
    }
  };

  saveOrder=async function(){if(!requireOnlineAdminSave())return;
    const item=$("orderItem").value.trim();if(!item)return toast("Describe the order");
    const id=editingOrderId||uid(),prev=orders.find(x=>x.id===id)||{},editedLineItems=collectQuotedLineItems(),paymentStatus=$("orderPaymentStatus").value||"unpaid",paymentAmount=Math.max(0,Number($("orderPaymentAmount")?.value||0)),o={id,...(prev.order_number?{order_number:prev.order_number}:{}),customer:$("orderCustomer").value.trim(),customer_email:$("orderCustomerEmail").value.trim().toLowerCase()||null,status:$("orderStatus").value,item,quantity:Number($("orderQty").value||1),quoted_price:Number($("orderPrice").value||0),due_date:$("orderDue").value,print_id:$("orderPrint").value||"",variant_id:$("orderVariant")?.value||null,notes:joinOrderPaymentInstructions($("orderNotes").value,$("orderPaymentInstructions").value),payment_status:paymentStatus,payment_amount:paymentAmount,deposit_amount:Math.max(0,Number($("orderDepositAmount").value||0)),payment_method:$("orderPaymentMethod").value||null,payment_methods_selected:selectedOrderPaymentMethods(),payment_instructions:paymentMethodInstructions(selectedOrderPaymentMethods())||$("orderPaymentInstructions").value.trim()||null,payment_provider:prev.payment_provider||null,payment_reference:prev.payment_reference||null,paid_at:paymentStatus==="paid"?(prev.paid_at||nowISO()):null,payment_link:prev.payment_link||null,stripe_checkout_session_id:prev.stripe_checkout_session_id||null,stripe_payment_intent_id:prev.stripe_payment_intent_id||null,quote_email_sent_at:prev.quote_email_sent_at||null,customer_accepted_at:prev.customer_accepted_at||null,customer_accepted_price:prev.customer_accepted_price??null,ready_email_sent_at:prev.ready_email_sent_at||null,line_items:editedLineItems.length?editedLineItems:(Array.isArray(prev.line_items)?prev.line_items:[]),created_at:prev.created_at||nowISO(),updated_at:nowISO()};

    if(o.line_items.length){const lineSum=o.line_items.reduce((a,line)=>a+lineItemTotal(line),0),manualTotal=Math.max(0,Number($("orderPrice")?.value||0));o.quote_adjustment=manualTotal-lineSum;o.quoted_price=manualTotal}
    if(o.status==="Approved"&&prev.status!=="Approved"&&!prev.inventory_reserved_at){const check=approvalStockCheck(o);if(!check.ok)return toast(check.message)}

    let synced=false;
    if(currentUser){synced=(await syncUpsert("orders",{...o,user_id:currentUser.id,print_id:o.print_id||null}))===true;}
    if(currentUser&&!synced)pendingLocalOrderIds.add(id);else pendingLocalOrderIds.delete(id);

    const idx=orders.findIndex(x=>x.id===id);if(idx>=0)orders[idx]=o;else orders.unshift(o);
    persist();$("orderDialog").close();
    if(synced&&prev.status!==o.status&&o.status==="Quoted"){toast("Order quoted — sending customer email…");await sendQuoteEmailForOrder(id,{quiet:true});await pullOrdersCloud()}
    else if(synced&&prev.status!==o.status&&o.status==="Ready"){toast("Order marked Ready — sending customer email…");await sendReadyEmailForOrder(id,{quiet:true});await pullOrdersCloud()}
    else toast(synced||!currentUser?"Order saved":"Order saved locally — waiting for cloud");
  };
  if($("saveOrderBtn"))$("saveOrderBtn").onclick=saveOrder;

  restoreQuoteUI();
  window.PRINTBOOK_BUILD="5.18.3";
})();
