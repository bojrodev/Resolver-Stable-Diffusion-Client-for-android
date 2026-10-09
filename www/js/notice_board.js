// www/js/notice_board.js

const NOTICE_BOARD_URL = 'https://raw.githubusercontent.com/bojrodev/Resolver-Stable-Diffusion-Client-for-android/dev/ntc.json';
const NOTICE_BOARD_SEEN_KEY = 'bojro_notice_board_seen';

async function checkForNoticeBoard() {
    try {
        const response = await fetch(`${NOTICE_BOARD_URL}?t=${Date.now()}`);
        if (!response.ok) throw new Error(`Notice fetch failed: ${response.status}`);

        const notice = await response.json();
        if (!notice || typeof notice.id !== 'string' || !notice.id.trim() ||
            typeof notice.title !== 'string' || !notice.title.trim() ||
            typeof notice.message !== 'string' || !notice.message.trim()) {
            throw new Error('Notice data must include non-empty id, title, and message fields.');
        }

        if (localStorage.getItem(NOTICE_BOARD_SEEN_KEY) === notice.id) return;
        showNoticeBoard(notice);
    } catch (error) {
        console.error('Notice board check failed:', error);
    }
}

function showNoticeBoard(notice) {
    const updateModal = document.getElementById('updateModal');
    if (updateModal && !updateModal.classList.contains('hidden')) {
        setTimeout(() => showNoticeBoard(notice), 500);
        return;
    }

    const modal = document.getElementById('noticeBoardModal');
    const title = document.getElementById('noticeBoardTitle');
    const message = document.getElementById('noticeBoardMessage');
    const link = document.getElementById('noticeBoardLink');
    const dismiss = document.getElementById('noticeBoardDismiss');
    if (!modal || !title || !message || !link || !dismiss) {
        console.error('Notice board UI is missing required elements.');
        return;
    }

    title.textContent = notice.title;
    message.textContent = notice.message;
    link.classList.add('hidden');

    if (typeof notice.link === 'string' && notice.link.trim()) {
        try {
            const url = new URL(notice.link);
            if (url.protocol === 'https:' || url.protocol === 'http:') {
                link.href = url.href;
                link.textContent = typeof notice.linkText === 'string' && notice.linkText.trim()
                    ? notice.linkText
                    : 'LEARN MORE';
                link.classList.remove('hidden');
            } else {
                console.warn('Notice link must use http or https.');
            }
        } catch (error) {
            console.warn('Ignoring invalid notice link:', error);
        }
    }

    dismiss.onclick = () => {
        localStorage.setItem(NOTICE_BOARD_SEEN_KEY, notice.id);
        modal.classList.add('hidden');
    };

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}
