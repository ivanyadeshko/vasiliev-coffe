(function () {
    'use strict';
    var data = window.SCREEN_DATA;
    var root = document.getElementById('editor');
    var msg = document.getElementById('msg');
    var LIMITS = { 1: 10, 2: 10, 3: 9, 4: 9 };

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }
    function input(value, cls, placeholder) {
        var i = el('input', cls);
        i.value = value == null ? '' : value;
        i.placeholder = placeholder || '';
        return i;
    }

    // высота поля состава — по тексту: виден весь состав и все переносы строк
    function fitDesc(t) {
        t.style.height = 'auto';
        t.style.height = (t.scrollHeight + t.offsetHeight - t.clientHeight) + 'px';
    }
    function fitAll() { [].forEach.call(root.querySelectorAll('textarea.f-desc'), fitDesc); }
    window.addEventListener('resize', fitAll);

    function renderItem(cat, it, ii) {
        var row = el('div', 'row' + (it.visible ? '' : ' off'));
        var name = input(it.name, 'f-name', 'название');
        name.oninput = function () { it.name = name.value; };
        // состав — многострочный: Enter переносит текст на новую строку на экране
        var desc = el('textarea', 'f-desc');
        desc.value = it.desc == null ? '' : it.desc;
        desc.placeholder = 'состав (Enter — новая строка)';
        desc.rows = 1;
        desc.oninput = function () { it.desc = desc.value; fitDesc(desc); };
        var vol = input(it.volume, 'f-vol', 'объём');
        vol.oninput = function () { it.volume = vol.value; };
        var p1 = input(it.prices[0], 'f-price', '₽');
        p1.type = 'number'; p1.min = '0';
        p1.oninput = function () { it.prices[0] = p1.value === '' ? null : Number(p1.value); };
        var p2 = input(it.prices.length > 1 ? it.prices[1] : '', 'f-price', '₽ · 2-й объём');
        p2.type = 'number'; p2.min = '0';
        p2.oninput = function () {
            if (p2.value === '') it.prices = [it.prices[0] === undefined ? null : it.prices[0]];
            else it.prices[1] = Number(p2.value);
        };
        var vis = el('button', 'tgl', it.visible ? 'скрыть' : 'показать');
        vis.type = 'button';
        vis.onclick = function () { it.visible = !it.visible; render(); };
        var up = el('button', 'mv', '↑');
        up.type = 'button';
        up.onclick = function () { if (ii > 0) { cat.items.splice(ii - 1, 0, cat.items.splice(ii, 1)[0]); render(); } };
        var dn = el('button', 'mv', '↓');
        dn.type = 'button';
        dn.onclick = function () { if (ii < cat.items.length - 1) { cat.items.splice(ii + 1, 0, cat.items.splice(ii, 1)[0]); render(); } };
        var del = el('button', 'del', '✕');
        del.type = 'button';
        del.onclick = function () {
            if (confirm('Удалить «' + (it.name || 'позицию') + '»?')) { cat.items.splice(ii, 1); render(); }
        };
        [name, desc, vol, p1, p2, vis, up, dn, del].forEach(function (x) { row.appendChild(x); });
        return row;
    }

    function render() {
        root.innerHTML = '';
        data.categories.forEach(function (cat) {
            var box = el('section', 'catbox');
            var head = el('div', 'cathead');
            var t = input(cat.title, 'cat-title');
            t.oninput = function () { cat.title = t.value; };
            head.appendChild(t);
            var warn = el('span', 'count', cat.items.length + ' поз.');
            if (cat.items.length > (LIMITS[data.screen] || 10)) {
                warn.classList.add('over');
                warn.textContent += ' — многовато, может не влезть';
            }
            head.appendChild(warn);
            box.appendChild(head);
            cat.items.forEach(function (it, ii) { box.appendChild(renderItem(cat, it, ii)); });
            var add = el('button', 'add', '+ позиция');
            add.type = 'button';
            add.onclick = function () {
                cat.items.push({ id: 'item-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                    name: '', desc: '', volume: '', prices: [null], visible: true });
                render();
            };
            box.appendChild(add);
            root.appendChild(box);
        });
        fitAll();
    }

    document.getElementById('save').onclick = function () {
        msg.textContent = 'сохраняю…';
        msg.className = '';
        fetch('/api/save.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.CSRF },
            body: JSON.stringify(data)
        }).then(function (r) {
            return r.json().then(function (j) { return { s: r.status, j: j }; });
        }).then(function (res) {
            if (res.s === 200) { msg.textContent = 'сохранено ✓'; msg.className = 'ok'; }
            else {
                msg.textContent = 'ошибка: ' + (res.j.errors ? res.j.errors.join('; ') : res.j.error);
                msg.className = 'err';
            }
        }).catch(function () {
            msg.textContent = 'сеть недоступна';
            msg.className = 'err';
        });
    };

    render();
})();
