import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateSnapshotAgainstManifest} from '../../protocol.mjs';
const pack=JSON.parse(await readFile(new URL('../../build/fixtures.json',import.meta.url),'utf8'));
const base=JSON.parse(pack.fixtures.find(f=>f.expectedValid).raw);
const binary=fileURLToPath(new URL('../../build/render-contract',import.meta.url));
const values=['',' ','\t','\n','\u0085','\ufeff','\u200b','x'];
function handler(node){if(node.On?.length)return node.On[0];for(const c of node.Kids??[]){const h=handler(c);if(h)return h}}
const rows=[];
for(const field of ['handler','binding'])for(const value of values){const s=structuredClone(base);if(field==='handler')handler(s.tree).Message=value;else s.bindings[0].Message=value;let js=true,jsError=null;try{validateSnapshotAgainstManifest(s,pack.manifest)}catch(e){js=false;jsError=e.message}const r=spawnSync(binary,['validate'],{input:JSON.stringify(s),encoding:'utf8'});if(r.error)throw r.error;rows.push({field,value,js,native:r.status===0,jsError,nativeResult:r.stdout.trim()})}
const result={rows,mismatches:rows.filter(x=>x.js!==x.native)};
await writeFile(new URL(process.argv[2] ?? '../../evidence/blank-message-admission-initial.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({cases:rows.length,mismatches:result.mismatches}));
