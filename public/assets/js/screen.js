(function () {
    'use strict';
    var screenId = Number(document.body.dataset.screen);
    var stage = document.getElementById('stage');
    var fit = document.getElementById('fit');
    var menuEl = document.getElementById('menu');
    var titleEl = document.getElementById('title');
    var brandEl = document.getElementById('brand');
    var clockEl = document.getElementById('clock');
    var CACHE_KEY = 'mokko-screen-' + screenId;
    var current = null;
    var player = null;
    var mediaKey = null;

    function fitStage() {
        var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
        fit.style.width = (1920 * s) + 'px';
        fit.style.height = (1080 * s) + 'px';
        stage.style.transform = 'scale(' + s + ')';
    }
    window.addEventListener('resize', fitStage);
    fitStage();

    function tickClock() {
        var d = new Date();
        clockEl.textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
    tickClock();
    setInterval(tickClock, 15000);

    function priceText(prices) {
        return prices.map(function (p) { return p === null ? '—' : String(p); }).join(' / ');
    }

    function render(payload) {
        titleEl.textContent = payload.menu.title;
        brandEl.textContent = payload.settings.brand;
        document.title = payload.settings.brand + ' · ' + payload.menu.title;
        var cols = { 1: document.createElement('div'), 2: document.createElement('div') };
        payload.menu.categories.forEach(function (c) {
            var cat = document.createElement('section');
            cat.className = 'cat';
            var h = document.createElement('h3'); h.textContent = c.title;
            var rule = document.createElement('div'); rule.className = 'rule';
            cat.appendChild(h); cat.appendChild(rule);
            c.items.forEach(function (it) {
                if (!it.visible) return;
                var row = document.createElement('div'); row.className = 'item';
                var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = it.name;
                if (it.volume) { var v = document.createElement('span'); v.className = 'vol'; v.textContent = it.volume; nm.appendChild(v); }
                if (it.desc) { var ds = document.createElement('span'); ds.className = 'desc'; ds.textContent = it.desc; nm.appendChild(ds); }
                var dots = document.createElement('span'); dots.className = 'dots';
                var pr = document.createElement('span'); pr.className = 'pr';
                pr.dataset.itemId = it.id;
                pr.textContent = priceText(it.prices);
                row.appendChild(nm); row.appendChild(dots); row.appendChild(pr);
                cat.appendChild(row);
            });
            cols[c.col === 2 ? 2 : 1].appendChild(cat);
        });
        menuEl.innerHTML = '';
        menuEl.appendChild(cols[1]);
        menuEl.appendChild(cols[2]);
        stage.classList.remove('compact');
        if (menuEl.scrollHeight > menuEl.clientHeight) stage.classList.add('compact');
    }

    function setupMedia(payload) {
        var m = payload.menu.media || { videos: [], poster: '' };
        var key = JSON.stringify(m);
        if (key === mediaKey) return;
        mediaKey = key;
        if (player) player.stop();
        player = window.MokkoPlayer({
            videos: (m.videos || []).map(function (v) { return '/assets/video/' + v; }),
            lastLoops: m.last_loops,
            poster: m.poster ? '/assets/img/' + m.poster : '',
            a: document.getElementById('vid-a'),
            b: document.getElementById('vid-b'),
            posterEl: document.getElementById('poster')
        });
        player.start();
    }

    var etag = null;
    var pollTimer = null;
    var startedAt = Date.now();

    function signature(payload) {
        return JSON.stringify(payload.menu.categories.map(function (c) {
            return [c.id, c.title, c.col, c.items.filter(function (i) { return i.visible; })
                .map(function (i) { return [i.id, i.name, i.desc, i.volume]; })];
        }));
    }

    function updatePrices(payload) {
        payload.menu.categories.forEach(function (c) {
            c.items.forEach(function (it) {
                if (!it.visible) return;
                var el = menuEl.querySelector('.pr[data-item-id="' + it.id + '"]');
                var txt = priceText(it.prices);
                if (el && el.textContent !== txt) {
                    el.style.opacity = '0';
                    setTimeout(function () {
                        el.textContent = txt;
                        el.style.opacity = '1';
                        el.classList.remove('flash');
                        void el.offsetWidth;
                        el.classList.add('flash');
                    }, 400);
                }
            });
        });
    }

    function applyPayload(payload) {
        if (current && signature(current) === signature(payload)) {
            updatePrices(payload);
        } else {
            render(payload);
            if (current) {
                menuEl.classList.remove('swap');
                void menuEl.offsetWidth;
                menuEl.classList.add('swap');
            }
        }
        current = payload;
        setupMedia(payload);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch (e) {}
    }

    function schedule() {
        var sec = (current && current.settings.poll_seconds) || 60;
        clearTimeout(pollTimer);
        pollTimer = setTimeout(poll, sec * 1000);
    }

    function poll() {
        var headers = etag ? { 'If-None-Match': etag } : {};
        fetch('/api/menu.php?screen=' + screenId, { headers: headers, cache: 'no-store' })
            .then(function (r) {
                if (r.status === 304) return null;
                if (!r.ok) throw new Error(r.status);
                etag = r.headers.get('ETag');
                return r.json();
            })
            .then(function (payload) { if (payload) applyPayload(payload); })
            .catch(function () {
                if (!current) {
                    try {
                        var cached = localStorage.getItem(CACHE_KEY);
                        if (cached) applyPayload(JSON.parse(cached));
                    } catch (e) {}
                }
            })
            .then(schedule);
    }
    poll();

    setInterval(function () {
        if (!current) return;
        var d = new Date();
        var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        if (hm === current.settings.reload_at && Date.now() - startedAt > 120000) location.reload();
    }, 60000);
})();
