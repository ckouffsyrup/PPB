from pathlib import Path
import re

app_p=Path('app.js')
sw_p=Path('sw.js')
app=app_p.read_text()
sw=sw_p.read_text()

# Fix the malformed regex literals introduced by the multi-item cart patch.
# The source accidentally contained \\s and \\. inside a regex literal, so valid
# addresses were being rejected while adding/submitting cart items.
helper='''function isValidCustomerEmail(value){\n  const email=String(value||"").trim().toLowerCase();\n  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);\n}\n'''
if 'function isValidCustomerEmail(' not in app:
    marker='function addCurrentRequestToCustomerCart(){'
    if marker not in app:
        raise SystemExit('cart function marker missing')
    app=app.replace(marker,helper+marker,1)

bad=r'if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))'
app=app.replace(bad,'if(!isValidCustomerEmail(email))')

# Also route the original request validator through the same helper so every
# customer order email field follows one tested rule.
good=r'if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))'
app=app.replace(good,'if(!isValidCustomerEmail(email))')

# Upgrade the admin preflight check to understand multi-item orders. Supabase
# performs the authoritative reservation atomically; this gives a useful error
# before the request reaches the database.
new_check=r'''function approvalStockCheck(o){
  const lines=Array.isArray(o?.line_items)&&o.line_items.length?o.line_items:null;
  if(lines){
    const grouped=new Map();
    for(const line of lines){
      const item=items.find(i=>String(i.id)===String(line?.print_id||""));
      if(!item||isMadeToOrder(item))continue;
      const qty=Math.max(1,Number(line?.quantity||1));
      const variantId=String(line?.variant_id||"");
      const variant=variantId?(item.variants||[]).find(v=>String(v.id)===variantId):null;
      if((item.variants||[]).length&&!variant)return {ok:false,message:`Choose a variant for ${item.name} before approving this stocked order.`};
      const key=`${item.id}::${variantId}`;
      const previous=grouped.get(key)||{item,variant,qty:0};
      previous.qty+=qty;
      grouped.set(key,previous);
    }
    for(const {item,variant,qty} of grouped.values()){
      const available=variant?Number(variant.stock||0):itemStock(item);
      if(available<qty)return {ok:false,message:`Only ${available} finished ${variant?`${item.name} · ${variant.name}`:item.name} in stock, but this order needs ${qty}. Make more first or set the print to Made to order.`};
    }
    return {ok:true};
  }
  const item=items.find(i=>i.id===o?.print_id);
  if(!item||isMadeToOrder(item))return {ok:true};
  const qty=Math.max(1,Number(o?.quantity||1)),variant=orderVariantForReservation(o,item);
  if((item.variants||[]).length&&!variant)return {ok:false,message:"Choose which variant this stocked order uses before approving it."};
  const available=variant?Number(variant.stock||0):itemStock(item);
  return available>=qty?{ok:true}:{ok:false,message:`Only ${available} finished ${variant?variant.name:item.name} in stock, but this order needs ${qty}. Make more first or set the print to Made to order.`};
}
'''
pattern=r'function approvalStockCheck\(o\)\{.*?\n\}\n(?=function orderNextStep\(status\)\{)'
app,count=re.subn(pattern,new_check,app,count=1,flags=re.S)
if count!=1:
    raise SystemExit(f'approvalStockCheck replacement count={count}')

app=app.replace('window.PRINTBOOK_BUILD="5.13.0"','window.PRINTBOOK_BUILD="5.13.1"',1)
sw=sw.replace('const CACHE="printbook-v5.13.0-multi-item-orders";','const CACHE="printbook-v5.13.1-cart-email-inventory";',1)

# Sanity assertions before writing.
if r'/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/' in app:
    raise SystemExit('malformed doubled-backslash email regex still present')
if 'function isValidCustomerEmail(' not in app or 'Array.isArray(o?.line_items)' not in app:
    raise SystemExit('expected update markers missing')

app_p.write_text(app)
sw_p.write_text(sw)
