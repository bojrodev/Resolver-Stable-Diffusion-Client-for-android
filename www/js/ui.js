// -----------------------------------------------------------
// UI INTERACTION & SETTINGS
// -----------------------------------------------------------

// Default Prompts Configuration
const DEFAULT_PROMPTS = {
    'xl': "1girl, hand fan, solo, black hair, long hair, jewelry, earrings, holding, chinese clothes, hair ornament, holding fan, red nails, looking at viewer, upper body, long sleeves, red lips, folding fan, smoke, hanfu, nail polish, masterpiece, best quality",
    'flux': "textured chalk pastel for subtle highlights, delicate charcoal shading for depth and contrast, warm, earthy color palette with ambient lighting casting soft shadows, A young woman with expressive, natural eyes and a gentle smile, soft oil brushwork adding warmth and depth to her skin, her small cat sitting calmly beside her, cozy and slightly messy living room in the background with books scattered, a warm throw blanket casually draped over the couch, city lights visible through a large window showing the urban landscape at night,",
    'qwen': "a man wearing sun glasses as captain of the guards stands in full regalia, exuding authority and experience. His striking eyes command attention, contrasting with his chestnut curly hair. The bear crest on his armor symbolizes his strength and loyalty. This vivid portrayal, whether a painting or photograph, captures the essence of a formidable and respected knight in exquisite detail and quality",
    'anima': "a man wearing sun glasses as captain of the guards stands in full regalia, exuding authority and experience. His striking eyes command attention, contrasting with his chestnut curly hair. The bear crest on his armor symbolizes his strength and loyalty. This vivid portrayal, whether a painting or photograph, captures the essence of a formidable and respected knight in exquisite detail and quality",
    'krea': "a man wearing sun glasses as captain of the guards stands in full regalia, exuding authority and experience. His striking eyes command attention, contrasting with his chestnut curly hair. The bear crest on his armor symbolizes his strength and loyalty. This vivid portrayal, whether a painting or photograph, captures the essence of a formidable and respected knight in exquisite detail and quality",
    'inp': "original"
};

// Negative-prompt equivalent of DEFAULT_PROMPTS, populated at boot by loadSavedPrompts() from each textarea's own value.
let DEFAULT_NEGATIVE_PROMPTS = {};

// Called on blur for batch size/count: an empty or zero value counts as 1, so show it.
window.normalizeBatchField = function(el) {
    el.value = parseInt(el.value) || 1;
    // Setting .value fires no 'input' event, so save the corrected value explicitly.
    if (typeof saveCurrentInpaintModeStateLive === 'function') saveCurrentInpaintModeStateLive();
    // Derives the main tab from the field id ({mode}_{fieldname}) instead of a separate onblur per mode; no-op for an unknown mode.
    if (typeof saveLiveGenParams === 'function') {
        const mode = el.id.split('_')[0];
        saveLiveGenParams(mode);
    }
}

// Tapping into a seed box showing -1 (random) empties it, so a seed can be pasted straight in; left empty it goes back
// to -1 (normalizeSeedField()).
document.addEventListener('focusin', e => {
    const el = e.target;
    if (el && el.matches && el.matches('input[onblur*="normalizeSeedField"]') && el.value.trim() === '-1') el.value = '';
}, true);
// As normalizeBatchField, for seed fields: an empty value means -1 (random). Uses parseSeedValue since 0 is a valid seed.
window.normalizeSeedField = function(el) {
    if (typeof parseSeedValue === 'function') el.value = parseSeedValue(el.value);
}

// The 5 modes with both a CFG field and a negative prompt (Flux has no negative). Inpaint and img2img share the 'inp' fields.
const NEG_PROMPT_CFG_MODES = ['xl', 'anima', 'qwen', 'krea', 'inp'];

// At CFG 1 the negative prompt has no effect: dimmed and not editable until the CFG changes.
window.updateNegPromptDimming = function(mode) {
    const cfgEl = document.getElementById(`${mode}_cfg`);
    const negEl = document.getElementById(`${mode}_neg`);
    if (!cfgEl || !negEl) return;
    const isInert = parseFloat(cfgEl.value) === 1;
    negEl.classList.toggle('neg-prompt-inert', isInert);
    if (isInert) {
        negEl.setAttribute('tabindex', '-1');
        if (document.activeElement === negEl) negEl.blur();
    } else {
        negEl.removeAttribute('tabindex');
    }
}

window.toggleTheme = function() {
    const root = document.documentElement;
    const switchEl = document.getElementById('cfgThemeSwitch');
    
    if (switchEl && switchEl.checked) {
        root.setAttribute('data-theme', 'light');
        localStorage.setItem('bojroTheme', 'light');
    } else {
        root.removeAttribute('data-theme');
        localStorage.setItem('bojroTheme', 'dark');
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.loadSavedTheme = function() {
    const saved = localStorage.getItem('bojroTheme');
    const switchEl = document.getElementById('cfgThemeSwitch');
    const root = document.documentElement;

    if (saved === 'light') {
        root.setAttribute('data-theme', 'light');
        if (switchEl) switchEl.checked = true;
    } else {
        root.removeAttribute('data-theme');
        if (switchEl) switchEl.checked = false;
    }
}

// switchTab() is defined only in boot.js (it replaces window.switchTab).
window.setMode = function(mode) {
    currentMode = mode;
    // The Low Bits row under the checkpoint box shows the value of the tab now in front.
    if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();

    const root = document.documentElement;
    const btnXL = document.getElementById('btn-xl');
    const btnFlux = document.getElementById('btn-flux');
    const btnQwen = document.getElementById('btn-qwen');
    const btnAnima = document.getElementById('btn-anima');
    const btnKrea = document.getElementById('btn-krea');

    const xlRow = document.getElementById('row-xl-model');
    const fluxRow = document.getElementById('row-flux-model');
    const qwenRow = document.getElementById('row-qwen-model');
    const animaRow = document.getElementById('row-anima-model');
    const kreaRow = document.getElementById('row-krea-model');

    const xlCont = document.getElementById('mode-xl-container');
    const fluxCont = document.getElementById('mode-flux-container');
    const qwenCont = document.getElementById('mode-qwen-container');
    const animaCont = document.getElementById('mode-anima-container');
    const kreaCont = document.getElementById('mode-krea-container');

    const titleEl = document.getElementById('appTitle');

    // Reset all states
    btnXL.classList.remove('active');
    btnFlux.classList.remove('active');
    if (btnQwen) btnQwen.classList.remove('active');
    if (btnAnima) btnAnima.classList.remove('active');
    if (btnKrea) btnKrea.classList.remove('active');

    xlRow.classList.add('hidden');
    fluxRow.classList.add('hidden');
    if (qwenRow) qwenRow.classList.add('hidden');
    if (animaRow) animaRow.classList.add('hidden');
    if (kreaRow) kreaRow.classList.add('hidden');

    xlCont.classList.add('hidden');
    fluxCont.classList.add('hidden');
    if (qwenCont) qwenCont.classList.add('hidden');
    if (animaCont) animaCont.classList.add('hidden');
    if (kreaCont) kreaCont.classList.add('hidden');

    // The idle label for this tab; a running or busy button keeps its step count or BUSY.
    const setGenIdleLabel = t => { const b = document.getElementById('genBtn'); if (b && !b.disabled && !b.classList.contains('gen-busy')) b.innerText = t; };
    // --- MODE SWITCHING LOGIC ---
    if (mode === 'flux') {
        root.setAttribute('data-mode', 'flux');
        btnFlux.classList.add('active');
        fluxRow.classList.remove('hidden');
        fluxCont.classList.remove('hidden');
        setGenIdleLabel(getGenerateButtonLabel('flux'));
    } else if (mode === 'qwen') {
        root.setAttribute('data-mode', 'qwen');
        if (btnQwen) btnQwen.classList.add('active');
        if (qwenRow) qwenRow.classList.remove('hidden');
        if (qwenCont) qwenCont.classList.remove('hidden');
        setGenIdleLabel(getGenerateButtonLabel('qwen'));
    } else if (mode === 'anima') {
        root.setAttribute('data-mode', 'anima');
        if (btnAnima) btnAnima.classList.add('active');
        if (animaRow) animaRow.classList.remove('hidden');
        if (animaCont) animaCont.classList.remove('hidden');
        setGenIdleLabel("GENERATE");
    } else if (mode === 'krea') {
        root.setAttribute('data-mode', 'krea');
        if (btnKrea) btnKrea.classList.add('active');
        if (kreaRow) kreaRow.classList.remove('hidden');
        if (kreaCont) kreaCont.classList.remove('hidden');
        setGenIdleLabel("GENERATE");
    } else {
        root.removeAttribute('data-mode');
        btnXL.classList.add('active');
        xlRow.classList.remove('hidden');
        xlCont.classList.remove('hidden');
        setGenIdleLabel("GENERATE");
    }

    const unifiedTitle = "RESOLVER";
    if (titleEl) {
        titleEl.innerText = unifiedTitle;
        titleEl.setAttribute('data-text', unifiedTitle);
    }

    // Re-validates negative prompt dimming against the current CFG, since only the CFG field's oninput triggered it.
    if (typeof NEG_PROMPT_CFG_MODES !== 'undefined' && NEG_PROMPT_CFG_MODES.includes(mode) && typeof updateNegPromptDimming === 'function') {
        updateNegPromptDimming(mode);
    }

    // Same for the res-switch highlight: width/height can change while a mode is hidden.
    if (typeof updateResSwitchHighlight === 'function') updateResSwitchHighlight(mode);
}

// --- FORM HELPERS ---

// Flux checkpoints don't use a negative prompt (see updateNegPromptDimming() for CFG=1). Hides the whole Negative group for whichever of Inpaint/img2img is active, based on its selected checkpoint; re-checked on checkpoint change and mode switch.
function updateInpaintNegativePromptVisibility() {
    if (typeof currentInpaintTopMode === 'undefined') return;
    // currentInpaintTopMode uses 'inpaint'/'img2img' but the select id uses 'inp' for Inpaint, so only 'inpaint' is remapped.
    const modelPrefix = currentInpaintTopMode === 'inpaint' ? 'inp' : currentInpaintTopMode;
    const modelSelect = document.getElementById(`${modelPrefix}_modelSelect`);
    const negGroup = document.getElementById('inpNegativeGroup');
    if (!modelSelect || !negGroup || !window.LoraManager) return;
    const arch = window.LoraManager.detectCheckpointArchitecture(modelSelect.value);
    negGroup.classList.toggle('hidden', arch === 'flux');
}

// CLIP/T5 override row for a Flux checkpoint on Inpaint/img2img, alongside the Text Encoder field for single-encoder architectures like Qwen. Per sub-mode with independent checkpoints, so it takes an explicit mode.
function updateInpFluxModuleVisibility(mode) {
    const modelSelect = document.getElementById(`${mode}_modelSelect`);
    const fluxRow = document.getElementById(`${mode}_flux_modules_row`);
    const teCol = document.getElementById(`${mode}_te_col`);
    if (!modelSelect || !fluxRow || !teCol || !window.LoraManager) return;
    const isFlux = window.LoraManager.detectCheckpointArchitecture(modelSelect.value) === 'flux';
    fluxRow.classList.toggle('hidden', !isFlux);
    teCol.classList.toggle('hidden', isFlux);

    // Inpaint/img2img can have any checkpoint, so re-classify their ControlNet/ADetailer sections and re-apply the CFG toggle's feature-hidden state on every change.
    const isSdxlAnima = ['xl', 'anima'].includes(window.LoraManager.detectCheckpointArchitecture(modelSelect.value));
    const cnGroup = document.getElementById(`${mode}ControlnetGroup`);
    if (cnGroup) {
        cnGroup.classList.toggle('controlnet-section-sdxl-anima', isSdxlAnima);
        cnGroup.classList.toggle('controlnet-section-other', !isSdxlAnima);
        const cnKey = isSdxlAnima ? 'bojroShowControlnetSdxlAnima' : 'bojroShowControlnetOther';
        cnGroup.classList.toggle('feature-hidden', localStorage.getItem(cnKey) !== 'true');
    }
    const adetailerWrapper = document.getElementById(`${mode}AdetailerGroup`);
    const adetailerSection = adetailerWrapper ? adetailerWrapper.querySelector('.adetailer-section') : null;
    if (adetailerSection) {
        adetailerSection.classList.toggle('adetailer-section-sdxl-anima', isSdxlAnima);
        adetailerSection.classList.toggle('adetailer-section-other', !isSdxlAnima);
        const adKey = isSdxlAnima ? 'bojroShowAdetailerSdxlAnima' : 'bojroShowAdetailerOther';
        adetailerSection.classList.toggle('feature-hidden', localStorage.getItem(adKey) !== 'true');
    }
}

window.saveSelection = function(key) {
    if (key === 'xl') {
        localStorage.setItem('bojroModel_xl', document.getElementById('xl_modelSelect').value);
        if (typeof applyCheckpointSelection === 'function') applyCheckpointSelection('xl', document.getElementById('xl_modelSelect').value);
        if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();
    }
    else if (key === 'flux') {
        localStorage.setItem('bojroModel_flux', document.getElementById('flux_modelSelect').value);
        if (typeof applyCheckpointSelection === 'function') applyCheckpointSelection('flux', document.getElementById('flux_modelSelect').value);
        if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();
    }
    else if (key === 'inp') {
        localStorage.setItem('bojroModel_inp', document.getElementById('inp_modelSelect').value);
        if (typeof updateInpaintNegativePromptVisibility === 'function') updateInpaintNegativePromptVisibility();
        if (typeof updateInpFluxModuleVisibility === 'function') updateInpFluxModuleVisibility('inp');
        if (typeof applyCheckpointSelection === 'function') applyCheckpointSelection('inp', document.getElementById('inp_modelSelect').value);
        if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();
    }
    else if (key === 'img2img') {
        localStorage.setItem('bojroModel_img2img', document.getElementById('img2img_modelSelect').value);
        if (typeof updateInpaintNegativePromptVisibility === 'function') updateInpaintNegativePromptVisibility();
        if (typeof updateInpFluxModuleVisibility === 'function') updateInpFluxModuleVisibility('img2img');
        if (typeof applyCheckpointSelection === 'function') applyCheckpointSelection('img2img', document.getElementById('img2img_modelSelect').value);
        if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();
    }
    else if (key === 'img2img_vae') localStorage.setItem('bojro_img2img_vae', document.getElementById('img2img_vae').value);
    else if (key === 'img2img_te') localStorage.setItem('bojro_img2img_te', document.getElementById('img2img_te').value);
    else if (key === 'inp_vae') localStorage.setItem('bojro_inp_vae', document.getElementById('inp_vae').value);
    else if (key === 'inp_te') localStorage.setItem('bojro_inp_te', document.getElementById('inp_te').value);
    // CLIP/T5 fields follow the same save pattern as inp_vae/inp_te (read back by fetchVaes()).
    else if (key === 'inp_clip') localStorage.setItem('bojro_inp_clip', document.getElementById('inp_clip').value);
    else if (key === 'inp_t5') localStorage.setItem('bojro_inp_t5', document.getElementById('inp_t5').value);
    else if (key === 'img2img_clip') localStorage.setItem('bojro_img2img_clip', document.getElementById('img2img_clip').value);
    else if (key === 'img2img_t5') localStorage.setItem('bojro_img2img_t5', document.getElementById('img2img_t5').value);
    else if (key === 'inp_content') localStorage.setItem('bojro_inp_content', document.getElementById('inp_content').value);
    else if (key === 'inp_padding') localStorage.setItem('bojro_inp_padding', document.getElementById('inp_padding').value);
    // Save the mask blur value (restored by the <script> beside inp_mask_blur in index.html).
    else if (key === 'inp_mask_blur') localStorage.setItem('bojro_inp_mask_blur', document.getElementById('inp_mask_blur').value);
    else if (key === 'inp_sampler') localStorage.setItem('bojro_inp_sampler', document.getElementById('inp_sampler').value);
    else if (key === 'qwen') {
        localStorage.setItem('bojroModel_qwen', document.getElementById('qwen_modelSelect').value);
        if (typeof applyCheckpointSelection === 'function') applyCheckpointSelection('qwen', document.getElementById('qwen_modelSelect').value);
        if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();
    }
    else if (key === 'anima') {
        localStorage.setItem('bojroModel_anima', document.getElementById('anima_modelSelect').value);
        if (typeof applyCheckpointSelection === 'function') applyCheckpointSelection('anima', document.getElementById('anima_modelSelect').value);
        if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();
    }
    else if (key === 'anima_vae') localStorage.setItem('bojro_anima_vae', document.getElementById('anima_vae').value);
    else if (key === 'anima_te') localStorage.setItem('bojro_anima_te', document.getElementById('anima_te').value);
    else if (key === 'krea') {
        localStorage.setItem('bojroModel_krea', document.getElementById('krea_modelSelect').value);
        if (typeof applyCheckpointSelection === 'function') applyCheckpointSelection('krea', document.getElementById('krea_modelSelect').value);
        if (typeof refreshLowBitsControls === 'function') refreshLowBitsControls();
    }
    else if (key === 'krea_vae') localStorage.setItem('bojro_krea_vae', document.getElementById('krea_vae').value);
    else if (key === 'krea_te') localStorage.setItem('bojro_krea_te', document.getElementById('krea_te').value);
    else if (/^(inp|img2img|xl|flux|qwen|anima|krea)_cn_\d_(module|model)$/.test(key)) localStorage.setItem(`bojro_${key}`, document.getElementById(key).value);
}

// --- PROMPT SAVING SYSTEM ---

// The set of active LoRA names in a prompt, case-insensitive; the same LoRAs in any order or weight count as unchanged.
function extractLoraTags(text) {
    if (!text) return new Set();
    const matches = text.matchAll(/<lora:([^:>]+):[^>]*>/g);
    return new Set(Array.from(matches, m => m[1].toLowerCase()));
}

// Removes duplicate tags, matched loosely (normaliseTag(), so "smile" and "(smile:1.2)" are one tag). The first is kept, in its
// place, but takes a later copy's weight if it has none. Commas and line breaks both separate tags; a removed tag's
// separator merges into the one before it, so line breaks are kept. Prompt keywords (BREAK, AND...), numbers, wildcards
// and bracket groups spanning commas ("(smile, happy:1.2)") are left alone. Returns the count.
const REPEATABLE_TAG = /^(AND|BREAK|ADDROW|ADDCOL|-?\d+(\.\d+)?)$/;
function mergeTagSeparators(a, b) {
    const lines = Math.max((a.match(/\n/g) || []).length, (b.match(/\n/g) || []).length);
    const comma = (a + b).includes(',');
    return lines ? (comma ? ',' : '') + '\n'.repeat(lines) : (comma ? ', ' : ' ');
}
function removeDuplicateTagsFrom(el) {
    if (!el || !el.value) return 0;
    const pieces = el.value.split(/(\s*[,\n][\s,]*)/);
    const seen = new Map(); // normalised tag -> its kept item
    const kept = [];
    let removedCount = 0;
    const weighted = t => /^[([]/.test(t) && /[)\]]$/.test(t);
    // Inside a {a|b} choice (wcengine.js) nothing is a duplicate.
    let inChoice = 0;
    for (let i = 0; i < pieces.length; i += 2) {
        const item = { tag: pieces[i], sep: pieces[i + 1] || '' };
        const tag = item.tag.trim();
        const was = inChoice;
        inChoice = Math.max(0, inChoice + (tag.match(/(^|[^\\])\{/g) || []).length - (tag.match(/(^|[^\\])\}/g) || []).length);
        const whole = tag && !was && !/[{}|]/.test(tag) && !REPEATABLE_TAG.test(tag) && !/__[A-Za-z0-9(-]/.test(tag) && !/^(random|order)::/i.test(tag) && repairTagBrackets(tag) === tag;
        const key = whole ? normaliseTag(tag) : null;
        const first = key && seen.get(key);
        if (first && kept.length) {
            if (weighted(tag) && !weighted(first.tag.trim())) first.tag = first.tag.replace(first.tag.trim(), tag);
            const prev = kept[kept.length - 1];
            prev.sep = mergeTagSeparators(prev.sep, item.sep);
            removedCount++;
            continue;
        }
        if (key) seen.set(key, item);
        kept.push(item);
    }
    // Trailing whitespace goes, as before; a closing comma stays as ", " (and isn't added by a removal).
    const closing = /,\s*$/.test(el.value);
    if (removedCount > 0) el.value = kept.map(t => t.tag + t.sep).join('').replace(/[\s,]+$/, '') + (closing ? ', ' : '');
    return removedCount;
}

const promptFormatOn = () => localStorage.getItem('bojroPromptFormat') === 'true';
const promptFormatOnBlur = () => promptFormatOn() && localStorage.getItem('bojroPromptFormatOnBlur') === 'true';

// Tags a LoRA or Character Select adds, formatted as the box would be (Prompt Auto-Formatting on). Only what goes into the
// box changes; the LoRA's config and the character list stay as they are.
window.formatInsertedTags = function(text, mode) {
    if (!text || !promptFormatOn()) return text;
    return formatPromptText(text, usesAutoComma(normalizeDedupeMode(mode)));
};

// Pony's own tags keep their underscores (score_9, source_anime, rating_safe), as do one-letter faces (o_o).
const KEEP_UNDERSCORE = /^(score|source|rating)_|^\p{L}_\p{L}$/iu;
// Embedding names, whose underscores stay too (saved by fetchEmbeddingNames(), network.js).
let promptEmbeddingNames = new Set();
try { promptEmbeddingNames = new Set(JSON.parse(localStorage.getItem('bojroEmbeddingNames') || '[]')); } catch (e) {}

// "(blue eyes : 1.2)" -> "(blue eyes:1.2)": spaces around ":" go only inside ( ) or [ ], so "Note: text" is left alone.
function tightenBracketColons(line) {
    let depth = 0, out = '';
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if ((c === '(' || c === '[') && line[i - 1] !== '\\') depth++;
        else if ((c === ')' || c === ']') && line[i - 1] !== '\\') depth = Math.max(0, depth - 1);
        if (c === ':' && depth > 0) {
            out = out.replace(/[ \t]+$/, '') + ':';
            while (line[i + 1] === ' ' || line[i + 1] === '\t') i++;
            continue;
        }
        out += c;
    }
    return out;
}

// Spacing fixes, line by line so line breaks stay; <...> (LoRAs), __...__ (wildcards), style:: and random:: / order::
// tokens are left alone. Spaces after commas, none before them,
// inside brackets or doubled; empty tags and empty brackets go, and a comma inside a bracket moves out of it.
// tagStyle (SDXL/Anima tags): a period beside a comma goes, one between letters is a missed space, underscores between
// letters become spaces, spaces around "|", and around ":" inside brackets (weights), go, and "name (series)" brackets
// are escaped so Forge reads them as text. Otherwise (natural language) a missing space after a full stop is added.
// An emoticon tag: eyes, maybe a nose, a mouth (:) ;-) :d :3 >:( or escaped :\) ), or a face round an underscore (>_< ^_^).
const EMOTICON_TAG = /(^|,)([ \t]*)(>?[:;=8][-'^o]?(?:\\[)(\]\[]|[)(\]\[DdPpOo3|\/<>*$@])|[^\s,_]_[^\s,_])(?=[ \t]*(?:,|\n|$))/gm;
// Its brackets escaped, so Forge reads them as text (not emphasis); ones already escaped left alone.
const escapeEmoticon = e => e.replace(/(^|[^\\])([()\[\]])/g, '$1\\$2');
function formatPromptText(text, tagStyle) {
    const loras = [];
    // Empty lines go first (collapseBlankLines(), utils.js, keeps a comma-only line's comma), and any a rule below empties after.
    // Choices missing a brace are completed first (tag-style prompts), so the whole choice is held aside below
    // (repairChoices(), utils.js).
    const s = collapseBlankLines(String(text == null ? '' : text)).split('\n').map(l => (tagStyle ? repairChoices(l) : l)).join('\n')
        // With AND: a weight ending a part (before AND, or at the end, commas after or not) is the part's: held aside.
        .replace(/\bAND\b/.test(String(text || '')) ? /[ \t]*:[ \t]*[-+]?(?:\d+\.?\d*|\.\d+)(?=[ \t]*(?:\bAND\b|[\s,]*$(?![\s\S])))/g : /$^/, m => `\u0000${loras.push(m) - 1}\u0000`)
        // Emoticon tags (;) :d >_< ^_^ ...) held aside first, as they are (tag-style prompts).
        .replace(EMOTICON_TAG, (m, pre, sp, emo) => (tagStyle ? `${pre}${sp}\u0000${loras.push(escapeEmoticon(emo)) - 1}\u0000` : m)).replace(/<[^<>\n]*>|__[A-Za-z0-9(-](?:(?!__)[A-Za-z0-9_ ()-])*?__|__[A-Za-z0-9(-](?:(?!__)[A-Za-z0-9_ ()-])*?(?:\([^()\n]*=[^()\n]*\))?\[[^\[\]\n]*\]__|__[A-Za-z0-9(-](?:(?!__)[A-Za-z0-9_ ()-])*?\([^()\n]*=[^()\n]*\)__|style::[^,\n<>]+|(?:random|order)::[^,\n<>]+|\$?\{(?:[^{}\n]|\{(?:[^{}\n]|\{[^{}\n]*\})*\})*\}/gi, m => `\u0000${loras.push(m) - 1}\u0000`);
    const lines = s.split('\n');
    const lastText = lines.map(l => /\S/.test(l)).lastIndexOf(true);
    const out = lines.map((line, i) => {
        // Tags: one ending a line has its comma before the break (not after BREAK, nor on the last line with text), added
        // first so the rules below tidy it.
        if (tagStyle && i < lastText && !/(,|\bBREAK)[ \t]*$/.test(line) && /\S/.test(line)) line = line.replace(/[ \t]*$/, ',');
        // A "..." tag is held aside so the full-stop rules leave it alone.
        if (tagStyle) line = repairTagBrackets(line).replace(ELLIPSIS_TAG, '$1$2\u0001').replace(STOP_RUN, '$1.');
        // Weights: "(a:1 5)", "(smile1.5)", "a:1.5" outside brackets, "((a:1.5))" (repairWeights(), utils.js).
        line = repairWeights(line, tagStyle);
        // Brackets first, so what an empty one leaves behind is tidied by the rules below.
        for (let prev = null; prev !== line;) {
            prev = line;
            line = line
                .replace(/([([])[ \t]+/g, '$1')
                .replace(/[ \t]+([)\]])/g, '$1')
                .replace(/,+[ \t]*([)\]])/g, '$1,')
                .replace(/(^|[^\\])([([])[ \t]*,+/g, '$1,$2')
                .replace(/(^|[^\\])(\([ \t]*\)|\[[ \t]*\])/g, '$1');
        }
        if (tagStyle) {
            // A stray full stop beside a comma or before a weight or closing bracket goes, and one followed by a space becomes
            // a comma; repeated until none is left (",. .tag"). Initials and titles keep theirs (strayFullStop(), utils.js).
            const stray = (m, pre, i, str) => strayFullStop(str.slice(0, i) + pre);
            for (let prev = null; prev !== line;) {
                prev = line;
                line = line
                    .replace(/([^\s,([])[ \t]+\.+[ \t]+(?=[^\s\d,.])/g, '$1, ')
                    .replace(LOOSE_STOPS, '$1')
                    .replace(STOP_RUN, '$1.')
                    .replace(/(^|[^.])\.(?=[ \t]*\\?[,:)\]])/g, (...a) => stray(...a) ? a[1] : a[0])
                    .replace(/,([ \t]*)\.(?![.\d])/g, ',$1')
                    .replace(/(^|[^.])\.[ \t]+(?=[^\s\d,.:)\]])/g, (...a) => stray(...a) ? `${a[1]}, ` : a[0])
                    .replace(/([([])[ \t]+/g, '$1')
                    .replace(/[ \t]+([)\]])/g, '$1');
            }
            line = line
                // Between words, not initials ("smile.blue eyes" but not "d.va").
                .replace(/(\p{L}{2})\.(?=\p{L}{2})/gu, '$1 ')
                .replace(/[ \t]*_[ \t]*/g, '_')
                .replace(/[\p{L}\p{N}_]*_[\p{L}\p{N}_]*/gu, w => KEEP_UNDERSCORE.test(w) || promptEmbeddingNames.has(w.toLowerCase()) ? w : w.replace(/(\p{L})_(?=\p{L})/gu, '$1 '))
                .replace(/[ \t]*\|[ \t]*/g, '|');
        } else {
            // ",." keeps the comma and ".," the full stop (not before a digit or another full stop, as in ",.5" or ",...").
            for (let prev = null; prev !== line;) {
                prev = line;
                line = line.replace(/,([ \t]*)\.(?![.\d])/g, ',$1').replace(/\.[ \t]*,/g, '.');
            }
            // No space before a full stop ("cat ." -> "cat."), and one after it (two letters before it, so "e.g." stays).
            line = line.replace(/(?<=\S)[ \t]+\.(?![.\d])/g, '.').replace(/(\p{L}{2})\.(?=\p{L})/gu, '$1. ');
        }
        // Again, now the full stop rules have run ("b:1.1...." is "b:1.1" only now), before the comma spacing.
        line = repairWeights(line, tagStyle);
        line = line
            .replace(/[ \t]+,/g, ',')
            .replace(/,(?:[ \t]*,)+/g, ',')
            .replace(/^[ \t]*,[ \t]*/, '')
            // Not between digits ("1,000").
            .replace(/,(?=[^\s,])/g, (m, i, str) => /\d/.test(str[i - 1] || '') && /\d/.test(str[i + 1]) ? m : ', ')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/[ \t]+$/, '');
        if (tagStyle) {
            // "2b (nier automata)" or "2b_(nier automata)" -> "2b \(nier automata\)"; a bracket with a weight ("(smile:1.2)") stays emphasis.
            // Repeated, so a second bracket after an escaped one is escaped too.
            for (let prev = null; prev !== line;) {
                prev = line;
                line = line.replace(/([\p{L}\p{N}.]|\\\))([ _]?)\(([^()\\\n]+)\)/gu, (m, a, sp, inner, i, str) =>
                    /:\s*-?\d*\.?\d+\s*$/.test(inner) || (a === '.' && strayFullStop(str.slice(0, i))) ? m : `${a}${sp && ' '}\\(${inner}\\)`);
            }
            line = tightenBracketColons(line).replace(/\u0001/g, '...');
        }
        return line;
    }).map(line => line.replace(/^[ \t]+|[ \t]+$/g, '')).filter(line => !/^[\s,]*$/.test(line)).join('\n');
    // Tags: a full stop at the very end would sit before the closing comma, so it goes as one beside a comma does.
    let end = out;
    for (let prev = null; tagStyle && prev !== end;) {
        prev = end;
        end = end.replace(/(^|[^.])\.(\s*)$/, (m, pre, sp, i, str) => strayFullStop(str.slice(0, i) + pre) ? pre + sp : m).replace(/[ \t]+$/, '');
    }
    // A full stop taken off the end can leave a bare weight ("b:1.1." -> "b:1.1").
    if (tagStyle) end = end.split('\n').map(l => repairWeights(l, true)).join('\n');
    // A choice held aside: no spaces around its "|" ("{pants | bare legs}" -> "{pants|bare legs}"); not ${...}.
    return end.replace(/\u0000(\d+)\u0000/g, (m, i) => (/^\{[\s\S]*\|[\s\S]*\}$/.test(loras[+i]) ? loras[+i].replace(/[ \t]*\|[ \t]*/g, '|') : loras[+i]));
}

// Tag-style prompt modes only (xl, anima, inp/img2img via 'inp'); flux/qwen/krea are natural-language. img2img shares inp_prompt/inp_neg.
const DEDUPE_TAG_MODES = ['xl', 'anima', 'inp', 'img2img'];
function normalizeDedupeMode(mode) {
    return mode === 'img2img' ? 'inp' : mode;
}

// Modes whose prompt boxes get a closing comma: SDXL and Anima, and Inpaint/img2img with an SDXL or Anima checkpoint.
const AUTO_COMMA_MODES = ['xl', 'anima'];
function usesAutoComma(realMode) {
    if (AUTO_COMMA_MODES.includes(realMode)) return true;
    if (realMode !== 'inp') return false;
    const checkpoint = currentInpModelTitle();
    return !!(checkpoint && window.LoraManager && AUTO_COMMA_MODES.includes(window.LoraManager.detectCheckpointArchitecture(checkpoint)));
}

// Adds ", " to a box with content that doesn't end in a comma (the ending LoRAs and styles leave, withTrailingComma(), utils.js). An empty box stays empty. Returns true if it changed anything.
function ensureTrailingCommaOn(el) {
    if (!el) return false;
    const trimmed = el.value.replace(/\s+$/, '');
    if (!trimmed || trimmed.endsWith(',')) return false;
    el.value = withTrailingComma(el.value);
    return true;
}

// Wildcards in a box: "__" alone goes, "__pose" is closed when that wildcard exists, and unknown ones go (with Wildcards
// on). Returns the text and how many went.
const WC_FULL = /__([A-Za-z0-9(-](?:(?!__)[A-Za-z0-9_ ()-])*?)(\([^()\n]*=[^()\n]*\))?(\[[^\[\]\n]*\])?__/g;
function tidyWildcards(text) {
    const W = window.Wildcards;
    if (!W || !W.enabled || !W.enabled() || !W._parts || !/__/.test(text)) return { text, removed: 0 };
    const key = W._parts.nameKey, have = new Set(W._parts.read().map(w => key(w.name)));
    let removed = 0;
    // Unfinished ones: a tag that starts with "__" and doesn't end with it.
    let out = text.replace(/(^|[,\n])([ \t]*)__((?:(?!__)[A-Za-z0-9 _()-])*?)[ \t]*(?=,|\n|$)/g, (m, pre, sp, name) => {
        if (/__$/.test(m.trim()) && name) return m;
        if (name && have.has(key(name))) return `${pre}${sp}__${name.trim()}__`;
        removed++;
        return pre;
    });
    out = out.replace(WC_FULL, (m, name) => (have.has(key(name)) ? m : (removed++, '')));
    return { text: out, removed };
}
// Tags in lower case (SDXL, Anima): not BREAK / AND / ADDROW..., <lora:...>, style::NAME or embedding names.
function lowerTags(text) {
    return text.replace(/(<[^<>\n]*>|\b(?:BREAK|AND|ADDROW|ADDCOL|ADDBASE|ADDCOMM)\b|style::[^,\n<>]+)|[^<]+?(?=<|\bBREAK\b|\bAND\b|\bADD(?:ROW|COL|BASE|COMM)\b|style::|$)/g, (m, keep) => keep ? m
        : m.replace(/[\p{L}\p{N}_.-]+/gu, w => (typeof promptEmbeddingNames !== 'undefined' && promptEmbeddingNames.has(w.toLowerCase()) ? w : w.toLowerCase())));
}

// One box: formatPromptText(), then in tag-style modes duplicate tags and the closing comma. Returns the duplicates removed and whether it changed.
function tidyPromptBox(el, realMode) {
    if (!el || !el.value) return { removed: 0, changed: false };
    const before = el.value;
    const tagStyle = usesAutoComma(realMode);
    const dedupe = DEDUPE_TAG_MODES.includes(realMode);
    const wc = tidyWildcards(el.value);
    if (wc.text !== el.value) el.value = wc.text;
    if (tagStyle) el.value = lowerTags(el.value);
    // Format, then remove duplicates; a removal can leave something new to tidy (or a new duplicate), so it repeats while it does.
    let removed = 0;
    for (let i = 0; i < 4; i++) {
        const formatted = formatPromptText(el.value, tagStyle);
        if (formatted !== el.value) el.value = formatted;
        const r = dedupe ? removeDuplicateTagsFrom(el) : 0;
        removed += r;
        if (!r) break;
    }
    if (tagStyle) {
        ensureTrailingCommaOn(el);
        // A closing comma left with no space after it ("smile.," tidied to "smile,") gets the usual ", ".
        if (el.value.endsWith(',')) el.value += ' ';
    }
    if (wc.removed && typeof Toast !== 'undefined') Toast.show({ text: `Removed ${wc.removed} unknown wildcard${wc.removed === 1 ? '' : 's'}`, duration: 'short' });
    return { removed, changed: el.value !== before };
}

// On leaving a prompt/negative box (inline onblur, or the listener below for Flux/Qwen/Krea), with Format On Leaving Text Box on.
// Generate without leaving the box is handled in generate() via dedupePromptTagsForMode().
window.dedupePromptTagsOnBlur = function(mode, field) {
    if (!promptFormatOnBlur()) return;
    const realMode = normalizeDedupeMode(mode);
    const { removed, changed } = tidyPromptBox(document.getElementById(`${realMode}_${field}`), realMode);
    if (changed) {
        if (field === 'prompt') { savePrompt(realMode); } else { saveNegativePrompt(realMode); }
        if (realMode === 'inp' && typeof saveCurrentInpaintModeStateLive === 'function') saveCurrentInpaintModeStateLive();
    }
    if (removed > 0 && Toast) Toast.show({ text: `Removed ${removed} duplicate prompt${removed === 1 ? '' : 's'}`, duration: 'short' });
}

// What a job sends, after its wildcards are picked: duplicate tags out (the box's own were taken out before).
window.dedupeJobPayload = function(job) {
    const pl = job && job.payload;
    if (!pl || !promptFormatOn()) return 0;
    if (Object.keys(pl.alwayson_scripts || {}).some(k => /couple/i.test(k))) return 0;
    // Formatted as the box is, now the wildcards have put their text in.
    const tagStyle = usesAutoComma(normalizeDedupeMode(job.mode));
    ['prompt', 'negative_prompt', 'hr_prompt', 'hr_negative_prompt'].forEach(k => {
        if (typeof pl[k] === 'string' && pl[k]) pl[k] = formatPromptText(pl[k], tagStyle);
    });
    if (!DEDUPE_TAG_MODES.includes(normalizeDedupeMode(job.mode))) return 0;
    let removed = 0;
    ['prompt', 'negative_prompt', 'hr_prompt', 'hr_negative_prompt'].forEach(k => {
        if (typeof pl[k] !== 'string' || !pl[k]) return;
        const box = { value: pl[k] };
        const r = removeDuplicateTagsFrom(box);
        if (r) { pl[k] = box.value; removed += r; }
    });
    if (removed && typeof dlog === 'function') dlog(`sent prompt: ${removed} duplicate tag(s) removed`);
    return removed;
};

// What a job sends: tags in the negative taken out of the prompt (Config > Prompts, on by default), and ~word (any
// prompt tag ending in that word, always) taken out of the prompt and then the negative. Line by line, so Forge
// Couple's regions keep their lines; <...> tags stay. The negative keeps its own tags. Returns how many went.
window.negBlocksOn = () => localStorage.getItem('bojroNegBlocks') !== 'false';
// A tag without its brackets and weight: ((smile)) and (smile:1.2) as smile (normaliseTag() keeps double brackets).
const bareTag = x => { const k = normaliseTag(x); return !k || k[0] === '<' ? k : normaliseTag(k.replace(/^[(\[]+/, '').replace(/(?::\s*-?[\d.]+)?[)\]]+$/, '')); };
function blockByNegative(pos, neg, on) {
    if (typeof neg !== 'string' || !neg.trim()) return { pos, neg, n: 0 };
    const tags = new Set(), ends = [], tilde = new Set();
    neg.split(/[,\n]/).forEach(x => {
        const k = bareTag(x);
        if (!k || k[0] === '<') return;
        if (k[0] === '~') { tilde.add(normaliseTag(x)); const w = k.slice(1).trim(); if (w) ends.push(w); } else if (on) tags.add(k);
    });
    if (tilde.size) neg = neg.split('\n').map(l => removeTagsFromText(l, tilde)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    let n = 0;
    if ((tags.size || ends.length) && typeof pos === 'string' && pos) {
        const hit = k => !!k && k[0] !== '<' && (tags.has(k) || ends.some(w => k === w || k.endsWith(' ' + w)));
        pos = pos.split('\n').map(line => {
            const out = new Set();
            // removeTagsFromText() compares the tag as normaliseTag() gives it.
            line.split(',').forEach(x => { const rest = textAfterLoraTags(x); if (hit(bareTag(x))) out.add(normaliseTag(x)); else if (rest && hit(bareTag(rest))) out.add(normaliseTag(rest)); });
            if (!out.size) return line;
            n += out.size;
            return removeTagsFromText(line, out);
        }).join('\n');
    }
    return { pos, neg, n };
}
window.negativeBlocksJob = function(job) {
    const pl = job && job.payload;
    if (!pl) return 0;
    const on = negBlocksOn();
    let n = 0;
    const pair = (o, a, b) => { const r = blockByNegative(o[a], o[b], on); if (typeof o[a] === 'string') o[a] = r.pos; if (typeof o[b] === 'string') o[b] = r.neg; n += r.n; };
    pair(pl, 'prompt', 'negative_prompt');
    if (typeof pl.hr_negative_prompt === 'string' && pl.hr_negative_prompt) pair(pl, 'hr_prompt', 'hr_negative_prompt');
    const ad = pl.alwayson_scripts?.ADetailer?.args;
    if (Array.isArray(ad)) ad.forEach(u => { if (u && typeof u === 'object') pair(u, 'ad_prompt', 'ad_negative_prompt'); });
    if (n && typeof dlog === 'function') dlog(`sent prompt: ${n} tag(s) in the negative taken out of the prompt`);
    return n;
};

// Same tidy-up for ADetailer prompt/negative boxes.
const AD_TAG_FIELD_RE = /^(xl|flux|qwen|anima|krea|inp|img2img)_adetailer_(\d+)_(prompt|neg)$/;
function tidyAdetailerBoxes(prefix, enabledOnly, onlyEl) {
    const realMode = normalizeDedupeMode(prefix);
    let removed = 0, changed = false;
    for (let n = 1; n <= 8; n++) {
        if (enabledOnly && !document.getElementById(`${prefix}_adetailer_${n}_enable`)?.checked) continue;
        ['prompt', 'neg'].forEach(field => {
            const el = document.getElementById(`${prefix}_adetailer_${n}_${field}`);
            if (!el || (onlyEl && el !== onlyEl)) return;
            const r = tidyPromptBox(el, realMode);
            removed += r.removed;
            if (r.changed) changed = true;
        });
    }
    if (changed && typeof saveAdetailer === 'function') saveAdetailer(prefix);
    return removed;
}

document.addEventListener('focusout', (e) => {
    if (!promptFormatOnBlur()) return;
    const main = e.target && e.target.id && /^(flux|qwen|krea)_(prompt|neg)$/.exec(e.target.id);
    if (main) { window.dedupePromptTagsOnBlur(main[1], main[2]); return; }
    const m = e.target && e.target.id && AD_TAG_FIELD_RE.exec(e.target.id);
    if (!m) return;
    const removed = tidyAdetailerBoxes(m[1], false, e.target);
    if (removed > 0 && Toast) Toast.show({ text: `Removed ${removed} duplicate prompt${removed === 1 ? '' : 's'}`, duration: 'short' });
});

// Run before building a job (with Prompt Auto-Formatting on): prompt, negative and enabled ADetailer passes, one toast.
window.dedupePromptTagsForMode = function(mode) {
    if (!promptFormatOn()) return;
    const realMode = normalizeDedupeMode(mode);
    const p = tidyPromptBox(document.getElementById(`${realMode}_prompt`), realMode);
    const n = tidyPromptBox(document.getElementById(`${realMode}_neg`), realMode);
    const adPrefix = realMode === 'inp' && (mode === 'img2img' || currentInpaintTopMode === 'img2img') ? 'img2img' : mode;
    const total = p.removed + n.removed + tidyAdetailerBoxes(adPrefix, true) + (window.ForgeCouple ? ForgeCouple.tidyAll(realMode) : 0);
    if (p.changed) savePrompt(realMode);
    if (n.changed) saveNegativePrompt(realMode);
    if ((total > 0 || p.changed || n.changed) && realMode === 'inp' && typeof saveCurrentInpaintModeStateLive === 'function') saveCurrentInpaintModeStateLive();
    if (total > 0 && Toast) Toast.show({ text: `Removed ${total} duplicate prompt${total === 1 ? '' : 's'}`, duration: 'short' });
}

window.savePrompt = function(mode) {
    const el = document.getElementById(`${mode}_prompt`);
    if (el) {
        localStorage.setItem(`bojro_prompt_${mode}`, el.value);
    }
    if (window.StyleManager && typeof window.StyleManager.checkAndClearFullyRemovedStyles === 'function') {
        window.StyleManager.checkAndClearFullyRemovedStyles(mode);
    }
}

window.saveNegativePrompt = function(mode) {
    const el = document.getElementById(`${mode}_neg`);
    if (el) {
        localStorage.setItem(`bojro_neg_session_${mode}`, el.value);
    }
    if (window.StyleManager && typeof window.StyleManager.checkAndClearFullyRemovedStyles === 'function') {
        window.StyleManager.checkAndClearFullyRemovedStyles(mode);
    }
}

// Allow the user to save their current text (even if empty) as the new default
window.saveAsNewDefault = function(mode) {
    const el = document.getElementById(`${mode}_prompt`);
    if (el) {
        localStorage.setItem(`bojro_custom_default_${defaultKeyMode(mode)}`, el.value);
        // Toast is always defined now (a plain in-app object).
        Toast.show({ text: 'Saved as new default prompt!', duration: 'short' });
    }
}

// Same idea as saveAsNewDefault, but for the negative prompt box
window.saveNegativeAsNewDefault = function(mode) {
    const el = document.getElementById(`${mode}_neg`);
    if (el) {
        localStorage.setItem(`bojro_custom_default_neg_${defaultKeyMode(mode)}`, el.value);
        Toast.show({ text: 'Saved as new default negative!', duration: 'short' });
    }
}

// Empties the prompt box
window.clearPrompt = function(mode) {
    // Reroll's kept picks and All combinations go with the prompt (wcreroll.js, moresettings.js).
    if (window.WcReroll && WcReroll.disarm) WcReroll.disarm(mode);
    if (window.MoreSettings && MoreSettings.combosOff) MoreSettings.combosOff(mode);
    const el = document.getElementById(`${mode}_prompt`);
    if (el) {
        el.value = "";
        savePrompt(mode); // Save the empty state
    }

    // The prompt text is gone, so clear stale selected-style state for this mode and re-render the Style Manager if open.
    if (window.StyleManager && typeof window.StyleManager.getSelectedStylesForMode === 'function') {
        window.StyleManager.getSelectedStylesForMode(mode).clear();
        if (typeof window.StyleManager.render === 'function') {
            window.StyleManager.render();
        }
    }
}

// Empties the negative prompt box
window.clearNegative = function(mode) {
    const el = document.getElementById(`${mode}_neg`);
    if (el) {
        el.value = "";
        saveNegativePrompt(mode); // Save the empty state
    }
}

// img2img's "import from image metadata" buttons (download icon between each box's reload and trash icons): replace the box's contents with the prompt/negative from the loaded image's PNG metadata (inpSourceMetadata, globals.js; captured when the image enters the editor). Says "No available metadata" per box when there is none (no image, no generation info, or only a prompt or only a negative).
function importFromImageMetadata(mode, field) {
    const meta = inpSourceMetadata;
    const value = meta ? (field === 'prompt' ? meta.pos : meta.neg) : '';
    if (!value) {
        if (typeof Toast !== 'undefined' && Toast) Toast.show({ text: 'No available metadata', duration: 'short' });
        return;
    }

    const el = document.getElementById(field === 'prompt' ? `${mode}_prompt` : `${mode}_neg`);
    if (!el) return;
    el.value = value;
    if (field === 'prompt') {
        savePrompt(mode);
        // As clearPrompt()/insertDefaultPrompt(): clear stale selected-style state (this mode only).
        if (window.StyleManager && typeof window.StyleManager.getSelectedStylesForMode === 'function') {
            window.StyleManager.getSelectedStylesForMode(mode).clear();
            if (typeof window.StyleManager.render === 'function') window.StyleManager.render();
        }
    } else {
        saveNegativePrompt(mode);
    }
    // Programmatic assignment fires no oninput, so update Inpaint/img2img's per-mode snapshot explicitly.
    if (mode === 'inp' && typeof saveCurrentInpaintModeStateLive === 'function') saveCurrentInpaintModeStateLive();
}
window.importPromptFromImageMetadata = function(mode) { importFromImageMetadata(mode, 'prompt'); };
window.importNegativeFromImageMetadata = function(mode) { importFromImageMetadata(mode, 'neg'); };

// Generic clear for a single field by id (ADetailer prompts: 4 passes, each with prompt and negative). Persists via saveAdetailer(mode).
window.clearAdetailerPromptField = function(fieldId, mode) {
    const el = document.getElementById(fieldId);
    if (el) {
        el.value = "";
        saveAdetailer(mode);
    }
}

// Save/Reload Default for a single ADetailer prompt/negative field, independent per field (7 modes x 8 passes x 2 fields), keyed from the field's id.
window.saveAdetailerPromptFieldAsDefault = function(fieldId) {
    const el = document.getElementById(fieldId);
    if (el) {
        localStorage.setItem(`bojro_adetailer_default_${fieldId}`, el.value);
        Toast.show({ text: 'Saved as default', duration: 'short' });
    }
}
window.reloadAdetailerPromptFieldDefault = function(fieldId, mode) {
    const el = document.getElementById(fieldId);
    if (el) {
        const saved = localStorage.getItem(`bojro_adetailer_default_${fieldId}`);
        // No default saved for this field: say so rather than silently doing nothing.
        if (saved === null) {
            Toast.show({ text: 'No default saved for this field yet', duration: 'short' });
            return;
        }
        el.value = saved;
        saveAdetailer(mode);
    }
}

// ad_mask_k_largest treats 0 and unset as "no limit", so typing 0 clears the box back to its "Unlimited" placeholder. Runs on change (not input) so multi-digit entries starting with 0 aren't disturbed.
window.normalizeMaxMasksField = function(el) {
    if (el.value === '0') el.value = '';
}

// Replaces the prompt box with this mode's default (a saved custom default first, as loadSavedPrompts()).
window.insertDefaultPrompt = function(mode) {
    if (window.WcReroll && WcReroll.disarm) WcReroll.disarm(mode);
    if (window.MoreSettings && MoreSettings.combosOff) MoreSettings.combosOff(mode);
    const el = document.getElementById(`${mode}_prompt`);
    if (el) {
        const customDefault = localStorage.getItem(`bojro_custom_default_${defaultKeyMode(mode)}`);
        el.value = customDefault !== null ? customDefault : (DEFAULT_PROMPTS[mode] || "");
        savePrompt(mode);
    }

    // As clearPrompt(): clear stale style selections (this mode only).
    if (window.StyleManager && typeof window.StyleManager.getSelectedStylesForMode === 'function') {
        window.StyleManager.getSelectedStylesForMode(mode).clear();
        if (typeof window.StyleManager.render === 'function') {
            window.StyleManager.render();
        }
    }
}

// Replaces the negative box with this mode's default (custom default first, as insertDefaultPrompt).
window.insertDefaultNegative = function(mode) {
    const el = document.getElementById(`${mode}_neg`);
    if (el) {
        const customNegDefault = localStorage.getItem(`bojro_custom_default_neg_${defaultKeyMode(mode)}`);
        el.value = customNegDefault !== null ? customNegDefault : (DEFAULT_NEGATIVE_PROMPTS[mode] || "");
        saveNegativePrompt(mode);
    }
}

window.loadSavedPrompts = function() {
    ['xl', 'flux', 'qwen', 'anima', 'krea', 'inp'].forEach(mode => {
        // Snapshot the negative textarea's raw HTML value as the mode's default before it is overwritten.
        const negElForDefault = document.getElementById(`${mode}_neg`);
        if (negElForDefault) DEFAULT_NEGATIVE_PROMPTS[mode] = negElForDefault.value;

        const saved = localStorage.getItem(`bojro_prompt_${mode}`);
        const el = document.getElementById(`${mode}_prompt`);
        
        if (el) {
            if (saved) {
                // Non-empty session value - load it, whatever it is
                el.value = saved;
            } else {
                // Empty falls back to the custom default, then the hardcoded default.
                const customDefault = localStorage.getItem(`bojro_custom_default_${defaultKeyMode(mode)}`);
                el.value = customDefault !== null ? customDefault : (DEFAULT_PROMPTS[mode] || "");
            }
        }

        // Negative prompt: same rule as the main prompt (session value, then saved custom default, then HTML default).
        const negEl = document.getElementById(`${mode}_neg`);
        if (negEl) {
            const sessionNeg = localStorage.getItem(`bojro_neg_session_${mode}`);
            if (sessionNeg) {
                negEl.value = sessionNeg;
            } else {
                const customNegDefault = localStorage.getItem(`bojro_custom_default_neg_${defaultKeyMode(mode)}`);
                if (customNegDefault !== null) negEl.value = customNegDefault;
            }
        }
    });
    window.initHr();
    window.initAdetailer();
    window.initNeverOom();
    window.initGlobalUiState();
}

window.saveTrident = function() {
    ['flux_vae', 'flux_clip', 'flux_t5'].forEach(id => localStorage.setItem('bojro_' + id, document.getElementById(id).value));
}

// Aspect ratio chip orientation (3:2 vs 2:3) comes from the mode's width/height: portrait means all chips portrait, landscape means all landscape. Derived every time this runs (boot, mode switch, preset tap, flip), so it can't drift. Square dimensions fall back to the last stored orientation, so Flip on a square size and a restart keep it.
function resChipOrientationKey(mode) { return `bojroResChipOrientation_${mode}`; }

function getResChipOrientation(grid) {
    for (const btn of grid.querySelectorAll('.res-switch[data-w]')) {
        const w = parseInt(btn.dataset.w, 10);
        const h = parseInt(btn.dataset.h, 10);
        if (w !== h) return h > w ? 'portrait' : 'landscape';
    }
    return 'landscape';
}

// Swaps one chip's own data-w/data-h, tap handler and label ("3:2" <-> "2:3").
function flipResChip(btn, mode) {
    const newW = btn.dataset.h;
    const newH = btn.dataset.w;
    btn.dataset.w = newW;
    btn.dataset.h = newH;
    btn.setAttribute('onclick', `setRes('${mode}', ${newW}, ${newH})`);
    btn.textContent = btn.textContent.split(':').reverse().join(':');
}

function syncResChipOrientation(mode) {
    const widthEl = document.getElementById(`${mode}_width`);
    const heightEl = document.getElementById(`${mode}_height`);
    const grid = document.getElementById(`resGrid-${mode}`);
    if (!widthEl || !heightEl || !grid) return;
    const w = parseInt(widthEl.value, 10);
    const h = parseInt(heightEl.value, 10);
    const key = resChipOrientationKey(mode);

    let want;
    if (Number.isFinite(w) && Number.isFinite(h) && w !== h) {
        want = h > w ? 'portrait' : 'landscape';
    } else {
        want = localStorage.getItem(key) === 'portrait' ? 'portrait' : 'landscape';
    }

    grid.querySelectorAll('.res-switch[data-w]').forEach(btn => {
        const btnW = parseInt(btn.dataset.w, 10);
        const btnH = parseInt(btn.dataset.h, 10);
        if (btnW === btnH) return; // 1:1 chips read the same either way
        if ((btnH > btnW ? 'portrait' : 'landscape') !== want) flipResChip(btn, mode);
    });
    try { localStorage.setItem(key, want); } catch (e) { /* storage unavailable - orientation just won't persist */ }
}

// Highlights the res-switch preset matching the mode's width/height. WP depends on the screen (computeWallpaperRes()). Flip has no single target.
window.updateResSwitchHighlight = function(mode) {
    const widthEl = document.getElementById(`${mode}_width`);
    const heightEl = document.getElementById(`${mode}_height`);
    const grid = document.getElementById(`resGrid-${mode}`);
    if (!widthEl || !heightEl || !grid) return;
    // Orientation first, so chips match the current dimensions before comparing.
    syncResChipOrientation(mode);
    const w = parseInt(widthEl.value, 10);
    const h = parseInt(heightEl.value, 10);
    grid.querySelectorAll('.res-switch[data-w]').forEach(btn => {
        const btnW = parseInt(btn.dataset.w, 10);
        const btnH = parseInt(btn.dataset.h, 10);
        btn.classList.toggle('active-ratio', btnW === w && btnH === h);
    });
    const wpMatch = computeWallpaperRes();
    grid.querySelectorAll('.res-switch[data-wp]').forEach(btn => {
        btn.classList.toggle('active-ratio', wpMatch.w === w && wpMatch.h === h);
    });
}

// The "WP" (Wallpaper) preset calculation, factored out of setWallpaperRes() so updateResSwitchHighlight() can check against it.
function computeWallpaperRes() {
    const ratio = window.screen.width / window.screen.height;
    const landscapeRatio = Math.max(ratio, 1 / ratio);

    // About 1.06MP, as the 1MP presets.
    const targetArea = 1.06 * 1024 * 1024;
    let w = Math.sqrt(targetArea * landscapeRatio);
    let h = Math.sqrt(targetArea / landscapeRatio);

    w = Math.max(16, Math.round(w / 16) * 16);
    h = Math.max(16, Math.round(h / 16) * 16);

    return { w: h, h: w }; // swapped: w/h above are landscape; portrait (what tapping WP actually sets) is the reverse
}

window.setRes = (mode, w, h) => {
    document.getElementById(`${mode}_width`).value = w;
    document.getElementById(`${mode}_height`).value = h;
    updateResSwitchHighlight(mode);
    // Direct .value assignment fires no input event, so save explicitly so a tapped preset persists.
    if (typeof saveLiveGenParams === 'function') saveLiveGenParams(mode);
}
window.flipRes = (mode) => {
    const w = document.getElementById(`${mode}_width`);
    const h = document.getElementById(`${mode}_height`);
    const t = w.value;
    w.value = h.value;
    h.value = t;

    // Also flips each fixed-ratio preset's label and data-w/data-h ("3:2" becomes "2:3"). The [data-w] selector excludes WP, which loses its highlight.
    const grid = document.getElementById(`resGrid-${mode}`);
    if (grid) {
        grid.querySelectorAll('.res-switch[data-w]').forEach(btn => flipResChip(btn, mode));
        // Recorded here so a flip on a square size is remembered.
        try { localStorage.setItem(resChipOrientationKey(mode), getResChipOrientation(grid)); } catch (e) {}
    }

    updateResSwitchHighlight(mode);
    // As setRes(): save explicitly, since a flip fires no input event.
    if (typeof saveLiveGenParams === 'function') saveLiveGenParams(mode);
}

// "WP" (Wallpaper) preset: detects the device's screen aspect ratio and outputs portrait dimensions by default; the flip (⇄) button gives landscape.
window.setWallpaperRes = function(mode) {
    const res = computeWallpaperRes();
    window.setRes(mode, res.w, res.h);
}

// Auto-Save: autoDlCheck (main tabs) is the one read; inpAutoDlCheck (Inpaint tab) mirrors it.
function loadAutoDlState() {
    const on = localStorage.getItem('bojroAutoSave') === 'true';
    ['autoDlCheck', 'inpAutoDlCheck'].forEach(id => { const c = document.getElementById(id); if (c) c.checked = on; });
}
window.saveAutoDlState = (from) => {
    const on = (from || document.getElementById('autoDlCheck')).checked;
    ['autoDlCheck', 'inpAutoDlCheck'].forEach(id => { const c = document.getElementById(id); if (c) c.checked = on; });
    localStorage.setItem('bojroAutoSave', on);
};

// --- CONFIG MODALS (LoRA & POWER) ---

// A text box's X (as the LoRA search's): shown while it has text, clears it and keeps the keyboard up.
window.initClearField = function (input) {
    const btn = input.parentElement && input.parentElement.querySelector('.clear-field-btn');
    if (!btn || input._clearField) return;
    input._clearField = true;
    const sync = () => btn.classList.toggle('hidden', !input.value);
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(input, 'value', {
        configurable: true,
        get() { return desc.get.call(this); },
        set(v) { desc.set.call(this, v); sync(); }
    });
    input.addEventListener('input', sync);
    // Pressed without taking focus from the box, so a name box isn't committed by losing it.
    btn.addEventListener('pointerdown', e => e.preventDefault());
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => {
        input.value = '';
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    sync();
};

// A LoRA's slider range, [min, max]: 0.5 to 1.5 unless both ends are different numbers; the wrong way round, they're swapped.
window.loraSliderRange = function (cfg) {
    let a = parseFloat(cfg && cfg.sliderMin), b = parseFloat(cfg && cfg.sliderMax);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return [0.5, 1.5];
    return a < b ? [a, b] : [b, a];
};

// Slider Name and Weight Range show while Slider is on.
window.syncLoraSliderSwitch = function () {
    const on = document.getElementById('cfgLoraSliderSwitch');
    const all = window.ForgeCouple && ForgeCouple.allSliders && ForgeCouple.allSliders();
    document.getElementById('cfgLoraSliderNameRow')?.classList.toggle('hidden', !(on && on.checked) && !all);
};

// The LoRA's own thumbnail picked in its settings, saved with SAVE (undefined: unchanged; null: the server's again).
let cfgPendingThumb;
// RESET pressed: the sidecar's { weight, trigger } it filled in, kept with SAVE (null: not pressed).
let cfgPendingReset = null;
// Its new name, saved with SAVE (undefined: unchanged; '' puts back its own).
let cfgPendingName;
const loraRowThumb = name => window.LoraManager ? document.getElementById(`thumb-${window.LoraManager.simpleHash(name)}`) : null;
function paintLoraConfigThumb(loraName) {
    const img = document.getElementById('cfgLoraThumbImg');
    if (!img) return;
    const LM = window.LoraManager;
    img.src = (LM && LM.thumbFor(loraName)) || 'icon.png';
    // Not shown yet this session: fetched as the list does.
    if (LM && !LM.thumbFor(loraName)) {
        const lora = (LM.allLoras || []).find(l => l.name === loraName);
        if (lora) LM.smartLoadThumbnail(img, lora);
    }
}

function injectConfigModal() {
    if (document.getElementById('loraConfigModal')) return;
    const div = document.createElement('div');
    div.id = 'loraConfigModal';
    div.className = 'modal hidden';
    div.innerHTML = `
        <div class="modal-content pin-scroll" style="max-height: 85vh; overflow-y: auto;">
            <div class="modal-header">
                <h3 id="cfgLoraTitle" onclick="enterLoraNameEditMode()" style="max-width:70%; cursor:text; font-size:var(--fs-window-title); text-transform:none; white-space:normal;" title="Tap to rename">Config</h3>
                <div class="clear-field" style="flex:1; margin: 0 8px;">
                    <input type="text" id="cfgLoraTitleEdit" class="hidden" onblur="commitLoraNameEdit()" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}" style="font-size:16px; font-weight:700;">
                    <button type="button" class="clear-field-btn hidden" aria-label="Clear"><i data-lucide="x" width="16" height="16"></i></button>
                </div>
                <div class="row" style="width:auto; gap:8px; flex-shrink:0;">
                    <button id="cfgResetNameBtn" class="card-btn card-btn-accent hidden" onclick="resetLoraOverrides()" title="Reset this LoRA's settings to defaults">
                        <i data-lucide="rotate-ccw" width="16" height="16"></i>
                    </button>
                </div>
            </div>
            <div class="col" style="gap: 15px; padding: 10px 0 0;">
                <div>
                    <label style="display:flex; justify-content:space-between;">
                        <span>Preferred Weight</span>
                        <span id="cfgWeightDisplay" class="slider-val">1.0</span>
                    </label>
                    <div class="slider-fake-thumb-wrap" style="margin-top:11px;"><input type="range" id="cfgWeight" class="orange-slider thumb-only-slider" min="-2" max="2" step="0.05" value="1" oninput="updateWeightDisplay(this.value)"><div class="slider-fake-thumb" data-for="cfgWeight"></div></div>
                </div>
                <div>
                    <label for="cfgTrigger">Prompt</label>
                    <textarea id="cfgTrigger" rows="3" placeholder="trigger, words, here" style="margin-top:5px;"></textarea>
                </div>
                <div class="lora-cfg-thumb-row">
                    <button type="button" class="lv-thumb-pick lora-cfg-thumb" id="cfgLoraThumbPick" title="Choose a thumbnail">
                        <img id="cfgLoraThumbImg" src="icon.png">
                        <span class="lv-thumb-badge"><i data-lucide="image-plus" width="13" height="13"></i></span>
                    </button>
                    <input type="file" id="cfgLoraThumbInput" accept="image/*" class="hidden">
                    <div class="lora-cfg-switches">
                        <div class="row" style="justify-content:space-between; align-items:center;">
                            <label for="cfgLoraLink" class="opt-name">Link to ADetailer</label>
                            <input type="checkbox" id="cfgLoraLink" class="bojro-switch" checked>
                        </div>
                        <div class="row" style="justify-content:space-between; align-items:center; gap:10px;">
                            <label class="opt-name">Type</label>
                            <select id="cfgLoraType" style="display:none;"><option value="">None</option><option value="artstyle">Artstyle</option><option value="background">Background</option><option value="character">Character</option><option value="characterpack">Character pack</option><option value="clothing">Clothing</option><option value="concept">Concept</option><option value="other">Other</option><option value="pose">Pose</option><option value="slider">Slider</option><option value="tool">Tool</option></select><button type="button" class="model-picker-trigger hidden lora-cfg-type" data-target="cfgLoraType" data-kind="lora-type" data-custom-order=",artstyle,background,character,characterpack,clothing,concept,other,pose,slider,tool" data-modal-title="LoRA Type" onclick="openModelPicker(this)"><span class="model-picker-trigger-primary"></span><span class="model-picker-trigger-subtitle hidden"></span></button>
                        </div>
                        <div class="row" style="justify-content:space-between; align-items:center;">
                            <label for="cfgLoraSliderSwitch" class="opt-name">Slider</label>
                            <input type="checkbox" id="cfgLoraSliderSwitch" class="bojro-switch" onchange="syncLoraSliderSwitch()">
                        </div>
                        <div class="row" style="justify-content:space-between; align-items:center;">
                            <label for="cfgLoraVariantsSwitch" class="opt-name">Variants</label>
                            <input type="checkbox" id="cfgLoraVariantsSwitch" class="bojro-switch" onchange="LoraVariants.syncLoraSwitches()">
                        </div>
                        <div id="cfgLoraVariantsAddRow" class="row hidden" style="justify-content:space-between; align-items:center; padding-left:14px;">
                            <label for="cfgLoraVariantsAddSwitch" class="opt-name">Show Add Variant</label>
                            <input type="checkbox" id="cfgLoraVariantsAddSwitch" class="bojro-switch" checked>
                        </div>
                    </div>
                </div>
                <div id="cfgLoraSliderNameRow" class="row hidden" style="gap:10px; align-items:flex-start;">
                    <div class="col" style="flex:1; min-width:0;">
                        <label for="cfgLoraSliderName">Slider Name</label>
                        <div class="clear-field" style="margin-top:5px;">
                            <input type="text" id="cfgLoraSliderName" maxlength="12" placeholder="Max 12 characters">
                            <button type="button" class="clear-field-btn hidden" aria-label="Clear"><i data-lucide="x" width="16" height="16"></i></button>
                        </div>
                    </div>
                    <div class="col" style="flex:none;">
                        <label for="cfgLoraSliderMin">Weight Range</label>
                        <div class="row lora-cfg-range" style="margin-top:5px;">
                            <input type="number" id="cfgLoraSliderMin" step="0.5" placeholder="0.5" aria-label="Lowest weight">
                            <span>–</span>
                            <input type="number" id="cfgLoraSliderMax" step="0.5" placeholder="1.5" aria-label="Highest weight">
                        </div>
                    </div>
                </div>
                <div class="inset-card">
                    <div class="row" onclick="toggleGeneric('grp-lora-overrides', 'arr-lora-overrides', 'bojro_vis_lora_overrides')" style="justify-content:space-between; align-items:center; cursor:pointer;">
                        <label style="cursor:pointer; font-size:13px; margin:0;">OVERRIDES</label>
                        <i id="arr-lora-overrides" data-lucide="chevron-down" width="16" height="16" style="transition: transform 0.2s;"></i>
                    </div>
                    <div id="grp-lora-overrides">
                    <div class="row" style="margin-top:12px;">
                        <div class="col"><label>Sampler</label><div class="row"><select id="cfgLoraOverrideSampler" style="display:none;"><option value="">Not Set</option></select><button type="button" class="model-picker-trigger hidden" data-target="cfgLoraOverrideSampler" data-kind="sampler" data-pin-first="" data-modal-title="Select Sampler" onclick="openModelPicker(this)"><span class="model-picker-trigger-primary"></span><span class="model-picker-trigger-subtitle hidden"></span></button></div></div>
                        <div class="col"><label>Schedule</label><div class="row"><select id="cfgLoraOverrideScheduler" style="display:none;"><option value="">Not Set</option></select><button type="button" class="model-picker-trigger hidden" data-target="cfgLoraOverrideScheduler" data-kind="schedule" data-pin-first="" data-modal-title="Select Schedule" onclick="openModelPicker(this)"><span class="model-picker-trigger-primary"></span><span class="model-picker-trigger-subtitle hidden"></span></button></div></div>
                    </div>
                    <div class="row" style="margin-top: 10px;">
                        <div class="col"><label>Steps</label><input type="number" id="cfgLoraOverrideSteps" placeholder="Default"></div>
                        <div class="col"><label>CFG</label><input type="number" id="cfgLoraOverrideCfg" placeholder="Default" step="0.5"></div>
                    </div>
                    <div style="margin-top: 10px;">
                        <label for="cfgLoraAdditionalNegative">Negative</label>
                        <textarea id="cfgLoraAdditionalNegative" rows="3" placeholder="bad hands, extra fingers" style="margin-top:5px;"></textarea>
                    </div>
                    </div>
                </div>
                <div class="row pin-foot" style="gap:10px; margin-top:4px;">
                    <button type="button" class="btn-small btn-cancel" style="flex:1;" onclick="closeConfigModal()">CANCEL</button>
                    <button id="cfgSaveBtn" class="btn-small btn-save" style="flex:1;">SAVE</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(div);
    div.querySelectorAll('.clear-field > input').forEach(initClearField);
    // Tapping outside closes it, as CANCEL does (the tap starting and ending outside, as for the other windows, boot.js).
    let downOnBackdrop = false;
    div.addEventListener('pointerdown', e => { downOnBackdrop = e.target === div; });
    div.addEventListener('click', e => {
        if (downOnBackdrop && e.target === div) window.closeConfigModal();
        downOnBackdrop = false;
    });
    // Preferred Weight is a thumb-only slider like the Inpaint ones (editor.js), in 0.05 steps. Wired here because the modal is built on demand, after editor.js ran its init.
    if (typeof initThumbOnlySlider === 'function') initThumbOnlySlider('cfgWeight');
    // Overrides starts collapsed and remembers its state like other collapsible sections. Done in JS because inline <script> doesn't run for innerHTML markup.
    if (typeof window.initGenericSectionClosed === 'function') {
        window.initGenericSectionClosed('grp-lora-overrides', 'arr-lora-overrides', 'bojro_vis_lora_overrides');
    }
    // This modal is created after boot's lucide.createIcons() pass, so create its icons explicitly.
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Populates the OVERRIDE selects (Sampler/Schedule) by copying the options loaded into the XL tab's selects (the live lists from fetchSamplers()/fetchSchedulers(), network.js) each time the modal opens. The select is hidden and only holds options and the value for openModelPicker(); the visible control is the paired model-picker-trigger (a native select popup can't be styled).
function populateLoraOverrideSelectors() {
    const copyOptions = (sourceId, targetId) => {
        const source = document.getElementById(sourceId);
        const target = document.getElementById(targetId);
        if (!source || !target) return;
        const current = target.value;
        target.innerHTML = '<option value="">Not Set</option>';
        Array.from(source.options).forEach(opt => {
            target.appendChild(new Option(opt.value, opt.value));
        });
        // Restore the previous selection if it still exists in the fresh list.
        if (current && Array.from(target.options).some(o => o.value === current)) {
            target.value = current;
        }
    };
    copyOptions('xl_sampler', 'cfgLoraOverrideSampler');
    copyOptions('xl_scheduler', 'cfgLoraOverrideScheduler');
}

window.openLoraSettings = async (e, loraName, loraPath) => {
    e.stopPropagation();
    const modal = document.getElementById('loraConfigModal');
    if (typeof applyPromptBoxHeights === 'function') applyPromptBoxHeights();
    // Kept invisible until filled in for this LoRA, so the last one's values and size don't flash (shown after 400ms
    // regardless, if its config is slow to come).
    modal.style.visibility = 'hidden';
    modal.classList.add('no-anim');
    // Shown, then switches slide again two frames later (after they've been drawn in place).
    const reveal = () => requestAnimationFrame(() => { modal.style.visibility = ''; requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.remove('no-anim'))); });
    const revealTimer = setTimeout(reveal, 400);
    if (window.LoraVariants) window.LoraVariants.renderLoraSwitches(loraName);
    cfgPendingThumb = undefined;
    cfgPendingName = undefined;
    cfgPendingReset = null;
    paintLoraConfigThumb(loraName);
    const thumbInput = document.getElementById('cfgLoraThumbInput');
    document.getElementById('cfgLoraThumbPick').onclick = e => window.LoraVariants.thumbMenu(e.currentTarget, thumbInput);
    thumbInput.onchange = async () => {
        const file = thumbInput.files && thumbInput.files[0];
        thumbInput.value = '';
        if (!file || !window.LoraVariants) return;
        try {
            cfgPendingThumb = await window.LoraVariants.makeThumb(file);
            document.getElementById('cfgLoraThumbImg').src = cfgPendingThumb;
        } catch (err) {
            if (typeof Toast !== 'undefined') Toast.show({ text: err.message, duration: 'short' });
        }
    };
    modal.classList.remove('hidden');
    // From the top each time, not where the last LoRA's was scrolled to.
    modal.querySelectorAll('.modal-content, .modal-content *').forEach(el => { if (el.scrollTop) el.scrollTop = 0; });
    // Lock body scroll while this modal's text fields have the keyboard up (as other picker modals).
    if (typeof lockBodyScroll === 'function') lockBodyScroll();

    // Always reset to display mode (not mid-edit) when opening for any LoRA
    window.currentConfigLoraName = loraName;
    window.currentConfigLoraPath = loraPath;
    const titleEl = document.getElementById('cfgLoraTitle');
    const editEl = document.getElementById('cfgLoraTitleEdit');
    titleEl.classList.remove('hidden');
    editEl.classList.add('hidden');

    titleEl.innerText = "Loading...";

    let cfg = loraConfigs[loraName];
    if (!cfg) cfg = await loadSidecarConfig(loraName, loraPath);

    const displayName = window.LoraManager ? window.LoraManager.getDisplayName({ name: loraName }) : loraName;
    titleEl.innerText = displayName;
    updateLoraResetBtnVisibility(loraName);
    document.getElementById('cfgWeight').value = cfg.weight;
    document.getElementById('cfgWeightDisplay').innerText = cfg.weight;
    if (typeof syncThumbOnlySliderPosition === 'function') syncThumbOnlySliderPosition('cfgWeight');
    document.getElementById('cfgTrigger').value = cfg.trigger;
    document.getElementById('cfgLoraLink').checked = window.LoraManager ? window.LoraManager.isLoraLinkEnabled(loraName) : true;
    populateLoraOverrideSelectors();
    document.getElementById('cfgLoraOverrideSampler').value = cfg.overrideSampler || '';
    document.getElementById('cfgLoraOverrideScheduler').value = cfg.overrideScheduler || '';
    document.getElementById('cfgLoraOverrideSteps').value = cfg.overrideSteps || '';
    document.getElementById('cfgLoraOverrideCfg').value = cfg.overrideCfg || '';
    document.getElementById('cfgLoraAdditionalNegative').value = cfg.additionalNegative || '';
    // Its type (random::<type>, randomtokens.js; Slider is a type too, for the Sliders filter) and Slider.
    // A type this list doesn't have (from a newer or older version) is shown and kept, not saved back as None.
    const typeSel = document.getElementById('cfgLoraType'), t = cfg.type || '';
    typeSel.querySelectorAll('option[data-kept]').forEach(o => o.remove());
    if (t && ![...typeSel.options].some(o => o.value === t)) typeSel.insertAdjacentHTML('beforeend', `<option value="${t.replace(/[^a-z0-9_-]/gi, '')}" data-kept>${t.replace(/[^a-z0-9_ -]/gi, '')}</option>`);
    typeSel.value = t;
    document.getElementById('cfgLoraSliderSwitch').checked = !!cfg.slider;
    if (typeof initModelPickers === 'function') initModelPickers();
    if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText('cfgLoraType');
    document.getElementById('cfgLoraSliderName').value = cfg.sliderName || '';
    document.getElementById('cfgLoraSliderName').placeholder = (typeof splitLoraName === 'function' ? splitLoraName(displayName)[0] : displayName).slice(0, 12);
    document.getElementById('cfgLoraSliderMin').value = loraSliderRange(cfg)[0];
    document.getElementById('cfgLoraSliderMax').value = loraSliderRange(cfg)[1];
    syncLoraSliderSwitch();
    if (window.LoraVariants) window.LoraVariants.renderLoraSwitches(loraName);
    // The selects are hidden (see populateLoraOverrideSelectors), so refresh the visible trigger button's text after setting .value.
    if (typeof updateModelPickerTriggerText === 'function') {
        updateModelPickerTriggerText('cfgLoraOverrideSampler');
        updateModelPickerTriggerText('cfgLoraOverrideScheduler');
    }
    clearTimeout(revealTimer);
    reveal();

    document.getElementById('cfgSaveBtn').onclick = () => {
        // SAVE also closes a mid-rename (commitLoraNameEdit() is a no-op if the name box isn't open), then keeps the name.
        commitLoraNameEdit();
        if (cfgPendingName !== undefined && window.LoraManager) window.LoraManager.saveUserRename(loraName, cfgPendingName);
        cfgPendingName = undefined;
        const reset = cfgPendingReset;
        cfgPendingReset = null;

        const newWeight = document.getElementById('cfgWeight').value;
        const newTrigger = document.getElementById('cfgTrigger').value;
        const linkEnabled = document.getElementById('cfgLoraLink').checked;
        const overrideSampler = document.getElementById('cfgLoraOverrideSampler').value;
        const overrideScheduler = document.getElementById('cfgLoraOverrideScheduler').value;
        const overrideSteps = document.getElementById('cfgLoraOverrideSteps').value;
        const overrideCfg = document.getElementById('cfgLoraOverrideCfg').value;
        const additionalNegative = document.getElementById('cfgLoraAdditionalNegative').value.trim();
        const type = document.getElementById('cfgLoraType').value;
        const slider = document.getElementById('cfgLoraSliderSwitch').checked;
        const sliderName = document.getElementById('cfgLoraSliderName').value.trim().slice(0, 12);
        const [sliderMin, sliderMax] = loraSliderRange({ sliderMin: document.getElementById('cfgLoraSliderMin').value, sliderMax: document.getElementById('cfgLoraSliderMax').value });
        const loraEntry = window.LoraManager && (window.LoraManager.allLoras || []).find(l => l.name === loraName);
        if (window.LoraManager) window.LoraManager.setLoraLinkEnabled(loraName, linkEnabled);
        if (window.LoraVariants) window.LoraVariants.saveLoraSwitches(loraName);
        loraConfigs[loraName] = {
            weight: parseFloat(newWeight),
            trigger: newTrigger,
            // Marks this entry as an in-app override, so LoraManager.refresh() re-fetches stale sidecar data but never discards a user-edited weight/trigger.
            userEdited: true,
            // Sampler/Schedule/Steps/CFG this LoRA applies to the current tab when added (window.Neo.appInjectConfig, boot.js). Empty means no opinion; each is applied only if non-empty.
            overrideSampler,
            overrideScheduler,
            overrideSteps,
            overrideCfg,
            // Tags appended to the Negative box when this LoRA is added and removed when toggled off (LoraManager.applyAdditionalNegative()/removeAdditionalNegative(), lora.js). The object is rebuilt on every save, so it must be listed here.
            additionalNegative,
            // type: character, artstyle, ... (random::<type>, randomtokens.js); slider: a weight slider under the prompt while
            // it's in (lorasliders.js); sliderAlias, the tag's alias, for before the LoRA list loads.
            type,
            slider,
            sliderName,
            sliderMin,
            sliderMax,
            sliderAlias: loraEntry ? window.LoraManager.resolveTagIdentifier(loraEntry) : loraName
        };
        // Reset and saved unchanged: the sidecar's settings again, not an override, so later edits on the PC show.
        const c = loraConfigs[loraName];
        if (reset && String(c.weight) === String(parseFloat(reset.weight)) && c.trigger === reset.trigger && !overrideSampler && !overrideScheduler
            && !overrideSteps && !overrideCfg && !additionalNegative && !type && !slider && !sliderName) {
            loraConfigs[loraName] = { weight: reset.weight, trigger: reset.trigger };
        }
        localStorage.setItem('bojroLoraConfigs', JSON.stringify(loraConfigs));
        if (cfgPendingThumb !== undefined && window.LoraVariants) {
            window.LoraVariants.setParentThumb(loraName, cfgPendingThumb);
            const rowImg = loraRowThumb(loraName);
            if (rowImg) rowImg.src = cfgPendingThumb || (window.LoraManager && window.LoraManager.thumbnailMemCache[loraName]) || 'icon.png';
        }
        cfgPendingThumb = undefined;
        if (window.LoraSliders) window.LoraSliders.refreshAll();
        if (window.LoraVariants) window.LoraVariants.refreshList();
        modal.classList.add('hidden');
        // Closes through closeConfigModal(), which calls unlockBodyScroll() to match lockBodyScroll() on open.
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
        if (Toast) Toast.show({
            text: 'Saved',
            duration: 'short'
        });
    };
}

// Show the reset button whenever any override exists (display rename, saved weight/trigger, chosen thumbnail), since
// resetLoraOverrides() puts back all of them (with SAVE).
function updateLoraResetBtnVisibility(loraName) {
    const resetBtn = document.getElementById('cfgResetNameBtn');
    if (!resetBtn) return;
    const hasNameOverride = !!(window.LoraManager && window.LoraManager.userRenames.hasOwnProperty(loraName));
    const hasConfigOverride = !!(loraConfigs[loraName] && loraConfigs[loraName].userEdited);
    const hasThumb = !!(window.LoraVariants && window.LoraVariants.parentThumb(loraName));
    resetBtn.classList.toggle('hidden', !(hasNameOverride || hasConfigOverride || hasThumb));
}

// Tapping the name opens it for editing (no separate pencil button).
window.enterLoraNameEditMode = function() {
    const titleEl = document.getElementById('cfgLoraTitle');
    const editEl = document.getElementById('cfgLoraTitleEdit');
    const loraName = window.currentConfigLoraName;
    if (!loraName) return;
    // innerText respects CSS text-transform (the title is uppercase), so read the real display name from LoraManager.
    editEl.value = cfgPendingName !== undefined ? cfgPendingName : window.LoraManager ? window.LoraManager.getDisplayName({ name: loraName }) : titleEl.innerText;
    titleEl.classList.add('hidden');
    editEl.classList.remove('hidden');
    editEl.focus();
    editEl.select();
}

// Tapping away from the name box closes it, showing the new name; it's kept with SAVE. A no-op if the box isn't open.
window.commitLoraNameEdit = function() {
    const titleEl = document.getElementById('cfgLoraTitle');
    const editEl = document.getElementById('cfgLoraTitleEdit');
    const loraName = window.currentConfigLoraName;
    if (!loraName || editEl.classList.contains('hidden')) return;

    cfgPendingName = editEl.value.trim();
    // Blank: its own name (the server's, or the file name).
    const L = window.LoraManager;
    const ownName = L ? ((L.nameCache[loraName]) || loraName.replace(/_/g, ' ')) : loraName;
    titleEl.innerText = cfgPendingName || ownName;

    titleEl.classList.remove('hidden');
    editEl.classList.add('hidden');
}

// Discards an uncommitted name edit (shared by resetLoraOverrides() and the hardware back button) without saving it.
window.discardLoraNameEditIfOpen = function() {
    const titleEl = document.getElementById('cfgLoraTitle');
    const editEl = document.getElementById('cfgLoraTitleEdit');
    if (editEl && titleEl && !editEl.classList.contains('hidden')) {
        editEl.classList.add('hidden');
        titleEl.classList.remove('hidden');
    }
}

// Resets a LoRA to defaults: name, thumbnail and every setting.
window.resetLoraOverrides = async function() {
    const loraName = window.currentConfigLoraName;
    const loraPath = window.currentConfigLoraPath;
    if (!loraName || !window.LoraManager) return;
    const L = window.LoraManager;

    window.discardLoraNameEditIfOpen();
    cfgPendingName = '';
    document.getElementById('cfgLoraTitle').innerText = L.nameCache[loraName] || loraName.replace(/_/g, ' ');

    // The sidecar's settings, read past the saved ones (loadSidecarConfig() returns those if there are any), which stay
    // until SAVE.
    const saved = loraConfigs[loraName];
    delete loraConfigs[loraName];
    let freshCfg;
    try {
        freshCfg = await loadSidecarConfig(loraName, loraPath);
    } finally {
        if (saved) loraConfigs[loraName] = saved; else delete loraConfigs[loraName];
        localStorage.setItem('bojroLoraConfigs', JSON.stringify(loraConfigs));
    }
    // The window was closed or moved to another LoRA meanwhile.
    if (window.currentConfigLoraName !== loraName) return;
    cfgPendingReset = { weight: freshCfg.weight, trigger: freshCfg.trigger };
    document.getElementById('cfgWeight').value = freshCfg.weight;
    document.getElementById('cfgWeightDisplay').innerText = freshCfg.weight;
    if (typeof syncThumbOnlySliderPosition === 'function') syncThumbOnlySliderPosition('cfgWeight');
    document.getElementById('cfgTrigger').value = freshCfg.trigger;
    document.getElementById('cfgLoraOverrideSampler').value = '';
    document.getElementById('cfgLoraOverrideScheduler').value = '';
    document.getElementById('cfgLoraOverrideSteps').value = '';
    document.getElementById('cfgLoraOverrideCfg').value = '';
    document.getElementById('cfgLoraAdditionalNegative').value = '';
    document.getElementById('cfgLoraType').value = '';
    if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText('cfgLoraType');
    document.getElementById('cfgLoraSliderSwitch').checked = false;
    document.getElementById('cfgLoraSliderName').value = '';
    document.getElementById('cfgLoraSliderMin').value = 0.5;
    document.getElementById('cfgLoraSliderMax').value = 1.5;
    syncLoraSliderSwitch();
    if (typeof updateModelPickerTriggerText === 'function') {
        updateModelPickerTriggerText('cfgLoraOverrideSampler');
        updateModelPickerTriggerText('cfgLoraOverrideScheduler');
    }
    // The server's thumbnail in place of a chosen one.
    cfgPendingThumb = null;
    const img = document.getElementById('cfgLoraThumbImg');
    if (img) {
        img.src = L.thumbnailMemCache[loraName] || 'icon.png';
        if (!L.thumbnailMemCache[loraName] && typeof L.readCachedThumb === 'function') L.readCachedThumb(img, loraName);
    }
    document.getElementById('cfgResetNameBtn')?.classList.add('hidden');
}

// Closing the editor (CANCEL, tapping outside or hardware back via boot.js) discards a new name and a picked thumbnail.
window.closeConfigModal = () => {
    window.discardLoraNameEditIfOpen();
    document.getElementById('loraConfigModal').classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
}
window.updateWeightDisplay = (val) => document.getElementById('cfgWeightDisplay').innerText = val;


// --- LLM MODALS ---

window.openLlmModal = (mode) => {
    activeLlmMode = mode;
    const llmModalEl = document.getElementById('llmModal');
    // Locks the page behind the window, once per open.
    if (llmModalEl.classList.contains('hidden') && typeof lockBodyScroll === 'function') lockBodyScroll();
    llmModalEl.classList.remove('hidden');
    if (window.Scene) Scene.fixTab();
    
    const inputEl = document.getElementById('llmInput');
    const outputEl = document.getElementById('llmOutput');
    const persistentCheck = document.getElementById('llmPersistentCheck');
    const resetBtn = document.getElementById('llmResetBtn');

    inputEl.value = llmState[mode].input;
    outputEl.value = llmState[mode].output;
    persistentCheck.checked = llmState[mode].persistent;
    
    resetBtn.disabled = !llmState[mode].persistent;

    let savedSys = llmSettings.system_xl;
    if (activeLlmMode === 'flux') savedSys = llmSettings.system_flux;
    else if (activeLlmMode === 'qwen') savedSys = llmSettings.system_qwen;
    else if (activeLlmMode === 'anima') savedSys = llmSettings.system_anima;
    else if (activeLlmMode === 'krea') savedSys = llmSettings.system_krea;
    document.getElementById('llmSystemPrompt').value = savedSys || "";
    
    updateLlmButtonState();
    
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const modelSelect = document.getElementById('llmModelSelect');
    if ((!modelSelect || !modelSelect.value) && typeof connectToLlmService === 'function') {
        connectToLlmService();
    }
}

window.closeLlmModal = () => {
    const llmModalEl = document.getElementById('llmModal');
    if (!llmModalEl.classList.contains('hidden') && typeof unlockBodyScroll === 'function') unlockBodyScroll();
    llmModalEl.classList.add('hidden');
};
window.toggleLlmSettings = () => document.getElementById('llmSettingsBox').classList.toggle('hidden');
window.updateLlmState = function() {
    llmState[activeLlmMode].input = document.getElementById('llmInput').value;
}

window.toggleLlmPersistent = function() {
    const isChecked = document.getElementById('llmPersistentCheck').checked;
    llmState[activeLlmMode].persistent = isChecked;
    
    document.getElementById('llmResetBtn').disabled = !isChecked;
    if (!isChecked) llmState[activeLlmMode].history = [];
}

window.resetLlmHistory = async function() {
    if (await window.appConfirm("Reset current chat history? All previous context for this mode will be deleted.", { title: 'Reset Chat History', okText: 'RESET', danger: true })) {
        llmState[activeLlmMode].history = [];
        if (Toast) Toast.show({ text: 'Context Reset', duration: 'short' });
    }
}

function updateLlmButtonState() {
    const hasOutput = llmState[activeLlmMode].output.trim().length > 0;
    const isPersistent = llmState[activeLlmMode].persistent;
    document.getElementById('llmGenerateBtn').innerText = (isPersistent && hasOutput) ? "ITERATE" : "GENERATE PROMPT";
}

function loadLlmSettings() {
    const s = localStorage.getItem('bojroLlmConfig');
    if (s) {
        const loaded = JSON.parse(s);
        llmSettings = { ...llmSettings, ...loaded };

        const elBase = document.getElementById('llmApiBase');
        if (elBase) elBase.value = llmSettings.baseUrl || '';
        
        const elKey = document.getElementById('llmApiKey');
        if (elKey) elKey.value = llmSettings.key || '';

        if (llmSettings.model) {
            const sel = document.getElementById('llmModelSelect');
            if (sel) {
                sel.innerHTML = `<option value="${escapeHtmlAttr(llmSettings.model)}">${escapeHtmlAttr(llmSettings.model)}</option>`;
                sel.value = llmSettings.model;
                if (typeof updateModelPickerTriggerText === 'function') updateModelPickerTriggerText('llmModelSelect');
            }
        }
    }
}

window.useLlmPrompt = async function() {
    const result = document.getElementById('llmOutput').value;
    if (!result) {
        await window.appAlert("Generate a prompt first!");
        return;
    }

    let targetId;
    if (activeLlmMode === 'xl') targetId = 'xl_prompt';
    else if (activeLlmMode === 'flux') targetId = 'flux_prompt';
    else if (activeLlmMode === 'qwen') targetId = 'qwen_prompt';
    else if (activeLlmMode === 'anima') targetId = 'anima_prompt';
    else if (activeLlmMode === 'krea') targetId = 'krea_prompt';

    const targetEl = document.getElementById(targetId);
    if(targetEl) {
        targetEl.value = result;
        if (typeof savePrompt === 'function') savePrompt(activeLlmMode);
        closeLlmModal();
        if (Toast) Toast.show({
            text: 'Applied to main prompt!',
            duration: 'short'
        });
    }
}

// --- HIGH-RES FIX LOGIC ---

window.saveHr = function(mode) {
    localStorage.setItem(`bojro_${mode}_hr_enable`, document.getElementById(`${mode}_hr_enable`).checked);
    localStorage.setItem(`bojro_${mode}_hr_upscaler`, document.getElementById(`${mode}_hr_upscaler`).value);
    localStorage.setItem(`bojro_${mode}_hr_steps`, document.getElementById(`${mode}_hr_steps`).value);
    localStorage.setItem(`bojro_${mode}_hr_denoise`, document.getElementById(`${mode}_hr_denoise`).value);
    localStorage.setItem(`bojro_${mode}_hr_scale`, document.getElementById(`${mode}_hr_scale`).value);
    localStorage.setItem(`bojro_${mode}_hr_cfg`, document.getElementById(`${mode}_hr_cfg`).value);
}

// --- ADETAILER (SDXL, Inpaint, img2img) ---
// Switches which ADetailer pass's fields are shown (pass chip 1-4). Each pass's enable checkbox (inside the chip) is independent of the one being viewed.
window.selectAdetailerPass = function(mode, passNum) {
    for (let i = 1; i <= 8; i++) {
        const chip = document.getElementById(`${mode}-adetailer-pass-chip-${i}`);
        const fields = document.getElementById(`${mode}_adetailer_${i}_fields`);
        if (chip) chip.classList.toggle('active', i === passNum);
        if (fields) fields.classList.toggle('hidden', i !== passNum);
    }
}

// MASK FILTER METHOD (Forge's ad_mask_filter_method: "Area" or "Confidence", which masks MAX MASKS keeps): an AREA/CONFIDENCE toggle above Inpaint Only Masked, styled like the WHOLE/MASKED buttons (setInpaintMode(), editor.js) but per pass and mode, so generic by id (as saveAdetailerPromptFieldAsDefault()). Backed by a hidden <select> like mask_merge, so the generic field loop in saveAdetailer()/initAdetailer() handles it (via 'filter_method' in that list).
window.syncAdetailerFilterMethodButtons = function(mode, n) {
    const select = document.getElementById(`${mode}_adetailer_${n}_filter_method`);
    const value = select ? select.value : 'Area';
    const areaBtn = document.getElementById(`${mode}_adetailer_${n}_filter_area`);
    const confBtn = document.getElementById(`${mode}_adetailer_${n}_filter_confidence`);
    if (areaBtn) areaBtn.classList.toggle('active', value === 'Area');
    if (confBtn) confBtn.classList.toggle('active', value === 'Confidence');
}
window.setAdetailerFilterMethod = function(mode, n, value) {
    const select = document.getElementById(`${mode}_adetailer_${n}_filter_method`);
    if (select) select.value = value;
    syncAdetailerFilterMethodButtons(mode, n);
    saveAdetailer(mode);
}

// MASK MERGE (ad_mask_merge_invert): NONE / MERGE / MERGE + INVERT buttons over a hidden <select>, as Mask Filter.
const AD_MERGE_BUTTONS = { none: 'None', merge: 'Merge', invert: 'Merge and Invert' };
window.syncAdetailerMaskMergeButtons = function(mode, n) {
    const select = document.getElementById(`${mode}_adetailer_${n}_mask_merge`);
    const value = select ? select.value : 'None';
    Object.entries(AD_MERGE_BUTTONS).forEach(([key, v]) => document.getElementById(`${mode}_adetailer_${n}_merge_${key}`)?.classList.toggle('active', value === v));
}
window.setAdetailerMaskMerge = function(mode, n, value) {
    const select = document.getElementById(`${mode}_adetailer_${n}_mask_merge`);
    if (select) select.value = value;
    syncAdetailerMaskMergeButtons(mode, n);
    saveAdetailer(mode);
}

window.saveAdetailer = function(mode) {
    let anyEnabled = false;
    for (let n = 1; n <= 8; n++) {
        const enableEl = document.getElementById(`${mode}_adetailer_${n}_enable`);
        if (enableEl) {
            localStorage.setItem(`bojro_${mode}_adetailer_${n}_enable`, enableEl.checked);
            if (enableEl.checked) anyEnabled = true;
        }
        // Checkbox: needs .checked, saved separately from the generic loop.
        const inpaintOnlyMaskedEl = document.getElementById(`${mode}_adetailer_${n}_inpaint_only_masked`);
        if (inpaintOnlyMaskedEl) localStorage.setItem(`bojro_${mode}_adetailer_${n}_inpaint_only_masked`, inpaintOnlyMaskedEl.checked);
        const loraLinkEl = document.getElementById(`${mode}_adetailer_${n}_lora_link`);
        if (loraLinkEl) localStorage.setItem(`bojro_${mode}_adetailer_${n}_lora_link`, loraLinkEl.checked);
        ['model', 'confidence', 'denoise', 'mask_blur', 'padding', 'prompt', 'neg', 'max_masks', 'mask_merge', 'filter_method', 'cn_model', 'cn_module', 'cn_weight', 'cn_guidance_start', 'cn_guidance_end'].forEach(field => {
            const el = document.getElementById(`${mode}_adetailer_${n}_${field}`);
            if (el) localStorage.setItem(`bojro_${mode}_adetailer_${n}_${field}`, el.value);
        });
    }
    // Keep the master switch in step when any pass is toggled directly.
    const masterEl = document.getElementById(`${mode}_adetailer_master`);
    if (masterEl) masterEl.checked = anyEnabled;
}

// --- NEVER OOM (Forge's built-in tiled-VAE / UNet-offload script) ---
window.saveNeverOom = function(mode) {
    const vaeEl = document.getElementById(`${mode}_neveroom_vae`);
    const unetEl = document.getElementById(`${mode}_neveroom_unet`);
    localStorage.setItem(`bojro_neveroom_vae_${mode}`, vaeEl ? vaeEl.checked : false);
    localStorage.setItem(`bojro_neveroom_unet_${mode}`, unetEl ? unetEl.checked : false);
}

window.initNeverOom = function() {
    ['xl', 'flux', 'qwen', 'anima', 'krea', 'inp', 'img2img'].forEach(mode => {
        const vaeEl = document.getElementById(`${mode}_neveroom_vae`);
        const unetEl = document.getElementById(`${mode}_neveroom_unet`);
        if (vaeEl) vaeEl.checked = localStorage.getItem(`bojro_neveroom_vae_${mode}`) === 'true';
        if (unetEl) unetEl.checked = localStorage.getItem(`bojro_neveroom_unet_${mode}`) === 'true';
    });
}

window.initAdetailer = function() {
    const defaultModelPerPass = { 1: 'face_yolov8n.pt', 2: 'hand_yolov8n.pt', 3: 'person_yolov8n-seg.pt', 4: 'face_yolov8n.pt', 5: 'face_yolov8n.pt', 6: 'hand_yolov8n.pt', 7: 'person_yolov8n-seg.pt', 8: 'face_yolov8n.pt' };
    ['xl', 'img2img', 'inp', 'qwen', 'flux', 'anima', 'krea'].forEach(mode => {
        let anyEnabled = false;
        for (let n = 1; n <= 8; n++) {
            const sEnable = localStorage.getItem(`bojro_${mode}_adetailer_${n}_enable`);
            const elEnable = document.getElementById(`${mode}_adetailer_${n}_enable`);
            const isEnabled = (sEnable === 'true');
            if (elEnable) elEnable.checked = isEnabled;
            if (isEnabled) anyEnabled = true;

            // Checkbox, restored separately from loadVal(). Defaults to checked, matching the previous hardcoded ad_inpaint_only_masked.
            const inpaintOnlyMaskedEl = document.getElementById(`${mode}_adetailer_${n}_inpaint_only_masked`);
            if (inpaintOnlyMaskedEl) {
                const sInpaintOnlyMasked = localStorage.getItem(`bojro_${mode}_adetailer_${n}_inpaint_only_masked`);
                inpaintOnlyMaskedEl.checked = sInpaintOnlyMasked !== null ? (sInpaintOnlyMasked === 'true') : true;
            }

            // LoRA Link is new and opt-in, so it defaults to unchecked.
            const loraLinkEl = document.getElementById(`${mode}_adetailer_${n}_lora_link`);
            if (loraLinkEl) {
                loraLinkEl.checked = localStorage.getItem(`bojro_${mode}_adetailer_${n}_lora_link`) === 'true';
            }

            const loadVal = (field, def) => {
                const el = document.getElementById(`${mode}_adetailer_${n}_${field}`);
                const saved = localStorage.getItem(`bojro_${mode}_adetailer_${n}_${field}`);
                if (el) el.value = saved !== null ? saved : def;
            };
            loadVal('model', defaultModelPerPass[n]);
            loadVal('confidence', 0.3);
            loadVal('denoise', 0.4);
            loadVal('mask_blur', 4);
            loadVal('padding', 32);
            loadVal('prompt', '');
            loadVal('neg', '');
            loadVal('max_masks', '');
            loadVal('mask_merge', 'None');
            loadVal('filter_method', 'Area');
            syncAdetailerFilterMethodButtons(mode, n);
            syncAdetailerMaskMergeButtons(mode, n);
            // The model list is populated by populateAdetailerControlNetModels() (network.js); this restores only weight/guidance.
            loadVal('cn_weight', 1.0);
            loadVal('cn_guidance_start', 0.0);
            loadVal('cn_guidance_end', 1.0);
        }

        // Master switch reflects whether any pass is enabled; it has no stored value of its own.
        const masterEl = document.getElementById(`${mode}_adetailer_master`);
        if (masterEl) masterEl.checked = anyEnabled;

        initGenericSectionClosed(`grp-${mode}-adetailer`, `arr-${mode}-adetailer`, `bojro_vis_${mode}_adetailer`);
        for (let n = 1; n <= 8; n++) {
            initGenericSectionClosed(`grp-${mode}-adetailer-${n}-more`, `arr-${mode}-adetailer-${n}-more`, `bojro_vis_${mode}_adetailer_${n}_more`);
        }
    });
}

// Master ADetailer switch: off disables every pass but remembers which were on; on restores those (first use: pass 1 only).
window.toggleAdetailerMaster = function(mode, isOn) {
    if (isOn) {
        const remembered = localStorage.getItem(`bojro_${mode}_adetailer_remembered_enables`);
        const enables = remembered ? JSON.parse(remembered) : [true, false, false, false, false, false, false, false];
        for (let n = 1; n <= 8; n++) {
            const el = document.getElementById(`${mode}_adetailer_${n}_enable`);
            if (el) el.checked = !!enables[n - 1];
        }
    } else {
        const current = [];
        for (let n = 1; n <= 8; n++) {
            const el = document.getElementById(`${mode}_adetailer_${n}_enable`);
            current.push(el ? el.checked : false);
        }
        // Only remember a non-empty state, so turning every pass off then the master off doesn't overwrite a remembered set.
        if (current.some(v => v)) {
            localStorage.setItem(`bojro_${mode}_adetailer_remembered_enables`, JSON.stringify(current));
        }
        for (let n = 1; n <= 8; n++) {
            const el = document.getElementById(`${mode}_adetailer_${n}_enable`);
            if (el) el.checked = false;
        }
    }
    saveAdetailer(mode);
}

window.initHr = function() {
    ['xl', 'flux', 'qwen', 'anima', 'krea'].forEach(mode => {
        const sEnable = localStorage.getItem(`bojro_${mode}_hr_enable`);
        const elEnable = document.getElementById(`${mode}_hr_enable`);
        if (elEnable) elEnable.checked = (sEnable === 'true');

        const loadVal = (id, def) => {
            const el = document.getElementById(`${mode}_hr_${id}`);
            const saved = localStorage.getItem(`bojro_${mode}_hr_${id}`);
            if (el) el.value = saved !== null ? saved : def;
        };

        loadVal('steps', 6);
        loadVal('cfg', 1.0);
        loadVal('denoise', 0.4);
        loadVal('scale', 1.5);
        
        initGenericSectionClosed(`grp-${mode}-hr`, `arr-${mode}-hr`, `bojro_vis_${mode}_hr`);
    });
}

// --- GLOBAL UI PERSISTENCE INITIALIZER ---

window.initGlobalUiState = function() {
    loadSavedTheme(); 
    
    // Main Gen Tab Sections
    initGenericSection('grp-models', 'arr-models', 'bojro_vis_models');
    initGenericSection('grp-xl', 'arr-xl', 'bojro_vis_xl');
    initGenericSection('grp-flux', 'arr-flux', 'bojro_vis_flux');
    initGenericSection('grp-qwen', 'arr-qwen', 'bojro_vis_qwen');
    initGenericSection('grp-flux-trident', 'arr-flux-trident', 'bojro_vis_flux_trident');
    initGenericSection('grp-qwen-modules', 'arr-qwen-modules', 'bojro_vis_qwen_modules');
    initGenericSection('grp-anima-modules', 'arr-anima-modules', 'bojro_vis_anima_modules');
    initGenericSection('grp-krea-modules', 'arr-krea-modules', 'bojro_vis_krea_modules');
    initGenericSection('fbc-settings-content', 'fbc-arrow', 'bojro_vis_fbc');
    initGenericSectionClosed('grp-xl-neveroom', 'arr-xl-neveroom', 'bojro_vis_xl_neveroom');
    initGenericSectionClosed('grp-flux-neveroom', 'arr-flux-neveroom', 'bojro_vis_flux_neveroom');
    initGenericSectionClosed('grp-qwen-neveroom', 'arr-qwen-neveroom', 'bojro_vis_qwen_neveroom');
    initGenericSectionClosed('grp-anima-neveroom', 'arr-anima-neveroom', 'bojro_vis_anima_neveroom');
    initGenericSectionClosed('grp-krea-neveroom', 'arr-krea-neveroom', 'bojro_vis_krea_neveroom');
    initGenericSectionClosed('grp-inp-neveroom', 'arr-inp-neveroom', 'bojro_vis_inp_neveroom');
    initGenericSectionClosed('grp-img2img-neveroom', 'arr-img2img-neveroom', 'bojro_vis_img2img_neveroom');
    
    // Config sections start closed, one open at most (toggleGeneric()).
    let cfgOpen = false;
    document.querySelectorAll('#view-cfg .cfg-accordion-content').forEach(section => {
        const key = 'bojro_vis_' + section.id.replace(/-/g, '_');
        initGenericSectionClosed(section.id, 'arr-' + section.id, key);
        if (section.classList.contains('hidden')) return;
        if (cfgOpen) toggleGeneric(section.id, 'arr-' + section.id, key);
        cfgOpen = true;
    });
}

// --- GENERIC SECTION TOGGLER (PERSISTENT) ---
// initGenericSection()/initGenericSectionClosed() live in an early inline <script> after <body> opens, because sections call them before this file loads.

window.toggleGeneric = function(contentId, arrowId, storageKey) {
    const content = document.getElementById(contentId);
    const arrow = document.getElementById(arrowId);
    const isHidden = content.classList.contains('hidden');

    if (isHidden) {
        // Config: one section open at a time (not while searching).
        const cfgOne = content.classList.contains('cfg-accordion-content') && !document.getElementById('cfgSearch')?.value.trim();
        if (cfgOne) {
            document.querySelectorAll('#view-cfg .cfg-accordion-content:not(.hidden)').forEach(other => {
                if (other === content) return;
                toggleGeneric(other.id, 'arr-' + other.id, 'bojro_vis_' + other.id.replace(/-/g, '_'));
            });
        }
        content.classList.remove('hidden');
        // Keep the opened section in view: its header no higher than the top (a section closing above moves it up),
        // and as much of its content as fits above the dock.
        if (cfgOne) {
            const headerTop = content.previousElementSibling?.getBoundingClientRect().top ?? 0;
            const dockTop = document.querySelector('.glass-dock')?.getBoundingClientRect().top ?? window.innerHeight;
            const hiddenBelow = content.getBoundingClientRect().bottom - (dockTop - 8);
            let by = 0;
            if (headerTop < 8) by = headerTop - 8;
            else if (hiddenBelow > 0) by = Math.min(hiddenBelow, headerTop - 8);
            if (by) window.scrollBy({ top: by, behavior: 'instant' });
        }
        arrow.style.transform = 'rotate(0deg)'; 
        localStorage.setItem(storageKey, 'open');
    } else {
        content.classList.add('hidden');
        arrow.style.transform = 'rotate(-90deg)'; 
        localStorage.setItem(storageKey, 'closed');
    }
}


// True just after a text box lost focus (the keyboard going) while the window is still shorter than the tallest it has
// been at this width: its new size hasn't come through yet. Fitted again 0.4s and 1.6s after the box lost focus.
let fullWindowHeight = { width: 0, height: 0 };
let textBoxLeftAt = 0;
const isTextBox = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|number|email|url|password|tel)$/i.test(el.type || 'text')));
document.addEventListener('focusout', e => {
    if (!isTextBox(e.target)) return;
    textBoxLeftAt = Date.now();
    [400, 1600].forEach(ms => setTimeout(() => { if (typeof fitAllLists === 'function') fitAllLists(); }, ms));
});
function windowAwaitingFullHeight() {
    const w = window.innerWidth, h = window.innerHeight;
    if (fullWindowHeight.width !== w) fullWindowHeight = { width: w, height: 0 };
    fullWindowHeight.height = Math.max(fullWindowHeight.height, h);
    return !isTextBox(document.activeElement) && Date.now() - textBoxLeftAt < 1500 && h < fullWindowHeight.height - 50;
}
// The most a window can grow to: the screen less a margin when its window is centred (it moves up as it grows),
// otherwise the space below its top.
function roomBelowWindowTop(content, box) {
    const ps = content.parentElement && getComputedStyle(content.parentElement);
    const centred = ps && ps.display === 'flex' && ps.flexDirection === 'column' && ps.justifyContent === 'center';
    return centred ? window.innerHeight - 20 : window.innerHeight - box.top - 10;
}

// A window's max-height in px: a length, a percentage of its parent's inner height, or calc(N% + Mpx).
function maxHeightOf(content, cs) {
    const m = cs.maxHeight, pct = /([\d.]+)%/.exec(m), add = /\+\s*([\d.]+)px/.exec(m);
    if (!pct) return parseFloat(m);
    const ps = getComputedStyle(content.parentElement);
    const inner = content.parentElement.clientHeight - parseFloat(ps.paddingTop) - parseFloat(ps.paddingBottom);
    return +pct[1] / 100 * inner + (add ? +add[1] : 0);
}

// Fits a list in a window to the whole rows that fit on screen. perRow: items per row; maxItems caps a one-per-row
// list; fewer shows that many fewer. Not shrunk while a text box has focus or the keyboard is up.
window.fitListToWholeRows = function (list, items, perRow = 1, maxItems = 0, fewer = 0) {
    const wrap = list && list.parentElement;
    const content = list && list.closest('.modal-content');
    if (!wrap || !content || !content.getClientRects().length) return;
    if (wrap.style.maxHeight && (isTextBox(document.activeElement) || (typeof isKeyboardUp === 'function' && isKeyboardUp()) || windowAwaitingFullHeight())) return;
    const before = wrap.style.maxHeight;
    fitListRows(list, items, perRow, maxItems, fewer, wrap, content);
    if (window.dbg && wrap.style.maxHeight !== before) {
        window.dbg(`list ${list.id || '?'} fitted ${before || 'none'} -> ${wrap.style.maxHeight || 'none'} (window ${window.innerHeight}, viewport ${Math.round(window.visualViewport ? window.visualViewport.height : 0)}, screen ${screen.height})`);
    }
};
function fitListRows(list, items, perRow, maxItems, fewer, wrap, content) {
    if (items.length <= perRow) { wrap.style.maxHeight = ''; return; }
    if (perRow === 1) return fitListToWholeItems(list, items, wrap, content, maxItems, fewer);
    const first = items[0].getBoundingClientRect();
    const stride = items[perRow].getBoundingClientRect().top - first.top;
    if (!(stride > 0) || !(first.height > 0)) return;
    const gap = Math.max(0, stride - first.height);
    const padTop = first.top - list.getBoundingClientRect().top + list.scrollTop;
    const cs = getComputedStyle(content);
    let maxContent = maxHeightOf(content, cs);
    const box = content.getBoundingClientRect();
    maxContent = Math.min(maxContent > 0 ? maxContent : Infinity, roomBelowWindowTop(content, box));
    const room = maxContent - (box.height - wrap.getBoundingClientRect().height);
    // Space under the last item; the slack below the last whole row is chosen so the list is clean at both ends of its scroll.
    const last = items[items.length - 1].getBoundingClientRect();
    const endPad = list.scrollHeight - (last.bottom - list.getBoundingClientRect().top + list.scrollTop);
    const low = Math.max(0, endPad - padTop), high = Math.min(gap, gap + endPad - padTop);
    const slack = low <= high ? (low + high) / 2 : gap / 2;
    let rows = Math.max(1, Math.floor((room - padTop - first.height - slack) / stride) + 1);
    // maxItems: no more rows than they fill.
    if (maxItems > 0) rows = Math.min(rows, Math.ceil(maxItems / perRow));
    if (items.length <= rows * perRow) { wrap.style.maxHeight = ''; return; }
    wrap.style.maxHeight = Math.round(padTop + (rows - 1) * stride + first.height + slack) + 'px';
}

// One item per row, any heights: as many whole items as fit, with a little space before the next; the bottom padding
// is set so the list also ends cleanly when scrolled to the end.
function fitListToWholeItems(list, items, wrap, content, maxItems = 0, fewer = 0) {
    const cs = getComputedStyle(content);
    let maxContent = maxHeightOf(content, cs);
    const box = content.getBoundingClientRect();
    maxContent = Math.min(maxContent > 0 ? maxContent : Infinity, roomBelowWindowTop(content, box));
    let room = Math.floor(maxContent - (box.height - wrap.getBoundingClientRect().height));
    // The last item's own bottom margin left out, so the list ends where its last item does (plus the padding below).
    list.classList.add('fit-whole-items');
    if (list.dataset.padBase === undefined) list.dataset.padBase = parseFloat(getComputedStyle(list).paddingBottom) || 0;
    const padBase = +list.dataset.padBase;
    list.style.paddingBottom = padBase + 'px';
    const origin = list.getBoundingClientRect().top - list.scrollTop;
    const rows = [...items].map(el => { const r = el.getBoundingClientRect(); return { top: r.top - origin, bottom: r.bottom - origin }; });
    const total = list.scrollHeight;
    // No further than the gap after the last item allowed.
    if (maxItems && rows.length > maxItems) room = Math.min(room, Math.floor(rows[maxItems].top));
    if (total <= room) { wrap.style.maxHeight = ''; return; }
    // No item crosses the line at y: with 1px to spare where items have gaps between them, within half a pixel where
    // they touch.
    const minGap = Math.min(...rows.slice(1).map((r, i) => r.top - rows[i].bottom));
    const spare = minGap >= 2 ? 1 : -0.5;
    const clearAt = y => {
        // The last item starting above y + spare (items are in order and don't overlap) must end by y - spare.
        let lo = 0, hi = rows.length - 1, i = -1;
        while (lo <= hi) { const mid = (lo + hi) >> 1; if (rows[mid].top < y + spare) { i = mid; lo = mid + 1; } else hi = mid - 1; }
        return i < 0 || rows[i].bottom <= y - spare;
    };
    const pick = maxAdd => {
        let best = null;
        for (let h = room; h > 0 && h > room - 400; h--) {
            if (!clearAt(h)) continue;
            const whole = rows.filter(r => r.bottom <= h);
            if (!whole.length) continue;
            if (best && whole.length < best.count) break;
            const last = whole[whole.length - 1], next = rows[whole.length];
            let add = -1;
            if (maxAdd < 0) add = Math.max(0, Math.round(h - last.bottom));
            else for (let a = 0; a <= maxAdd; a++) if (clearAt(total + a - h)) { add = a; break; }
            if (add < 0) continue;
            const gap = next ? next.top - last.bottom : 0;
            const score = Math.abs(h - last.bottom - gap / 2) + add / 4;
            if (!best || score < best.score) best = { h, add, count: whole.length, score };
        }
        return best;
    };
    // Clean at the end with up to 12px of extra padding, else the end gets the top's gap under its last item.
    const most = () => { const clean = pick(12), loose = pick(-1); return !clean || (loose && loose.count > clean.count) ? loose : clean; };
    let best = most();
    // fewer: that many whole items fewer, the list ending before the first of them.
    if (best && fewer && best.count > fewer) {
        room = Math.floor(rows[best.count - fewer].top);
        best = most();
    }
    if (!best) { wrap.style.maxHeight = room + 'px'; return; }
    list.style.paddingBottom = (padBase + best.add) + 'px';
    wrap.style.maxHeight = best.h + 'px';
}

let fitListsTimer = 0, fitListsLateTimer = 0;
function fitAllLists() {
    if (window.LoraManager) window.LoraManager.fitListHeight();
    if (window.StyleManager) window.StyleManager.fitListHeight();
    if (window.SaacManager && typeof window.SaacManager.refitGrid === 'function') window.SaacManager.refitGrid();
    if (typeof fitCheckpointListHeight === 'function') fitCheckpointListHeight();
    if (typeof fitFolderManagerList === 'function') fitFolderManagerList();
    if (typeof fitDataUsageListHeight === 'function') fitDataUsageListHeight();
    if (typeof fitImg2imgPresetListHeight === 'function') fitImg2imgPresetListHeight();
}
// Fitted soon after a change of size, and again once things have settled.
const refitLists = () => {
    clearTimeout(fitListsTimer);
    clearTimeout(fitListsLateTimer);
    fitListsTimer = setTimeout(fitAllLists, 150);
    fitListsLateTimer = setTimeout(fitAllLists, 600);
};
window.addEventListener('resize', () => { windowAwaitingFullHeight(); refitLists(); });
windowAwaitingFullHeight();
// The keyboard coming and going (it doesn't always resize the window).
if (window.visualViewport) window.visualViewport.addEventListener('resize', refitLists);

if (window.StyleManager && typeof window.StyleManager.init === 'function') {
    window.StyleManager.init();
}
// Draggable scroll thumb beside .has-scroll-indicator lists.
(function () {
    function setUp(list) {
        const bar = list.parentElement.querySelector('.scroll-indicator');
        const thumb = bar && bar.firstElementChild;
        if (!thumb) return;
        let timer = null;
        let dragOffset = null;
        let shown = null;
        const roomForBar = list.style.paddingRight;
        const scale = () => (typeof list.indicatorScale === 'function' ? list.indicatorScale() : 1);
        function metrics() {
            const full = list.scrollHeight * scale();
            const h = bar.clientHeight;
            const size = Math.min(h, Math.max(28, h * list.clientHeight / full));
            return { full, h, size, max: full - list.clientHeight };
        }
        function update() {
            const m = metrics();
            const on = m.max > 1;
            bar.classList.toggle('visible', on);
            if (on !== shown) {
                shown = on;
                list.style.paddingRight = on ? roomForBar : getComputedStyle(list).paddingLeft;
            }
            if (!on) return;
            thumb.style.height = m.size + 'px';
            thumb.style.top = Math.max(0, Math.min(m.h - m.size, (m.h - m.size) * list.scrollTop / m.max)) + 'px';
        }
        function dragTo(clientY) {
            const m = metrics();
            const top = clientY - bar.getBoundingClientRect().top - dragOffset;
            const frac = Math.max(0, Math.min(1, top / (m.h - m.size)));
            // A list that renders in batches grows only as far as the drag needs.
            if (typeof list.indicatorGrow === 'function') {
                const target = frac * m.max;
                list.indicatorGrow(target);
                list.scrollTop = frac >= 1 ? list.scrollHeight : target;
                return;
            }
            list.scrollTop = frac * (list.scrollHeight - list.clientHeight);
        }
        list.addEventListener('scroll', () => {
            update();
            bar.classList.add('scrolling');
            clearTimeout(timer);
            timer = setTimeout(() => { if (dragOffset === null) bar.classList.remove('scrolling'); }, 700);
        }, { passive: true });
        bar.addEventListener('pointerdown', (e) => {
            if (!bar.classList.contains('visible')) return;
            if (typeof list.indicatorPrepareDrag === 'function') list.indicatorPrepareDrag();
            update();
            const r = thumb.getBoundingClientRect();
            dragOffset = (e.clientY >= r.top && e.clientY <= r.bottom) ? e.clientY - r.top : r.height / 2;
            bar.setPointerCapture(e.pointerId);
            bar.classList.add('scrolling', 'dragging');
            dragTo(e.clientY);
            e.preventDefault();
        });
        bar.addEventListener('pointermove', (e) => {
            if (dragOffset !== null) dragTo(e.clientY);
        });
        const end = () => {
            if (dragOffset === null) return;
            dragOffset = null;
            bar.classList.remove('dragging');
            timer = setTimeout(() => bar.classList.remove('scrolling'), 700);
        };
        bar.addEventListener('pointerup', end);
        bar.addEventListener('pointercancel', end);
        new MutationObserver(update).observe(list, { childList: true });
        new ResizeObserver(update).observe(list);
        update();
    }
    document.querySelectorAll('.has-scroll-indicator').forEach(setUp);
    // For lists made later (the LoRA group picker, loragroups.js).
    window.attachScrollIndicator = setUp;
})();

// The title's glitch repaints every frame, which makes scrolling stutter; it pauses while scrolling or off screen.
;(function () {
    const title = document.getElementById('appTitle');
    if (!title) return;
    let onScreen = true, scrollTimer = 0;
    const sync = () => title.classList.toggle('glitch-paused', !onScreen || scrollTimer !== 0);
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(title);
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => { scrollTimer = 0; sync(); }, 300);
        sync();
    }, { passive: true, capture: true });
})();
