from pathlib import Path
import re

app = Path('app.js')
s = app.read_text()

old = 'function activePaymentMethods(){return normalizedPaymentMethods(storeAvailability.payment_methods||settings.paymentMethods||{})}'
new = '''function activePaymentMethods(){
  // Prefer cloud-backed store settings when they actually contain payment data,
  // otherwise fall back to the locally cached copy. An empty object is truthy,
  // so the old `cloud || local` version could hide saved methods on startup.
  const cloud=storeAvailability?.payment_methods;
  const local=settings?.paymentMethods;
  const cloudHasData=cloud&&typeof cloud==="object"&&Object.values(cloud).some(v=>v&&(v.enabled||String(v.detail||"").trim()));
  const localHasData=local&&typeof local==="object"&&Object.values(local).some(v=>v&&(v.enabled||String(v.detail||"").trim()));
  return normalizedPaymentMethods(cloudHasData?cloud:(localHasData?local:(cloud||local||{})));
}'''
if old not in s:
    raise SystemExit('activePaymentMethods block not found')
s = s.replace(old, new, 1)

# When cloud settings load, also refresh the local cache so orders opened later
# use the same saved payment methods even before another settings load finishes.
old2 = 'storeAvailability={...storeAvailability,status:d.availability_status||"open",turnaround:d.turnaround_text||"3–5 days",notice:d.storefront_notice||"",reopen_date:d.reopen_date||null,capacity_limit:d.capacity_limit||null,auto_pause_at_capacity:!!d.auto_pause_at_capacity,store_name:d.store_name||"Karcen\'s Prints",tagline:d.storefront_tagline||"Made layer by layer.",about:d.storefront_about||"",accent_color:normalizeStoreAccent(d.storefront_accent),logo_url:d.storefront_logo_url||"",hero_url:d.storefront_hero_url||"",payment_methods:normalizedPaymentMethods(d.payment_methods||{}),featured_product_ids:normalizeFeaturedProductIds(d.featured_product_ids)};'
new2 = old2 + '\n  settings.paymentMethods=storeAvailability.payment_methods;localStorage.setItem(K.settings,JSON.stringify(settings));'
if old2 not in s:
    raise SystemExit('loadStoreAvailability settings assignment not found')
s = s.replace(old2, new2, 1)

# Make successful save immediately rerender choices if an order editor is open.
old3 = 'settings.paymentMethods=storeAvailability.payment_methods;localStorage.setItem(K.settings,JSON.stringify(settings));toast("Payment methods saved")'
new3 = 'settings.paymentMethods=storeAvailability.payment_methods;localStorage.setItem(K.settings,JSON.stringify(settings));if($("orderDialog")?.open)renderOrderPaymentMethodChoices(selectedOrderPaymentMethods());toast("Payment methods saved")'
if old3 not in s:
    raise SystemExit('savePaymentMethods success block not found')
s = s.replace(old3, new3, 1)

s = re.sub(r'window\.PRINTBOOK_BUILD="[^"]+";', 'window.PRINTBOOK_BUILD="5.17.2";', s, count=1)
app.write_text(s)

sw = Path('sw.js')
w = sw.read_text()
w = re.sub(r'const CACHE="[^"]+";', 'const CACHE="printbook-v5.17.2-payment-method-persistence";', w, count=1)
sw.write_text(w)
