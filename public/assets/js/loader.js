window.MokkoLoader = function (root) {
    'use strict';
    // Лоадер витрины: эмблема с прогресс-кольцом, пар, «МОККО», подпись.
    var ring = root.querySelector('#loader-ring');
    var caption = root.querySelector('#loader-caption');
    var countdown = null;
    var visible = false;

    function pct(p) { ring.style.strokeDashoffset = String(100 - p); }
    function say(text) { caption.textContent = text; }

    return {
        show: function () {
            if (visible) return;
            visible = true;
            root.hidden = false;
            root.classList.remove('done');
            void root.offsetWidth;
            root.classList.add('show');
        },
        progress: function (done, total) {
            clearInterval(countdown);
            root.classList.remove('offline');
            var p = total > 0 ? Math.min(99, Math.floor(done / total * 100)) : 0;
            pct(p);
            say('Загружаем видео · ' + p + ' %');
        },
        retry: function (sec) {
            clearInterval(countdown);
            root.classList.add('offline');
            var left = sec;
            var tick = function () {
                say(left > 0 ? 'Нет связи · повтор через ' + left + ' с' : 'Нет связи · пробуем снова');
                left--;
                if (left < 0) clearInterval(countdown);
            };
            tick();
            countdown = setInterval(tick, 1000);
        },
        // cb вызывается, когда кольцо замкнулось и лоадер начал уходить
        done: function (cb) {
            clearInterval(countdown);
            if (!visible) { if (cb) cb(); return; }
            root.classList.remove('offline');
            pct(100);
            say('Загружаем видео · 100 %');
            setTimeout(function () {
                root.classList.add('done');
                root.classList.remove('show');
                if (cb) cb();
                setTimeout(function () { root.hidden = true; visible = false; }, 700);
            }, 450);
        },
        isVisible: function () { return visible; }
    };
};
