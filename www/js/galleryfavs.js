// History favourites: set in the viewer or the selection bar, marked by a star on the thumbnail; the ★ button shows
// only favourites, in one group (no date sections).
// Ids kept in localStorage; the Gallery Cache Limit never deletes them, nor DELETE ALL unless asked.
(function () {
    const KEY = 'bojroGalFavs', ONLY_KEY = 'bojroGalFavOnly';
    const STAR = filled => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg>`;
    function ids() {
        try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { return new Set(); }
    }
    function save(set) {
        try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch (e) {}
    }
    const only = () => { try { return localStorage.getItem(ONLY_KEY) === 'true'; } catch (e) { return false; } };

    function paintStar(btn, on) {
        btn.classList.toggle('on', on);
        btn.innerHTML = STAR(on);
        btn.setAttribute('aria-label', on ? 'Unfavorite' : 'Favorite');
        btn.setAttribute('aria-pressed', String(on));
    }
    // A thumbnail's star (loadGallery(), engine.js), shown on favourites only.
    function star(id) {
        const mark = document.createElement('span');
        mark.className = 'gal-fav';
        mark.innerHTML = STAR(true);
        mark.classList.toggle('hidden', !ids().has(id));
        return mark;
    }
    const markThumb = (id, on) => {
        const mark = document.querySelector(`#savedGalleryGrid [data-id="${id}"] .gal-fav`);
        if (mark) mark.classList.toggle('hidden', !on);
    };
    // The selection bar's ★: filled when every selected image is a favourite (a tap then takes them all off).
    function selectedAllFav() {
        const sel = typeof selectedImageIds !== 'undefined' ? [...selectedImageIds] : [];
        const set = ids();
        return sel.length > 0 && sel.every(id => set.has(id));
    }
    function paintSelect() {
        const btn = document.getElementById('galSelFavBtn');
        if (!btn) return;
        const sel = typeof selectedImageIds !== 'undefined' ? selectedImageIds.size : 0;
        btn.disabled = !sel;
        paintStar(btn, selectedAllFav());
        btn.querySelector('svg')?.setAttribute('width', '24');
        btn.querySelector('svg')?.setAttribute('height', '24');
    }
    function toggleSelected() {
        const sel = typeof selectedImageIds !== 'undefined' ? [...selectedImageIds] : [];
        if (!sel.length) return;
        const on = !selectedAllFav(), set = ids();
        sel.forEach(id => { if (on) set.add(id); else set.delete(id); markThumb(id, on); });
        save(set);
        if (typeof toggleGallerySelectionMode === 'function') toggleGallerySelectionMode();
        if (only() && !on && typeof loadGallery === 'function') loadGallery();
        if (typeof Toast !== 'undefined') Toast.show({ text: `${on ? 'Added to' : 'Removed from'} favorites`, duration: 'short' });
    }
    // The list as History shows it; ids of images no longer there are forgotten.
    function filter(all) {
        const set = ids();
        if (set.size) {
            const there = new Set(all.map(i => i.id));
            const kept = new Set([...set].filter(id => there.has(id)));
            if (kept.size !== set.size) save(kept);
        }
        return only() ? all.filter(i => set.has(i.id)) : all;
    }
    function paint() {
        const btn = document.getElementById('galFavBtn');
        if (!btn) return;
        btn.classList.toggle('active', only());
        btn.setAttribute('aria-pressed', String(only()));
        btn.innerHTML = STAR(only());
    }
    function toggle() {
        try { localStorage.setItem(ONLY_KEY, only() ? 'false' : 'true'); } catch (e) {}
        paint();
        if (typeof galleryPage !== 'undefined') galleryPage = 1;
        if (typeof loadGallery === 'function') loadGallery();
    }
    // The viewer's star: the image on show (History images only); its thumbnail's star follows.
    let viewerChanged = false;
    const viewerItem = () => (typeof currentGalleryImages !== 'undefined' && currentGalleryImages[currentGalleryIndex]) || null;
    function paintViewer() {
        const btn = document.getElementById('fsFavBtn'), item = viewerItem();
        if (!btn) return;
        btn.classList.toggle('hidden', !(item && item.id));
        if (item && item.id) paintStar(btn, ids().has(item.id));
        btn.querySelector('svg')?.setAttribute('width', '24');
        btn.querySelector('svg')?.setAttribute('height', '24');
        const del = document.querySelector('#fullScreenModal .fs-delete');
        if (del) del.disabled = !!(item && item.id && ids().has(item.id));
    }
    function toggleViewer() {
        const item = viewerItem();
        if (!item || !item.id) return;
        const set = ids(), on = !set.has(item.id);
        if (on) set.add(item.id); else set.delete(item.id);
        save(set);
        paintViewer();
        markThumb(item.id, on);
        if (only() && !on) viewerChanged = true;
    }
    function startViewer() {
        const img = document.getElementById('fsImage'), modal = document.getElementById('fullScreenModal');
        if (img) new MutationObserver(paintViewer).observe(img, { attributes: true, attributeFilter: ['src'] });
        // Showing favourites only, one taken off in the viewer goes once it closes.
        if (modal) new MutationObserver(() => {
            if (!modal.classList.contains('hidden')) { paintViewer(); return; }
            if (viewerChanged) { viewerChanged = false; if (typeof loadGallery === 'function') loadGallery(); }
        }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
    const start = () => { paint(); startViewer(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

    window.GalleryFavs = { ids, save, star, filter, only, toggle, toggleViewer, toggleSelected, paintSelect };
})();
