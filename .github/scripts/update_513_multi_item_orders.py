from pathlib import Path

app_p=Path('app.js'); idx_p=Path('index.html'); css_p=Path('storefront-v55.css'); sw_p=Path('sw.js')
app=app_p.read_text(); idx=idx_p.read_text(); css=css_p.read_text(); sw=sw_p.read_text()

# ---------------- JS: customer cart + multi-item order rendering ----------------
state_anchor='let currentRequestPrintId=null;'
if 'let customerOrderCart=[];' not in app:
    if state_anchor not in app: raise SystemExit('cart state anchor missing')
    app=app.replace(state_anchor,state_anchor+'\nlet customerOrderCart=[];\nlet customerOrderDraft={customer:"",email:"",contact:"",notes:""};',1)

helpers=r'''
function customerCartColorLabel(line){
  if(line.color_mode==="multi"){
    const names=(line.color_ids||[]).map(id=>getFilament(id)).filter(Boolean).map(f=>[f.color,f.material].filter(Boolean).join(" · "));
    return names.join(" + ")||"Multicolor";
  }
  const f=getFilament(line.filament_id||"");
  return f?[f.color,f.material,f.brand].filter(Boolean).join(" · "):"No preference";
}
function customerCartVariantName(line,item){
  const v=(item?.variants||[]).find(x=>String(x.id)===String(line.variant_id||""));
  return v?.name||"Standard";
}
function renderCustomerOrderCart(){
  const list=$("customerCartList"),count=$("customerCartCount"),button=$("customerCartBtn");
  const qty=customerOrderCart.reduce((n,x)=>n+Math.max(1,Number(x.quantity||1)),0);
  const total=customerOrderCart.reduce((n,x)=>n+Number(x.estimated_total||0),0);
  if(count)count.textContent=String(qty);
  if(button)button.classList.toggle("hidden",!(customerMode&&customerOrderCart.length));
  if($("customerCartTotal"))$("customerCartTotal").textContent=money(total);
  if(!list)return;
  list.innerHTML=customerOrderCart.length?customerOrderCart.map((line,index)=>{
    const item=items.find(i=>String(i.id)===String(line.print_id));
    return `<div class="customer-cart-line">
      <div class="customer-cart-line-num">${index+1}</div>
      <div class="customer-cart-line-copy"><strong>${safe(item?.name||line.name||"Print")}</strong><small>${safe(customerCartVariantName(line,item))} · ${safe(customerCartColorLabel(line))} · Qty ${Math.max(1,Number(line.quantity||1))}</small>${line.notes?`<small>${safe(line.notes)}</small>`:""}</div>
      <div class="customer-cart-line-price"><strong>${money(line.estimated_total||0)}</strong><button type="button" data-remove-cart-line="${safe(line.cart_id)}">Remove</button></div>
    </div>`;
  }).join(""):`<div class="customer-cart-empty"><strong>Your order is empty</strong><span>Add a print from the storefront to get started.</span></div>`;
  list.querySelectorAll('[data-remove-cart-line]').forEach(btn=>btn.onclick=()=>{
    customerOrderCart=customerOrderCart.filter(x=>x.cart_id!==btn.dataset.removeCartLine);
    renderCustomerOrderCart();
    if(!customerOrderCart.length)$("customerCartDialog")?.close();
  });
}
function syncCustomerCartDraftFromRequest(){
  customerOrderDraft.customer=$("requestCustomerName")?.value.trim()||customerOrderDraft.customer||"";
  customerOrderDraft.email=$("requestCustomerEmail")?.value.trim().toLowerCase()||customerOrderDraft.email||"";
  customerOrderDraft.contact=$("requestContact")?.value.trim()||customerOrderDraft.contact||"";
}
function openCustomerOrderCart(){
  renderCustomerOrderCart();
  if($("customerCartName"))$("customerCartName").value=customerOrderDraft.customer||"";
  if($("customerCartEmail"))$("customerCartEmail").value=customerOrderDraft.email||"";
  if($("customerCartContact"))$("customerCartContact").value=customerOrderDraft.contact||"";
  if($("customerCartNotes"))$("customerCartNotes").value=customerOrderDraft.notes||"";
  $("customerCartDialog")?.showModal();
}
function addCurrentRequestToCustomerCart(){
  const item=items.find(i=>i.id===currentRequestPrintId);if(!item)return toast("That product could not be found");
  if(storeAvailability.accepting_requests===false)return toast(storeAvailability.at_capacity?"The store is at order capacity right now":"New print requests are temporarily paused");
  const customer=$("requestCustomerName").value.trim();if(!customer)return toast("Enter your name");
  const email=$("requestCustomerEmail").value.trim().toLowerCase();if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))return toast("Enter a valid email so you can recover your order");
  const qty=Math.max(1,Number($("requestQty").value||1)),variantId=$("requestVariant").value,filamentId=$("requestFilament").value,userNotes=$("requestNotes").value.trim();
  const wantsMulticolor=!!item.multicolor_capable&&$("requestColorMode").value==="multi",colorIds=wantsMulticolor?selectedRequestColorIds():[],maxColors=productMaxColors(item);
  if(wantsMulticolor&&colorIds.length<2)return toast("Choose at least 2 colors");
  if(wantsMulticolor&&colorIds.length>maxColors)return toast(`Choose no more than ${maxColors} colors`);
  syncCustomerCartDraftFromRequest();
  customerOrderCart.push({cart_id:uid(),print_id:item.id,name:item.name,variant_id:variantId||"",filament_id:wantsMulticolor?"":(filamentId||""),color_mode:wantsMulticolor?"multi":"single",color_ids:colorIds,quantity:qty,notes:userNotes,unit_price:requestUnitPrice(),estimated_total:requestUnitPrice()*qty});
  $("requestPrintDialog").close();
  renderCustomerOrderCart();
  openCustomerOrderCart();
  toast(`${item.name} added to order`);
}
async function submitCustomerOrderCart(){
  if(!customerOrderCart.length)return toast("Add at least one print");
  const customer=$("customerCartName")?.value.trim()||"",email=$("customerCartEmail")?.value.trim().toLowerCase()||"",contact=$("customerCartContact")?.value.trim()||"",orderNotes=$("customerCartNotes")?.value.trim()||"";
  if(!customer)return toast("Enter your name");
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))return toast("Enter a valid email");
  customerOrderDraft={customer,email,contact,notes:orderNotes};
  const btn=$("submitCustomerCartBtn"),old=btn?.textContent||"Submit Order";if(btn){btn.disabled=true;btn.textContent="Submitting…"}
  try{
    const result=await submitPublicPrintRequest({items:customerOrderCart.map(({cart_id,name,unit_price,estimated_total,...line})=>line),customer,email,contact,order_notes:orderNotes});
    const label=customerOrderCart.length===1?(items.find(i=>i.id===customerOrderCart[0].print_id)?.name||"Print order"):`${customerOrderCart.length} different prints`;
    customerOrderCart=[];renderCustomerOrderCart();$("customerCartDialog")?.close();
    if(result?.order_number&&result?.access_token){saveCustomerOrderAccess(result.order_number,result.access_token,label,email);showCustomerOrderConfirmation(result,label)}else toast("Order request sent");
  }catch(err){console.error("Multi-item order request failed",err);toast(err?.message||"Couldn't send the order request")}
  finally{if(btn){btn.disabled=false;btn.textContent=old}}
}
function renderOrderLineItemsPanel(o){
  const panel=$("orderLineItemsPanel"),list=$("orderLineItemsList");if(!panel||!list)return;
  const rows=Array.isArray(o?.line_items)?o.line_items.filter(Boolean):[];
  panel.classList.toggle("hidden",!rows.length);
  if(!rows.length){list.innerHTML="";return}
  list.innerHTML=rows.map((line,index)=>`<div class="admin-order-line"><span>${index+1}</span><div><strong>${safe(line.name||"Print")}</strong><small>${safe(line.variant_name||"Standard")}${line.color_label?` · ${safe(line.color_label)}`:""}${line.notes?` · ${safe(line.notes)}`:""}</small></div><div><strong>×${Math.max(1,Number(line.quantity||1))}</strong><small>${money(line.estimated_total||0)} est.</small></div></div>`).join("");
}
function renderCustomerPortalLineItems(o){
  const wrap=$("customerPortalLineItems"),list=$("customerPortalLineItemsList");if(!wrap||!list)return;
  const rows=Array.isArray(o?.line_items)?o.line_items.filter(Boolean):[];
  wrap.classList.toggle("hidden",rows.length<2);
  list.innerHTML=rows.map(line=>`<div class="customer-portal-line"><div><strong>${safe(line.name||"Print")}</strong><small>${safe(line.variant_name||"Standard")}${line.color_label?` · ${safe(line.color_label)}`:""}</small></div><strong>×${Math.max(1,Number(line.quantity||1))}</strong></div>`).join("");
}
'''
anchor='function openRequestPrint(){'
if 'function addCurrentRequestToCustomerCart()' not in app:
    if anchor not in app: raise SystemExit('request function anchor missing')
    app=app.replace(anchor,helpers+'\n'+anchor,1)

# Keep customer identity filled while adding multiple products.
needle='$("requestQty").value=1;'
if 'customerOrderDraft.customer' not in app[app.find('function openRequestPrint(){'):app.find('async function submitPrintRequest(){')]:
    if needle not in app: raise SystemExit('request qty reset missing')
    app=app.replace(needle,needle+'\n  if(customerOrderDraft.customer)$("requestCustomerName").value=customerOrderDraft.customer;\n  if(customerOrderDraft.email)$("requestCustomerEmail").value=customerOrderDraft.email;\n  if(customerOrderDraft.contact)$("requestContact").value=customerOrderDraft.contact;',1)

# Customer-side button adds to cart; owner/local fallback keeps old behavior.
old='safeUiInit("startup-25",()=>{$("submitPrintRequestBtn").onclick=submitPrintRequest;});'
new='safeUiInit("startup-25",()=>{$("submitPrintRequestBtn").onclick=()=>((publicVisitorMode||customerMode)?addCurrentRequestToCustomerCart():submitPrintRequest());});'
if old in app: app=app.replace(old,new,1)

# Wire cart UI once.
wire_anchor='safeUiInit("startup-25a",()=>{'
wire='safeUiInit("startup-25-cart",()=>{if($("customerCartBtn"))$("customerCartBtn").onclick=openCustomerOrderCart;if($("closeCustomerCart"))$("closeCustomerCart").onclick=()=>$("customerCartDialog").close();if($("keepShoppingCartBtn"))$("keepShoppingCartBtn").onclick=()=>{$("customerCartDialog").close();$("storefrontBrowseHeading")?.scrollIntoView({behavior:"smooth",block:"start"})};if($("submitCustomerCartBtn"))$("submitCustomerCartBtn").onclick=submitCustomerOrderCart;});\n'
if 'startup-25-cart' not in app:
    if wire_anchor not in app: raise SystemExit('startup cart anchor missing')
    app=app.replace(wire_anchor,wire+wire_anchor,1)

# Admin detail panel and customer portal item list.
open_old='updateOrderPaymentButtons();updateOrderEditorSummary();renderCustomerHistory()'
if open_old in app: app=app.replace(open_old,'updateOrderPaymentButtons();updateOrderEditorSummary();renderOrderLineItemsPanel(o);renderCustomerHistory()',1)
new_order_old='else{$("orderTitle").textContent="New order";renderCustomerHistory()}'
if new_order_old in app: app=app.replace(new_order_old,'else{$("orderTitle").textContent="New order";renderOrderLineItemsPanel(null);renderCustomerHistory()}',1)
portal_old='$("customerPortalQty").textContent=String(o.quantity||1);'
if portal_old in app and 'renderCustomerPortalLineItems(o);' not in app[app.find('function renderCustomerPortalOrder'):app.find('function renderCustomerPortalOrder')+1200]:
    app=app.replace(portal_old,portal_old+'\n  renderCustomerPortalLineItems(o);',1)

# Preserve line_items when owner edits the request.
save_anchor='ready_email_sent_at:prev.ready_email_sent_at||null,created_at:prev.created_at||nowISO()'
if save_anchor in app:
    app=app.replace(save_anchor,'ready_email_sent_at:prev.ready_email_sent_at||null,line_items:Array.isArray(prev.line_items)?prev.line_items:[],created_at:prev.created_at||nowISO()',1)

app=app.replace('window.PRINTBOOK_BUILD="5.12.0"','window.PRINTBOOK_BUILD="5.13.0"')

# ---------------- HTML ----------------
submit_old='<button class="primary full-width" id="submitPrintRequestBtn" type="button">Submit Print Request</button>'
if submit_old in idx: idx=idx.replace(submit_old,'<button class="primary full-width" id="submitPrintRequestBtn" type="button">Add to Order</button>',1)

# Floating cart button lives outside the fragile mobile hero/header layout.
cart_button='''\n      <button class="customer-cart-button customer-only hidden" id="customerCartBtn" type="button">\n        <span>Order</span><strong id="customerCartCount">0</strong>\n      </button>\n'''
shop_empty='''      <div id="shopEmpty" class="empty-state hidden">\n        <h3>No products yet</h3>\n        <p>Add your first print and it'll show up here.</p>\n      </div>'''
if 'id="customerCartBtn"' not in idx:
    if shop_empty not in idx: raise SystemExit('shop empty anchor missing')
    idx=idx.replace(shop_empty,shop_empty+cart_button,1)

cart_dialog='''\n<!-- CUSTOMER MULTI-ITEM ORDER CART -->\n<dialog id="customerCartDialog">\n  <div class="sheet customer-cart-sheet">\n    <div class="sheet-grabber"></div>\n    <div class="sheet-header">\n      <div><p class="eyebrow">YOUR ORDER</p><h2>Review your prints</h2><p class="muted">Add as many different prints as you want before sending one request.</p></div>\n      <button class="icon-btn" id="closeCustomerCart" type="button">✕</button>\n    </div>\n    <div id="customerCartList" class="customer-cart-list"></div>\n    <div class="customer-cart-checkout">\n      <div class="form-grid">\n        <label>Your name<input id="customerCartName" placeholder="Name / nickname" autocomplete="name" /></label>\n        <label>Email<input id="customerCartEmail" type="email" placeholder="you@example.com" autocomplete="email" /></label>\n        <label class="full">Other contact info <span class="muted">optional</span><input id="customerCartContact" placeholder="Phone, Discord, etc." /></label>\n        <label class="full">Order notes <span class="muted">optional</span><textarea id="customerCartNotes" placeholder="Anything that applies to the whole order"></textarea></label>\n      </div>\n      <div class="customer-cart-total"><span>Estimated order total</span><strong id="customerCartTotal">$0</strong></div>\n      <div class="customer-cart-actions"><button class="secondary" id="keepShoppingCartBtn" type="button">+ Add Another Print</button><button class="primary" id="submitCustomerCartBtn" type="button">Submit Order</button></div>\n      <small class="muted">You will receive one order number and one quote for the whole order.</small>\n    </div>\n  </div>\n</dialog>\n\n'''
confirm_anchor='<!-- CUSTOMER ORDER CONFIRMATION -->'
if 'id="customerCartDialog"' not in idx:
    if confirm_anchor not in idx: raise SystemExit('confirmation anchor missing')
    idx=idx.replace(confirm_anchor,cart_dialog+confirm_anchor,1)

# Admin order line-item summary.
admin_anchor='<label class="full">What they want<input id="orderItem" placeholder="Blue + black articulated dragon" /></label>'
admin_panel='''<div class="full order-line-items-panel hidden" id="orderLineItemsPanel"><div class="order-line-items-head"><span>ORDER ITEMS</span><small>Submitted together by the customer</small></div><div id="orderLineItemsList" class="order-line-items-list"></div></div>\n          '''
if 'id="orderLineItemsPanel"' not in idx:
    if admin_anchor not in idx: raise SystemExit('order item anchor missing')
    idx=idx.replace(admin_anchor,admin_panel+admin_anchor,1)

portal_anchor='<div class="customer-order-notes hidden" id="customerPortalNotesWrap"><small>ORDER DETAILS</small><div id="customerPortalNotes"></div></div>'
portal_panel='<div class="customer-portal-line-items hidden" id="customerPortalLineItems"><small>PRINTS IN THIS ORDER</small><div id="customerPortalLineItemsList"></div></div>\n      '
if 'id="customerPortalLineItems"' not in idx:
    if portal_anchor not in idx: raise SystemExit('customer portal notes anchor missing')
    idx=idx.replace(portal_anchor,portal_panel+portal_anchor,1)

idx=idx.replace('storefront-v55.css?v=5.11.0','storefront-v55.css?v=5.13.0')

# ---------------- CSS ----------------
marker='/* PrintBook v5.13.0 — multi-item customer orders */'
if marker not in css:
    css += r'''

/* PrintBook v5.13.0 — multi-item customer orders */
.customer-cart-button{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(18px,calc(env(safe-area-inset-bottom) + 12px));z-index:90;display:flex;align-items:center;gap:9px;padding:11px 13px;border:1px solid rgba(167,139,250,.34);border-radius:999px;background:rgba(28,20,47,.94);color:#fff;box-shadow:0 14px 34px rgba(0,0,0,.34);backdrop-filter:blur(18px);font-weight:800;cursor:pointer}.customer-cart-button.hidden{display:none!important}.customer-cart-button strong{display:grid;place-items:center;min-width:24px;height:24px;padding:0 6px;border-radius:999px;background:#8b5cf6;font-size:11px}.customer-cart-sheet{width:min(680px,calc(100vw - 24px))}.customer-cart-list{display:flex;flex-direction:column;gap:7px;margin:4px 0 14px}.customer-cart-line{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px;border:1px solid rgba(255,255,255,.06);border-radius:13px;background:rgba(255,255,255,.018)}.customer-cart-line-num{width:26px;height:26px;display:grid;place-items:center;border-radius:9px;background:rgba(139,92,246,.11);color:#c4b5fd;font-size:10px;font-weight:900}.customer-cart-line-copy{min-width:0}.customer-cart-line-copy strong,.customer-cart-line-copy small{display:block}.customer-cart-line-copy strong{font-size:12px}.customer-cart-line-copy small{margin-top:3px;font-size:9px;line-height:1.35;color:rgba(255,255,255,.43)}.customer-cart-line-price{text-align:right}.customer-cart-line-price strong{display:block;font-size:12px}.customer-cart-line-price button{margin-top:5px;padding:0;border:0;background:none;color:rgba(255,255,255,.38);font-size:9px;cursor:pointer}.customer-cart-line-price button:hover{color:#fca5a5}.customer-cart-empty{padding:18px;border:1px dashed rgba(255,255,255,.08);border-radius:13px;text-align:center}.customer-cart-empty strong,.customer-cart-empty span{display:block}.customer-cart-empty span{margin-top:4px;font-size:10px;color:rgba(255,255,255,.4)}.customer-cart-checkout{padding-top:12px;border-top:1px solid rgba(255,255,255,.06)}.customer-cart-total{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:13px 0 10px;padding:12px 13px;border-radius:13px;background:rgba(139,92,246,.07);border:1px solid rgba(139,92,246,.15)}.customer-cart-total span{font-size:10px;color:rgba(255,255,255,.48)}.customer-cart-total strong{font-size:20px}.customer-cart-actions{display:grid;grid-template-columns:1fr 1.25fr;gap:8px;margin-bottom:8px}.order-line-items-panel{grid-column:1/-1;padding:12px;border:1px solid rgba(139,92,246,.16);border-radius:14px;background:rgba(139,92,246,.045)}.order-line-items-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}.order-line-items-head span{font-size:8px;font-weight:900;letter-spacing:.12em;color:#c4b5fd}.order-line-items-head small{font-size:8px;color:rgba(255,255,255,.34)}.order-line-items-list{display:flex;flex-direction:column;gap:5px}.admin-order-line{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:9px;align-items:center;padding:8px 9px;border-radius:10px;background:rgba(0,0,0,.10)}.admin-order-line>span{width:22px;height:22px;display:grid;place-items:center;border-radius:8px;background:rgba(139,92,246,.1);font-size:9px;color:#c4b5fd}.admin-order-line strong,.admin-order-line small{display:block}.admin-order-line small{margin-top:2px;font-size:8px;color:rgba(255,255,255,.38)}.admin-order-line>div:last-child{text-align:right}.customer-portal-line-items{margin-top:10px;padding:12px;border:1px solid rgba(139,92,246,.12);border-radius:13px;background:rgba(139,92,246,.035)}.customer-portal-line-items>small{display:block;margin-bottom:7px;font-size:8px;font-weight:900;letter-spacing:.12em;color:#c4b5fd}.customer-portal-line{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid rgba(255,255,255,.05)}.customer-portal-line:first-child{border-top:0}.customer-portal-line strong,.customer-portal-line small{display:block}.customer-portal-line small{margin-top:2px;font-size:9px;color:rgba(255,255,255,.42)}
@media(max-width:560px){.customer-cart-line{grid-template-columns:24px minmax(0,1fr)}.customer-cart-line-price{grid-column:2;display:flex;gap:10px;align-items:center;text-align:left}.customer-cart-line-price button{margin-top:0}.customer-cart-actions{grid-template-columns:1fr}.customer-cart-button{bottom:max(76px,calc(env(safe-area-inset-bottom) + 64px))}.order-line-items-head{align-items:flex-start;flex-direction:column}}
'''

sw=sw.replace('const CACHE="printbook-v5.12.0-trending-products";','const CACHE="printbook-v5.13.0-multi-item-orders";')

app_p.write_text(app); idx_p.write_text(idx); css_p.write_text(css); sw_p.write_text(sw)
