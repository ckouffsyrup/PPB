from pathlib import Path
import re

app_path=Path('app.js')
css_path=Path('storefront-v55.css')
app=app_path.read_text(encoding='utf-8')
css=css_path.read_text(encoding='utf-8')

if 'function orderAgeDays(order)' not in app:
    pos=app.find('const ORDER_STATUS_META=')
    if pos<0: raise SystemExit('ORDER_STATUS_META not found')
    semi=app.find(';',pos)
    helper='''\nfunction orderAgeDays(order){\n  const raw=order?.updated_at||order?.created_at;\n  if(!raw)return 0;\n  const t=new Date(raw).getTime();\n  if(!Number.isFinite(t))return 0;\n  return Math.max(0,Math.floor((Date.now()-t)/86400000));\n}\nfunction orderAgeLabel(order){\n  const days=orderAgeDays(order);\n  const status=String(order?.status||"Requested");\n  if(status==="Completed"||status==="Cancelled")return "";\n  if(status==="Requested")return days>0?`Waiting ${days}d`:"New today";\n  if(status==="Quoted")return days>0?`Quoted ${days}d ago`:"Quoted today";\n  if(status==="Accepted")return days>0?`Accepted ${days}d ago`:"Accepted today";\n  if(status==="Approved")return days>0?`Approved ${days}d ago`:"Approved today";\n  if(status==="Printing")return days>0?`Printing ${days}d`:"Printing today";\n  if(status==="Ready")return days>0?`Ready ${days}d`:"Ready today";\n  return days>0?`${days}d`:"Today";\n}\nfunction orderAgeBadge(order){\n  const label=orderAgeLabel(order);\n  if(!label)return "";\n  const days=orderAgeDays(order);\n  const urgency=days>=7?"age-overdue":days>=3?"age-warn":"age-fresh";\n  return `<span class="order-age-badge ${urgency}" title="${safe(label)}">${safe(label)}</span>`;\n}\n'''
    app=app[:semi+1]+helper+app[semi+1:]

if app.count('${orderAgeBadge(o)}')<2:
    hits=list(re.finditer(r'\$\{safe\(o\.status\)\}',app))
    inserted=0
    for m in reversed(hits):
        context=app[max(0,m.start()-450):m.start()+450].lower()
        if 'order' in context and ('status' in context or 'tone-border' in context):
            app=app[:m.end()]+'${orderAgeBadge(o)}'+app[m.end():]
            inserted+=1
            if inserted>=2: break
    if inserted<2: raise SystemExit(f'Could only find {inserted} order status render locations')

if '/* PrintBook order aging badges */' not in css:
    css+='''\n\n/* PrintBook order aging badges */\n.order-age-badge{display:inline-flex;align-items:center;min-height:22px;padding:3px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.035);color:rgba(255,255,255,.62);font-size:10px;font-weight:700;line-height:1;white-space:nowrap;vertical-align:middle}\n.order-age-badge.age-warn{border-color:rgba(245,158,11,.18);background:rgba(245,158,11,.07);color:rgba(253,186,116,.9)}\n.order-age-badge.age-overdue{border-color:rgba(248,113,113,.20);background:rgba(248,113,113,.07);color:rgba(252,165,165,.92)}\n@media(max-width:720px){.order-age-badge{font-size:9px;min-height:20px;padding:3px 6px}}\n'''

app_path.write_text(app,encoding='utf-8')
css_path.write_text(css,encoding='utf-8')
