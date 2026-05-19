(function () {
    /* ── Inject shared CSS ── */
    var s = document.createElement('style');
    s.textContent = [
        '.lang-btn{color:#71717a;padding-bottom:2px}',
        '.lang-btn.active{color:white;border-bottom:2px solid #2563eb}',
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
        '.modal-input::placeholder{color:#52525b}',
        '.nav-status-btn{display:block;flex-shrink:0;white-space:nowrap}',
        '@media (max-width:767px){.nav-status-btn{display:none!important}}',
        'html{height:100%}body{min-height:100%;display:flex;flex-direction:column}body>div:not(#main-footer){width:100%}#main-footer{margin-top:auto}',
    ].join('');
    document.head.appendChild(s);

    /* ── Footer HTML ── */
    var FOOTER_HTML = '<footer id="main-footer" class="border-t border-white/5 py-12 px-6" style="background:#050505">'
        + '<div class="max-w-[1400px] mx-auto flex flex-col md:flex-row justify-between items-start gap-6">'
        + '<div>'
        + '<div class="text-[9px] font-extrabold uppercase tracking-[0.2em] text-zinc-600">SFF Lab OÜ · 17506407 · EE102985942</div>'
        + '<div class="text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-700 mt-1"><a href="mailto:info@sfflab.ee" class="hover:text-zinc-400 transition" style="text-decoration:none">info@sfflab.ee</a></div>'
        + '<div class="text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-700 mt-1">2026</div>'
        + '</div>'
        + '<div class="md:text-right">'
        + '<div class="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600" data-key="footer-built">Ehitatud Eestis</div>'
        + '<div class="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-700 mt-1"><a href="https://www.cloudflare.com" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 hover:text-zinc-400 transition" style="text-decoration:none"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>Secured by Cloudflare</a></div>'
        + '<div class="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600 mt-1"><a href="legal.html#terms" data-key="legal-terms" class="hover:text-zinc-400 transition" style="text-decoration:none">Müügitingimused</a><span class="text-zinc-800 mx-1">·</span><a href="legal.html#privacy" data-key="legal-privacy" class="hover:text-zinc-400 transition" style="text-decoration:none">Privaatsuspoliitika</a><span class="text-zinc-800 mx-1">·</span><a href="legal.html#returns" data-key="legal-returns" class="hover:text-zinc-400 transition" style="text-decoration:none">Tagastuspoliitika</a></div>'
        + '</div>'
        + '</div>'
        + '</footer>';

    /* ── Nav + Modal HTML ── */
    var NAV_HTML = '<div id="modal-overlay" class="modal-overlay" onclick="window._navBackdrop(event)">'
        + '<div class="modal-box">'
        + '<button onclick="window.closeModal()" style="position:absolute;top:20px;right:24px;background:none;border:none;cursor:pointer;color:#71717a;font-size:20px;line-height:1" onmouseover="this.style.color=\'white\'" onmouseout="this.style.color=\'#71717a\'">✕</button>'
        + '<p class="text-blue-500 text-[11px] font-black uppercase tracking-[0.25em] mb-3">SFF Lab</p>'
        + '<h2 id="modal-title" class="text-2xl font-extrabold mb-2 text-white">Tellimuse staatus</h2>'
        + '<p id="modal-sub" class="text-zinc-500 text-sm mb-8">Sisesta oma tellimuse number, et kontrollida selle staatust.</p>'
        + '<div id="modal-form">'
        + '<div style="margin-bottom:24px">'
        + '<input id="order-id" type="text" class="modal-input" placeholder="SFF-2026-0515-1234">'
        + '<p id="modal-error" style="display:none;color:#ef4444;font-size:12px;font-weight:600;margin-top:8px;text-align:left"></p>'
        + '</div>'
        + '<button onclick="window.submitOrder()" id="modal-submit-btn" class="btn-ripple w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest" style="border:none;cursor:pointer;transition:background 0.2s">Kontrolli</button>'
        + '</div>'
        + '<div id="modal-success" style="display:none;text-align:center;padding:8px 0">'
        + '</div>'
        + '</div>'
        + '</div>'
        + '<nav id="main-nav" class="anim-nav fixed w-full border-b border-white/5 bg-black/70 backdrop-blur-md" style="top:0;left:0;right:0;z-index:100;transition:background 0.3s,border-color 0.3s;overflow-x:hidden">'
        + '<div class="max-w-[1400px] mx-auto py-4 md:py-6 px-6 md:px-10" style="display:flex;align-items:center;justify-content:space-between;gap:16px">'
        + '<a href="/" class="text-2xl md:text-3xl font-extrabold tracking-tighter uppercase text-white hover:opacity-80 transition" style="flex-shrink:0">SFF LAB<span class="text-blue-600">.</span></a>'
        + '<div style="display:flex;align-items:center;gap:16px;flex-shrink:1;min-width:0">'
        + '<a href="shop.html" class="min-[900px]:hidden flex items-center gap-1.5 hover:text-white transition" style="color:#52525b;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;white-space:nowrap">Shop <span style="font-size:8px;font-weight:800;letter-spacing:0.12em;color:#2563eb;background:rgba(37,99,235,0.15);padding:1px 5px;border-radius:3px;text-transform:uppercase">DEMO</span></a>'
        + '<div class="hidden min-[900px]:flex items-center text-[16px] font-bold uppercase tracking-[0.2em] text-zinc-500" style="flex-shrink:1;min-width:0">'
        + '<a href="shop.html" class="hover:text-white transition whitespace-nowrap flex items-center gap-2" style="color:#52525b;font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em">Shop <span style="font-size:9px;font-weight:800;letter-spacing:0.15em;color:#2563eb;background:rgba(37,99,235,0.15);padding:2px 6px;border-radius:4px;text-transform:uppercase">DEMO</span></a>'
        + '<span class="text-zinc-800 mx-2">·</span>'
        + '<a href="/#pricing" data-key="nav-pricing" class="hover:text-white transition whitespace-nowrap">Paketid</a>'
        + '</div>'
        + '<div class="flex items-center space-x-3 border-l border-white/10 pl-4 text-sm font-bold tracking-widest" style="flex-shrink:0;white-space:nowrap">'
        + '<button onclick="setLanguage(\'et\')" id="lang-et" class="lang-btn active transition hover:text-white" style="background:none;border:none;cursor:pointer;font-weight:700;letter-spacing:0.15em">ET</button>'
        + '<span class="text-zinc-800">|</span>'
        + '<button onclick="setLanguage(\'ru\')" id="lang-ru" class="lang-btn transition hover:text-white" style="background:none;border:none;cursor:pointer;font-weight:700;letter-spacing:0.15em">RU</button>'
        + '<span class="text-zinc-800">|</span>'
        + '<button onclick="setLanguage(\'en\')" id="lang-en" class="lang-btn transition hover:text-white" style="background:none;border:none;cursor:pointer;font-weight:700;letter-spacing:0.15em">EN</button>'
        + '</div>'
        + '<button onclick="openModal()" data-key="nav-status" class="nav-status-btn btn-ripple bg-white text-black px-6 py-2.5 rounded-full hover:bg-zinc-200 transition uppercase tracking-widest text-[11px] font-black" style="flex-shrink:0;white-space:nowrap;border:none;cursor:pointer;min-width:11rem;text-align:center">Tellimuse staatus</button>'
        + '</div>'
        + '</div>'
        + '</nav>';

    /* ── Inject on DOMContentLoaded ── */
    document.addEventListener('DOMContentLoaded', function () {
        document.body.insertAdjacentHTML('afterbegin', NAV_HTML);
        document.body.insertAdjacentHTML('beforeend', FOOTER_HTML);
        _init();
    });

    function _init() {
        window.addEventListener('scroll', function () {
            var nav = document.getElementById('main-nav');
            if (!nav) return;
            var scrolled = window.scrollY > 40;
            nav.style.background = scrolled ? 'rgba(0,0,0,0.92)' : 'rgba(0,0,0,0.7)';
            nav.style.borderColor = scrolled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)';
        }, { passive: true });

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

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') window.closeModal();
        });

        // Auto-open order status popup if ?order= param present in URL
        (function() {
            var params = new URLSearchParams(window.location.search);
            var orderId = params.get('order');
            if (!orderId) return;
            // Only auto-open if explicitly triggered via email link, not after payment redirect
            if (document.referrer && document.referrer.includes('payment')) return;
            if (window.location.pathname.includes('success')) return;
            var idEl = document.getElementById('order-id');
            if (idEl) idEl.value = orderId.toUpperCase();
            window.openModal();
            setTimeout(function() { window.submitOrder(); }, 300);
        })();
    }

    /* ── i18n ── */
    var _NAV_TR = {
        et: { 'nav-pricing': 'Paketid',  'nav-status': 'Tellimuse staatus',
              'legal-terms': 'Müügitingimused', 'legal-privacy': 'Privaatsuspoliitika', 'legal-returns': 'Tagastuspoliitika',
              'footer-built': 'Ehitatud Eestis' },
        ru: { 'nav-pricing': 'Цены',     'nav-status': 'Статус заказа',
              'legal-terms': 'Условия продажи', 'legal-privacy': 'Конфиденциальность',  'legal-returns': 'Возврат',
              'footer-built': 'Собрано в Эстонии' },
        en: { 'nav-pricing': 'Packages', 'nav-status': 'Order Status',
              'legal-terms': 'Terms of Sale',   'legal-privacy': 'Privacy Policy',      'legal-returns': 'Returns',
              'footer-built': 'Built in Estonia' }
    };

    window.setLanguage = function (lang) {
        localStorage.setItem('selectedLanguage', lang);
        var pg = window.pageTranslations || {};
        var tr = {
            et: Object.assign({}, _NAV_TR.et, pg.et || {}),
            ru: Object.assign({}, _NAV_TR.ru, pg.ru || {}),
            en: Object.assign({}, _NAV_TR.en, pg.en || {})
        };
        document.querySelectorAll('[data-key]').forEach(function (el) {
            var k = el.getAttribute('data-key');
            if (tr[lang] && tr[lang][k] !== undefined) el.innerText = tr[lang][k];
        });
        document.querySelectorAll('.lang-btn').forEach(function (b) { b.classList.remove('active'); });
        var ab = document.getElementById('lang-' + lang);
        if (ab) ab.classList.add('active');

        var isRu = lang === 'ru';
        var isEn = lang === 'en';
        var mt = document.getElementById('modal-title');
        var ms = document.getElementById('modal-sub');
        var mb = document.getElementById('modal-submit-btn');
        if (mt) mt.innerText = isRu ? 'Статус заказа'    : (isEn ? 'Order Status'                          : 'Tellimuse staatus');
        if (ms) ms.innerText = isRu ? 'Введи номер заказа, чтобы проверить его статус.'
                                    : (isEn ? 'Enter your order number to check its status.'
                                            : 'Sisesta oma tellimuse number, et kontrollida selle staatust.');
        if (mb && !mb.disabled) mb.innerText = isRu ? 'Проверить' : (isEn ? 'Check' : 'Kontrolli');
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

    var STATUS_ET = { pending: 'Ootel', pending_payment: 'Ootel makset', in_progress: 'Töös', ready: 'Valmis', shipped: 'Saadetud' };
    var STATUS_RU = { pending: 'Ожидает', pending_payment: 'Ожидает оплаты', in_progress: 'В работе', ready: 'Готово', shipped: 'Отправлено' };
    var STATUS_EN = { pending: 'Pending', pending_payment: 'Awaiting payment', in_progress: 'In progress', ready: 'Ready', shipped: 'Shipped' };
    var STATUS_COLOR = { pending: '#a1a1aa', pending_payment: '#f59e0b', in_progress: '#3b82f6', ready: '#22c55e', shipped: '#a78bfa' };

    function _statusBackBtn(lang) {
        var label = lang === 'ru' ? 'Назад' : (lang === 'en' ? 'Back' : 'Tagasi');
        return '<button onclick="window._navStatusBack()" style="background:none;border:1px solid rgba(255,255,255,0.1);border-radius:14px;color:#71717a;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;cursor:pointer;padding:10px 24px;margin-top:8px">'
            + label + '</button>';
    }

    window.submitOrder = function () {
        var idEl  = document.getElementById('order-id');
        var errEl = document.getElementById('modal-error');
        var btn   = document.getElementById('modal-submit-btn');
        var lang  = localStorage.getItem('selectedLanguage') || 'et';
        var isRu  = lang === 'ru';
        var isEn  = lang === 'en';
        var orderNumber = idEl ? idEl.value.trim().toUpperCase() : '';

        if (errEl) errEl.style.display = 'none';

        if (!orderNumber || !/^SFF-\d{4}-\d{4}-\d{4}$/.test(orderNumber)) {
            if (idEl) { idEl.style.borderColor = 'rgba(239,68,68,0.6)'; setTimeout(function () { idEl.style.borderColor = ''; }, 1500); }
            if (errEl) {
                errEl.innerText = isRu ? 'Неверный формат: SFF-2026-0515-1234'
                                       : (isEn ? 'Invalid format: SFF-2026-0515-1234' : 'Vale vorming: SFF-2026-0515-1234');
                errEl.style.display = 'block';
            }
            return;
        }

        if (btn) { btn.disabled = true; btn.innerText = '···'; btn.style.opacity = '0.6'; }

        fetch('/api/order-status?orderNumber=' + encodeURIComponent(orderNumber))
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
            .then(function (res) {
                if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.innerText = isRu ? 'Проверить' : (isEn ? 'Check' : 'Kontrolli'); }

                var f  = document.getElementById('modal-form');
                var sc = document.getElementById('modal-success');

                if (res.status === 404) {
                    if (sc) {
                        sc.innerHTML = '<div style="font-size:32px;margin-bottom:16px">⚠</div>'
                            + '<p style="color:#fff;font-weight:700;font-size:15px;margin-bottom:8px">'
                            + (isRu ? 'Заказ не найден' : (isEn ? 'Order not found' : 'Tellimust ei leitud')) + '</p>'
                            + '<p style="color:#71717a;font-size:13px;margin-bottom:24px">' + orderNumber + '</p>'
                            + _statusBackBtn(lang);
                        sc.style.display = 'block';
                    }
                    if (f) f.style.display = 'none';
                    return;
                }

                if (!res.ok) throw new Error('http ' + res.status);

                var d = res.data;
                var color = STATUS_COLOR[d.status] || '#a1a1aa';
                var STATUS_MAP = isRu ? STATUS_RU : (isEn ? STATUS_EN : STATUS_ET);
                var statusLabel = STATUS_MAP[d.status] || d.status;
                var delivLabel = isRu ? 'Готовность' : (isEn ? 'Ready by' : 'Eeldatav');
                var deliveryHtml = d.estimatedDelivery
                    ? '<div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#52525b;margin-bottom:4px">'
                      + delivLabel + '</div>'
                      + '<div style="font-size:13px;color:#a1a1aa;margin-bottom:24px">' + d.estimatedDelivery + '</div>'
                    : '<div style="margin-bottom:24px"></div>';

                if (sc) {
                    sc.innerHTML = '<div style="font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#52525b;margin-bottom:6px">ORDER</div>'
                        + '<div style="font-size:18px;font-weight:900;letter-spacing:0.04em;color:#fff;margin-bottom:20px">' + d.orderNumber + '</div>'
                        + '<div style="display:inline-block;padding:8px 24px;border-radius:100px;background:' + color + '1a;border:1px solid ' + color + '55;margin-bottom:20px">'
                        + '<span style="font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:' + color + '">' + statusLabel + '</span>'
                        + '</div>'
                        + (d.model ? '<div style="font-size:13px;font-weight:700;color:#e4e4e7;margin-bottom:16px">' + d.model + '</div>' : '')
                        + deliveryHtml
                        + _statusBackBtn(lang);
                    sc.style.display = 'block';
                }
                if (f) f.style.display = 'none';
            })
            .catch(function () {
                if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.innerText = isRu ? 'Проверить' : (isEn ? 'Check' : 'Kontrolli'); }
                if (errEl) {
                    errEl.innerText = isRu ? 'Ошибка соединения. Попробуй ещё раз.'
                                           : (isEn ? 'Connection error. Please try again.' : 'Ühenduse viga. Proovi uuesti.');
                    errEl.style.display = 'block';
                }
            });
    };

    window._navStatusBack = function () {
        var f  = document.getElementById('modal-form');
        var sc = document.getElementById('modal-success');
        if (f)  f.style.display  = '';
        if (sc) { sc.style.display = 'none'; sc.innerHTML = ''; }
    };

    function _reset() {
        var f  = document.getElementById('modal-form');
        var sc = document.getElementById('modal-success');
        var i  = document.getElementById('order-id');
        var e  = document.getElementById('modal-error');
        var b  = document.getElementById('modal-submit-btn');
        if (f)  f.style.display  = '';
        if (sc) { sc.style.display = 'none'; sc.innerHTML = ''; }
        if (i)  i.value = '';
        if (e)  e.style.display  = 'none';
        if (b)  { b.disabled = false; b.style.opacity = ''; }
    }

    /* ── Apply saved language on page load ── */
    window.addEventListener('load', function () {
        window.setLanguage(localStorage.getItem('selectedLanguage') || 'et');
    });
})();
