// Resolver docs: screenshot capture.
//
// Loads the real app (www/index.html) in headless Chrome at phone size and saves one screenshot per entry in
// shots.mjs into ../assets/img/shots/. It only reads the app: nothing in www/ is changed, and Chrome uses a throwaway
// profile, so no settings or images on this PC are touched.
//
//   node docs/html/tools/capture.mjs              all shots
//   node docs/html/tools/capture.mjs gen-sdxl     only the shots whose names contain "gen-sdxl"
//   node docs/html/tools/capture.mjs "prep-images|mp-"   several (a pattern)
//
// Chrome is found in its usual Windows / macOS / Linux places, or set CHROME=/path/to/chrome.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SHOTS, VIEWPORT } from './shots.mjs';
import { startMockForge, STYLES } from './mock-forge.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appIndex = resolve(here, '../../../www/index.html');
const outDir = resolve(here, '../assets/img/shots');
const filter = process.argv[2] || '';

const CHROMES = [process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const chrome = CHROMES.find(p => existsSync(p));
if (!chrome) { console.error('Chrome or Edge not found: set CHROME=/path/to/chrome'); process.exit(1); }
if (!existsSync(appIndex)) { console.error('App not found at ' + appIndex); process.exit(1); }
mkdirSync(outDir, { recursive: true });

const port = 9400 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'resolver-docs-'));
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, '--allow-file-access-from-files',
    '--hide-scrollbars', '--force-color-profile=srgb', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws;
for (let i = 0; i < 60 && !ws; i++) {
    try { const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = t.find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch (e) { }
    if (!ws) await sleep(200);
}
await new Promise(r => ws.onopen = r);
let id = 0; const pend = {};
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const run = async code => {
    const r = await cmd('Runtime.evaluate', { expression: `(async () => { ${code} })()`, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result && r.result.result ? r.result.result.value : undefined;
};

// Common set-up before every shot: no first-run windows, a clean page, the top of the screen.
const RESET = `
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.body.classList.remove('app-loading');
  const comfyDock = document.getElementById('dock-comfy'); if (comfyDock) comfyDock.classList.add('hidden');
  // Connected to the pretend Forge on this PC: Config shows a usual home address instead (on screen only, not saved).
  const ipBox = document.getElementById('cfgBaseIp'), portBox = document.getElementById('cfgPortWebUI');
  if (ipBox && /127\\.0\\.0\\.1/.test(ipBox.value)) { ipBox.value = 'http://192.168.1.20'; if (portBox) portBox.value = '7860'; }
  // Config in Simple, the app's default (advcontrol.js): shots that need Advanced Control switch it on themselves.
  document.body.classList.remove('adv-control'); try { localStorage.removeItem('bojroCfgMode'); } catch (e) { }
  { const n = document.getElementById('cfgModeName'); if (n) { n.textContent = 'Simple'; n.classList.remove('adv'); } }
  if (typeof closeCfgSearch === 'function' && !document.getElementById('cfgSearchWrap')?.classList.contains('hidden')) closeCfgSearch();
  window.__docShot = true;
`;

async function load() {
    await cmd('Emulation.setDeviceMetricsOverride', { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: VIEWPORT.scale, mobile: true });
    await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cmd('Page.enable');
    await cmd('Page.navigate', { url: pathToFileURL(appIndex).href });
    await sleep(5000);
}

// Two passes: first the app as installed (not connected), then connected to the pretend Forge (mock-forge.mjs) for the
// shots marked online, so their lists (checkpoints, LoRAs...) are filled.
// The filter is a pattern: 'gen-sdxl', or 'prep-images|mp-' for several.
const picked = SHOTS.filter(s => !filter || new RegExp(filter).test(s.name));
const offline = picked.filter(s => !s.online), online = picked.filter(s => s.online);
let done = 0, mock = null;
if (offline.length) await load();
await shootAll(offline);
if (online.length) {
    mock = await startMockForge();
    await load();
    await run(`localStorage.setItem('bojroConnectionConfig', JSON.stringify({ baseIp: 'http://127.0.0.1', portWebUI: ${mock.port}, portComfy: 8188, portLlm: ${mock.port}, portWake: 5000, isConfigured: true, isRemote: false }));
      localStorage.setItem('bojroHostIp', 'http://127.0.0.1:${mock.port}');
      localStorage.setItem('resolver_styles_fallback', ${JSON.stringify(JSON.stringify(STYLES))});`);
    await load();
    const linked = await run(`for (let i = 0; i < 40; i++) { const b = document.querySelector('#view-gen button, .engine-btn, [onclick*="connect("]'); if (typeof isEngineConnected !== 'undefined' && isEngineConnected) return true;
      if (i === 10 && typeof connect === 'function') connect(true); await new Promise(r => setTimeout(r, 250)); } return false;`);
    console.log(linked ? 'connected to the pretend Forge' : 'WARNING: not connected to the pretend Forge');
    await shootAll(online);
    mock.close();
}

async function shootAll(list) { for (const shot of list) await shootOne(shot); }
async function shootOne(shot) {
    if (shot.fresh) await load();
    try {
        const said = await run((shot.keep ? '' : RESET) + (shot.setup || ''));
        // A finger dragged across the screen (CSS pixels), as painting a mask.
        if (shot.drag) {
            // dragOn: the points are fractions of that element's box.
            const box = shot.dragOn ? await run(`const e = document.querySelector(${JSON.stringify(shot.dragOn)}); e.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 300)); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height };`) : { x: 0, y: 0, w: 1, h: 1 };
            const pts = shot.drag.map(([x, y]) => ({ x: box.x + x * box.w, y: box.y + y * box.h }));
            await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
            for (const p of pts.slice(1)) { await cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] }); await sleep(16); }
            await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await sleep(300);
        }
        if (shot.after) await run(shot.after);
        // A step only (images made, jobs queued...): nothing to save.
        if (shot.prep) { console.log('done', shot.name, said ? '- ' + said : ''); return; }
        await sleep(shot.wait || 700);
        await run('if (window.lucide && lucide.createIcons) lucide.createIcons();');
        let clip;
        if (shot.clip) {
            const r = await run(`const el = document.querySelector(${JSON.stringify(shot.clip)}); if (!el) return null;
              el.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 250));
              const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height };`);
            if (!r) throw new Error('clip element not found: ' + shot.clip);
            const pad = shot.pad ?? 8;
            clip = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + pad * 2, height: r.h + pad * 2, scale: 1 };
        }
        const res = await cmd('Page.captureScreenshot', { format: 'webp', quality: 86, ...(clip ? { clip, captureBeyondViewport: true } : {}) });
        writeFileSync(join(outDir, shot.name + '.webp'), Buffer.from(res.result.data, 'base64'));
        done++;
        console.log('saved', shot.name, said ? '- ' + said : '');
    } catch (e) {
        console.log('FAILED', shot.name, '-', e.message.split('\n')[0]);
    }
}
console.log(`${done} screenshot(s) in ${outDir}`);
ws.close(); proc.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { }
process.exit(0);
