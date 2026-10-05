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

    // Сцена — 1920 по ширине, высота подстраивается под окно: браузер ТВ
    // забирает часть высоты под свою панель (окно 1920×1022, не 16:9),
    // и при жёстких 1080 сцена вписывалась по высоте с чёрными полосами по бокам.
    // Вёрстка привязана к краям, поэтому высота может «плавать»; пределы —
    // чтобы меню не ломалось на экзотических окнах (там остаются полосы).
    var STAGE_MIN_H = 960, STAGE_MAX_H = 1080;
    function fitStage() {
        var w = window.innerWidth, h = window.innerHeight;
        var stageH = Math.max(STAGE_MIN_H, Math.min(STAGE_MAX_H, 1920 * h / w));
        var s = Math.min(w / 1920, h / stageH);
        fit.style.width = (1920 * s) + 'px';
        fit.style.height = (stageH * s) + 'px';
        stage.style.height = stageH + 'px';
        stage.style.transform = 'scale(' + s + ')';
        fitMenu();
    }

    // меню не влезает по высоте — компактный режим
    function fitMenu() {
        stage.classList.remove('compact');
        if (menuEl.scrollHeight > menuEl.clientHeight) stage.classList.add('compact');
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
            // все позиции скрыты — категорию не показываем (так её прячут из админки)
            if (!c.items.some(function (it) { return it.visible; })) return;
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
                // trim: случайный Enter в конце описания не добавит пустую строку
                var desc = (it.desc || '').trim();
                if (desc) { var ds = document.createElement('span'); ds.className = 'desc'; ds.textContent = desc; nm.appendChild(ds); }
                var pr = document.createElement('span'); pr.className = 'pr';
                pr.dataset.itemId = it.id;
                pr.textContent = priceText(it.prices);
                row.appendChild(nm); row.appendChild(pr);
                cat.appendChild(row);
            });
            cols[c.col === 2 ? 2 : 1].appendChild(cat);
        });
        menuEl.innerHTML = '';
        menuEl.appendChild(cols[1]);
        menuEl.appendChild(cols[2]);
        fitMenu();
    }

    var posterEl = document.getElementById('poster');
    var loader = window.MokkoLoader(document.getElementById('loader'));
    var log = window.MokkoLog;
    var mediaGen = 0;
    var activeUrls = [];

    function revokeLater(urls) {
        // освобождаем с запасом: последний кадр старого плеера ещё может быть на экране
        setTimeout(function () { urls.forEach(function (u) { URL.revokeObjectURL(u); }); }, 10000);
    }

    function setupMedia(payload) {
        var m = payload.menu.media || { videos: [], poster: '' };
        var key = JSON.stringify(m);
        if (key === mediaKey) return;
        mediaKey = key;
        var gen = ++mediaGen;
        var manifest = m.files || {};
        var hasManifest = !!m.files;
        var raw;
        if (m.scenes && m.scenes.length) {
            raw = m.scenes.map(function (s) {
                return { names: s.videos || [], intro: s.intro || 0,
                         loops: s.loops == null ? 5 : s.loops };
            });
        } else {
            // легаси: список клипов = одна сцена, последний клип цикловой
            var vs = m.videos || [];
            raw = vs.length ? [{ names: vs, intro: vs.length - 1,
                loops: m.last_loops == null ? 5 : m.last_loops }] : [];
        }
        // клипы, которых нет на сервере, пропускаем — иначе загрузка никогда не закончится;
        // границу цикла пересчитываем по уцелевшим сюжетным клипам
        raw.forEach(function (s) {
            var intro = 0;
            s.names = s.names.filter(function (n, i) {
                var ok = !hasManifest || !!manifest[n];
                if (!ok) log.warn('media.missing', { file: n });
                else if (i < s.intro) intro++;
                return ok;
            });
            s.intro = intro;
        });
        raw = raw.filter(function (s) { return s.names.length > 0; });

        var files = [], seen = {};
        raw.forEach(function (s) {
            s.names.forEach(function (n) {
                if (seen[n]) return;
                seen[n] = true;
                var f = manifest[n] || { size: 0, v: 0 };
                files.push({ name: n, size: f.size, v: f.v,
                             url: '/assets/video/' + encodeURIComponent(n) + '?v=' + f.v });
            });
        });
        var poster = m.poster ? '/assets/img/' + m.poster : '';
        if (poster) posterEl.style.backgroundImage = 'url(' + poster + ')';

        var playing = player && player.status().state === 'playing';
        var launch = function (urls) {
            var scenes = raw.map(function (s) {
                return { videos: s.names.map(function (n) { return urls[n]; }), names: s.names,
                         intro: s.intro, loops: s.loops };
            });
            var from = player ? player.stop(true) : null;
            revokeLater(activeUrls);
            activeUrls = Object.keys(urls).map(function (n) { return urls[n]; });
            player = window.MokkoPlayer({
                scenes: scenes, poster: poster, from: from,
                a: document.getElementById('vid-a'),
                b: document.getElementById('vid-b'),
                posterEl: posterEl,
                onEvent: function (event, data) {
                    (event === 'player.retry' ? log.warn : log.error)(event, data);
                }
            });
            player.start();
        };

        if (!files.length) { loader.done(); launch({}); return; }
        // пока видео не играет — постер под лоадером; играет — докачиваем фоном
        if (!playing) posterEl.classList.add('on');
        var loaderTimer = playing ? null : setTimeout(function () {
            if (gen === mediaGen) loader.show();
        }, 400);
        window.MokkoMediaCache.ensure({
            screen: screenId,
            files: files,
            isCancelled: function () { return gen !== mediaGen; },
            onProgress: function (done, total) {
                if (gen === mediaGen && loader.isVisible()) loader.progress(done, total);
            },
            onRetry: function (sec) {
                if (gen === mediaGen && loader.isVisible()) loader.retry(sec);
            }
        }).then(function (urls) {
            if (!urls || gen !== mediaGen) return;
            clearTimeout(loaderTimer);
            loader.done(function () {
                // за время прощальной анимации медиа могли смениться ещё раз
                if (gen !== mediaGen) {
                    Object.keys(urls).forEach(function (n) { URL.revokeObjectURL(urls[n]); });
                    return;
                }
                launch(urls);
            });
        }).catch(function (e) {
            log.error('media.fatal', { msg: String(e && e.message || e) });
        });
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

    // версия кода, с которой загружена страница; после деплоя API отдаст другую —
    // перезагружаемся, чтобы ТВ не пришлось перезапускать руками
    var build = document.body.dataset.build || '';

    function reloadForBuild(payload) {
        if (!build || !payload.build || payload.build === build) return false;
        // защита от цикла: если после перезагрузки страница всё ещё старая
        // (кэш прокси), ради той же версии второй раз не перезагружаемся
        try {
            if (sessionStorage.getItem('mokko-reloaded-for') === payload.build) return false;
            sessionStorage.setItem('mokko-reloaded-for', payload.build);
        } catch (e) {}
        log.info('reload.build', { from: build, to: payload.build });
        location.reload();
        return true;
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
            .then(function (payload) { if (payload && !reloadForBuild(payload)) applyPayload(payload); })
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

    (function boot() {
        var c = navigator.connection || {};
        var info = { ua: navigator.userAgent, w: window.innerWidth, h: window.innerHeight,
                     dpr: window.devicePixelRatio, downlink: c.downlink, net: c.effectiveType,
                     idb: !!window.indexedDB };
        if (navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then(function (e) {
                info.quota_mb = Math.round(e.quota / 1048576);
                info.usage_mb = Math.round(e.usage / 1048576);
            }).catch(function () {}).then(function () { log.info('boot', info); });
        } else {
            log.info('boot', info);
        }
    })();

    var perf = window.MokkoPerf({
        videos: [document.getElementById('vid-a'), document.getElementById('vid-b')],
        log: log,
        clip: function () { return player ? player.status().clip : null; }
    });

    setInterval(function () {
        var st = player ? player.status() : { state: 'none', clip: null };
        log.info('heartbeat', { state: loader.isVisible() ? 'loading' : st.state, clip: st.clip,
                                uptime_min: Math.round((Date.now() - startedAt) / 60000),
                                perf: perf.take() });
    }, 600000);

    // перезагрузка — только когда сервер отвечает: без сети вместо экрана
    // осталась бы страница ошибки браузера, и до утра его никто не поднимет
    var reloadPending = false;
    function reloadWhenOnline(reason) {
        if (reloadPending) return;
        reloadPending = true;
        var attempt = function () {
            fetch('/api/menu.php?screen=' + screenId, { cache: 'no-store' })
                .then(function (r) {
                    if (!r.ok) throw new Error(r.status);
                    log.info('reload', { reason: reason });
                    location.reload();
                })
                .catch(function () { setTimeout(attempt, 30000); });
        };
        attempt();
    }

    // На ночь ТВ уходят в standby: страница замирает целиком, а утром
    // продолжает вчерашний показ — reload_at в 04:00 при этом не наступает.
    // Пробуждение видно по разрыву таймера: тогда и перезагружаемся
    var lastTick = Date.now();
    setInterval(function () {
        var now = Date.now();
        var slept = now - lastTick;
        lastTick = now;
        if (slept > 300000) {
            log.info('wake', { slept_min: Math.round(slept / 60000) });
            reloadWhenOnline('wake');
        }
    }, 20000);

    setInterval(function () {
        if (!current) return;
        var d = new Date();
        var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        if (hm === current.settings.reload_at && Date.now() - startedAt > 120000) reloadWhenOnline('schedule');
    }, 60000);
})();
