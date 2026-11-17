import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
// node caprot.mjs <style> <zoom> <a0deg> <a1deg> <N> [size] [outdir]
const [st,zoom,a0,a1,nStr,size='900',od]=process.argv.slice(2);const N=+nStr;const outdir=od||`a/rot-${st}`;mkdirSync(outdir,{recursive:true});
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:1000,height:1000}});
const raw=readFileSync(`a/proj-${st}.json`,'utf8');await p.addInitScript(r=>{try{localStorage.setItem('houscaper-v2',r)}catch(e){}},raw);
await p.goto(`http://127.0.0.1:3000/?capture=1&style=${st}&seed=1&bg=transparent&w=${size}&h=${size}&zoom=${zoom}`,{waitUntil:'load',timeout:300000});
await p.waitForFunction(()=>window.__HOUSCAPER_READY__===true,null,{timeout:240000,polling:1000});
for(let i=0;i<N;i++){const f=`${outdir}/o${String(i).padStart(3,'0')}.png`;if(existsSync(f))continue;const t=Date.now();
 await p.evaluate(a=>{window.__az=a},(+a0+(+a1-+a0)*(N>1?i/(N-1):.5))*Math.PI/180);
 await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const d=await p.evaluate(()=>document.querySelector('canvas').toDataURL('image/png'));
 writeFileSync(f,Buffer.from(d.split(',')[1],'base64'));console.log(st,i,(Date.now()-t)/1000);}
await b.close();
