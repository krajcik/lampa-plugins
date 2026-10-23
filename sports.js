(function (root) {
    'use strict';
    var VERSION = '0.3.1';
    var SPORTS = {
        nhl: { title: 'NHL', path: 'hockey/nhl', color: '#29496a' },
        nba: { title: 'NBA', path: 'basketball/nba', color: '#824831' },
        ufc: { title: 'UFC', path: 'mma/ufc', color: '#78323c' },
        f1: { title: 'Formula 1', path: 'racing/f1', color: '#883237' },
        nascar: { title: 'NASCAR Cup', path: 'racing/nascar-premier', color: '#74602d' }
    };
    var PARTS = { FP1: 'Тренировка 1', FP2: 'Тренировка 2', FP3: 'Тренировка 3', Qual: 'Квалификация', SQ: 'Квалификация спринта', Sprint: 'Спринт', Race: 'Гонка' };
    var COVERS = { nhl: 4, nba: 5, ufc: 14, f1: 10, nascar: 10 };
    function image(url) {
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return '';
        try { var parsed = new URL(url); return parsed.username || parsed.password ? '' : parsed.href; } catch (_) { return ''; }
    }
    function validDate(value) { return typeof value === 'string' && isFinite(Date.parse(value)); }
    function monthKey(date) { return date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0'); }
    function schedule(sport, data, now) {
        now = now || Date.now();
        var logos = data.leagues && data.leagues[0] && data.leagues[0].logos || [];
        return (Array.isArray(data.events) ? data.events : []).map(function (e) {
            if (!e.id || !validDate(e.date) || Date.parse(e.date) > now) return null;
            if (e.status && e.status.type && ['STATUS_CANCELED', 'STATUS_POSTPONED'].includes(e.status.type.name)) return null;
            var competitions = e.competitions || [], first = competitions[0] || {};
            var event = { id: sport + '_' + e.id, sport: sport, date: e.date, end: validDate(e.endDate) ? e.endDate : e.date, logo: image(logos[0] && logos[0].href), parts: [] };
            if (sport === 'nhl' || sport === 'nba') {
                event.teams = (first.competitors || []).map(function (c) { return { name: String(c.team && c.team.displayName || ''), logo: image(c.team && c.team.logo) }; });
                if (event.teams.length !== 2 || event.teams.some(function (t) { return !t.name; })) return null;
                event.title = event.teams.map(function (t) { return t.name; }).join(' — ');
                event.parts = [{ id: 'full', title: 'Полная запись', date: e.date }];
            } else if (sport === 'f1') {
                event.location = String(e.circuit && e.circuit.address && (e.circuit.address.city || e.circuit.address.country) || e.shortName || e.name || 'Formula 1');
                event.title = 'Гран-при: ' + event.location;
                competitions.forEach(function (c) {
                    var key = c.type && c.type.abbreviation;
                    if (key === 'SS') key = 'SQ';
                    if (key === 'SR') key = 'Sprint';
                    if (PARTS[key] && validDate(c.date)) event.parts.push({ id: key, title: PARTS[key], date: c.date });
                });
                event.parts.sort(function (a, b) { return Date.parse(a.date) - Date.parse(b.date); });
            } else if (sport === 'ufc') {
                event.title = String(e.name || e.shortName || 'UFC');
                event.parts = [{ id: 'full', title: 'Полный турнир', date: e.date }, { id: 'main', title: 'Основной кард' }, { id: 'prelims', title: 'Прелимы' }, { id: 'early', title: 'Ранние прелимы' }];
            } else {
                event.title = String(e.name || 'NASCAR Cup');
                event.parts = [{ id: 'full', title: 'Гонка', date: e.date }];
            }
            return event.parts.length ? event : null;
        }).filter(Boolean).sort(function (a, b) { return Date.parse(b.date) - Date.parse(a.date); });
    }
    function searchParams(event, part) {
        var year = new Date(event.date).getUTCFullYear(), broad = SPORTS[event.sport].title + (event.sport === 'nhl' ? '' : ' ' + year);
        var query = event.title;
        if (event.sport === 'f1') query = 'Formula 1 ' + year + ' ' + event.location + ' ' + part.id;
        else if (event.sport === 'ufc' && part.id !== 'full') query += ' ' + ({ main: 'Main Card', prelims: 'Prelims', early: 'Early Prelims' }[part.id] || part.title);
        return { component: 'torrents', title: 'Поиск записи', search: query, from_search: true, krajcik_sports: true, page: 1,
            movie: { title: escape(event.title), original_title: escape(event.title), release_date: event.date, genres: [], names: [broad, SPORTS[event.sport].title] } };
    }
    function nativeEvent(data) {
        var title = String(data.title || '').replace(/\s*\(RU\)/gi, '').trim(), sport;
        if (/\bNHL\b|НХЛ/i.test(title)) sport = 'nhl';
        else if (/\bNBA\b|НБА/i.test(title)) sport = 'nba';
        else if (/\bUFC\b/i.test(title)) sport = 'ufc';
        else if (/formula[ ._-]*1|формула[ ._-]*1|\bF1\b/i.test(title)) sport = 'f1';
        else if (/nascar|наскар/i.test(title)) sport = 'nascar';
        var time = Number(data.time_start);
        if (!sport || !isFinite(time) || !time || !isFinite(new Date(time).getTime())) return null;
        return { id: 'cub_' + data.id, sport: sport, title: title, date: new Date(time).toISOString(), parts: [{ id: 'full', title: 'Запись трансляции' }] };
    }
    var core = { SPORTS: SPORTS, schedule: schedule, searchParams: searchParams, nativeEvent: nativeEvent, image: image };
    if (typeof module !== 'undefined' && module.exports) module.exports = core;
    if (!root || !root.Lampa || root.krajcik_sports) return;
    root.krajcik_sports = { version: VERSION };
    var L = root.Lampa, calendars = {};
    function escape(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function stamp(date) { return new Date(date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    function restore() { L.Controller.toggle('content'); }
    function choose(event) {
        function open(part) { L.Activity.push(searchParams(event, part)); }
        if (event.parts.length === 1) return open(event.parts[0]);
        L.Select.show({ title: event.title, items: event.parts.map(function (part) {
            return { title: part.title, subtitle: part.date ? stamp(part.date) : 'Время части не указано', noenter: part.date && Date.parse(part.date) > Date.now(), onSelect: function () { open(part); } };
        }), onBack: restore });
    }
    function load(sport, month, state) {
        var key = sport + month;
        if (calendars[key] && Date.now() - calendars[key].at < 600000) return Promise.resolve(calendars[key].events);
        return new Promise(function (resolve, reject) {
            var net = new L.Reguest(), done = false;
            function finish(fn, value) { if (done) return; done = true; state.jobs.delete(job); net.clear(); fn(value); }
            var job = { cancel: function () { finish(reject, new Error('cancelled')); } };
            state.jobs.add(job); net.timeout(15000);
            net.native('https://site.api.espn.com/apis/site/v2/sports/' + SPORTS[sport].path + '/scoreboard?dates=' + month + '&limit=1000', function (data) {
                if (done) return;
                if (!data || !Array.isArray(data.events)) return finish(reject, new Error('calendar format'));
                var events = schedule(sport, data); calendars[key] = { at: Date.now(), events: events }; finish(resolve, events);
            }, function () { finish(reject, new Error('calendar unavailable')); });
        });
    }
    function CalendarCard(state, event, title, subtitle, action) {
        this.create = function () {
            var self = this;
            this.node = document.createElement('div');
            this.node.className = 'card card--wide selector layer--visible layer--render krajcik-sports-card';
            if (!event.id) this.node.classList.add('krajcik-sports-control');
            this.node.innerHTML = '<div class="card__view"><img class="krajcik-sports-cover"><div class="krajcik-sports-shade"></div><div class="krajcik-sports-logos"></div><div class="krajcik-sports-caption"><div class="krajcik-sports-title"></div><div class="krajcik-sports-date"></div></div></div>';
            this.node.querySelector('.card__view').style.background = 'linear-gradient(135deg,' + SPORTS[event.sport].color + ',#131b29)';
            this.node.querySelector('.krajcik-sports-title').textContent = title;
            this.node.querySelector('.krajcik-sports-date').textContent = subtitle;
            this.node.addEventListener('hover:focus', function () { if (self.onFocus) self.onFocus(self.node, {}); });
            this.node.addEventListener('hover:enter', action);
            this.node.addEventListener('hover:long', action);
            this.node.addEventListener('visible', function () { self.shown = true; self.refresh(); });
            state.cards.add(this);
        };
        this.refresh = function () {
            if (!this.shown) return;
            var cover = event.id && (state.covers[event.sport] || 'https://static.deepstream.in/api/images/cat_' + COVERS[event.sport] + '_h.png'), img = this.node.querySelector('.krajcik-sports-cover');
            img.loading = 'lazy';
            if (cover && img.getAttribute('src') !== cover) img.src = cover;
            var box = this.node.querySelector('.krajcik-sports-logos');
            if (!box.childNodes.length) {
                var logos = event.teams ? event.teams.map(function (t) { return t.logo; }) : [event.logo];
                logos.filter(Boolean).forEach(function (url) { var logo = document.createElement('img'); logo.loading = 'lazy'; logo.src = url; logo.alt = ''; box.appendChild(logo); });
                if (!box.childNodes.length && event.id) box.textContent = SPORTS[event.sport].title;
            }
        };
        this.render = function (js) { return js ? this.node : $(this.node); };
        this.destroy = function () { state.cards.delete(this); this.node.querySelectorAll('img').forEach(function (img) { img.removeAttribute('src'); }); this.node.remove(); this.node = null; };
    }
    function item(state, event, title, subtitle, action) { return { cardClass: function () { return new CalendarCard(state, event, title, subtitle, action); } }; }
    function showEvents(events, sport, offset) {
        var items = events.slice(offset, offset + 20).map(function (event) { return { title: escape(event.title), subtitle: escape(stamp(event.date)), onSelect: function () { choose(event); } }; });
        if (events.length > offset + 20) items.push({ title: 'Следующие 20 событий', onSelect: function () { showEvents(events, sport, offset + 20); } });
        L.Select.show({ title: SPORTS[sport].title + ' · календарь', items: items, onBack: restore });
    }
    function enhance(comp) {
        var state = { alive: true, built: false, jobs: new Set(), cards: new Set(), covers: {}, periods: new Set() };
        var build = comp.build, create = comp.create, destroy = comp.destroy;
        function append(row) {
            if (!state.alive) return;
            comp.append(row); L.Layer.update(comp.render(true)); L.Layer.visible(comp.render(true));
        }
        function addCalendar(sport, month) {
            var key = sport + month;
            if (state.periods.has(key)) return;
            state.periods.add(key);
            load(sport, month, state).then(function (events) {
                if (!state.alive || !events.length) return;
                var results = events.slice(0, 8).map(function (event) {
                    var date = event.sport === 'f1' ? stamp(event.date).split(',')[0] + ' — ' + stamp(event.end).split(',')[0] : stamp(event.date);
                    return item(state, event, event.title, date, function () { choose(event); });
                });
                if (events.length > 8) results.push(item(state, { sport: sport }, 'Все события', 'Открыть календарь месяца', function () { showEvents(events, sport, 0); }));
                append({ title: SPORTS[sport].title + ' · ' + month.slice(4) + '.' + month.slice(0, 4), nomore: true, noimage: true, results: results });
            }).catch(function () { if (state.alive) { state.periods.delete(key); L.Noty.show('Календарь ' + SPORTS[sport].title + ' недоступен. Выберите месяц ещё раз.'); } });
        }
        function months(sport) {
            var items = [];
            for (var i = 0; i < 12; i++) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); items.push({ title: d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }), month: monthKey(d) }); }
            L.Select.show({ title: SPORTS[sport].title + ' · выбрать месяц', items: items, onSelect: function (entry) { addCalendar(sport, entry.month); restore(); }, onBack: restore });
        }
        function shell() {
            if (state.built) return;
            state.built = true;
            var selected = Object.keys(SPORTS).filter(function (sport) { return L.Storage.get('krajcik_sports_' + sport, true); });
            var controls = selected.map(function (sport) { return item(state, { sport: sport }, SPORTS[sport].title, 'Календарь записей · выбрать месяц', function () { months(sport); }); });
            build.call(comp, controls.length ? [{ title: 'Записи · выбрать период', line_type: 'krajcik-sports-controls', nomore: true, noimage: true, results: controls }] : []);
            comp.activity.loader(false);
            selected.forEach(function (sport) { addCalendar(sport, monthKey(new Date())); });
        }
        function decorateNative(entry) {
            if (typeof entry.cardClass !== 'function') return;
            var factory = entry.cardClass;
            entry.cardClass = function () {
                var card = factory.apply(this, arguments), event = nativeEvent(card.data || {});
                if (!event) return card;
                var cover = image(card.data.image_horizontal);
                if (cover) { state.covers[event.sport] = cover; state.cards.forEach(function (own) { own.refresh(); }); }
                var oldCreate = card.create, bypass = false;
                card.create = function () {
                    oldCreate.apply(card, arguments);
                    var node = card.render(true);
                    node.addEventListener('hover:enter', function (e) {
                        if (bypass) return;
                        e.stopImmediatePropagation();
                        choose(event);
                    }, true);
                    node.addEventListener('hover:long', function () {
                        var options = [{ title: 'Найти запись трансляции', onSelect: function () { choose(event); } }];
                        if (card.params.type === 'watch') options.unshift({ title: 'Прямой эфир', onSelect: function () {
                            bypass = true; try { node.dispatchEvent(new CustomEvent('hover:enter', { bubbles: true })); } finally { bypass = false; }
                        } });
                        L.Select.show({ title: event.title, items: options, onBack: restore });
                    });
                };
                return card;
            };
        }
        comp.build = function (rows) { if (!state.alive) return; shell(); rows.forEach(function (row) { row.results.forEach(decorateNative); append(row); }); };
        comp.empty = function () { if (state.alive) { shell(); L.Noty.show('Эфирное расписание недоступно. Календари записей загружаются отдельно.'); } };
        comp.create = function () { var view = create.apply(comp, arguments); Promise.resolve().then(function () { if (state.alive) shell(); }); return view; };
        comp.destroy = function () { state.alive = false; state.jobs.forEach(function (job) { job.cancel(); }); destroy.apply(comp, arguments); state.cards.clear(); };
        return comp;
    }
    function start() {
        if (root.krajcik_sports.started || !L.Component || !L.Component.create || !L.Layer) return;
        root.krajcik_sports.started = true;
        // The extension detector requires an explicit API name in the script.
        var original = root.Lampa.Component.create;
        L.Component.create = function (object) {
            var comp = original.apply(this, arguments);
            if (object.component === 'cub_sport' && typeof comp.build === 'function' && typeof comp.append === 'function') return enhance(comp);
            if (object.component === 'torrents' && object.krajcik_sports && typeof comp.empty === 'function') {
                var empty = comp.empty;
                comp.empty = function () { var result = empty.apply(comp, arguments); comp.render().find('.empty__footer .selector').eq(0).text('Поиск: ' + object.search); return result; };
            }
            return comp;
        };
        var style = document.createElement('style');
        style.textContent = '.krajcik-sports-card .card__view{overflow:hidden}.krajcik-sports-cover,.krajcik-sports-shade{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.krajcik-sports-cover{opacity:.7}.krajcik-sports-shade{background:linear-gradient(0deg,rgba(5,10,18,.96),transparent 85%)}.krajcik-sports-logos{position:absolute;top:8%;height:44%;left:12%;right:12%;display:flex;align-items:center;justify-content:space-around;gap:1em;font-size:2em;font-weight:700}.krajcik-sports-logos img{max-width:40%;height:100%;object-fit:contain;filter:drop-shadow(0 4px 8px #0008)}.krajcik-sports-caption{position:absolute;left:1em;right:1em;bottom:1em}.krajcik-sports-title{font-size:1.15em;line-height:1.25}.krajcik-sports-date{opacity:.8;font-size:.8em;margin-top:.4em}';
        document.head.appendChild(style);
        style.textContent += '.items-line--type-krajcik-sports-controls{min-height:0}.krajcik-sports-control{width:14em!important}.krajcik-sports-control .card__view{height:5.2em;padding-bottom:0}.krajcik-sports-control .krajcik-sports-logos{display:none}';
        L.SettingsApi.addComponent({ component: 'krajcik_sports', name: 'Спорт · записи' });
        Object.keys(SPORTS).forEach(function (sport) { L.SettingsApi.addParam({ component: 'krajcik_sports', param: { name: 'krajcik_sports_' + sport, type: 'trigger', default: true }, field: { name: SPORTS[sport].title, description: 'Календарь внутри раздела Спорт. Применяется при повторном входе.' } }); });
    }
    if (root.appready) start();
    else L.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });
})(typeof window !== 'undefined' ? window : null);
