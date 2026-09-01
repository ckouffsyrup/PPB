from pathlib import Path
import re

css=Path('styles.css')
s=css.read_text()
marker='/* v5.17.1 settings scroll fix */'
block='''\n/* v5.17.1 settings scroll fix */\n#settingsDialog{overflow:hidden;max-height:100dvh}\n#settingsDialog[open]{display:grid;place-items:center}\n#settingsDialog .settings-sheet{display:flex;flex-direction:column;width:min(650px,calc(100vw - 24px));height:min(92dvh,900px);max-height:92dvh;overflow:hidden;padding-bottom:max(22px,env(safe-area-inset-bottom))}\n#settingsDialog .sheet-header,#settingsDialog .settings-tabs{flex:0 0 auto}\n#settingsDialog .settings-tabs{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none}\n#settingsDialog .settings-tabs::-webkit-scrollbar{display:none}\n#settingsDialog .settings-tab-panels{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding-right:3px;padding-bottom:18px;touch-action:pan-y}\n#settingsDialog .settings-tab-panel{min-height:min-content}\n#settingsDialog #saveSettingsBtn{flex:0 0 auto;margin-top:10px}\n@media(max-width:560px){#settingsDialog{margin:0;width:100vw;height:100dvh;max-height:100dvh}#settingsDialog[open]{align-items:end}#settingsDialog .settings-sheet{width:100vw;height:calc(100dvh - max(8px,env(safe-area-inset-top)));max-height:none;border-radius:24px 24px 0 0;padding:16px 14px max(14px,env(safe-area-inset-bottom))}#settingsDialog .settings-tab-panels{padding-bottom:28px}}\n'''
if marker not in s:s += block
css.write_text(s)

app=Path('app.js'); a=app.read_text(); a=re.sub(r'window\.PRINTBOOK_BUILD="[^"]+";','window.PRINTBOOK_BUILD="5.17.1";',a,count=1);app.write_text(a)
sw=Path('sw.js'); w=sw.read_text(); w=re.sub(r'const CACHE="[^"]+";','const CACHE="printbook-v5.17.1-settings-scroll";',w,count=1);sw.write_text(w)

# Safety: do not touch index.html. Verify it still looks complete.
h=Path('index.html').read_text()
assert '<!doctype html>' in h.lower()
assert '<dialog id="settingsDialog">' in h
assert '</html>' in h
assert len(h)>20000
