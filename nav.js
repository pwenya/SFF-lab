(function () {
    /* ── Inject shared CSS ── */
    var s = document.createElement('style');
    s.textContent = [
        '.lang-btn.active{color:white;border-bottom:2px solid #2563eb;padding-bottom:2px}',
        '.nav-scrolled{background:rgba(0,0,0,0.92)!important;border-color:rgba(255,255,255,0.08)!important}',
        '@keyframes _navFadeIn{from{opacity:0}to{opacity:1}}',
        '.anim-nav{animation:_navFadeIn 0.6s ease both}',
        '.btn-ripple{position:relative;overflow:hidden}',
        '.btn-ripple .ripple-circle{position:absolute;border-radius:50%;background:rgba(255,255,255,0.25);transform:scale(0);animation:_ripple 0.55s linear;pointer-events:none}',
        '@keyframes _ripple{to{transform:scale(4);opacity:0}}',
        '.modal-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.3s ease}',
        '.modal-overlay.open{opacity:1;pointer-events:all}',
        '.modal-box{position:relative;background:#0d0d0d;border:1px solid rgba(255,255,255,0.1);border-radius:32px;padding:48px;width:100%;max-width:440px;margin:16px;transform:translateY(20px) scale(0.97);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1),opacity 0.35s ease;opacity:0}',
        '.modal-overlay.open .modal-box{transform:translateY(0) scale(1);opacity:1}',
        '.modal-input{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:14px;color:white;padding:14px 18px;font-size:14px;font-family:inherit;outline:none;transition:border-color 0.2s;box-sizing:border-box}',
        '.modal-input:focus{border-color:rgba(59,130,246,0.6)}',
        '.modal-input::placeholder{color:#52525b}'
    ].join('');
    document.head.appendChild(s);

    /* ── Nav + Modal HTML ── */
    var NAV_HTML = '<div id="modal-overlay" class="modal-overlay" onclick="window._navBackdrop(event)">'
        + '<div class="modal-box">'
        + '<button onclick="window.closeModal()" style="position:absolute;top:20px;right:24px;background:none;border:none;cursor:pointer;color:#71717a;font-size:20px;line-height:1" onmouseover="this.style.color=\'white\'" onmouseout="this.style.color=\'#71717a\'">✕</button>'
        + '<p class="text-blue-500 text-[11px] font-black uppercase tracking-[0.25em] mb-3">SFF Lab</p>'
        + '<h2 id="modal-title" class="text-2xl font-extrabold mb-2 text-white">Tellimuse staatus</h2>'
        + '<p id="modal-sub" class="text-zinc-500 text-sm mb-8">Sisesta oma email ja tellimuse number ning võtame sinuga ühendust tunni jooksul.</p>'
        + '<div id="modal-form">'
        + '<div class="space-y-3 mb-6">'
        + '<input id="order-email" type="email" class="modal-input" placeholder="Email / Meiliaadress">'
        + '<input id="order-id" type="text" class="modal-input" placeholder="Tellimuse nr. / Номер заказа">'
        + '</div>'
        + '<button onclick="window.submitOrder()" class="btn-ripple w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest" style="border:none;cursor:pointer;transition:background 0.2s">Kontrolli / Проверить</button>'
        + '</div>'
        + '<div id="modal-success" style="display:none;text-align:center;padding:24px 0">'
        + '<div style="font-size:36px;margin-bottom:16px">✓</div>'
        + '<p class="text-white font-bold mb-2">Saadud!</p>'
        + '<p class="text-zinc-500 text-sm">Võtame teiega varsti ühendust.<br>Скоро свяжемся с вами.</p>'
        + '</div>'
        + '</div>'
        + '</div>'
        + '<nav id="main-nav" class="anim-nav fixed w-full z-50 border-b border-white/5 bg-black/70 backdrop-blur-md" style="transition:background 0.3s,border-color 0.3s">'
        + '<div class="max-w-[1400px] mx-auto flex justify-between items-center py-4 md:py-6 px-6 md:px-10">'
        + '<a href="index.html" class="text-2xl md:text-3xl font-extrabold tracking-tighter uppercase text-white hover:opacity-80 transition">SFF LAB<span class="text-blue-600">.</span></a>'
        + '<div class="flex items-center space-x-4 lg:space-x-12">'
        + '<div class="hidden lg:flex items-center space-x-12 text-[16px] font-bold uppercase tracking-[0.2em] text-zinc-500">'
        + '<a href="index.html#pricing" data-key="nav-pricing" class="hover:text-white transition">Paketid</a>'
        + '</div>'
        + '<div class="flex items-center space-x-3 border-l border-white/10 pl-4 lg:pl-12 text-sm font-bold tracking-widest">'
        + '<button onclick="setLanguage(\'et\')" id="lang-et" class="lang-btn active transition hover:text-white" style="background:none;border:none;cursor:pointer;font-weight:700;letter-spacing:0.15em">ET</button>'
        + '<span class="text-zinc-800">|</span>'
        + '<button onclick="setLanguage(\'ru\')" id="lang-ru" class="lang-btn transition hover:text-white text-zinc-500" style="background:none;border:none;cursor:pointer;font-weight:700;letter-spacing:0.15em">RU</button>'
        + '</div>'
        + '<button onclick="openModal()" data-key="nav-status" class="hidden lg:block btn-ripple bg-white text-black px-8 py-3 rounded-full hover:bg-zinc-200 transition uppercase tracking-widest text-[14px] font-black" style="border:none;cursor:pointer">Tellimuse staatus</button>'
        + '</div>'
        + '</div>'
        + '</nav>';

    /* ── Inject on DOMContentLoaded ── */
    document.addEventListener('DOMContentLoaded', function () {
        document.body.insertAdjacentHTML('afterbegin', NAV_HTML);
        _init();
    });

    function _init() {
        /* Nav scroll opacity */
        window.addEventListener('scroll', function () {
            var nav = document.getElementById('main-nav');
            if (!nav) return;
            var scrolled = window.scrollY > 40;
            nav.style.background = scrolled ? 'rgba(0,0,0,0.92)' : 'rgba(0,0,0,0.7)';
            nav.style.borderColor = scrolled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)';
        }, { passive: true });

        /* Ripple on .btn-ripple clicks */
        document.addEventListener('click', function (e) {
            var btn = e.target.closest('.btn-ripple');
            if (!btn) return;
            var c = document.createElement('span');
            var r = btn.getBoundingClientRect();
            var sz = Math.max(r.width, r.height);
            c.className = 'ripple-circle';
            c.style.cssText = 'width:' + sz + 'px;height:' + sz + 'px;left:' + (e.clientX - r.left - sz / 2) + 'px;top:' + (e.clientY - r.top - sz / 2) + 'px';
            btn.appendChild(c);
            c.addEventListener('animationend', function () { c.remove(); });
        });

        /* ESC closes modal */
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') window.closeModal();
        });
    }

    /* ── i18n ── */
    var _NAV_TR = {
        et: { 'nav-pricing': 'Paketid', 'nav-status': 'Tellimuse staatus' },
        ru: { 'nav-pricing': 'Цены', 'nav-status': 'Статус заказа' }
    };

    window.setLanguage = function (lang) {
        localStorage.setItem('selectedLanguage', lang);
        var pg = window.pageTranslations || {};
        var tr = {
            et: Object.assign({}, _NAV_TR.et, pg.et || {}),
            ru: Object.assign({}, _NAV_TR.ru, pg.ru || {})
        };
        document.querySelectorAll('[data-key]').forEach(function (el) {
            var k = el.getAttribute('data-key');
            if (tr[lang] && tr[lang][k] !== undefined) el.innerText = tr[lang][k];
        });
        document.querySelectorAll('.lang-btn').forEach(function (b) { b.classList.remove('active'); });
        var ab = document.getElementById('lang-' + lang);
        if (ab) ab.classList.add('active');

        var isRu = lang === 'ru';
        var mt = document.getElementById('modal-title');
        var ms = document.getElementById('modal-sub');
        if (mt) mt.innerText = isRu ? 'Статус заказа' : 'Tellimuse staatus';
        if (ms) ms.innerText = isRu
            ? 'Введи свой email и номер заказа, и мы ответим в течение часа.'
            : 'Sisesta oma email ja tellimuse number ning võtame sinuga ühendust tunni jooksul.';
    };

    /* ── Modal ── */
    window.openModal = function () {
        var o = document.getElementById('modal-overlay');
        if (o) { o.classList.add('open'); document.body.style.overflow = 'hidden'; }
    };
    window.closeModal = function () {
        var o = document.getElementById('modal-overlay');
        if (o) { o.classList.remove('open'); document.body.style.overflow = ''; }
        setTimeout(_reset, 350);
    };
    window._navBackdrop = function (e) {
        if (e.target === document.getElementById('modal-overlay')) window.closeModal();
    };
    window.submitOrder = function () {
        var emailEl = document.getElementById('order-email');
        var email = emailEl ? emailEl.value.trim() : '';
        if (!email || !email.includes('@')) {
            if (emailEl) { emailEl.style.borderColor = 'rgba(239,68,68,0.6)'; setTimeout(function () { emailEl.style.borderColor = ''; }, 1500); }
            return;
        }
        var f = document.getElementById('modal-form');
        var sc = document.getElementById('modal-success');
        if (f) f.style.display = 'none';
        if (sc) sc.style.display = 'block';
    };
    function _reset() {
        var f = document.getElementById('modal-form');
        var sc = document.getElementById('modal-success');
        var e = document.getElementById('order-email');
        var i = document.getElementById('order-id');
        if (f) f.style.display = '';
        if (sc) sc.style.display = 'none';
        if (e) e.value = '';
        if (i) i.value = '';
    }

    /* ── Apply saved language on page load ── */
    window.addEventListener('load', function () {
        window.setLanguage(localStorage.getItem('selectedLanguage') || 'et');
    });
})();