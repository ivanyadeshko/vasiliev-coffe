window.MokkoPlayer = function (opts) {
    'use strict';
    var vids = opts.videos || [];
    var a = opts.a, b = opts.b, posterEl = opts.posterEl;
    // последний клип плейлиста (обычно зацикленное испарение) повторяется
    // lastLoops раз с кроссфейдом, затем плейлист начинается заново;
    // 0 = последний клип крутится бесконечно
    var lastLoops = opts.lastLoops == null ? 5 : opts.lastLoops;
    var idx = 0, repeats = 0, active = null, stopped = false;

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

    function advance() {
        if (idx < vids.length - 1) { idx++; return; }
        repeats++;
        if (lastLoops !== 0 && repeats >= lastLoops) { idx = 0; repeats = 0; }
    }

    function playCurrent() {
        if (stopped) return;
        var el = active === a ? b : a;
        var src = vids[idx];
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
            if (!vids.length) { showPoster(); return; }
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
