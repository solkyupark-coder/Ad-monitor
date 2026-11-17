import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const [L, mode, ...rest] = process.argv.slice(2);
const b = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('pageerror', e => console.error('ERR', e.message)); p.on('console', m => m.type()==='error'&&console.error('CONSOLE', m.text()));
await p.goto(`http://127.0.0.1:8765/${process.env.PAGE||'reel8.html'}?l=${L}`);
await p.waitForFunction(() => window.__ok === true, null, { timeout: 120000 });
const dur = await p.evaluate(() => DUR);
if (mode === 'stills') {
  for (const t of rest.map(Number)) { await p.evaluate(t => render(t), t); await p.screenshot({ path: `still_${L}_${t}.jpg`, quality: 80, type: 'jpeg' }); }
} else {
  const out = `out_${L}`; mkdirSync(out, { recursive: true });
  const n = Math.round(dur * 30);
  for (let i = 0; i < n; i++) { await p.evaluate(t => render(t), i / 30); await p.screenshot({ path: `${out}/${String(i).padStart(4, '0')}.jpg`, quality: 92, type: 'jpeg' }); if(i%60==0)console.log(i,'/',n); }
}
await b.close();
