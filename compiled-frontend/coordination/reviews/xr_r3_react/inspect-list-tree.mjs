import { inspect } from 'node:util';
const p='/tmp/gondola-compiled-atomic/apps/list-f8359aa2866d/gobi-compiled.mjs';
const {gobiCompiled}=await import(p);
const c=gobiCompiled.appIR.components[0], s=gobiCompiled.symbols;
const own=(o,k)=>Object.getOwnPropertyDescriptor(o,k)?.value;
let state=own(s,c.init)();
for(let n=1;n<=5;n++){
 state=own(s,c.update)(state,{Name:'add',Arg:''})[0];
 if(n===3||n===5){
  const view=own(s,c.view)(state);
  console.log('ROWS',n,inspect(view,{depth:3,colors:false,maxArrayLength:4}));
 }
}
