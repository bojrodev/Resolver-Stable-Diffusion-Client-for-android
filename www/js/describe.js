// Magic Prompt's DESCRIBE tab: an image described as tags or sentences by a vision model (its own model setting),
// with the last few kept under Recent.
(function() {
    const RECENT_MAX = 8;
    const PROMPTS = {
        tags: 'Describe the image as Danbooru-style tags for Stable Diffusion. Reply with only a comma-separated list of lowercase tags, most important first: subject count (1girl, 1boy, no humans), features, clothing, pose, expression, setting, lighting, composition. No sentences.',
        sentences: 'Describe the image as a prompt for an image generator, in one paragraph of plain English: subject, appearance, clothing, pose, setting, lighting, style and composition. Reply with only the description.'
    };
    let image = null;
    const $ = id => document.getElementById(id);
    const style = () => localStorage.getItem('bojroDescribeStyle') === 'sentences' ? 'sentences' : 'tags';
    const readRecent = () => { try { return JSON.parse(localStorage.getItem('bojroDescribeRecent')) || []; } catch (e) { return []; } };

    function setTab(tab) {
        const describe = tab === 'describe';
        localStorage.setItem('bojroMagicTab', describe ? 'describe' : 'prompt');
        document.querySelectorAll('#llmTabs .toggle-opt').forEach(b => b.classList.toggle('active', b.dataset.tab === (describe ? 'describe' : 'prompt')));
        ['llmPromptScroll', 'llmPromptFoot'].forEach(id => $(id).classList.toggle('hidden', describe));
        ['descScroll', 'descFoot'].forEach(id => $(id).classList.toggle('hidden', !describe));
        if (describe) { syncModels(); renderRecent(); }
    }

    function setStyle(s) {
        localStorage.setItem('bojroDescribeStyle', s);
        document.querySelectorAll('#descStyleSeg .toggle-opt').forEach(b => b.classList.toggle('active', b.dataset.style === s));
    }

    function showImage(src) {
        image = src;
        const box = $('descImageBox');
        box.style.backgroundImage = src ? `url("${src}")` : '';
        box.classList.toggle('has-image', !!src);
        warn(null);
        paintClear();
    }
    function paintClear() {
        $('descClearBtn').disabled = !image && !$('descOutput').value.trim();
    }
    function clear() {
        $('descOutput').value = '';
        showImage(null);
    }

    // A copy no larger than `edge` on its long side, as JPEG.
    function shrink(src, edge, quality) {
        return new Promise(resolve => {
            const im = new Image();
            im.onload = () => {
                const k = Math.min(1, edge / Math.max(im.naturalWidth, im.naturalHeight));
                const c = document.createElement('canvas');
                c.width = Math.max(1, Math.round(im.naturalWidth * k));
                c.height = Math.max(1, Math.round(im.naturalHeight * k));
                const g = c.getContext('2d');
                g.fillStyle = '#fff';
                g.fillRect(0, 0, c.width, c.height);
                g.drawImage(im, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/jpeg', quality));
            };
            im.onerror = () => resolve(null);
            im.src = src;
        });
    }

    function pick() { $('descFileInput').click(); }
    function picked(input) {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        const r = new FileReader();
        r.onload = () => showImage(r.result);
        r.readAsDataURL(file);
    }

    // The newest image in History.
    function useLast() {
        if (typeof db === 'undefined' || !db) return;
        try {
            db.transaction(['images'], 'readonly').objectStore('images').openCursor(null, 'prev').onsuccess = e => {
                const c = e.target.result;
                if (c && c.value && c.value.data) showImage(c.value.data);
                else if (typeof Toast !== 'undefined' && Toast) Toast.show({ text: 'No images in History', duration: 'short' });
            };
        } catch (e) {}
    }

    function warn(model) {
        const box = $('descWarn');
        box.classList.toggle('hidden', !model);
        if (model) box.querySelector('.desc-warn-model').textContent = `${model} answered without seeing the picture. Pick a vision model.`;
    }

    // Describe's own model list follows Magic Prompt's (filled on LINK).
    function syncModels() {
        const src = $('llmModelSelect'), sel = $('descModelSelect');
        if (!src || !sel) return;
        const saved = localStorage.getItem('bojroDescribeModel') || sel.value || src.value;
        sel.innerHTML = '';
        Array.from(src.options).forEach(o => { if (o.value) sel.appendChild(new Option(o.value, o.value)); });
        if (saved && !Array.from(sel.options).some(o => o.value === saved)) sel.appendChild(new Option(saved, saved));
        if (!sel.options.length) sel.appendChild(new Option('Connect first...', ''));
        sel.value = saved || sel.options[0].value;
        if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText('descModelSelect');
    }
    function saveModel() {
        const v = $('descModelSelect').value;
        if (v) localStorage.setItem('bojroDescribeModel', v);
        warn(null);
    }

    // true / false when the server says whether the model takes images (LM Studio, Ollama), null when it can't.
    async function canSee(baseUrl, model, headers) {
        const get = async (url, opts) => {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 4000);
            try {
                const r = await fetch(url, { ...opts, signal: ctl.signal });
                return r.ok ? await r.json() : null;
            } catch (e) { return null; } finally { clearTimeout(t); }
        };
        const lms = await get(`${baseUrl}/api/v0/models/${encodeURIComponent(model)}`, { headers });
        if (lms && lms.type) return lms.type === 'vlm';
        const lms1 = await get(`${baseUrl}/api/v1/models`, { headers });
        const entry = lms1 && (lms1.models || lms1.data || []).find(m => m.key === model || m.id === model);
        if (entry && entry.capabilities) {
            const cap = entry.capabilities;
            return Array.isArray(cap) ? cap.includes('vision') : !!cap.vision;
        }
        const ollama = await get(`${baseUrl}/api/show`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) });
        if (ollama && Array.isArray(ollama.capabilities)) return ollama.capabilities.includes('vision');
        return null;
    }

    async function describe() {
        if (!image) { pick(); return; }
        let { baseUrl, key } = getLlmConfig();
        let model = $('descModelSelect').value;
        if (!model) {
            if (typeof connectToLlmService === 'function') await connectToLlmService();
            syncModels();
            ({ baseUrl, key } = getLlmConfig());
            model = $('descModelSelect').value;
            if (!model) return;
        }
        const btn = $('descGenerateBtn');
        btn.disabled = true;
        btn.textContent = 'DESCRIBING...';
        warn(null);
        const headers = {};
        if (key) headers['Authorization'] = `Bearer ${key}`;
        try {
            if (await canSee(baseUrl, model, headers) === false) { warn(model); return; }
            const pic = await shrink(image, 1024, 0.9);
            const s = style();
            const res = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: [{ type: 'text', text: PROMPTS[s] }, { type: 'image_url', image_url: { url: pic } }] }],
                    temperature: 0.3,
                    max_tokens: 400,
                    stream: false
                })
            });
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                if (/image|vision|multimodal|modalit/i.test(body)) { warn(model); return; }
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            let text = data.choices?.[0]?.message?.content ?? data.response ?? '';
            text = String(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            if (s === 'tags') text = text.split(/[,\n]+/).map(t => t.trim().replace(/\.$/, '')).filter(Boolean).join(', ');
            $('descOutput').value = text;
            paintClear();
            if (text) await addRecent(text, s);
        } catch (e) {
            await window.appAlert('Describe failed: ' + (e.message || e), { title: 'Describe Failed', danger: true });
        } finally {
            btn.disabled = false;
            btn.textContent = 'DESCRIBE IMAGE';
        }
    }

    async function addRecent(text, s) {
        const img = await shrink(image, 384, 0.8);
        if (!img) return;
        const list = readRecent().filter(e => e.img !== img);
        list.unshift({ img, text, style: s, at: Date.now() });
        for (let n = Math.min(list.length, RECENT_MAX); n > 0; n--) {
            try { localStorage.setItem('bojroDescribeRecent', JSON.stringify(list.slice(0, n))); break; } catch (e) {}
        }
        renderRecent();
    }

    function renderRecent() {
        const list = readRecent(), row = $('descRecent');
        $('descRecentWrap').classList.toggle('hidden', !list.length);
        row.innerHTML = '';
        list.forEach(e => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'desc-recent-thumb';
            b.style.backgroundImage = `url("${e.img}")`;
            b.onclick = () => { showImage(e.img); $('descOutput').value = e.text; setStyle(e.style || 'tags'); paintClear(); };
            row.appendChild(b);
        });
    }

    async function clearRecent() {
        if (!await window.appConfirm('', { title: 'Clear recent descriptions?', okText: 'CLEAR', danger: true })) return;
        localStorage.removeItem('bojroDescribeRecent');
        renderRecent();
    }

    async function use() {
        const text = $('descOutput').value.trim();
        if (!text) { await window.appAlert('Describe an image first!'); return; }
        const el = $(`${activeLlmMode}_prompt`);
        if (!el) return;
        el.value = text;
        if (typeof savePrompt === 'function') savePrompt(activeLlmMode);
        closeLlmModal();
        if (typeof Toast !== 'undefined' && Toast) Toast.show({ text: 'Applied to main prompt!', duration: 'short' });
    }

    function start() {
        setStyle(style());
        $('descOutput').addEventListener('input', paintClear);
        setTab(localStorage.getItem('bojroMagicTab') === 'describe' ? 'describe' : 'prompt');
        const src = $('llmModelSelect');
        if (src) new MutationObserver(syncModels).observe(src, { childList: true });
    }

    window.Describe = { setTab, setStyle, pick, picked, useLast, describe, use, clear, clearRecent, saveModel, toggleSettings: () => $('descSettingsBox').classList.toggle('hidden') };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
