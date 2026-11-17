// A pretend Forge server for the docs screenshots (capture.mjs). It answers the requests the app makes with example
// data (checkpoints, LoRAs with artwork thumbnails, samplers, upscalers...), so screenshots show a connected app with
// filled lists. It only listens on 127.0.0.1, only while screenshots are taken, and generates nothing real: a
// "generated" image is a drawn landscape (a few gradients, different for each seed) with the settings written into it
// as Forge does, so History, Queue and Analyze have something to show. It also answers as a small LLM server (the
// LM Studio / OpenAI-style /v1 routes) for the Magic Prompt shots.
import http from 'node:http';
import zlib from 'node:zlib';

const ckpt = (file, hash) => ({ title: `${file} [${hash}]`, model_name: file.replace(/\.(safetensors|gguf|ckpt)$/, ''), filename: `C:\\forge\\models\\Stable-diffusion\\${file}`, hash });
export const CHECKPOINTS = [
    ckpt('dreamshaperXL_lightning.safetensors', '4496b36d48'),
    ckpt('juggernautXL_ragnarok.safetensors', 'dd08fa32f9'),
    ckpt('animagineXL_v31.safetensors', 'e3c47aedb0'),
    ckpt('illustriousXL_v10.safetensors', '8f13a6bc1e'),
    ckpt('anima_preview_v2.safetensors', '1c9d7e44a0'),
    ckpt('z_image_turbo_bf16.safetensors', '5a3b2c1d0e'),
    ckpt('flux1-dev-Q8_0.gguf', '0f9a8b7c6d'),
    ckpt('flux1-krea-dev-Q8_0.gguf', '7e6d5c4b3a'),
];

const lora = (name, folder = '') => ({ name, alias: name, path: `C:\\forge\\models\\Lora\\${folder ? folder + '\\' : ''}${name}.safetensors`, metadata: {} });
export const LORAS = [
    lora('detailTweaker_xl'), lora('add_more_details'), lora('cinematic_lighting'), lora('watercolor_style', 'styles'),
    lora('pixel_art_xl', 'styles'), lora('ghibli_landscape', 'styles'), lora('cyberpunk_city', 'backgrounds'),
    lora('enchanted_forest', 'backgrounds'), lora('silver_knight_armor', 'clothing'), lora('kimono_floral', 'clothing'),
    lora('aria_character_v2', 'characters'), lora('kai_character', 'characters'),
];

export const STYLES = [
    { name: 'Cinematic', prompt: 'cinematic still, dramatic lighting, film grain, shallow depth of field, anamorphic', negative_prompt: 'cartoon, flat lighting' },
    { name: 'Watercolor', prompt: 'watercolor painting, soft washes, paper texture, delicate ink lines', negative_prompt: 'photo, 3d render' },
    { name: 'Anime Key Visual', prompt: 'anime key visual, vibrant colors, clean lineart, detailed background', negative_prompt: 'realistic, photo' },
    { name: 'Cozy Interior', prompt: 'cozy interior, warm lamp light, wooden furniture, plants, soft shadows', negative_prompt: '' },
    { name: 'Neon Night', prompt: 'neon lights, rainy night street, reflections, cyberpunk atmosphere', negative_prompt: 'daylight' },
    { name: 'Studio Portrait', prompt: 'studio portrait, softbox lighting, 85mm lens, sharp focus, bokeh', negative_prompt: 'blurry, distorted face' },
];

// Artwork thumbnails: a gradient scene per name (an SVG), the same each time for the same name.
function art(name) {
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const r = n => { h = (h * 1103515245 + 12345) >>> 0; return h % n; };
    const hue = r(360), hue2 = (hue + 40 + r(120)) % 360;
    const shapes = Array.from({ length: 6 }, () => `<circle cx="${r(256)}" cy="${r(256)}" r="${20 + r(70)}" fill="hsla(${(hue + r(90)) % 360},80%,${55 + r(25)}%,.${3 + r(5)})"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,45%)"/><stop offset="1" stop-color="hsl(${hue2},75%,22%)"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/>${shapes}<path d="M0 200 Q64 ${150 + r(40)} 128 190 T256 ${170 + r(40)} V256 H0Z" fill="hsla(${hue2},60%,12%,.75)"/></svg>`;
}

// ---- "generated" images: a PNG drawn here, with Forge's parameters text in it ----
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}
const hsl = (h, s, l) => {
    const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0) * 255, f(8) * 255, f(4) * 255];
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// A landscape: sky, a sun with a glow, three rows of hills. The seed sets the colours and shapes.
export function landscapePng(w, h, seed, text) {
    let x0 = (seed >>> 0) || 1;
    const rnd = () => { x0 = (x0 * 1103515245 + 12345) >>> 0; return (x0 >>> 8) / 16777216; };
    rnd(); rnd();
    const hue = rnd() * 360, sky1 = hsl(hue, .7, .62), sky2 = hsl((hue + 40) % 360, .65, .3), sun = hsl((hue + 180) % 360, .9, .78);
    const sx = .2 + rnd() * .6, sy = .25 + rnd() * .2, sr = .07 + rnd() * .05;
    const hills = [0, 1, 2].map(i => ({ base: .55 + i * .13, amp: .05 + rnd() * .05, f: 2 + rnd() * 4, ph: rnd() * 6.3, col: hsl((hue + 200 + i * 25) % 360, .45, .32 - i * .09) }));
    const raw = Buffer.alloc((w * 3 + 1) * h);
    let o = 0;
    for (let y = 0; y < h; y++) {
        raw[o++] = 0;
        const v = y / h;
        for (let x = 0; x < w; x++) {
            const u = x / w;
            let c = mix(sky1, sky2, v);
            const d = Math.hypot((u - sx) * w / h, v - sy);
            if (d < sr) c = sun; else c = mix(c, sun, Math.max(0, .5 - (d - sr) * 2.2));
            for (const hl of hills) if (v > hl.base + Math.sin(u * hl.f + hl.ph) * hl.amp) c = mix(hl.col, [0, 0, 0], (v - hl.base) * .5);
            raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2];
        }
    }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
        chunk('tEXt', Buffer.from('parameters\0' + text, 'latin1')), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
const MODEL_NAME = t => String(t || CHECKPOINTS[0].title).replace(/\s*\[.*$/, '').replace(/\.(safetensors|gguf)$/, '');
// Forge's reply to txt2img / img2img: each image with its own seed, and the settings in it (drawn smaller than asked).
function generate(p, img2img) {
    const n = Math.max(1, Math.min(8, (+p.n_iter || 1) * (+p.batch_size || 1)));
    let w = Math.round(+p.width || 1024), h = Math.round(+p.height || 1024);
    const k = Math.min(1, 768 / Math.max(w, h)); w = Math.max(64, Math.round(w * k / 8) * 8); h = Math.max(64, Math.round(h * k / 8) * 8);
    const first = +p.seed >= 0 ? +p.seed : Math.floor(Math.random() * 4e9);
    const ckpt = (p.override_settings && p.override_settings.sd_model_checkpoint) || CHECKPOINTS[0].title;
    const hash = (CHECKPOINTS.find(c => c.title === ckpt) || CHECKPOINTS[0]).hash;
    const seeds = [], infotexts = [], images = [];
    for (let i = 0; i < n; i++) {
        const seed = first + i;
        const extra = (img2img ? `, Denoising strength: ${p.denoising_strength ?? 0.75}` : '') + (p.enable_hr ? `, Hires upscale: ${p.hr_scale || 1.5}, Hires upscaler: ${p.hr_upscaler || 'Latent'}` : '');
        const text = `${p.prompt || ''}\nNegative prompt: ${p.negative_prompt || ''}\nSteps: ${p.steps || 20}, Sampler: ${p.sampler_name || 'Euler a'}, Schedule type: ${p.scheduler || 'Karras'}, CFG scale: ${p.cfg_scale ?? 7}, Seed: ${seed}, Size: ${+p.width || w}x${+p.height || h}, Model hash: ${hash}, Model: ${MODEL_NAME(ckpt)}${extra}, Version: f2.0.1v1.10.1`;
        seeds.push(seed); infotexts.push(text);
        images.push(landscapePng(w, h, seed, text).toString('base64'));
    }
    return { images, parameters: {}, info: JSON.stringify({ prompt: p.prompt, seed: first, all_seeds: seeds, infotexts, width: w, height: h, sampler_name: p.sampler_name, cfg_scale: p.cfg_scale, steps: p.steps }) };
}
// An LLM's answer for Magic Prompt.
const IDEA_REPLY = 'masterpiece, best quality, futuristic city at dusk, flying cars between glass skyscrapers, neon signs, light trails, wet streets reflecting the lights, wide shot, volumetric fog, highly detailed';

const OPTIONS = { sd_model_checkpoint: CHECKPOINTS[0].title, samples_format: 'png', jpeg_quality: 85, live_previews_enable: true };
const POSTS = {
    '/sdapi/v1/txt2img': p => generate(p, false),
    '/sdapi/v1/img2img': p => generate(p, true),
    // Settings the app sets (the checkpoint to load...) are kept, as Forge does.
    '/sdapi/v1/options': p => { Object.assign(OPTIONS, p); return {}; },
    '/sdapi/v1/interrupt': () => ({}),
    '/sdapi/v1/skip': () => ({}),
    '/sdapi/v1/unload-checkpoint': () => ({}),
    '/v1/chat/completions': () => ({ choices: [{ message: { role: 'assistant', content: IDEA_REPLY } }] }),
};

const ROUTES = {
    '/v1/models': () => ({ data: [{ id: 'qwen2.5-vl-7b-instruct', object: 'model' }, { id: 'gemma-3-4b-it', object: 'model' }] }),
    '/sdapi/v1/sd-models': () => CHECKPOINTS,
    '/sdapi/v1/loras': () => LORAS,
    '/sdapi/v1/samplers': () => ['Euler a', 'Euler', 'DPM++ 2M', 'DPM++ 2M SDE', 'DPM++ SDE', 'DPM++ 3M SDE', 'UniPC', 'LCM', 'DDIM', 'Heun', 'Restart'].map(name => ({ name, aliases: [], options: {} })),
    '/sdapi/v1/schedulers': () => ['Automatic', 'Uniform', 'Karras', 'Exponential', 'Polyexponential', 'SGM Uniform', 'KL Optimal', 'Align Your Steps', 'Simple', 'Normal', 'DDIM', 'Beta'].map(label => ({ name: label.toLowerCase().replace(/ /g, '_'), label })),
    '/sdapi/v1/upscalers': () => ['None', 'Latent', 'Latent (nearest-exact)', 'R-ESRGAN 4x+', 'R-ESRGAN 4x+ Anime6B', '4x-UltraSharp', '4x_NMKD-Siax_200k', 'SwinIR_4x'].map(name => ({ name })),
    '/sdapi/v1/sd-modules': () => ['sdxl_vae.safetensors', 'ae.safetensors', 'clip_l.safetensors', 't5xxl_fp8_e4m3fn.safetensors', 'qwen_3_4b.safetensors', 'qwen_image_vae.safetensors'].map(f => ({ model_name: f, filename: `C:\\forge\\models\\VAE\\${f}` })),
    '/sdapi/v1/options': () => OPTIONS,
    '/sdapi/v1/memory': () => ({ cuda: { system: { free: 9.1e9, used: 14.9e9, total: 24e9 } }, ram: { free: 2.1e10, used: 1.1e10, total: 3.2e10 } }),
    '/sdapi/v1/embeddings': () => ({ loaded: { 'easynegative': {}, 'badhandv4': {} }, skipped: {} }),
    '/sdapi/v1/prompt-styles': () => STYLES,
    '/sdapi/v1/progress': () => ({ progress: 0, eta_relative: 0, state: { job_count: 0, sampling_step: 0, sampling_steps: 0 }, current_image: null }),
    '/internal/progress': () => ({ active: false, queued: false, completed: false, progress: 0 }),
    '/controlnet/model_list': () => ({ model_list: ['diffusers_xl_canny_full', 'diffusers_xl_depth_full', 'xinsir_openpose_sdxl', 'ip-adapter_xl'] }),
    '/controlnet/module_list': () => ({ module_list: ['none', 'canny', 'depth_midas', 'openpose_full', 'lineart_realistic', 'softedge_pidinet', 'ip-adapter_clip_h'] }),
    '/controlnet/control_types': () => ({ control_types: { All: { module_list: [], model_list: [], default_option: 'none', default_model: 'None' }, Canny: { module_list: ['none', 'canny'], model_list: ['diffusers_xl_canny_full'], default_option: 'canny', default_model: 'diffusers_xl_canny_full' }, Depth: { module_list: ['depth_midas'], model_list: ['diffusers_xl_depth_full'], default_option: 'depth_midas', default_model: 'diffusers_xl_depth_full' }, OpenPose: { module_list: ['openpose_full'], model_list: ['xinsir_openpose_sdxl'], default_option: 'openpose_full', default_model: 'xinsir_openpose_sdxl' } } }),
    '/config': () => ({ components: [] }),
};

export function startMockForge() {
    const server = http.createServer((req, res) => {
        const cors = {
            'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
            'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Expose-Headers': 'Last-Modified, Content-Length, Content-Disposition',
        };
        if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
        const url = new URL(req.url, 'http://x');
        const path = decodeURIComponent(url.pathname);
        // LoRA / checkpoint thumbnails: /file=<path>.png (and .jpg, .preview.png...).
        if (path.startsWith('/file=')) {
            if (/\.(png|jpe?g|webp)$/i.test(path) && !/\.preview\.png$/i.test(path)) {
                const name = path.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
                const body = art(name);
                res.writeHead(200, { ...cors, 'Content-Type': 'image/svg+xml', 'Last-Modified': 'Tue, 01 Jul 2025 10:00:00 GMT', 'Content-Length': Buffer.byteLength(body) });
                res.end(req.method === 'HEAD' ? undefined : body);
            } else { res.writeHead(404, cors); res.end(); }
            return;
        }
        const key = path.replace(/\/$/, '');
        if (req.method === 'POST' && POSTS[key]) {
            let body = '';
            req.on('data', d => body += d);
            req.on('end', () => {
                let p = {}; try { p = JSON.parse(body || '{}'); } catch (e) { }
                // A short wait, as a real generation takes a moment.
                setTimeout(() => { const out = JSON.stringify(POSTS[key](p)); res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(out); }, /2img/.test(key) ? 900 : 60);
            });
            return;
        }
        const route = ROUTES[key];
        if (!route) { res.writeHead(404, { ...cors, 'Content-Type': 'application/json' }); res.end('{"detail":"Not Found"}'); return; }
        const body = JSON.stringify(route());
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        res.end(req.method === 'HEAD' ? undefined : body);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() })));
}
