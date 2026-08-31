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
            poster: m.poster ? '/assets/img/' + m.poster : '',
            a: document.getElementById('vid-a'),
            b: document.getElementById('vid-b'),
            posterEl: document.getElementById('poster')
        });
        player.start();
    }

    function applyPayload(payload) {
        render(payload);
        current = payload;
        setupMedia(payload);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch (e) {}
    }

    fetch('/api/menu.php?screen=' + screenId, { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(applyPayload)
        .catch(function () {
            try {
                var cached = localStorage.getItem(CACHE_KEY);
                if (cached) applyPayload(JSON.parse(cached));
            } catch (e) {}
        });
})();
