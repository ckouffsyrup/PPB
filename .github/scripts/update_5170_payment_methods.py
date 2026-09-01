from pathlib import Path
import re

app=Path('app.js'); s=app.read_text()
# defaults + store availability payment_methods
s=s.replace('''  customerModePin:""\n};''','''  customerModePin:"",paymentMethods:{}\n};''',1)
s=s.replace('''hero_url:""};''','''hero_url:"",payment_methods:{}};''',1)

# helpers near payment prefix
needle='''const PAYMENT_NOTE_PREFIX="Payment instructions:";'''
insert='''const PAYMENT_NOTE_PREFIX="Payment instructions:";
const PAYMENT_METHOD_DEFS={
  cashapp:{label:"Cash App",placeholder:"$YourCashtag"},
  venmo:{label:"Venmo",placeholder:"@YourVenmo"},
  zelle:{label:"Zelle",placeholder:"Email or phone"},
  cash:{label:"Cash at pickup",placeholder:"Optional note"}
};
function normalizedPaymentMethods(raw={}){const out={};for(const [key,def] of Object.entries(PAYMENT_METHOD_DEFS)){const v=raw?.[key]||{};out[key]={enabled:!!v.enabled,detail:String(v.detail||"").trim(),label:def.label}}return out}
function activePaymentMethods(){return normalizedPaymentMethods(storeAvailability.payment_methods||settings.paymentMethods||{})}
function paymentMethodInstructions(keys=[]){const methods=activePaymentMethods();return keys.filter(k=>methods[k]?.enabled).map(k=>{const m=methods[k];if(k==="cash")return m.detail?`${m.label} — ${m.detail}`:m.label;return m.detail?`${m.label} — ${m.detail}`:m.label}).join("\n")}
function renderOrderPaymentMethodChoices(selected=[]){const wrap=$("orderPaymentMethodChoices");if(!wrap)return;const methods=activePaymentMethods(),picked=new Set(selected||[]);wrap.innerHTML=Object.entries(methods).filter(([,m])=>m.enabled).map(([key,m])=>`<label class="quote-payment-choice"><input type="checkbox" value="${key}" ${picked.has(key)?"checked":""}><span><strong>${safe(m.label)}</strong><small>${safe(m.detail||"Available")}</small></span></label>`).join("")||`<div class="muted tiny-note">No payment methods are enabled yet. Add them in Settings → Storefront.</div>`;wrap.querySelectorAll('input[type="checkbox"]').forEach(i=>i.onchange=syncOrderPaymentInstructionsFromChoices);syncOrderPaymentInstructionsFromChoices()}
function selectedOrderPaymentMethods(){return [...document.querySelectorAll('#orderPaymentMethodChoices input[type="checkbox"]:checked')].map(i=>i.value)}
function syncOrderPaymentInstructionsFromChoices(){const selected=selectedOrderPaymentMethods(),generated=paymentMethodInstructions(selected),box=$("orderPaymentInstructions");if(box)box.value=generated;const preview=$("orderPaymentInstructionsPreview");if(preview)preview.textContent=generated||"No payment method selected"}
'''
if needle not in s: raise SystemExit('payment prefix not found')
s=s.replace(needle,insert,1)

# load store settings select + hydration
s=s.replace('''featured_product_ids").eq("user_id"''','''featured_product_ids,payment_methods").eq("user_id"''',1)
s=s.replace('''hero_url:d.storefront_hero_url||"",featured_product_ids:''','''hero_url:d.storefront_hero_url||"",payment_methods:normalizedPaymentMethods(d.payment_methods||{}),featured_product_ids:''',1)
# fill payment inputs after branding inputs
marker='''  if($("storeHeroUrlInput"))$("storeHeroUrlInput").value=storeAvailability.hero_url;'''
addition='''  if($("storeHeroUrlInput"))$("storeHeroUrlInput").value=storeAvailability.hero_url;
  const pm=activePaymentMethods();for(const key of Object.keys(PAYMENT_METHOD_DEFS)){const en=$(`payment_${key}_enabled`),detail=$(`payment_${key}_detail`);if(en)en.checked=!!pm[key]?.enabled;if(detail)detail.value=pm[key]?.detail||""}'''
if marker not in s: raise SystemExit('store hero marker not found')
s=s.replace(marker,addition,1)

# add saver before availability saver
marker='''async function saveStoreAvailability(){'''
saver='''async function savePaymentMethods(){
  if(!supabaseClient||!currentUser)return toast("Sign in to save payment methods");
  const payment_methods={};for(const key of Object.keys(PAYMENT_METHOD_DEFS)){payment_methods[key]={enabled:!!$(`payment_${key}_enabled`)?.checked,detail:$(`payment_${key}_detail`)?.value.trim()||""}}
  const btn=$("savePaymentMethodsBtn"),old=btn?.textContent||"Save payment methods";if(btn){btn.disabled=true;btn.textContent="Saving…"}
  try{const {error}=await supabaseClient.from("store_settings").upsert({user_id:currentUser.id,payment_methods,updated_at:nowISO()});if(error)throw error;storeAvailability={...storeAvailability,payment_methods:normalizedPaymentMethods(payment_methods)};settings.paymentMethods=storeAvailability.payment_methods;localStorage.setItem(K.settings,JSON.stringify(settings));toast("Payment methods saved")}
  catch(err){console.error(err);toast(err?.message||"Couldn't save payment methods")}
  finally{if(btn){btn.disabled=false;btn.textContent=old}}
}

async function saveStoreAvailability(){'''
if marker not in s: raise SystemExit('availability saver not found')
s=s.replace(marker,saver,1)

# reset/open order choices
s=s.replace('''resetOrder(){editingOrderId=null;''','''resetOrder(){editingOrderId=null;''',1)
# append rendering into reset just before buttons update
s=s.replace('''if($("orderNotesSection"))$("orderNotesSection").open=false;updateOrderPaymentButtons();updateOrderEditorSummary()}''','''if($("orderNotesSection"))$("orderNotesSection").open=false;renderOrderPaymentMethodChoices([]);updateOrderPaymentButtons();updateOrderEditorSummary()}''',1)
# in open order after payment instructions set, render selected methods
open_marker='''$("orderPaymentInstructions").value=o.payment_instructions||paymentParts.instructions||"";$("orderPaymentStatus")'''
open_repl='''$("orderPaymentInstructions").value=o.payment_instructions||paymentParts.instructions||"";renderOrderPaymentMethodChoices(Array.isArray(o.payment_methods_selected)?o.payment_methods_selected:[]);$("orderPaymentStatus")'''
if open_marker not in s: raise SystemExit('open order payment marker not found')
s=s.replace(open_marker,open_repl,1)
# new order default to all enabled methods
s=s.replace('''}else{$("orderTitle").textContent="New order";renderOrderLineItemsPanel(null);renderCustomerHistory()}''','''}else{$("orderTitle").textContent="New order";renderOrderPaymentMethodChoices(Object.entries(activePaymentMethods()).filter(([,m])=>m.enabled).map(([k])=>k));renderOrderLineItemsPanel(null);renderCustomerHistory()}''',1)
# save selected + compiled instructions
s=s.replace('''payment_method:$("orderPaymentMethod").value||null,payment_instructions:$("orderPaymentInstructions").value.trim()||null,''','''payment_method:$("orderPaymentMethod").value||null,payment_methods_selected:selectedOrderPaymentMethods(),payment_instructions:paymentMethodInstructions(selectedOrderPaymentMethods())||$("orderPaymentInstructions").value.trim()||null,''',1)

# bind button near generic event bindings by direct delegated safe listener
s += '''\n// v5.17 payment methods settings\ndocument.addEventListener("click",e=>{if(e.target?.id==="savePaymentMethodsBtn"){e.preventDefault();savePaymentMethods()}});\n'''
s=re.sub(r'window\.PRINTBOOK_BUILD="[^"]+";','window.PRINTBOOK_BUILD="5.17.0";',s,count=1)
app.write_text(s)

html=Path('index.html'); h=html.read_text()
# replace payment instructions textarea block in order dialog with choices + preview hidden textarea kept for compatibility
old='''          <label class="full">How should they pay?<textarea id="orderPaymentInstructions" placeholder="Example: Cash App — $YourCashtag"></textarea></label>
          <p class="full muted tiny-note">Shown in the customer portal with their order total and KP order number reminder.</p>'''
new='''          <div class="full order-payment-method-picker"><div class="order-payment-picker-head"><strong>Payment options for this quote</strong><small>Choose from the methods saved in Settings → Storefront.</small></div><div id="orderPaymentMethodChoices" class="quote-payment-choices"></div><div class="order-payment-preview"><small>CUSTOMER WILL SEE</small><span id="orderPaymentInstructionsPreview">No payment method selected</span></div><textarea id="orderPaymentInstructions" class="hidden" aria-hidden="true"></textarea></div>
          <p class="full muted tiny-note">These instructions are included with the quote and shown in the customer's private order page.</p>'''
if old not in h: raise SystemExit('order payment html not found')
h=h.replace(old,new,1)
# insert storefront payment section before availability section by marker
marker='''    <section class="settings-section">
      <div class="section-heading">
        <div><h3>Store availability</h3>'''
payment='''    <section class="settings-section payment-methods-settings">
      <div class="section-heading"><div><h3>Payment Methods</h3><p class="muted">Enter these once, then choose which ones to include on each quote.</p></div></div>
      <div class="payment-method-settings-list">
        <div class="payment-method-setting"><label class="payment-method-enable"><input id="payment_cashapp_enabled" type="checkbox"><span>Cash App</span></label><input id="payment_cashapp_detail" placeholder="$YourCashtag"></div>
        <div class="payment-method-setting"><label class="payment-method-enable"><input id="payment_venmo_enabled" type="checkbox"><span>Venmo</span></label><input id="payment_venmo_detail" placeholder="@YourVenmo"></div>
        <div class="payment-method-setting"><label class="payment-method-enable"><input id="payment_zelle_enabled" type="checkbox"><span>Zelle</span></label><input id="payment_zelle_detail" placeholder="Email or phone"></div>
        <div class="payment-method-setting"><label class="payment-method-enable"><input id="payment_cash_enabled" type="checkbox"><span>Cash at pickup</span></label><input id="payment_cash_detail" placeholder="Optional note, e.g. Exact cash preferred"></div>
      </div>
      <button class="primary" id="savePaymentMethodsBtn" type="button">Save payment methods</button>
      <p class="muted tiny-note">Only enabled methods appear when you prepare a quote.</p>
    </section>
'''+marker
if marker not in h: raise SystemExit('store availability marker not found')
h=h.replace(marker,payment,1); html.write_text(h)

css=Path('storefront-v55.css'); c=css.read_text(); c+='''\n/* v5.17 payment methods */\n.payment-method-settings-list{display:grid;gap:10px;margin:12px 0}.payment-method-setting{display:grid;grid-template-columns:minmax(145px,.45fr) minmax(0,1fr);gap:12px;align-items:center;padding:11px 12px;border:1px solid rgba(127,127,127,.15);border-radius:12px;background:rgba(127,127,127,.035)}.payment-method-enable{display:flex!important;flex-direction:row!important;align-items:center;gap:9px;font-weight:700}.payment-method-enable input{width:auto}.order-payment-method-picker{padding:12px;border:1px solid rgba(139,92,246,.18);border-radius:13px;background:rgba(139,92,246,.045)}.order-payment-picker-head{display:flex;flex-direction:column;gap:3px;margin-bottom:9px}.order-payment-picker-head small{opacity:.58}.quote-payment-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.quote-payment-choice{display:flex!important;flex-direction:row!important;align-items:center;gap:9px;padding:10px;border:1px solid rgba(127,127,127,.15);border-radius:11px;background:rgba(127,127,127,.035);cursor:pointer}.quote-payment-choice input{width:auto}.quote-payment-choice span{display:flex;flex-direction:column;min-width:0}.quote-payment-choice small{opacity:.58;overflow:hidden;text-overflow:ellipsis}.order-payment-preview{margin-top:10px;padding:10px 11px;border-radius:10px;background:rgba(127,127,127,.06);display:flex;flex-direction:column;gap:4px}.order-payment-preview small{font-size:9px;letter-spacing:.11em;font-weight:800;opacity:.5}.order-payment-preview span{white-space:pre-line;font-size:12px;line-height:1.5}@media(max-width:650px){.payment-method-setting{grid-template-columns:1fr}.quote-payment-choices{grid-template-columns:1fr}}\n''';css.write_text(c)
sw=Path('sw.js'); w=sw.read_text(); sw.write_text(re.sub(r'const CACHE="[^"]+";','const CACHE="printbook-v5.17.0-payment-methods";',w,count=1))
