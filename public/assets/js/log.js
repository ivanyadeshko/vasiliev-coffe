window.MokkoLog = (function () {
    'use strict';
    // Журнал экрана → /api/log.php. Буфер дублируется в localStorage:
    // события, случившиеся без сети, уйдут на сервер позже (в т.ч. после reload).
    var screen = Number(document.body.dataset.screen) || 0;
    var KEY = 'mokko-log-' + screen;
    var MAX_BUF = 200, MAX_BATCH = 50, MAX_BATCH_BYTES = 24 * 1024;
    var sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    var buf = [];
    var sending = false;
    var jsErrors = 0;
    var seq = 0;

    try { buf = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { buf = []; }
    // у каждой записи свой номер: после отправки удаляем именно подтверждённые,
    // даже если буфер за это время сдвинулся из-за вытеснения старых записей
    buf.forEach(function (e) { e.n = ++seq; });

    // сервер ограничивает тело в байтах, а кириллица в UTF-8 — 2 байта на символ
    function utf8Len(s) {
        return window.TextEncoder ? new TextEncoder().encode(s).length
                                  : unescape(encodeURIComponent(s)).length;
    }

    function persist() {
        try { localStorage.setItem(KEY, JSON.stringify(buf)); } catch (e) {}
    }

    function push(level, event, data) {
        buf.push({ n: ++seq, ts: new Date().toISOString(), screen: screen, sid: sid,
                   level: level, event: event, data: data == null ? null : data });
        if (buf.length > MAX_BUF) buf.splice(0, buf.length - MAX_BUF);
        persist();
        if (level === 'error') flush();
    }

    function flush() {
        if (sending || !buf.length) return;
        // пачка ограничена и по числу, и по объёму: сервер не примет тело больше 32 КБ
        var n = 0, bytes = 0;
        while (n < buf.length && n < MAX_BATCH) {
            bytes += utf8Len(JSON.stringify(buf[n])) + 1;
            if (n > 0 && bytes > MAX_BATCH_BYTES) break;
            n++;
        }
        var batch = buf.slice(0, n);
        sending = true;
        fetch('/api/log.php', {
            method: 'POST', cache: 'no-store', keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries: batch })
        }).then(function (r) {
            // 4xx — пачка негодна, повтор ничего не даст; при 5xx и обрыве — оставляем
            if (r.ok || (r.status >= 400 && r.status < 500)) {
                var sent = {};
                batch.forEach(function (e) { sent[e.n] = true; });
                buf = buf.filter(function (e) { return !sent[e.n]; });
                persist();
            }
        }).catch(function () {}).then(function () { sending = false; });
    }

    setInterval(flush, 30000);

    window.addEventListener('error', function (e) {
        if (++jsErrors > 20) return;
        push('error', 'js.error', { msg: String(e.message || ''), src: String(e.filename || ''),
                                    line: e.lineno || 0, col: e.colno || 0 });
    });
    window.addEventListener('unhandledrejection', function (e) {
        if (++jsErrors > 20) return;
        var r = e.reason;
        push('error', 'js.error', { msg: 'unhandledrejection: ' + String(r && r.message || r) });
    });

    return {
        info: function (event, data) { push('info', event, data); },
        warn: function (event, data) { push('warn', event, data); },
        error: function (event, data) { push('error', event, data); },
        flush: flush
    };
})();
