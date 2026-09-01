from pathlib import Path
import re
p=Path('app.js')
s=p.read_text()
# CUSTOMER_CART_KEY must exist before loadCustomerCart() runs during startup.
s=s.replace('const CUSTOMER_SAVED_ORDERS_KEY="printbook_customer_orders_v1";\nconst CUSTOMER_CART_KEY="printbook_customer_cart_v1";', 'const CUSTOMER_SAVED_ORDERS_KEY="printbook_customer_orders_v1";')
anchor='let currentRequestPrintId=null;\n'
if 'const CUSTOMER_CART_KEY="printbook_customer_cart_v1";' not in s:
    s=s.replace(anchor, anchor+'const CUSTOMER_CART_KEY="printbook_customer_cart_v1";\n',1)
else:
    # If another copy remains later, remove all and insert once before cart startup.
    s=s.replace('const CUSTOMER_CART_KEY="printbook_customer_cart_v1";\n','')
    s=s.replace(anchor, anchor+'const CUSTOMER_CART_KEY="printbook_customer_cart_v1";\n',1)
s=re.sub(r'window\.PRINTBOOK_BUILD="[^"]+";', 'window.PRINTBOOK_BUILD="5.14.1";', s, count=1)
p.write_text(s)
# cache bust
swp=Path('sw.js'); sw=swp.read_text(); sw=re.sub(r'const CACHE="[^"]+";', 'const CACHE="printbook-v5.14.1-persistent-cart-fix";',sw,count=1); swp.write_text(sw)
