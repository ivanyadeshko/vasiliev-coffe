window.MokkoPlayer = function (opts) {
    'use strict';
    // Сцена: {videos: [url...], intro: n, loops: k}
    //  - клипы 0..intro-1 играют один раз (сюжет),
    //  - клипы intro..конец — цикловая часть (обычно пар вперёд/назад:
    //    стыки совпадают покадрово, скачков нет), k полных проходов
    //    (0 = бесконечно), затем плавный переход к следующей сцене.
    var scenes = opts.scenes || [];
    var a = opts.a, b = opts.b, posterEl = opts.posterEl;
    var si = 0, ci = 0, passes = 0, active = null, stopped = false;

    function showPoster() {
        stopped = true;
        if (opts.poster) posterEl.style.backgroundImage = 'url(' + opts.poster + ')';
        posterEl.classList.add('on');
        a.classList.remove('on');
        b.classList.remove('on');
        a.removeAttribute('src');
        b.removeAttribute('src');
    }

    function swapTo(el) {
        var other = el === a ? b : a;
        el.classList.add('on');
        other.classList.remove('on');
        active = el;
    }

    function nextScene() {
        si = (si + 1) % scenes.length;
        ci = 0;
        passes = 0;
    }

    function advance() {
        var sc = scenes[si];
        if (ci < sc.videos.length - 1) { ci++; return; }
        if (sc.intro >= sc.videos.length) { nextScene(); return; } // цикла нет
        passes++;
        if (sc.loops !== 0 && passes >= sc.loops) nextScene();
        else ci = sc.intro;
    }

    function playCurrent() {
        if (stopped) return;
        var el = active === a ? b : a;
        var src = scenes[si].videos[ci];
        var done = false;
        var fail = function () { if (!done) { done = true; showPoster(); } };
        var t = setTimeout(fail, 4000);
        el.onerror = fail;
        el.oncanplay = function () {
            if (done) return;
            done = true;
            clearTimeout(t);
            var p = el.play();
            if (p && p.catch) p.then(function () { swapTo(el); }).catch(fail);
            else swapTo(el);
        };
        el.onended = function () {
            if (stopped) return;
            advance();
            playCurrent();
        };
        el.src = src;
        el.load();
    }

    return {
        start: function () {
            var ok = scenes.some(function (s) { return s.videos.length > 0; });
            if (!ok) { showPoster(); return; }
            playCurrent();
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
