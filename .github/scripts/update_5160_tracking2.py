from pathlib import Path
import re
app=Path('app.js');s=app.read_text()
old='''function customerOrderProgress(status){
  const steps=["Requested","Quoted","Accepted","Approved","Printing","Ready","Completed"];
  const current=Math.max(0,steps.indexOf(status));
  if(status==="Cancelled")return `<div class="customer-order-cancelled">Order cancelled</div>`;
  return steps.map((step,i)=>`<div class="customer-order-progress-step ${i<=current?"done":""} ${i===current?"current":""}"><i></i><span>${safe(step)}</span></div>`).join("")
}'''
new='''const CUSTOMER_ORDER_STEPS=["Requested","Quoted","Accepted","Approved","Printing","Ready","Completed"];
const CUSTOMER_STATUS_COPY={Requested:["Request received","Your order request is waiting for review."],Quoted:["Quote ready","Your final price is ready to review."],Accepted:["Quote accepted","Your quote was accepted and the order is moving forward."],Approved:["Order approved","Everything is confirmed and your print is in the production queue."],Printing:["Printing now","Your order is actively being made."],Ready:["Ready for you","Your order is finished and ready for pickup or delivery."],Completed:["Order complete","This order has been completed. Thank you!"],Cancelled:["Order cancelled","This order is no longer active."]};
function customerOrderProgress(status){const current=Math.max(0,CUSTOMER_ORDER_STEPS.indexOf(status));if(status==="Cancelled")return `<div class="customer-order-cancelled">Order cancelled</div>`;return CUSTOMER_ORDER_STEPS.map((step,i)=>`<div class="customer-order-progress-step ${i<=current?"done":""} ${i===current?"current":""}"><i></i><span>${safe(step)}</span></div>`).join("")}
function customerStatusMeta(status){const copy=CUSTOMER_STATUS_COPY[status]||[status||"Order update","Check back for the latest progress."];const index=CUSTOMER_ORDER_STEPS.indexOf(status);return {title:copy[0],detail:copy[1],percent:status==="Cancelled"?0:index<0?0:Math.round((index/(CUSTOMER_ORDER_STEPS.length-1))*100)}}
function customerOrderActivity(o){
  const rows=[];
  const history=Array.isArray(o.status_history)?o.status_history:Array.isArray(o.history)?o.history:[];
  history.forEach(x=>{if(!x)return;rows.push({status:x.status||x.label||"Update",at:x.at||x.created_at||x.updated_at||"",detail:x.detail||x.note||""})});
  if(!rows.length){rows.push({status:"Requested",at:o.created_at||"",detail:"Order request submitted"});if(o.status&&o.status!=="Requested")rows.push({status:o.status,at:o.updated_at||"",detail:CUSTOMER_STATUS_COPY[o.status]?.[1]||"Order updated"})}
  return rows.sort((a,b)=>String(b.at||"").localeCompare(String(a.at||""))).slice(0,8)
}
function renderCustomerOrderActivity(o){const wrap=$("customerPortalActivity"),list=$("customerPortalActivityList");if(!wrap||!list)return;const rows=customerOrderActivity(o);wrap.classList.toggle("hidden",!rows.length);list.innerHTML=rows.map((x,i)=>`<div class="customer-activity-row ${i===0?"latest":""}"><i></i><div><strong>${safe(x.status)}</strong><small>${safe(x.detail||"")}</small></div><time>${x.at?safe(new Date(x.at).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})):""}</time></div>`).join("")}
'''
if old not in s:raise SystemExit('progress block not found')
s=s.replace(old,new,1)
needle='''  $("customerPortalProgress").innerHTML=customerOrderProgress(o.status);'''
repl='''  $("customerPortalProgress").innerHTML=customerOrderProgress(o.status);
  const statusMeta=customerStatusMeta(o.status),hero=$("customerPortalStatusHero");
  if(hero){hero.classList.toggle("cancelled",o.status==="Cancelled");$("customerPortalStatusHeroTitle").textContent=statusMeta.title;$("customerPortalStatusHeroText").textContent=statusMeta.detail;$("customerPortalStatusBar").style.width=`${statusMeta.percent}%`;$("customerPortalStatusPercent").textContent=o.status==="Cancelled"?"—":`${statusMeta.percent}%`}
  renderCustomerOrderActivity(o);'''
if needle not in s:raise SystemExit('portal render needle not found')
s=s.replace(needle,repl,1)
s=re.sub(r'window\.PRINTBOOK_BUILD="[^"]+";','window.PRINTBOOK_BUILD="5.16.0";',s,count=1);app.write_text(s)

html=Path('index.html');h=html.read_text()
needleh='''      <div class="customer-order-progress" id="customerPortalProgress"></div>'''
replh='''      <section class="customer-status-hero" id="customerPortalStatusHero"><div class="customer-status-hero-copy"><small>WHAT'S HAPPENING</small><strong id="customerPortalStatusHeroTitle">Request received</strong><p id="customerPortalStatusHeroText">Your order request is waiting for review.</p></div><div class="customer-status-meter"><div><span>ORDER PROGRESS</span><strong id="customerPortalStatusPercent">0%</strong></div><div class="customer-status-meter-track"><i id="customerPortalStatusBar"></i></div></div></section>
      <div class="customer-order-progress" id="customerPortalProgress"></div>'''
if needleh not in h:raise SystemExit('portal progress html not found')
h=h.replace(needleh,replh,1)
needle2='''      <div class="customer-order-notes hidden" id="customerPortalNotesWrap"><small>ORDER DETAILS</small><div id="customerPortalNotes"></div></div>'''
repl2=needle2+'''\n      <section class="customer-order-activity hidden" id="customerPortalActivity"><div class="customer-order-activity-head"><small>ORDER ACTIVITY</small><span>Newest first</span></div><div id="customerPortalActivityList" class="customer-order-activity-list"></div></section>'''
if needle2 not in h:raise SystemExit('notes html not found')
h=h.replace(needle2,repl2,1);html.write_text(h)

css=Path('storefront-v55.css');c=css.read_text();c+='''\n/* v5.16 customer order tracking 2.0 */\n.customer-status-hero{margin:14px 0 18px;padding:18px;border:1px solid rgba(139,92,246,.22);border-radius:16px;background:linear-gradient(135deg,rgba(139,92,246,.12),rgba(139,92,246,.035));display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,.65fr);gap:22px;align-items:center}.customer-status-hero-copy small,.customer-order-activity-head small{font-size:10px;letter-spacing:.12em;font-weight:800;opacity:.58}.customer-status-hero-copy strong{display:block;font-size:20px;margin:5px 0}.customer-status-hero-copy p{margin:0;opacity:.72;line-height:1.45}.customer-status-meter>div:first-child{display:flex;justify-content:space-between;gap:10px;font-size:10px;font-weight:800;letter-spacing:.08em;opacity:.7}.customer-status-meter-track{height:8px;border-radius:999px;background:rgba(127,127,127,.16);overflow:hidden;margin-top:8px}.customer-status-meter-track i{display:block;height:100%;width:0;border-radius:inherit;background:currentColor;transition:width .35s ease}.customer-status-hero.cancelled{opacity:.7}.customer-order-activity{margin-top:16px;padding:15px;border:1px solid rgba(127,127,127,.14);border-radius:14px}.customer-order-activity-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.customer-order-activity-head span{font-size:10px;opacity:.45}.customer-order-activity-list{display:flex;flex-direction:column}.customer-activity-row{position:relative;display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:10px;padding:10px 0}.customer-activity-row:not(:last-child):after{content:"";position:absolute;left:5px;top:25px;bottom:-7px;width:1px;background:rgba(127,127,127,.2)}.customer-activity-row>i{width:11px;height:11px;border-radius:50%;margin-top:4px;background:rgba(127,127,127,.35);z-index:1}.customer-activity-row.latest>i{background:currentColor;box-shadow:0 0 0 4px rgba(139,92,246,.12)}.customer-activity-row>div{display:flex;flex-direction:column;gap:2px}.customer-activity-row small{opacity:.58}.customer-activity-row time{font-size:10px;opacity:.48;white-space:nowrap;padding-top:3px}@media(max-width:650px){.customer-status-hero{grid-template-columns:1fr;gap:16px}.customer-activity-row{grid-template-columns:12px minmax(0,1fr)}.customer-activity-row time{grid-column:2}}\n''';css.write_text(c)
sw=Path('sw.js');w=sw.read_text();sw.write_text(re.sub(r'const CACHE="[^"]+";','const CACHE="printbook-v5.16.0-tracking2";',w,count=1))
