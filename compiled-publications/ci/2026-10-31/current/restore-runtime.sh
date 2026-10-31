#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'CHECK'
from pathlib import Path
import json,hashlib
m=json.loads(Path('runtime-parts.json').read_text()); parts=[]
for row in m['parts']:
 p=Path(row['path']).name; b=Path(p).read_bytes(); assert len(b)==row['bytes'] and hashlib.sha256(b).hexdigest()==row['sha256'],p; parts.append(b)
b=b''.join(parts); assert len(b)==m['bytes'] and hashlib.sha256(b).hexdigest()==m['sha256'];Path(m['archive']).write_bytes(b)
print('runtime.tar.gz: exact archive hash verified')
CHECK
mkdir -p restored-runtime
tar -xzf runtime.tar.gz -C restored-runtime
printf '%s\n' 'Serve executable demo: python3 -m http.server 8000 --directory restored-runtime/demo/site'
