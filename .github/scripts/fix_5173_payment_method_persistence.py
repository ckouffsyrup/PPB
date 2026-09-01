from pathlib import Path
import re
p=Path('app.js')
s=p.read_text()
anchor='''function activePaymentMethods(){\n  // Prefer cloud-backed store settings when they actually contain payment data,\n  // otherwise fall back to the locally cached copy. An empty object is truthy,\n  // so the old `cloud || local` version could hide saved methods on startup.\n  const cloud=storeAvailability?.payment_methods;\n  const local=settings?.paymentMethods;\n  const cloudHasData=cloud&&typeof cloud==="object"&&Object.values(cloud).some(v=>v&&(v.enabled||String(v.detail||"").trim()));\n  const localHasData=local&&typeof local==="object"&&Object.values(local).some(v=>v&&(v.enabled||String(v.detail||"").trim()));\n  return normalizedPaymentMethods(cloudHasData?cloud:(localHasData?local:(cloud||local||{})));\n}\n'''
insert=anchor+'''let paymentMethodsCloudLoaded=false;\nasync function ensurePaymentMethodsLoaded(){\n  if(paymentMethodsCloudLoaded||!supabaseClient||!currentUser)return activePaymentMethods();\n  try{\n    const {data,error}=await supabaseClient.from("store_settings").select("payment_methods").eq("user_id",currentUser.id).maybeSingle();\n    if(error)throw error;\n    const normalized=normalizedPaymentMethods(data?.payment_methods||{});\n    storeAvailability={...storeAvailability,payment_methods:normalized};\n    settings.paymentMethods=normalized;\n    localStorage.setItem(K.settings,JSON.stringify(settings));\n    paymentMethodsCloudLoaded=true;\n    return normalized;\n  }catch(err){\n    console.error("Payment methods load failed",err);\n    return activePaymentMethods();\n  }\n}\n'''
if anchor not in s: raise SystemExit('activePaymentMethods anchor not found')
s=s.replace(anchor,insert,1)
s=s.replace('window.openOrder=id=>{','window.openOrder=async id=>{',1)
needle='''  resetOrder();populatePrintSelects();if(id){'''
repl='''  await ensurePaymentMethodsLoaded();\n  resetOrder();populatePrintSelects();if(id){'''
if needle not in s: raise SystemExit('openOrder body anchor not found')
s=s.replace(needle,repl,1)
s=s.replace('''  settings.paymentMethods=storeAvailability.payment_methods;localStorage.setItem(K.settings,JSON.stringify(settings));\n  featuredProductIds=''', '''  settings.paymentMethods=storeAvailability.payment_methods;paymentMethodsCloudLoaded=true;localStorage.setItem(K.settings,JSON.stringify(settings));\n  featuredProductIds=''',1)
s=s.replace('''try{const {error}=await supabaseClient.from("store_settings").upsert({user_id:currentUser.id,payment_methods,updated_at:nowISO()});if(error)throw error;storeAvailability={...storeAvailability,payment_methods:normalizedPaymentMethods(payment_methods)};settings.paymentMethods=storeAvailability.payment_methods;localStorage.setItem(K.settings,JSON.stringify(settings));''','''try{const {error}=await supabaseClient.from("store_settings").upsert({user_id:currentUser.id,payment_methods,updated_at:nowISO()});if(error)throw error;storeAvailability={...storeAvailability,payment_methods:normalizedPaymentMethods(payment_methods)};settings.paymentMethods=storeAvailability.payment_methods;paymentMethodsCloudLoaded=true;localStorage.setItem(K.settings,JSON.stringify(settings));''',1)
s=re.sub(r'window\.PRINTBOOK_BUILD="[^"]+";','window.PRINTBOOK_BUILD="5.17.3";',s,count=1)
p.write_text(s)
sw=Path('sw.js'); w=sw.read_text(); w=re.sub(r'const CACHE="[^"]+";','const CACHE="printbook-v5.17.3-payment-method-persist";',w,count=1); sw.write_text(w)
