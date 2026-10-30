import { inspect } from 'node:util';
import { lowerView } from '../../../frontend/react/renderer.mjs';
const p='/tmp/gondola-compiled-atomic/apps/list-f8359aa2866d/gobi-compiled.mjs';
const {gobiCompiled}=await import(p); const c=gobiCompiled.appIR.components[0], s=gobiCompiled.symbols;
const own=(o,k)=>Object.getOwnPropertyDescriptor(o,k)?.value;
let state=own(s,c.init)();
for(let n=1;n<=5;n++){
 state=own(s,c.update)(state,{Name:'add',Arg:''})[0];
 if(n===3||n===5){const v=own(s,c.view)(state); const out=lowerView(v,{dispatch(){},onStaleAction(){},isCurrent:()=>true,refFor:()=>null}); console.log('ROWS',n,inspect(out.element,{depth:4,colors:false,maxArrayLength:7}));}
}
