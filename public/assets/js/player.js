window.MokkoPlayer = function (opts) {
    'use strict';
    var vids = opts.videos || [];
    var a = opts.a, b = opts.b, posterEl = opts.posterEl;
    var hold = (opts.holdSeconds == null ? 15 : opts.holdSeconds) * 1000;
    var idx = 0, active = null, stopped = false, holdTimer = null;

    function showPoster() {
        stopped = true;
        clearTimeout(holdTimer);
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

    function playNext() {
        if (stopped) return;
        var el = active === a ? b : a;
        var src = vids[idx % vids.length];
        idx++;
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
        // ролик доигрывает до конца, замирает на финальном кадре,
        // держит паузу и только потом кроссфейдится в следующий
        el.onended = function () {
            if (stopped) return;
            clearTimeout(holdTimer);
            holdTimer = setTimeout(playNext, hold);
        };
        el.src = src;
        el.load();
    }

    return {
        start: function () {
            if (!vids.length) { showPoster(); return; }
            playNext();
        },
        stop: function () {
            stopped = true;
            clearTimeout(holdTimer);
            [a, b].forEach(function (el) {
                el.pause();
                el.removeAttribute('src');
            });
        }
    };
};
