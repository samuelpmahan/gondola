#!/usr/bin/env python3
"""Verify and concatenate the numbered archive chunks in this directory."""
import hashlib,json,pathlib
root=pathlib.Path(__file__).resolve().parent
manifest=json.loads((root/"manifest.json").read_text())
out=root/manifest["filename"]
total=hashlib.sha256(); count=0
with out.open("xb") as target:
    for part in manifest["parts"]:
        data=(root/part["file"]).read_bytes()
        assert len(data)==part["bytes"], part["file"]
        assert hashlib.sha256(data).hexdigest()==part["sha256"], part["file"]
        total.update(data); count+=len(data); target.write(data)
assert count==manifest["bytes"]
assert total.hexdigest()==manifest["sha256"]
print(out, count, total.hexdigest())
