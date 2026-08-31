window.MokkoPlayer = function (opts) {
    'use strict';
    var vids = opts.videos || [];
    var a = opts.a, b = opts.b, posterEl = opts.posterEl;
    var idx = 0, active = null, switching = false, stopped = false;

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
        switching = false;
    }

    function playNext() {
        if (stopped) return;
        switching = true;
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
        el.onended = function () { if (!switching && !stopped) playNext(); };
        el.src = src;
        el.load();
    }

    function tick() {
        if (stopped || !active || switching) return;
        if (active.duration && active.duration - active.currentTime < 1.2) playNext();
    }

    return {
        start: function () {
            if (!vids.length) { showPoster(); return; }
            [a, b].forEach(function (el) { el.addEventListener('timeupdate', tick); });
            playNext();
        },
        stop: function () {
            stopped = true;
            [a, b].forEach(function (el) {
                el.removeEventListener('timeupdate', tick);
                el.pause();
                el.removeAttribute('src');
            });
        }
    };
};
