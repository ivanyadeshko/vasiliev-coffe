window.MokkoMediaCache = (function () {
    'use strict';
    // Клипы экрана скачиваются целиком заранее и лежат в IndexedDB:
    // после первой загрузки показ не зависит от сети. Cache API здесь
    // недоступен — прод работает по HTTP, а он требует secure context.
    var DB = 'mokko-media', STORE = 'clips';
    var RETRY = [5, 15, 30, 60];
    var STALL_MS = 30000;
    var dbPromise = null;
    var idbOk = true;
    var mem = {};   // запасное хранение в памяти, если IndexedDB отказала

    function log(level, event, data) {
        if (window.MokkoLog) window.MokkoLog[level](event, data);
    }

    function idbFail(err) {
        if (!idbOk) return;
        idbOk = false;
        log('warn', 'media.idb_fail', { msg: String(err && (err.message || err.name) || err) });
    }

    // любая операция IndexedDB с таймаутом: на некоторых ТВ‑браузерах она может просто зависнуть
    function withTimeout(p, ms) {
        return new Promise(function (res, rej) {
            var t = setTimeout(function () { rej(new Error('idb timeout')); }, ms);
            p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
        });
    }

    function openDb() {
        if (!dbPromise) {
            dbPromise = withTimeout(new Promise(function (res, rej) {
                if (!window.indexedDB) { rej(new Error('no indexedDB')); return; }
                var rq = indexedDB.open(DB, 1);
                rq.onupgradeneeded = function () { rq.result.createObjectStore(STORE); };
                rq.onsuccess = function () { res(rq.result); };
                rq.onerror = function () { rej(rq.error); };
            }), 5000);
        }
        return dbPromise;
    }

    function tx(mode, fn) {
        if (!idbOk) return Promise.reject(new Error('idb off'));
        return withTimeout(openDb().then(function (db) {
            return new Promise(function (res, rej) {
                var t = db.transaction(STORE, mode);
                var out = fn(t.objectStore(STORE));
                t.oncomplete = function () { res(out && 'result' in out ? out.result : undefined); };
                t.onerror = function () { rej(t.error); };
                t.onabort = function () { rej(t.error || new Error('abort')); };
            });
        }), 15000);
    }

    function get(key) {
        if (mem[key]) return Promise.resolve(mem[key]);
        return tx('readonly', function (s) { return s.get(key); })
            .catch(function (e) { idbFail(e); return null; });
    }

    function put(key, blob) {
        return tx('readwrite', function (s) { s.put(blob, key); })
            .catch(function (e) { idbFail(e); mem[key] = blob; });
    }

    function cleanup(prefix, keep) {
        Object.keys(mem).forEach(function (k) {
            if (k.indexOf(prefix) === 0 && !keep[k]) delete mem[k];
        });
        return tx('readonly', function (s) { return s.getAllKeys(); }).then(function (keys) {
            var stale = (keys || []).filter(function (k) {
                return String(k).indexOf(prefix) === 0 && !keep[k];
            });
            if (!stale.length) return;
            return tx('readwrite', function (s) { stale.forEach(function (k) { s.delete(k); }); });
        }).catch(function () {});
    }

    function download(url, onBytes) {
        return new Promise(function (res, rej) {
            var x = new XMLHttpRequest();
            var stall = null;
            var arm = function () {
                clearTimeout(stall);
                stall = setTimeout(function () { x.abort(); rej(new Error('stalled')); }, STALL_MS);
            };
            x.open('GET', url, true);
            x.responseType = 'blob';
            x.onprogress = function (e) { arm(); onBytes(e.loaded); };
            x.onload = function () {
                clearTimeout(stall);
                if (x.status === 200) res(x.response);
                else rej(new Error('HTTP ' + x.status));
            };
            x.onerror = function () { clearTimeout(stall); rej(new Error('network')); };
            arm();
            x.send();
        });
    }

    // пауза перед повтором; сеть вернулась (событие online) — повторяем сразу
    function wait(sec, isCancelled) {
        return new Promise(function (res) {
            var left = sec * 1000;
            var finish = function () {
                clearInterval(t);
                window.removeEventListener('online', finish);
                res();
            };
            var t = setInterval(function () {
                left -= 1000;
                if (left <= 0 || isCancelled()) finish();
            }, 1000);
            window.addEventListener('online', finish);
        });
    }

    /**
     * opts: {screen, files: [{name, url, size, v}], onProgress(done, total),
     *        onRetry(sec, name), isCancelled()}
     * → Promise<{name: blobUrl}> | Promise<null> при отмене. Не отклоняется:
     * при сбоях сети повторяет попытки бесконечно.
     */
    function ensure(opts) {
        var files = opts.files;
        var prefix = 's' + opts.screen + '/';
        var total = 0, done = 0;
        var keep = {}, urls = {};
        var stats = { hits: 0, downloaded: 0, bytes: 0 };
        var t0 = Date.now();
        var isCancelled = opts.isCancelled || function () { return false; };
        var progress = function (extra) {
            if (opts.onProgress) opts.onProgress(done + extra, total);
        };
        files.forEach(function (f) { total += f.size || 0; });

        function fetchFile(f, key, attempt) {
            var started = Date.now();
            return download(f.url, function (b) { progress(b); }).then(function (blob) {
                if (f.size && blob.size !== f.size) throw new Error('size ' + blob.size + ' != ' + f.size);
                var ms = Date.now() - started;
                log('info', 'media.download_ok', { file: f.name, bytes: blob.size, ms: ms,
                    kbps: Math.round(blob.size * 8 / Math.max(ms, 1)) });
                stats.downloaded++;
                stats.bytes += blob.size;
                return put(key, blob).then(function () { return blob; });
            }).catch(function (err) {
                if (isCancelled()) return null;
                var sec = RETRY[Math.min(attempt, RETRY.length - 1)];
                log('warn', 'media.download_fail', { file: f.name, err: String(err && err.message || err),
                    attempt: attempt + 1, retry_in: sec });
                progress(0);
                if (opts.onRetry) opts.onRetry(sec, f.name);
                return wait(sec, isCancelled).then(function () {
                    return isCancelled() ? null : fetchFile(f, key, attempt + 1);
                });
            });
        }

        function next(i) {
            if (isCancelled()) {
                Object.keys(urls).forEach(function (n) { URL.revokeObjectURL(urls[n]); });
                return Promise.resolve(null);
            }
            if (i >= files.length) {
                if (stats.hits) log('info', 'media.cache_hit', { files: stats.hits });
                log('info', 'media.ready', { files: files.length, downloaded: stats.downloaded,
                    bytes: stats.bytes, ms: Date.now() - t0, idb: idbOk });
                cleanup(prefix, keep);
                return Promise.resolve(urls);
            }
            var f = files[i];
            var key = prefix + f.name + '@' + f.v;
            keep[key] = true;
            return get(key).then(function (blob) {
                if (blob && (!f.size || blob.size === f.size)) { stats.hits++; return blob; }
                return fetchFile(f, key, 0);
            }).then(function (blob) {
                if (!blob) return next(i);  // отменено во время загрузки — next() уберёт хвосты
                urls[f.name] = URL.createObjectURL(blob);
                done += f.size || 0;
                progress(0);
                return next(i + 1);
            });
        }

        return next(0);
    }

    return { ensure: ensure };
})();
