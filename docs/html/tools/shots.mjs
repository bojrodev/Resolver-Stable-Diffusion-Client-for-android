// The screenshots the docs use (capture.mjs). Each: name (file name), setup (JS run in the app page), and optionally
// clip (a CSS selector: only that element is captured), pad, wait (ms before capture), fresh (reload the app first) and
// online (taken while connected to the pretend Forge in mock-forge.mjs, so lists are filled), keep (no clean-up first:
// it carries on from the shot before), drag (a finger dragged through these points; with dragOn, fractions of that
// element), after (JS run after the drag) and prep (a step only, nothing saved: images made, jobs queued...).

export const VIEWPORT = { width: 412, height: 892, scale: 2 };

const PROMPT = 'masterpiece, best quality, 1girl, (looking at viewer:1.2), silver hair, flowing dress, fantasy forest at golden hour, volumetric lighting, <lora:detailTweaker_xl:0.8>';
const NEG = 'lowres, bad anatomy, blurry, watermark';

// Puts example text in a model tab's prompt boxes (as typing would).
const fill = mode => `
  for (const [id, v] of [['${mode}_prompt', ${JSON.stringify(PROMPT)}], ['${mode}_neg', ${JSON.stringify(NEG)}]]) {
    const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }`;
const wait = ms => `await new Promise(r => setTimeout(r, ${ms}));`;
const tab = v => `if (typeof switchTab === 'function') switchTab('${v}'); window.scrollTo(0, 0);`;
const mode = m => `${tab('gen')} if (typeof setMode === 'function') setMode('${m}'); ${fill(m)} window.scrollTo(0, 0);`;
// Turns a Config switch on (as tapping it would).
const on = id => `{ const s = document.getElementById('${id}'); if (s && !s.checked) { s.checked = true; s.dispatchEvent(new Event('change', { bubbles: true })); } } ${wait(150)} { const m = document.getElementById('appConfirmModal'); if (m && !m.classList.contains('hidden')) document.getElementById('appConfirmOkBtn').click(); } ${wait(150)}`;
// The confirmation itself, left open (to show what turning a feature on asks).
const onAsk = id => `{ const s = document.getElementById('${id}'); if (s && s.checked) { s.checked = false; s.dispatchEvent(new Event('change', { bubbles: true })); } } ${wait(150)} { const s = document.getElementById('${id}'); s.checked = true; s.dispatchEvent(new Event('change', { bubbles: true })); } ${wait(250)}`;
const check = id => on(id);
// Opens a collapsible section by its content id (sections remember open / closed).
const open = id => `{ const c = document.getElementById('${id}'); if (c && (c.classList.contains('hidden') || getComputedStyle(c).display === 'none')) { const h = c.previousElementSibling && c.previousElementSibling.matches('[onclick*="toggleGeneric"]') ? c.previousElementSibling : document.querySelector('[onclick*="toggleGeneric(\\'${id}\\'"]'); if (h) h.dispatchEvent(new MouseEvent('click', { bubbles: true })); } } ${wait(200)}`;
// Scrolls so an element sits near the top of the screen.
const top = sel => `${wait(300)} { const e = document.querySelector(${JSON.stringify(sel)}); if (e) { e.scrollIntoView({ block: 'start' }); window.scrollBy(0, -14); } } ${wait(250)}`;
// Config's Advanced Control on, as holding the CPU leaves it (advcontrol.js), without the animation.
const adv = `document.body.classList.add('adv-control'); try { localStorage.setItem('bojroCfgMode', 'advanced'); } catch (e) { }
  { const n = document.getElementById('cfgModeName'); if (n) { n.textContent = 'Advanced Control'; n.classList.add('adv'); } }`;
// Closes every Config section.
const cfgClosed = `document.querySelectorAll('#view-cfg .cfg-accordion-content:not(.hidden)').forEach(c => c.previousElementSibling.click()); ${wait(250)} window.scrollTo(0, 0);`;
const cfgOpen = id => `${tab('cfg')}
  const c = document.getElementById('${id}');
  if (c && (c.classList.contains('hidden') || getComputedStyle(c).display === 'none')) c.previousElementSibling.click();
  ${wait(300)}
  c && c.closest('.cfg-card').scrollIntoView({ block: 'start' }); window.scrollBy(0, -12);`;

// Generates with a tab's settings (Batch Count n, this prompt) and waits until the images are in.
const genWith = (m, n, prompt) => `{ const p = document.getElementById('${m}_prompt'); p.value = ${JSON.stringify(prompt)}; p.dispatchEvent(new Event('input', { bubbles: true }));
    const b = document.getElementById('${m}_batch_count'); if (b) { b.value = '${n}'; b.dispatchEvent(new Event('input', { bubbles: true })); b.dispatchEvent(new Event('change', { bubbles: true })); } }
  generate(); ${wait(600)} for (let i = 0; i < 80 && (isSingleJobRunning || isQueueRunning); i++) await new Promise(r => setTimeout(r, 250)); ${wait(1500)}
  { const m2 = document.getElementById('appConfirmModal'); if (m2 && !m2.classList.contains('hidden')) { (window.__prepLog = window.__prepLog || []).push('${m}: ' + document.getElementById('appConfirmMessage').textContent); document.getElementById('appConfirmOkBtn').click(); } }
  (window.__prepLog = window.__prepLog || []).push('${m} results: ' + document.querySelectorAll('#gallery .gen-result').length);
  { const b = document.getElementById('${m}_batch_count'); if (b) { b.value = '1'; b.dispatchEvent(new Event('input', { bubbles: true })); b.dispatchEvent(new Event('change', { bubbles: true })); } }`;
// LINK as the app does it (cfg.js connectToLlmService), over fetch: the browser has no native HTTP plugin.
const LINK_LLM = `{ const d = await (await fetch(buildLlmUrl() + '/v1/models')).json(); for (const id of ['llmModelSelect', 'descModelSelect']) { const s = document.getElementById(id); if (!s) continue; s.innerHTML = ''; d.data.forEach(m => s.appendChild(new Option(m.id, m.id))); if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText(id); } updateConnectionStatus('llm', 'connected'); }`;
// Chooses a tab's checkpoint (as picking it would): earlier shots may have left it unset.
const pickCkpt = (m, name) => `{ const s = document.getElementById('${m}_modelSelect'); const o = s && [...s.options].find(o => o.value.includes('${name}')); if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } } ${wait(300)}`;
// Switches a tab's extensions off again (earlier shots turned them on; ControlNet without an image stops a job).
const plain = m => ['_cn_master', '_adetailer_master', '_fc_enable', '_hr_enable'].map(x => `{ const s = document.getElementById('${m}${x}'); if (s && s.checked) { s.checked = false; s.dispatchEvent(new Event('change', { bubbles: true })); } }`).join(' ') + wait(300);
// Taps the nth matching elements (as a finger would).
const clickN = (sel, ns) => `{ const els = [...document.querySelectorAll(${JSON.stringify(sel)})]; for (const n of ${JSON.stringify(ns)}) if (els[n]) els[n].dispatchEvent(new MouseEvent('click', { bubbles: true })); } ${wait(400)}`;
// Sets a prompt box (as typing would).
const setPrompt = (id, v) => `{ const p = document.getElementById('${id}'); p.value = ${JSON.stringify(v)}; p.dispatchEvent(new Event('input', { bubbles: true })); }`;
// An example ComfyUI workflow (API format), for the ComfyUI tab.
const COMFY = {
    '3': { class_type: 'KSampler', _meta: { title: 'KSampler' }, inputs: { seed: 156680208700286, steps: 25, cfg: 6.5, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1, model: ['10', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    '4': { class_type: 'CheckpointLoaderSimple', _meta: { title: 'Load Checkpoint' }, inputs: { ckpt_name: 'juggernautXL_ragnarok.safetensors' } },
    '5': { class_type: 'EmptyLatentImage', _meta: { title: 'Empty Latent Image' }, inputs: { width: 832, height: 1216, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', _meta: { title: 'Positive' }, inputs: { text: 'portrait of a woman in a sunlit greenhouse, soft light, film photo', clip: ['10', 1] } },
    '7': { class_type: 'CLIPTextEncode', _meta: { title: 'Negative' }, inputs: { text: 'blurry, lowres, watermark', clip: ['10', 1] } },
    '8': { class_type: 'VAEDecode', _meta: { title: 'VAE Decode' }, inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', _meta: { title: 'Save Image' }, inputs: { filename_prefix: 'resolver', images: ['8', 0] } },
    '10': { class_type: 'LoraLoader', _meta: { title: 'Load LoRA' }, inputs: { lora_name: 'detailTweaker_xl.safetensors', strength_model: 0.8, strength_clip: 0.8, model: ['4', 0], clip: ['4', 1] } },
};

export const SHOTS = [
    // ---- not connected ----
    { name: 'tab-inpaint', setup: tab('inp') },
    { name: 'tab-queue', setup: tab('que') },
    { name: 'tab-history', setup: tab('gal') },
    { name: 'tab-analyze', setup: tab('ana') },
    { name: 'tab-config', setup: tab('cfg') + cfgClosed },
    { name: 'tab-config-adv', setup: tab('cfg') + adv + cfgClosed },
    // The Mode Selector window: in Simple, held (the bar part-filled, as at 60%) and with Advanced Control on.
    { name: 'mode-simple', wait: 900, setup: tab('cfg') + cfgClosed + 'AdvControl.open();' },
    { name: 'mode-charging', wait: 600, setup: tab('cfg') + cfgClosed + "AdvControl.open(); document.getElementById('acBoard').classList.add('charging'); document.getElementById('acCpuFill').style.width = '60%'; document.getElementById('acCpuHint').textContent = 'CHARGING...';" },
    { name: 'mode-active', wait: 900, setup: tab('cfg') + adv + cfgClosed + 'AdvControl.open();' },
    { name: 'tab-comfy', setup: `document.getElementById('dock-comfy').classList.remove('hidden'); ${tab('comfy')}` },
    { name: 'cfg-connection', setup: cfgOpen('cfg-connection') },
    { name: 'gen-offline', setup: mode('xl') },

    // ---- connected to the pretend Forge ----
    { name: 'gen-sdxl', online: true, setup: mode('xl') },
    { name: 'gen-anima', online: true, setup: mode('anima') },
    { name: 'gen-qwen', online: true, setup: mode('qwen') },
    { name: 'gen-flux', online: true, setup: mode('flux') },
    { name: 'gen-krea', online: true, setup: mode('krea') },
    { name: 'dock', online: true, setup: mode('xl'), clip: '.glass-dock', pad: 14 },
        { name: 'gen-prompt', online: true, setup: mode('xl') + top('#xl_prompt') + `window.scrollBy(0, -70);` },
    { name: 'gen-params', online: true, setup: mode('xl') + open('grp-xl') + `{ const h = [...document.querySelectorAll('#mode-xl-container label')].find(l => /MORE SETTINGS/.test(l.textContent) && l.closest('#grp-xl')); if (h) h.dispatchEvent(new MouseEvent('click', { bubbles: true })); } ${wait(200)}` + top('#grp-xl') + `window.scrollBy(0, -60);` },
    { name: 'gen-hires', online: true, setup: mode('xl') + check('xl_hr_enable') + open('grp-xl-hr') + `{ const h = [...document.querySelectorAll('#grp-xl-hr label')].find(l => /MORE SETTINGS/.test(l.textContent)); if (h) h.dispatchEvent(new MouseEvent('click', { bubbles: true })); } ${wait(200)}` + top('#grp-xl-hr') + `window.scrollBy(0, -60);` },
    { name: 'gen-adetailer', online: true, setup: mode('xl') + on('cfgShowAdetailerSdxlAnimaSwitch') + check('xl_adetailer_master') + open('grp-xl-adetailer') + top('#xl_adetailer_master') + `window.scrollBy(0, -40);` },
    { name: 'gen-controlnet', online: true, setup: mode('xl') + on('cfgShowControlnetSdxlAnimaSwitch') + check('xl_cn_master') + open('grp-xl-cn') + top('#xl_cn_master') + `window.scrollBy(0, -40);` },
    { name: 'gen-forgecouple', online: true, setup: mode('xl') + on('cfgForgeCoupleSwitch') + check('xl_fc_enable') + `if (window.ForgeCouple) ForgeCouple.setMode('xl', 'basic'); ${wait(300)}` + top('#xl_prompt') + `window.scrollBy(0, -60);` },
        { name: 'gen-forgecouple-adv', online: true, setup: mode('xl') + on('cfgForgeCoupleSwitch') + check('xl_fc_enable') + `if (window.ForgeCouple) ForgeCouple.setMode('xl', 'advanced'); ${wait(300)}` + open('grp-xl-fc') + top('#grp-xl-fc') + `window.scrollBy(0, -70);` },
    { name: 'gen-forgecouple-basic', online: true, setup: mode('xl') + on('cfgForgeCoupleSwitch') + check('xl_fc_enable') + `if (window.ForgeCouple) ForgeCouple.setMode('xl', 'basic'); ${wait(300)}` + open('grp-xl-fc') + top('#grp-xl-fc') + `window.scrollBy(0, -70);` },
    { name: 'gen-adetailer-more', online: true, setup: mode('xl') + on('cfgShowAdetailerSdxlAnimaSwitch') + on('cfgAdetailerControlNetSwitch') + check('xl_adetailer_master') + open('grp-xl-adetailer') + open('grp-xl-adetailer-1-more') + open('grp-xl-adetailer-1-cn') + top('#grp-xl-adetailer-1-more') + `window.scrollBy(0, -60);` },
    { name: 'gen-flux-extras', online: true, setup: mode('flux') + on('cfgShowLowBitsSwitch') + on('cfgFluxCacheSwitch') + on('cfgNeverOomSwitch') + `${wait(300)}` },
            { name: 'gen-bottom', online: true, setup: mode('xl') + `${wait(450)} window.scrollTo(0, document.documentElement.scrollHeight); ${wait(350)}` },

    // ---- windows ----
    { name: 'lora-modal', online: true, wait: 1500, setup: mode('xl') + `openLoraModal('xl'); ${wait(1200)}` },
    { name: 'lora-settings', online: true, wait: 1200, setup: mode('xl') + `openLoraModal('xl'); ${wait(900)} window.openLoraSettings(new MouseEvent('click'), 'detailTweaker_xl', 'C:/forge/models/Lora/detailTweaker_xl.safetensors'); ${wait(700)}` },
    { name: 'lora-overrides', online: true, wait: 900, setup: mode('xl') + `openLoraModal('xl'); ${wait(900)} window.openLoraSettings(new MouseEvent('click'), 'detailTweaker_xl', 'C:/forge/models/Lora/detailTweaker_xl.safetensors'); ${wait(700)} { const h = [...document.querySelectorAll('.modal:not(.hidden) *')].find(e => e.children.length < 3 && /^\s*OVERRIDES\s*$/i.test(e.textContent)); if (h) h.dispatchEvent(new MouseEvent('click', { bubbles: true })); } ${wait(500)} { const m = [...document.querySelectorAll('.modal:not(.hidden) .modal-content, .modal:not(.hidden) .modal-box')].pop(); if (m) m.scrollTop = m.scrollHeight; } ${wait(300)}` },
    { name: 'styles-modal', online: true, wait: 1200, setup: mode('xl') + `window.StyleManager.open('xl'); ${wait(900)}` },
    { name: 'style-editor', online: true, wait: 800, setup: mode('xl') + `window.StyleManager.open('xl'); ${wait(700)} { const st = (window.StyleManager.styles || []).find(x => /cinematic/i.test(x.name)) || window.StyleManager.styles[0]; if (st) window.StyleManager.openEditor(st.name); } ${wait(500)}` },
    { name: 'checkpoint-manager', online: true, wait: 1000, setup: `${tab('cfg')} openCheckpointManager(); ${wait(800)}` },
        { name: 'checkpoint-config', online: true, wait: 900, setup: `${tab('cfg')} openCheckpointManager(); ${wait(600)} window.openCheckpointConfig('dreamshaperXL_lightning.safetensors [4496b36d48]'); ${wait(600)}` },
    { name: 'fc-confirm', online: true, wait: 500, setup: mode('xl') + onAsk('cfgForgeCoupleSwitch') },
    { name: 'adetailer-labels', online: true, wait: 700, setup: `${tab('cfg')} openAdetailerLabelsModal(); ${wait(500)}` },

    // ---- with images: the pretend Forge "generates" (prep steps make them first) ----
    { name: 'prep-images', online: true, prep: true, setup: mode('xl') + plain('xl') + pickCkpt('xl', 'dreamshaperXL') + genWith('xl', 4, PROMPT) + mode('anima') + genWith('anima', 2, 'masterpiece, 1girl, kimono, cherry blossoms, night festival, lanterns') + mode('flux') + genWith('flux', 2, 'A cozy cabin by a frozen lake at sunset, warm light in the windows, cinematic, wide shot') + "return window.__prepLog.join(' | ');" },
    { name: 'prep-queue', online: true, prep: true, setup: mode('xl') + plain('xl') + pickCkpt('xl', 'dreamshaperXL') + 'addToQueue();' + wait(300) + "const q1 = queueState.next.length + '/' + (document.getElementById('appConfirmModal').classList.contains('hidden') ? '' : document.getElementById('appConfirmMessage').textContent);" + mode('anima') + setPrompt('anima_prompt', 'masterpiece, 1girl, kimono, cherry blossoms, night festival, lanterns') + 'addToQueue();' + wait(300) + mode('flux') + setPrompt('flux_prompt', 'A cozy cabin by a frozen lake at sunset, warm light in the windows') + 'addToQueue();' + wait(300) + "return q1 + ' then ' + queueState.next.length;" },
    { name: 'queue', online: true, wait: 900, setup: tab('que') + wait(600) },
    { name: 'queue-details', online: true, keep: true, wait: 800, setup: "document.querySelector('#list-next .q-card').click();" + wait(600) },
    { name: 'gen-results', online: true, setup: mode('xl') + top('#gallery') + 'window.scrollBy(0, -120);' },
    { name: 'history', online: true, wait: 1200, setup: tab('gal') + 'if (window.loadGallery) await loadGallery();' + wait(1500) },
    { name: 'history-select', online: true, wait: 900, setup: tab('gal') + 'if (window.loadGallery) await loadGallery();' + wait(1500) + 'toggleGallerySelectionMode();' + wait(300) + clickN('#savedGalleryGrid img', [0, 1, 2]) },
    { name: 'history-dates', online: true, wait: 900, setup: tab('gal') + 'if (window.loadGallery) await loadGallery();' + wait(1500) + "document.getElementById('galDateBtn').click();" + wait(600) },
    { name: 'history-search', online: true, wait: 900, setup: tab('gal') + 'if (window.loadGallery) await loadGallery();' + wait(1500) + "if (document.getElementById('galDateBtn').classList.contains('active')) document.getElementById('galDateBtn').click(); document.getElementById('galSearchBtn').click();" + wait(300) + setPrompt('galSearchInput', 'kimono') + wait(600) },
    { name: 'viewer', online: true, wait: 1200, setup: tab('gal') + 'if (window.loadGallery) await loadGallery();' + wait(1500) + "{ const i = document.getElementById('galSearchInput'); if (i && i.value) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); } }" + wait(400) + 'openFullscreenFromGallery(0);' + wait(900) },
    { name: 'viewer-send', online: true, keep: true, wait: 600, setup: 'toggleFsSendMenu();' + wait(400) },
    { name: 'analyze', online: true, keep: true, wait: 1500, setup: "if (window.closeFsSendMenu) closeFsSendMenu(); document.getElementById('fsAnalyzeBtn').click();" + wait(1800) + 'window.scrollTo(0, 0);' },
    { name: 'analyze-settings', online: true, keep: true, wait: 700, setup: top('#anaMetaSections') + 'window.scrollBy(0, -10);' },
    { name: 'editor', online: true, wait: 1200, setup: tab('gal') + 'if (window.loadGallery) await loadGallery();' + wait(1500) + 'openFullscreenFromGallery(1);' + wait(900) + "document.getElementById('fsInpaintBtn').click();" + wait(1800) },
    { name: 'inp-mask', online: true, keep: true, wait: 900, setup: "document.getElementById('editorProceedBtn').click();" + wait(2200) + "setInpaintTopMode('inpaint');" + wait(500), dragOn: '#paintCanvas', drag: [[.3, .35], [.38, .3], [.48, .28], [.58, .3], [.66, .36], [.62, .45], [.5, .48], [.4, .46], [.34, .42], [.45, .38], [.55, .38]], after: top('#canvasWrapper') + 'window.scrollBy(0, -60);' },
    { name: 'inp-controls', online: true, keep: true, wait: 700, setup: top('#inpaintOnlyControls') + 'window.scrollBy(0, -12);' },
    { name: 'inp-img2img', online: true, keep: true, wait: 900, setup: "setInpaintTopMode('img2img');" + wait(600) + 'window.scrollTo(0, 0);' },
    { name: 'inp-img2img-params', online: true, keep: true, wait: 700, setup: top('#inp_prompt') + 'window.scrollBy(0, -90);' },
    { name: 'inp-upscale', online: true, keep: true, wait: 900, setup: "setInpaintTopMode('upscale');" + wait(600) + 'window.scrollTo(0, 0);' },
    { name: 'inp-upscale-settings', online: true, keep: true, wait: 700, setup: 'window.scrollTo(0, document.documentElement.scrollHeight);' + wait(300) },
    { name: 'img2img-presets', online: true, keep: true, wait: 900, setup: "setInpaintTopMode('img2img');" + wait(400) + 'openImg2imgPresetModal();' + wait(600) },
    { name: 'prompt-history', online: true, wait: 800, setup: mode('xl') + "PromptHistory.open('xl');" + wait(500) },
    { name: 'prompt-colors', online: true, wait: 600, setup: mode('xl') + 'openPromptColorsHelp();' + wait(300) },
    { name: 'prompt-guide', online: true, wait: 700, setup: mode('xl') + 'openPromptGuide();' + wait(400) },
    { name: 'gen-wildcards', online: true, wait: 900, setup: mode('xl') + setPrompt('xl_prompt', 'masterpiece, best quality, 1girl, __hair color__, __casual outfits__, __weather__, <lora:detailTweaker_xl:0.8>') + wait(500) + top('#xl_prompt') + 'window.scrollBy(0, -70);' },
    { name: 'wc-basic', online: true, wait: 900, setup: mode('xl') + "Wildcards.open(); WcAdvanced.setMode('basic');" + wait(600) },
    { name: 'wc-advanced', online: true, wait: 900, setup: mode('xl') + "Wildcards.open(); WcAdvanced.setMode('advanced');" + wait(600) },
    { name: 'wc-editor', online: true, keep: true, wait: 900, setup: "Wildcards.edit('hair color');" + wait(700) },
    { name: 'wc-editor-text', online: true, keep: true, wait: 700, setup: "{ const b = document.querySelector('#wcViewSeg [data-v=text]'); if (b) b.click(); }" + wait(400) },
    { name: 'wc-guide', online: true, wait: 800, setup: mode('xl') + 'Wildcards.open(); WcAdvanced.guideOpen();' + wait(500) },
    { name: 'wc-try', online: true, wait: 900, setup: mode('xl') + "Wildcards.open(); WcAdvanced.setMode('advanced'); WcAdvanced.tryOpen();" + wait(400) + setPrompt('wcTryText', '1girl, __hair color__, {red|blue|green} dress, __weather__') + 'WcAdvanced.runTry();' + wait(700) },
    { name: 'wc-import', online: true, wait: 900, setup: mode('xl') + 'Wildcards.open(); WcImport.open();' + wait(600) },
    { name: 'mp-prompt', online: true, wait: 900, setup: mode('xl') + "openLlmModal('xl');" + wait(900) + setPrompt('llmInput', 'a futuristic city with flying cars') + "{ const m = document.getElementById('appConfirmModal'); if (m && !m.classList.contains('hidden')) document.getElementById('appConfirmOkBtn').click(); }" + wait(300) + LINK_LLM + "const P = (window.Capacitor = window.Capacitor || { Plugins: {} }).Plugins; const had = 'CapacitorHttp' in P; if (!had) P.CapacitorHttp = {};" + 'generateLlmPrompt();' + wait(2500) + "if (!had) delete P.CapacitorHttp; return 'models ' + document.getElementById('llmModelSelect').options.length + ' alert ' + !document.getElementById('appConfirmModal').classList.contains('hidden') + ' out ' + document.getElementById('llmOutput').value.slice(0, 30);" },
    { name: 'mp-describe', online: true, keep: true, wait: 1000, setup: "Describe.setTab('describe');" + wait(300) + 'if (Describe.useLast) Describe.useLast();' + wait(900) },
    { name: 'tab-comfy-loaded', online: true, wait: 900, setup: "document.getElementById('dock-comfy').classList.remove('hidden');" + tab('comfy') + 'comfyLoadedWorkflow = ' + JSON.stringify(COMFY) + "; document.getElementById('comfyLoadedFileName').innerText = 'PORTRAIT_SDXL.JSON'; buildComfyUI(comfyLoadedWorkflow);" + wait(600) + 'window.scrollTo(0, 0);' },
    { name: 'tab-comfy-controls', online: true, keep: true, wait: 700, setup: top('#comfy-dynamic-controls') + 'window.scrollBy(0, -10);' },
    { name: 'power-row', online: true, setup: mode('xl'), clip: '#devPowerSection', pad: 10 },
    { name: 'power-pwk', online: true, wait: 500, setup: mode('xl') + "document.getElementById('pwkModal').classList.remove('hidden');" },
    { name: 'power-info', online: true, wait: 500, setup: mode('xl') + "document.getElementById('powerInfoModal').classList.remove('hidden');" },
    { name: 'battery', online: true, wait: 500, setup: mode('xl') + "document.getElementById('batteryModal').classList.remove('hidden');" },
    { name: 'backup', online: true, wait: 900, setup: tab('cfg') + 'Backup.openBackup();' + wait(600) },
    { name: 'gallery-badges', online: true, wait: 600, setup: tab('cfg') + 'openGalleryBadges();' + wait(300) },
    { name: 'debug-log', online: true, wait: 800, setup: tab('cfg') + on('cfgDebugLogSwitch') + 'openDebugLog();' + wait(500) },
    { name: 'data-usage', online: true, wait: 800, setup: tab('cfg') + on('cfgDataUsageSwitch') + 'openDataUsageHistory();' + wait(500) },
    ...['interface', 'prompts', 'magic', 'generation', 'livepreview', 'history', 'inpana', 'models', 'extensions', 'diag', 'experimental', 'sys'].map(s => ({ name: 'cfg-' + s, online: true, wait: 700, setup: (s === 'sys' ? '' : tab('cfg') + adv) + cfgOpen('cfg-' + s) })),
];
