from pathlib import Path
p=Path('app.js')
s=p.read_text()
s=s.replace('}).join("\n")}', '}).join("\\n")}')
p.write_text(s)
