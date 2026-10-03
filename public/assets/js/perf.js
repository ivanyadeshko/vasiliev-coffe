window.MokkoPerf = function (opts) {
    'use strict';
    // Плавность показа на ТВ: кратковременные сбои картинки (рябь, рывки)
    // не ловит сторож плеера — он видит только зависания дольше 15 с.
    //
    // Замер по кадрам видео (requestVideoFrameCallback), а не по
    // requestAnimationFrame: rAF-цикл сам заставлял бы ТВ собирать кадр
    // 60 раз в секунду, а кадры видео (24/с) рисуются и так.
    //
    // Сводка — в heartbeat (take()), заметные сбои — отдельным событием,
    // не чаще раза в минуту на тип, пропущенные считаются в suppressed.
    var GAP_COUNT_MS = 100;   // при 24 fps норма ~42 мс; 100+ — потеряно 2+ кадра
    var GAP_REPORT_MS = 250;  // рывок, заметный глазу, — отдельным событием
    var DROP_REPORT = 10;     // потерянных декодером кадров за ролик
    var REPORT_EVERY_MS = 60000;
    var log = opts.log, clip = opts.clip;
    var stats, lastReport = {}, suppressed = {};

    function zero() {
        stats = { gaps: 0, gap_max_ms: 0, frames: 0, dropped: 0, corrupted: 0,
                  longtasks: 0, longtask_max_ms: 0 };
    }
    zero();

    function report(event, data) {
        var now = Date.now();
        if (now - (lastReport[event] || 0) < REPORT_EVERY_MS) {
            suppressed[event] = (suppressed[event] || 0) + 1;
            return;
        }
        lastReport[event] = now;
        if (suppressed[event]) { data.suppressed = suppressed[event]; suppressed[event] = 0; }
        data.clip = clip();
        log.warn(event, data);
    }

    function watch(el) {
        // token обрывает старую цепочку колбэков: после паузы, перемотки
        // или смены ролика интервал до следующего кадра — не сбой
        var token = 0, last = 0, lastMedia = 0, lastPresented = 0;
        var q0 = { total: 0, dropped: 0, corrupted: 0 };

        function onFrame(my) {
            return function (now, meta) {
                if (my !== token) return;
                if (last && !document.hidden) {
                    var gap = now - last;
                    if (gap >= GAP_COUNT_MS) {
                        stats.gaps++;
                        if (gap > stats.gap_max_ms) stats.gap_max_ms = Math.round(gap);
                    }
                    if (gap >= GAP_REPORT_MS) {
                        report('render.jank', {
                            gap_ms: Math.round(gap),
                            // видео шло, а экран не обновлялся — или стояло и само видео
                            media_ms: Math.round((meta.mediaTime - lastMedia) * 1000),
                            frames: meta.presentedFrames - lastPresented,
                            at: Math.round(meta.mediaTime * 100) / 100
                        });
                    }
                }
                last = now;
                lastMedia = meta.mediaTime;
                lastPresented = meta.presentedFrames;
                el.requestVideoFrameCallback(onFrame(my));
            };
        }

        function stop() { token++; last = 0; }

        // счётчики декодера растут с начала ролика и обнуляются при смене src
        function sample() {
            if (!el.getVideoPlaybackQuality) return;
            var q = el.getVideoPlaybackQuality();
            var base = q.totalVideoFrames >= q0.total ? q0 : { total: 0, dropped: 0, corrupted: 0 };
            var d = { total: q.totalVideoFrames - base.total,
                      dropped: q.droppedVideoFrames - base.dropped,
                      corrupted: (q.corruptedVideoFrames || 0) - base.corrupted };
            q0 = { total: q.totalVideoFrames, dropped: q.droppedVideoFrames,
                   corrupted: q.corruptedVideoFrames || 0 };
            stats.frames += d.total;
            stats.dropped += d.dropped;
            stats.corrupted += d.corrupted;
            if (d.corrupted > 0 || d.dropped >= DROP_REPORT) {
                report('player.frames', { dropped: d.dropped, corrupted: d.corrupted, total: d.total });
            }
        }

        el.addEventListener('playing', function () {
            stop();
            if (el.requestVideoFrameCallback) el.requestVideoFrameCallback(onFrame(token));
        });
        ['pause', 'waiting', 'seeking'].forEach(function (ev) { el.addEventListener(ev, stop); });
        el.addEventListener('ended', function () { stop(); sample(); });
        el.addEventListener('pause', sample);
        el.addEventListener('emptied', function () { stop(); q0 = { total: 0, dropped: 0, corrupted: 0 }; });
        return { sample: function () { if (!el.paused) sample(); } };
    }

    var watchers = opts.videos.map(watch);

    // длинные задачи главного потока (> 50 мс): скрипты, стили, сборка мусора
    try {
        new PerformanceObserver(function (list) {
            list.getEntries().forEach(function (e) {
                stats.longtasks++;
                if (e.duration > stats.longtask_max_ms) stats.longtask_max_ms = Math.round(e.duration);
            });
        }).observe({ entryTypes: ['longtask'] });
    } catch (e) {}

    return {
        // сводка с прошлого вызова — для heartbeat
        take: function () {
            watchers.forEach(function (w) { w.sample(); });
            var out = stats;
            zero();
            return out;
        }
    };
};
