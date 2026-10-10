// Slider widgets for ControlNet Weight (one ball) and Guidance start/end (two balls), in the ControlNet
// sections and ADetailer's ControlNet. Steps of 0.05; a ball must be touched to move (the track
// scrolls the page). The hidden <input type=number> stays the single source of truth, so payload
// builders, save functions and presets keep working through .value. The widget stays in step with
// the input both ways (dragging writes it and fires input/change; programmatic .value changes are
// caught by watching the property). Ball position is a CSS --p property (0..1), so sliders inside
// hidden sections are already placed when shown.
(function () {
    'use strict';

    // Hysteresis as the older thumb-only sliders (editor.js).
    const HYSTERESIS_STEP_FRACTION = 0.4;

    function readNumber(input, fallback) {
        const v = parseFloat(input.value);
        return isNaN(v) ? fallback : v;
    }
    function toFraction(value, min, max) {
        return max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
    }
    function format(value) {
        return Number(value).toFixed(2);
    }

    // Runs onChange after any change to input.value, including assignments from other code.
    function watchValue(input, onChange) {
        const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        Object.defineProperty(input, 'value', {
            configurable: true,
            enumerable: true,
            get() { return native.get.call(this); },
            set(v) { native.set.call(this, v); onChange(); }
        });
        input.addEventListener('input', onChange);
        input.addEventListener('change', onChange);
    }

    // inputs: one number input (Weight) or [start, end] (Guidance). anchorCols: original .col wrappers to hide.
    function build(inputs, anchorCols, labelText) {
        const isRange = inputs.length === 2;
        const first = inputs[0];
        const min = parseFloat(first.min);
        const max = parseFloat(first.max);
        const step = parseFloat(first.step) || 0.05;
        const decimals = (String(step).split('.')[1] || '').length;

        const block = document.createElement('div');
        block.className = 'col cn-slider-col';
        block.innerHTML =
            `<div class="cn-slider-head"><label>${labelText} (${min}-${max})</label><span class="cn-slider-val"></span></div>` +
            `<div class="cn-slider-wrap"><div class="cn-slider-track">${isRange ? '<div class="cn-slider-fill"></div>' : ''}</div></div>`;
        const wrap = block.querySelector('.cn-slider-wrap');
        const fill = block.querySelector('.cn-slider-fill');
        const readout = block.querySelector('.cn-slider-val');

        const thumbs = inputs.map((input, i) => {
            const thumb = document.createElement('div');
            thumb.className = 'slider-fake-thumb';
            thumb.setAttribute('role', 'slider');
            thumb.setAttribute('aria-label', isRange ? (i === 0 ? 'Guidance start' : 'Guidance end') : labelText);
            thumb.setAttribute('aria-valuemin', String(min));
            thumb.setAttribute('aria-valuemax', String(max));
            wrap.appendChild(thumb);
            return thumb;
        });

        function values() {
            return inputs.map((input, i) => readNumber(input, i === 1 ? max : min));
        }

        function sync() {
            const vs = values();
            vs.forEach((v, i) => {
                thumbs[i].style.setProperty('--p', toFraction(v, min, max));
                thumbs[i].setAttribute('aria-valuenow', String(v));
            });
            if (isRange) {
                const lo = Math.min(vs[0], vs[1]);
                const hi = Math.max(vs[0], vs[1]);
                fill.style.setProperty('--p1', toFraction(lo, min, max));
                fill.style.setProperty('--p2', toFraction(hi, min, max));
                readout.textContent = `${format(vs[0])} - ${format(vs[1])}`;
            } else {
                readout.textContent = format(vs[0]);
            }
        }

        // ---- dragging: only a ball moves it ----
        let drag = null; // { index, pointerId, lastStepIndex }

        // Which ball a touch grabbed, chosen by distance because the 36px targets can overlap. Returns the index,
        // -1 for none, or { tie: [left, right] } settled by the direction the finger moves first.
        function pickBall(e) {
            const hits = [];
            thumbs.forEach((thumb, i) => {
                const r = thumb.getBoundingClientRect();
                if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
                    hits.push({ i, centre: r.left + r.width / 2 });
                }
            });
            if (!hits.length) return -1;
            hits.sort((a, b) => Math.abs(e.clientX - a.centre) - Math.abs(e.clientX - b.centre));
            if (hits.length > 1 && Math.abs(e.clientX - hits[0].centre) === Math.abs(e.clientX - hits[1].centre)) {
                return { tie: [Math.min(hits[0].i, hits[1].i), Math.max(hits[0].i, hits[1].i)] };
            }
            return hits[0].i;
        }

        function valueFromClientX(clientX) {
            const rect = wrap.querySelector('.cn-slider-track').getBoundingClientRect();
            const raw = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
            const fraction = Math.min(1, Math.max(0, raw));
            const rawStepIndex = (fraction * (max - min)) / step;
            let stepIndex;
            if (drag.lastStepIndex === null || Math.abs(rawStepIndex - drag.lastStepIndex) > 0.5 + HYSTERESIS_STEP_FRACTION) {
                stepIndex = Math.round(rawStepIndex);
            } else {
                stepIndex = drag.lastStepIndex;
            }
            drag.lastStepIndex = stepIndex;
            // toFixed() so floating-point steps can't leave 0.7000000000000001 in the field
            let v = parseFloat(Math.min(max, Math.max(min, min + stepIndex * step)).toFixed(decimals));
            if (isRange) {
                // Balls can't cross or coincide: always at least one step apart.
                const other = readNumber(inputs[1 - drag.index], drag.index === 0 ? max : min);
                v = drag.index === 0
                    ? Math.min(v, parseFloat((other - step).toFixed(decimals)))
                    : Math.max(v, parseFloat((other + step).toFixed(decimals)));
                v = parseFloat(Math.min(max, Math.max(min, v)).toFixed(decimals));
            }
            return v;
        }

        function apply(clientX) {
            const input = inputs[drag.index];
            const v = valueFromClientX(clientX);
            if (readNumber(input, NaN) === v) return;
            input.value = v; // the watcher above re-syncs the widget
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        wrap.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('.slider-fake-thumb')) return; // touching the track does nothing
            const picked = pickBall(e);
            if (picked === -1) return;
            e.preventDefault();
            const tie = typeof picked === 'object' ? picked.tie : null;
            // index stays null for an undecided tie (see pickBall) until the finger moves
            drag = { index: tie ? null : picked, tie, startX: e.clientX, pointerId: e.pointerId, lastStepIndex: null };
            try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
            if (drag.index !== null) {
                thumbs[drag.index].classList.add('dragging');
                apply(e.clientX);
            }
        });
        wrap.addEventListener('pointermove', (e) => {
            if (!drag || e.pointerId !== drag.pointerId) return;
            if (drag.index === null) {
                const dx = e.clientX - drag.startX;
                if (Math.abs(dx) < 2) return; // not moving yet - nothing to decide on
                drag.index = dx < 0 ? drag.tie[0] : drag.tie[1];
                thumbs[drag.index].classList.add('dragging');
            }
            apply(e.clientX);
        });
        const endDrag = (e) => {
            if (!drag || e.pointerId !== drag.pointerId) return;
            const finished = drag;
            drag = null;
            try { wrap.releasePointerCapture(e.pointerId); } catch (err) {}
            if (finished.index === null) return; // an undecided tie that never moved: nothing changed, nothing to commit
            thumbs[finished.index].classList.remove('dragging');
            // Commit: what the inline onchange handlers (which save the value) run on.
            inputs[finished.index].dispatchEvent(new Event('change', { bubbles: true }));
        };
        wrap.addEventListener('pointerup', endDrag);
        wrap.addEventListener('pointercancel', endDrag);

        inputs.forEach(input => watchValue(input, sync));
        anchorCols[0].parentNode.insertBefore(block, anchorCols[0]);
        anchorCols.forEach(col => col.classList.add('cn-slider-source'));
        // Lets the row hold the slider at full width (see .cn-slider-row, style.css).
        anchorCols[0].parentNode.classList.add('cn-slider-row');
        sync();
        return block;
    }

    // Weight: "<mode>_cn_<unit>_weight" and "<mode>_adetailer_<pass>_cn_weight".
    // Guidance: the matching "..._start"/"..._end" and "..._cn_guidance_start"/"..._cn_guidance_end" pairs.
    const WEIGHT_ID = /^[a-z0-9]+_(?:cn_\d+_weight|adetailer_\d+_cn_weight)$/;
    const GUIDANCE_START_ID = /^([a-z0-9]+_(?:cn_\d+_)|[a-z0-9]+_adetailer_\d+_cn_guidance_)start$/;

    window.upgradeControlNetSliders = function (root) {
        root = root || document;
        let built = { weight: 0, guidance: 0, skipped: [] };
        root.querySelectorAll('input[type="number"]').forEach(input => {
            if (input.dataset.cnSlider || !input.id) return;
            const col = input.closest('.col');
            if (WEIGHT_ID.test(input.id)) {
                if (!col) { built.skipped.push(input.id); return; }
                input.dataset.cnSlider = '1';
                build([input], [col], 'Weight');
                built.weight++;
                return;
            }
            const m = input.id.match(GUIDANCE_START_ID);
            if (m) {
                const end = document.getElementById(`${m[1]}end`);
                const endCol = end && end.closest('.col');
                // Both columns must share one row, or there's nowhere sensible to put a single combined slider
                if (!end || !col || !endCol || col.parentNode !== endCol.parentNode) { built.skipped.push(input.id); return; }
                input.dataset.cnSlider = '1';
                end.dataset.cnSlider = '1';
                build([input, end], [col, endCol], 'Guidance');
                built.guidance++;
            }
        });
        return built;
    };
})();
