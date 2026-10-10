/**
 * BOJRO SAA CLIENT (Character Select)
 * Version: IndexedDB Support for Large Files (125MB+)
 */
window.SaacManager = {
    data: [], 
    imgDb: null, 
    displayedCount: 0,
    BATCH_SIZE: 30,
    observer: null,
    isLoaded: false,
    filteredData: [],
    currentXhr: null, 
    EXTERNAL_DB_URL: 'https://huggingface.co/datasets/Resolvexx/exdb/resolve/main/exact_db.json',
    DB_NAME: 'SaacDatabase',
    STORE_NAME: 'ImageCache',

    // --- DATABASE LOGIC (INDEXEDDB) ---
    getDb: function() {
        return new Promise((resolve) => {
            const request = indexedDB.open(this.DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                e.target.result.createObjectStore(this.STORE_NAME);
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = () => resolve(null);
        });
    },

    saveToCache: async function(data) {
        const db = await this.getDb();
        if (!db) return;
        const tx = db.transaction(this.STORE_NAME, 'readwrite');
        tx.objectStore(this.STORE_NAME).put(data, 'exact_db');
    },

    loadFromCache: async function() {
        const db = await this.getDb();
        if (!db) return null;
        return new Promise((resolve) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const request = tx.objectStore(this.STORE_NAME).get('exact_db');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
    },

    // Whether the character database is already cached on-device.
    hasCachedDb: async function() {
        try {
            const cached = await this.loadFromCache();
            return !!cached;
        } catch (e) {
            return false;
        }
    },

    // Deletes the cached database from disk (used by "Reset App Configuration").
    clearCache: async function() {
        this.imgDb = null;
        this.isLoaded = false;
        try {
            const db = await this.getDb();
            if (!db) return;
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).delete('exact_db');
        } catch (e) {
            console.error("SAAC cache clear failed:", e);
        }
    },

    // --- CORE LOGIC ---
    init: async function() {
        if(this.isLoaded) return;
        try {
            const response = await fetch('assets/saac_data/wai_characters.csv');
            const csvText = await response.text();
            this.data = csvText.split('\n').filter(l=>l.trim().length>0).map(l=>{
                const p = l.split(','); if(p.length<2) return null;
                const tag = p[1].trim();
                const name = tag.split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
                return { name, tag };
            }).filter(x=>x);
            
            document.getElementById('saacSearch')?.addEventListener('input', () => this.render());
            this.isLoaded = true;
        } catch(e) { console.error("SAAC Init failed", e); }
    },

    loadImages: async function() {
        if (this.imgDb) return true;
        
        // Try IndexedDB first
        const cachedData = await this.loadFromCache();
        if (cachedData) {
            try {
                this.imgDb = JSON.parse(cachedData);
                return true;
            } catch(e) {
                console.error("Cache Parse Error", e);
            }
        }
        
        return await this.downloadDb();
    },

    downloadDb: function() {
        return new Promise((resolve) => {
            const grid = document.getElementById('saacGrid');
            if (!grid) return resolve(false);

            grid.innerHTML = `
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 85%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; font-family: var(--font-main); color: var(--text-main); z-index: 100;">
                    <div style="margin-bottom: 15px; font-weight: bold; letter-spacing: 1px;">SYNCING DATABASE...<br>DO NOT CLOSE THIS POP UP</div>
                    <div style="width: 100%; height: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; overflow: hidden; margin-bottom: 12px;">
                        <div id="saac-progress-bar" style="width: 0%; height: 100%; background: var(--accent-gradient); box-shadow: 0 0 10px var(--accent-primary); transition: width 0.1s;"></div>
                    </div>
                    <div id="saac-progress-text" style="font-size: 12px; color: var(--text-muted);">Requesting access...</div>
                </div>`;

            if (this.currentXhr) this.currentXhr.abort();
            this.currentXhr = new XMLHttpRequest();
            const xhr = this.currentXhr;
            
            xhr.open('GET', this.EXTERNAL_DB_URL, true);

            xhr.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = (event.loaded / event.total) * 100;
                    const progressFill = document.getElementById('saac-progress-bar');
                    const progressText = document.getElementById('saac-progress-text');
                    if (progressFill) progressFill.style.width = percent + '%';
                    if (progressText) {
                        const loadedMb = (event.loaded / (1024 * 1024)).toFixed(1);
                        const totalMb = (event.total / (1024 * 1024)).toFixed(1);
                        progressText.innerText = `${Math.round(percent)}% (${loadedMb}MB / ${totalMb}MB)`;
                    }
                }
            };

            xhr.onload = () => {
                if (xhr.status === 200) {
                    const progressText = document.getElementById('saac-progress-text');
                    if (progressText) progressText.innerText = "Processing 125MB Data...";
                    
                    setTimeout(async () => {
                        try {
                            const rawText = xhr.responseText;
                            this.imgDb = JSON.parse(rawText);
                            await this.saveToCache(rawText); // Save to IndexedDB
                            this.currentXhr = null;
                            resolve(true);
                        } catch (e) {
                            grid.innerHTML = `<div style="padding:40px; color:var(--error); text-align:center;">
                                Parse Error: Data too large.<br>
                                <button onclick="location.reload()" style="margin-top:10px; padding:5px 10px; cursor:pointer;">Reload UI</button>
                            </div>`;
                            resolve(false);
                        }
                    }, 500); 
                } else {
                    grid.innerHTML = `<div style="padding:40px; color:var(--error); text-align:center;">Error: ${xhr.status}</div>`;
                    resolve(false);
                }
            };

            xhr.onerror = () => {
                grid.innerHTML = `<div style="padding:40px; color:var(--error); text-align:center;">Network Error.</div>`;
                resolve(false);
            };
            xhr.send();
        });
    },

    open: async function() {
        if(!this.isLoaded) await this.init();
        document.getElementById('saacModal')?.classList.remove('hidden');
        if (typeof lockBodyScroll === 'function') lockBodyScroll();
        const success = await this.loadImages();
        if (success) this.render();
    },

    close: function() { 
        if (this.currentXhr) {
            this.currentXhr.abort();
            this.currentXhr = null;
        }
        document.getElementById('saacModal')?.classList.add('hidden'); 
        if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
    },

    render: function() {
        // #saacGrid scrolls; #saacCardsGrid inside it is the CSS grid; the infinite-scroll trigger is a sibling after the grid.
        const scrollContainer = document.getElementById('saacGrid');
        if(!scrollContainer) return;
        // downloadDb() replaces #saacGrid's contents, so rebuild the structure here.
        let cardsGrid = document.getElementById('saacCardsGrid');
        if (!cardsGrid) {
            scrollContainer.innerHTML = '';
            cardsGrid = document.createElement('div');
            cardsGrid.id = 'saacCardsGrid';
            scrollContainer.appendChild(cardsGrid);
        }
        const q = document.getElementById('saacSearch')?.value.toLowerCase() || '';
        const clearBtn = document.getElementById('saacSearchClear');
        if (clearBtn) clearBtn.classList.toggle('hidden', !q);
        let filtered = q ? this.data.filter(c => 
            c.name.toLowerCase().includes(q) || c.tag.toLowerCase().includes(q)
        ) : [...this.data];
        // Characters already in the prompt first, alphabetical within each group.
        const prompt = document.getElementById('xl_prompt')?.value || '';
        filtered.sort((a, b) => {
            const aActive = prompt.includes(a.tag);
            const bActive = prompt.includes(b.tag);
            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;
            return a.name.localeCompare(b.name);
        });
        this.filteredData = filtered;
        cardsGrid.innerHTML = "";
        document.getElementById('saac-trigger')?.remove();
        this.displayedCount = 0;
        const trigger = document.createElement('div');
        trigger.id = 'saac-trigger';
        // 1px rather than 0, which some browsers never report as intersecting.
        trigger.style.height = '1px';
        // A sibling of cardsGrid, in normal flow after it.
        scrollContainer.appendChild(trigger);
        this.renderMore();
        if(this.observer) this.observer.disconnect();
        this.observer = new IntersectionObserver(e => {
            if(e[0].isIntersecting && this.displayedCount < this.filteredData.length) this.renderMore();
        }, { root: scrollContainer });
        this.observer.observe(trigger);
    },

    renderMore: function() {
        const cardsGrid = document.getElementById('saacCardsGrid');
        const batch = this.filteredData.slice(this.displayedCount, this.displayedCount + this.BATCH_SIZE);
        const prompt = document.getElementById('xl_prompt')?.value || '';
        const frag = document.createDocumentFragment();
        batch.forEach(c => {
            const active = prompt.includes(c.tag);
            const imgSrc = this.imgDb?.[c.tag];
            const card = document.createElement('div');
            card.className = `saac-card ${active ? 'saac-active' : ''}`;
            card.innerHTML = `
                <div class="saac-card-thumb">
                    ${imgSrc ? `<img src="${imgSrc}" loading="lazy">` : `<div class="saac-no-img">${c.name.charAt(0)}</div>`}
                    <div class="saac-card-zoom" onclick="event.stopPropagation(); window.SaacManager.showImage('${c.tag.replace(/'/g, "\\'")}', '${c.name.replace(/'/g, "\\'")}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    </div>
                </div>
                <div class="saac-card-info">
                    <div class="saac-card-name">${c.name}</div>
                </div>`;
            card.onclick = () => this.toggle(c);
            frag.appendChild(card);
        });
        // Append only; the trigger is outside this grid.
        cardsGrid.appendChild(frag);
        this.displayedCount += batch.length;
    },

    toggle: function(c) {
        const el = document.getElementById('xl_prompt');
        if(!el) return;
        let v = el.value;
        if(v.includes(c.tag)) {
            v = v.replace(new RegExp(`(${c.tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,?\\s*)`,'gi'), '');
        } else {
            // New tags are appended after the existing prompt.
            v = v ? `${v}, ${c.tag}` : c.tag;
        }
        el.value = v.replace(/^[\s,]+|[\s,]+$/g, '').replace(/,\s*,/g, ',');
        this.render(); 
    },

    showImage: function(key, name) {
        const modal = document.getElementById('saac-img-modal');
        const img = document.getElementById('saac-img-content');
        const title = document.getElementById('saac-img-title');
        if(!modal || !img) return;
        if(this.imgDb?.[key]) {
            img.src = this.imgDb[key];
            if(title) title.textContent = name;
            modal.classList.add('active');
        }
    },

    closeImage: function() { 
        document.getElementById('saac-img-modal')?.classList.remove('active'); 
    }
};

// As clearLoraSearch() (lora.js): don't refocus the field on clear.
window.clearSaacSearch = function() {
    const searchEl = document.getElementById('saacSearch');
    if (!searchEl) return;
    searchEl.value = '';
    window.SaacManager.render();
};