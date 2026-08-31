window.MokkoPlayer = function (opts) {
    'use strict';
    // Сцена: {videos: [url...], intro: n, loops: k}
    // Клипы 0..intro-1 — сюжет (один раз), intro..конец — цикловая часть,
    // k полных проходов (0 = бесконечно), затем следующая сцена.
    //
    // Стыки: следующий клип предзагружается, пока играет текущий.
    // Внутри сцены — мгновенная склейка (кадры цикла совпадают, стык невидим).
    // Смена сцены — быстрый фейд НОВОГО ролика поверх старого: старый не
    // гаснет, поэтому нет ни провала яркости, ни мигания.
    var scenes = opts.scenes || [];
    var a = opts.a, b = opts.b, posterEl = opts.posterEl;
    var state = { si: 0, ci: 0, passes: 0 };
    var cur = null, stopped = false;

    function showPoster() {
        stopped = true;
        if (opts.poster) posterEl.style.backgroundImage = 'url(' + opts.poster + ')';
        posterEl.classList.add('on');
        a.classList.remove('on', 'top', 'fade');
        b.classList.remove('on', 'top', 'fade');
        a.removeAttribute('src');
        b.removeAttribute('src');
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
        var fin = function (ok) { if (!done) { done = true; cb(ok); } };
        if (el.currentSrc && el.currentSrc.indexOf(src) !== -1 && el.readyState >= 3) {
            try { el.currentTime = 0; } catch (e) {}
            fin(true);
            return;
        }
        var t = setTimeout(function () { fin(false); }, 4000);
        el.onerror = function () { clearTimeout(t); fin(false); };
        el.oncanplaythrough = function () { clearTimeout(t); fin(true); };
        el.src = src;
        el.load();
    }

    function step(sceneChange) {
        if (stopped) return;
        var el = cur === a ? b : a;
        prepare(el, srcOf(state), function (ok) {
            if (stopped) return;
            if (!ok) { showPoster(); return; }
            el.classList.add('top');
            if (cur) el.classList.add(sceneChange ? 'fade' : 'fade-fast');
            var p = el.play();
            var reveal = function () {
                if (stopped) return;
                el.classList.add('on');
                var old = cur;
                cur = el;
                var cleanup = function () {
                    if (old) old.classList.remove('on', 'top', 'fade', 'fade-fast');
                    el.classList.remove('top', 'fade', 'fade-fast');
                };
                setTimeout(cleanup, sceneChange ? 600 : 400);
                // предзагрузка следующего клипа, пока играет текущий
                var nx = computeNext(state);
                var other = el === a ? b : a;
                setTimeout(function () {
                    if (!stopped) prepare(other, srcOf(nx), function () {});
                }, 1000);
                var fired = false;
                var trigger = function () {
                    if (fired || stopped) return;
                    fired = true;
                    el.ontimeupdate = null;
                    el.onended = null;
                    state = nx;
                    step(nx.sceneChange);
                };
                el.onended = trigger;
                // любой стык начинаем чуть раньше конца клипа: новый фейдится
                // поверх ещё ДВИЖУЩЕГОСЯ старого — ни стоп-кадра, ни видимого шва
                var early = nx.sceneChange ? 0.6 : 0.35;
                el.ontimeupdate = function () {
                    if (el.duration && el.duration - el.currentTime <= early) trigger();
                };
            };
            if (p && p.then) p.then(reveal).catch(function () { showPoster(); });
            else reveal();
        });
    }

    return {
        start: function () {
            var ok = scenes.some(function (s) { return s.videos.length > 0; });
            if (!ok) { showPoster(); return; }
            step(false);
        },
        stop: function () {
            stopped = true;
            [a, b].forEach(function (el) {
                el.pause();
                el.removeAttribute('src');
            });
        }
    };
};
