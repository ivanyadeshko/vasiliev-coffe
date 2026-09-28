window.MokkoPlayer = function (opts) {
    'use strict';
    // Сцена: {videos: [url...], names: [файл...], intro: n, loops: k}
    // Клипы 0..intro-1 — сюжет (один раз), intro..конец — цикловая часть,
    // k полных проходов (0 = бесконечно), затем следующая сцена.
    //
    // Стыки: следующий клип предзагружается, пока играет текущий.
    // Внутри сцены — мгновенная склейка (кадры цикла совпадают, стык невидим).
    // Смена сцены — быстрый фейд НОВОГО ролика поверх старого: старый не
    // гаснет, поэтому нет ни провала яркости, ни мигания.
    //
    // Сбой (ошибка, таймаут, отказ play(), зависание) — постер, но не навсегда:
    // через RETRY_MS пробуем снова со следующего клипа.
    var RETRY_MS = 30000, STALL_MS = 15000;
    var scenes = opts.scenes || [];
    var a = opts.a, b = opts.b, posterEl = opts.posterEl;
    var state = { si: 0, ci: 0, passes: 0 };
    var cur = null, stopped = false, failed = false;
    // кадр предыдущего плеера (смена медиа): новый клип проявится поверх него
    var handoff = opts.from || null;
    var retryTimer = null, watchTimer = null;
    var lastTime = -1, lastMove = 0;

    function emit(event, data) { if (opts.onEvent) opts.onEvent(event, data || {}); }

    function nameOf(s) {
        var sc = scenes[s.si];
        return (sc.names && sc.names[s.ci]) || sc.videos[s.ci];
    }

    function posterOn() {
        if (opts.poster) posterEl.style.backgroundImage = 'url(' + opts.poster + ')';
        posterEl.classList.add('on');
    }

    function detach(el) {
        el.onended = el.ontimeupdate = el.onerror = el.oncanplaythrough = null;
        try { el.pause(); } catch (e) {}
    }

    function reset(el) {
        detach(el);
        el.classList.remove('on', 'top', 'fade', 'fade-fast');
        el.removeAttribute('src');
        try { el.load(); } catch (e) {}
    }

    function fail(event, data) {
        if (stopped || failed) return;
        failed = true;
        data = data || {};
        data.file = nameOf(state);
        emit(event, data);
        posterOn();
        reset(a);
        reset(b);
        cur = null;
        handoff = null;
        state = computeNext(state);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(function () {
            if (stopped) return;
            failed = false;
            emit('player.retry', { file: nameOf(state) });
            step(true);
        }, RETRY_MS);
    }

    function computeNext(s) {
        var sc = scenes[s.si];
        if (s.ci < sc.videos.length - 1)
            return { si: s.si, ci: s.ci + 1, passes: s.passes, sceneChange: false };
        if (sc.intro < sc.videos.length) {
            var p = s.passes + 1;
            if (sc.loops === 0 || p < sc.loops)
                return { si: s.si, ci: sc.intro, passes: p, sceneChange: false };
        }
        return { si: (s.si + 1) % scenes.length, ci: 0, passes: 0, sceneChange: true };
    }

    function srcOf(s) { return scenes[s.si].videos[s.ci]; }

    function prepare(el, src, cb) {
        var done = false;
        var fin = function (ok, why) { if (!done) { done = true; cb(ok, why); } };
        if (el.currentSrc && el.currentSrc.indexOf(src) !== -1 && el.readyState >= 3) {
            try { el.currentTime = 0; } catch (e) {}
            fin(true);
            return;
        }
        // клипы локальные (blob:), 10 с — запас для слабого железа ТВ
        var t = setTimeout(function () { fin(false, { reason: 'timeout', ready: el.readyState }); }, 10000);
        el.onerror = function () {
            clearTimeout(t);
            fin(false, { reason: 'error', code: el.error ? el.error.code : 0 });
        };
        el.oncanplaythrough = function () { clearTimeout(t); fin(true); };
        el.src = src;
        el.load();
    }

    // сторож: видео «играет», но кадр не двигается — считаем сбоем
    function watch() {
        clearInterval(watchTimer);
        watchTimer = setInterval(function () {
            if (stopped || failed || !cur) return;
            var now = Date.now();
            if (cur.currentTime !== lastTime) { lastTime = cur.currentTime; lastMove = now; return; }
            if (now - lastMove > STALL_MS) fail('player.stall', { at: cur.currentTime, ready: cur.readyState });
        }, 5000);
    }

    function step(sceneChange) {
        if (stopped || failed) return;
        var el = (cur || handoff) === a ? b : a;
        prepare(el, srcOf(state), function (ok, why) {
            if (stopped || failed) return;
            if (!ok) {
                fail(why.reason === 'timeout' ? 'player.timeout' : 'player.error', why);
                return;
            }
            el.classList.add('top');
            if (cur || handoff) el.classList.add(sceneChange || !cur ? 'fade' : 'fade-fast');
            var p = el.play();
            var reveal = function () {
                if (stopped || failed) return;
                el.classList.add('on');
                posterEl.classList.remove('on');
                lastMove = Date.now();
                var old = cur || handoff;
                handoff = null;
                cur = el;
                var cleanup = function () {
                    if (stopped) return;
                    if (old && old !== cur) old.classList.remove('on', 'top', 'fade', 'fade-fast');
                    el.classList.remove('top', 'fade', 'fade-fast');
                };
                setTimeout(cleanup, sceneChange ? 600 : 400);
                // предзагрузка следующего клипа, пока играет текущий
                var nx = computeNext(state);
                var other = el === a ? b : a;
                setTimeout(function () {
                    if (!stopped && !failed) prepare(other, srcOf(nx), function () {});
                }, 1000);
                var fired = false;
                var trigger = function () {
                    if (fired || stopped || failed) return;
                    fired = true;
                    el.ontimeupdate = null;
                    el.onended = null;
                    state = nx;
                    step(nx.sceneChange);
                };
                el.onended = trigger;
                el.onerror = function () {
                    fail('player.error', { reason: 'playback', code: el.error ? el.error.code : 0 });
                };
                // любой стык начинаем чуть раньше конца клипа: новый фейдится
                // поверх ещё ДВИЖУЩЕГОСЯ старого — ни стоп-кадра, ни видимого шва
                var early = nx.sceneChange ? 0.6 : 0.35;
                el.ontimeupdate = function () {
                    if (el.duration && el.duration - el.currentTime <= early) trigger();
                };
            };
            if (p && p.then) p.then(reveal).catch(function (e) {
                fail('player.play_rejected', { name: e && e.name, msg: e && e.message });
            });
            else reveal();
        });
    }

    return {
        start: function () {
            var ok = scenes.some(function (s) { return s.videos.length > 0; });
            if (!ok) { posterOn(); return; }
            scenes = scenes.filter(function (s) { return s.videos.length > 0; });
            watch();
            step(false);
        },
        // keep: оставить видимым последний кадр (вернёт его <video>) —
        // для бесшовной передачи новому плееру через opts.from
        stop: function (keep) {
            stopped = true;
            clearTimeout(retryTimer);
            clearInterval(watchTimer);
            var vis = keep && cur && !failed ? cur : null;
            [a, b].forEach(function (el) {
                if (el === vis) { detach(el); el.classList.remove('top', 'fade', 'fade-fast'); }
                else reset(el);
            });
            return vis;
        },
        status: function () {
            return { state: failed ? 'poster' : (cur ? 'playing' : 'starting'),
                     clip: scenes.length ? nameOf(state) : null };
        }
    };
};
