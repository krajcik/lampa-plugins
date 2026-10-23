(function (root) {
    'use strict';

    var VERSION = '0.1.1';
    var SPORTS = {
        nhl: { title: 'NHL', path: 'hockey/nhl', queries: ['NHL', 'НХЛ'], color: '#395d88' },
        nba: { title: 'NBA', path: 'basketball/nba', queries: ['NBA', 'НБА'], color: '#96532f' },
        ufc: { title: 'UFC', path: 'mma/ufc', queries: ['UFC'], color: '#943e45' },
        f1: { title: 'Formula 1', path: 'racing/f1', queries: ['Формула 1', 'Formula 1'], color: '#a03c3c' },
        nascar: { title: 'NASCAR Cup', path: 'racing/nascar-premier', queries: ['NASCAR', 'НАСКАР'], color: '#7b632e' }
    };
    var TEAM_RU = {
        ANA: 'Анахайм', BOS: 'Бостон', BUF: 'Баффало', CAR: 'Каролина', CBJ: 'Коламбус',
        CGY: 'Калгари', CHI: 'Чикаго', COL: 'Колорадо', DAL: 'Даллас', DET: 'Детройт',
        EDM: 'Эдмонтон', FLA: 'Флорида', LA: 'Лос Анджелес', LAK: 'Лос Анджелес',
        MIN: 'Миннесота', MTL: 'Монреаль', NJ: 'Нью Джерси', NJD: 'Нью Джерси',
        NSH: 'Нэшвилл|Нешвилл', NYI: 'Айлендерс|Нью Йорк Айлендерс',
        NYR: 'Рейнджерс|Нью Йорк Рейнджерс', OTT: 'Оттава', PHI: 'Филадельфия',
        PIT: 'Питтсбург|Питтсбур', SEA: 'Сиэтл', SJ: 'Сан Хосе', SJS: 'Сан Хосе',
        STL: 'Сент Луис', TB: 'Тампа', TBL: 'Тампа', TOR: 'Торонто',
        UTA: 'Юта', VAN: 'Ванкувер', VGK: 'Вегас', WPG: 'Виннипег', WSH: 'Вашингтон',
        ATL: 'Атланта', BKN: 'Бруклин', CHA: 'Шарлотт', CLE: 'Кливленд',
        DEN: 'Денвер', GS: 'Голден Стэйт|Голден Стейт', GSW: 'Голден Стэйт|Голден Стейт',
        HOU: 'Хьюстон', IND: 'Индиана', LAC: 'Клипперс|Лос Анджелес Клипперс',
        LAL: 'Лейкерс|Лос Анджелес Лейкерс', MEM: 'Мемфис', MIA: 'Майами',
        MIL: 'Милуоки', NO: 'Новый Орлеан|Нью Орлеан', NOP: 'Новый Орлеан|Нью Орлеан',
        NY: 'Никс|Нью Йорк Никс', NYK: 'Никс|Нью Йорк Никс', OKC: 'Оклахома',
        ORL: 'Орландо', PHX: 'Финикс', POR: 'Портленд', SA: 'Сан Антонио',
        SAS: 'Сан Антонио', SAC: 'Сакраменто', WIS: 'Вашингтон', WAS: 'Вашингтон'
    };
    var PLACES = [
        ['Australia', 'Австрали'], ['China', 'Кита'], ['Japan', 'Япони'],
        ['Bahrain', 'Бахрейн'], ['Saudi Arabia', 'Саудовск'], ['Miami', 'Майами'],
        ['Canada', 'Канад'], ['Monaco', 'Монако'], ['Barcelona', 'Барселон'],
        ['Austria', 'Австри'], ['British', 'Великобритани|Британ'], ['Belgium', 'Бельги'],
        ['Hungary', 'Венгри'], ['Netherlands', 'Нидерланд|Голланд'], ['Italy', 'Итали'],
        ['Madrid', 'Мадрид'], ['Azerbaijan', 'Азербайджан'], ['Singapore', 'Сингапур'],
        ['United States', 'США|Остин'], ['Mexico', 'Мексик'], ['Brazil', 'Бразили|Сан Паулу'],
        ['Las Vegas', 'Лас Вегас'], ['Qatar', 'Катар'], ['Abu Dhabi', 'Абу Даби'],
        ['Phoenix', 'Финикс'], ['Daytona', 'Дейтона'], ['Talladega', 'Талладега'],
        ['Martinsville', 'Мартинсвилл'], ['Bristol', 'Бристоль'], ['Darlington', 'Дарлингтон'],
        ['Charlotte', 'Шарлотт'], ['Richmond', 'Ричмонд'], ['Atlanta', 'Атланта'],
        ['Kansas', 'Канзас'], ['Texas', 'Техас'], ['Michigan', 'Мичиган'],
        ['Pocono', 'Поконо'], ['Indianapolis', 'Индианаполис'], ['Watkins Glen', 'Уоткинс Глен'],
        ['Sonoma', 'Сонома'], ['Dover', 'Довер'], ['Homestead', 'Хоумстед'],
        ['Nashville', 'Нэшвилл|Нешвилл'], ['New Hampshire', 'Нью Гэмпшир'],
        ['Gateway', 'Гейтвей'], ['Iowa', 'Айова'], ['San Diego', 'Сан Диего']
    ];
    var SESSION = {
        FP1: ['Тренировка 1', /(?:practice|практик|тренировк|свободн\w*\s+заезд)[^\d]{0,20}1|\bfp\s*1\b/i],
        FP2: ['Тренировка 2', /(?:practice|практик|тренировк|свободн\w*\s+заезд)[^\d]{0,20}2|\bfp\s*2\b/i],
        FP3: ['Тренировка 3', /(?:practice|практик|тренировк|свободн\w*\s+заезд)[^\d]{0,20}3|\bfp\s*3\b/i],
        Qual: ['Квалификация', /qualif|квалификац/i],
        SQ: ['Квалификация спринта', /sprint\s*(?:shootout|qual)|спринт.{0,18}квалиф|квалиф.{0,18}спринт/i],
        Sprint: ['Спринт', /sprint|спринт/i],
        Race: ['Гонка', /race|гонк/i]
    };
    function text(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim(); }
    function unique(values) { return Array.from(new Set(values.filter(Boolean))); }
    function validDate(value) { return typeof value === 'string' && isFinite(Date.parse(value)); }
    function aliases(value) {
        var result = [value];
        PLACES.forEach(function (place) {
            if (text(value).indexOf(text(place[0])) >= 0) result = result.concat(place[1].split('|'));
        });
        return unique(result.map(text));
    }
    function team(teamData) {
        var name = String(teamData.displayName || '');
        return { name: name, aliases: unique([name, teamData.shortDisplayName].concat((TEAM_RU[teamData.abbreviation] || '').split('|')).map(text)) };
    }
    function monthKey(date) { return date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0'); }
    function schedule(sport, data, now) {
        now = now || Date.now();
        return (Array.isArray(data.events) ? data.events : []).map(function (e) {
            if (!validDate(e.date) || Date.parse(e.date) > now || !e.id) return null;
            var competitions = e.competitions || [];
            var first = competitions[0] || {};
            if (e.status && e.status.type && ['STATUS_CANCELED', 'STATUS_POSTPONED'].includes(e.status.type.name)) return null;
            var event = { id: sport + '_' + e.id, sport: sport, date: e.date, end: e.endDate || e.date, parts: [] };
            if (sport === 'nhl' || sport === 'nba') {
                event.teams = (first.competitors || []).map(function (c) { return team(c.team || {}); });
                if (event.teams.length !== 2 || event.teams.some(function (t) { return !t.name; })) return null;
                event.title = event.teams.map(function (t) { return t.name; }).join(' — ');
                event.parts = [{ id: 'full', title: 'Полная запись', date: e.date }];
            } else if (sport === 'f1') {
                var place = e.circuit && e.circuit.address && (e.circuit.address.city || e.circuit.address.country);
                event.title = 'Гран-при: ' + String(place || e.shortName || e.name || 'Formula 1');
                event.aliases = unique(aliases((e.circuit && e.circuit.address && e.circuit.address.country) || '').concat(aliases(place || ''), aliases(e.name || '')));
                competitions.forEach(function (c) {
                    var key = c.type && c.type.abbreviation;
                    if (key === 'SS' || key === 'Sprint Qualifying') key = 'SQ';
                    if (key === 'SR') key = 'Sprint';
                    if (SESSION[key] && validDate(c.date)) event.parts.push({ id: key, title: SESSION[key][0], date: c.date });
                });
                event.parts.sort(function (a, b) { return Date.parse(a.date) - Date.parse(b.date); });
            } else if (sport === 'ufc') {
                event.title = String(e.name || e.shortName || 'UFC');
                event.number = (event.title.match(/\bUFC\s+(\d{2,4})\b/i) || [])[1] || '';
                event.fighters = (event.title.split(/:\s*/)[1] || '').split(/\s+vs\.?\s+/i).map(text);
                event.parts = [
                    { id: 'main', title: 'Основной кард' },
                    { id: 'prelims', title: 'Прелимы' },
                    { id: 'early', title: 'Ранние прелимы' }
                ];
                // shortcut: scoreboard does not label card segments; show unknown time until a verified segment source is available.
            } else {
                event.title = String(e.name || 'NASCAR Cup');
                var location = event.title.split(/\s+at\s+/i).pop();
                event.aliases = aliases(location);
                event.parts = [{ id: 'full', title: 'Гонка', date: e.date }];
            }
            return event.parts.length ? event : null;
        }).filter(Boolean).sort(function (a, b) { return Date.parse(b.date) - Date.parse(a.date); });
    }
    function dateMatches(title, date) {
        var found = [], pattern = /\b(\d{1,4})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/g, m;
        while ((m = pattern.exec(title))) {
            var y = m[1].length === 4 ? +m[1] : +m[3];
            if (y < 100) y += 2000;
            var mo = +m[2], day = m[1].length === 4 ? +m[3] : +m[1];
            if (mo > 12 || mo < 1 || day < 1 || day > 31) continue;
            found.push(Date.UTC(y, mo - 1, day));
        }
        var utc = new Date(date), start = Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
        return found.some(function (d) { return Math.abs(d - start) <= 86400000; });
    }
    function hasAlias(title, variants) { return variants.some(function (a) { return a.length >= 3 && title.indexOf(a) >= 0; }); }
    function magnet(record, title) {
        var uri = record.MagnetUri || record.Link || '';
        if (!/^magnet:\?/i.test(uri) || !/[?&]xt=urn:btih:([a-f\d]{40}|[a-z2-7]{32})(?:&|$)/i.test(uri)) return '';
        return uri.replace(/&dn=[^&]*/gi, '') + '&dn=' + encodeURIComponent(title);
    }
    function russian(title) { return /(?:^|[^a-z])ru(?:[^a-z]|$)|русск|рус\.|матч\s*(?:тв|арена|игра)|сетанта/i.test(title); }
    function matches(event, part, record) {
        var title = String(record.Title || '');
        if (!magnet(record, event.title) || /highlights?|обзор|нарезк|итоги|результат|documentary|документаль|\bnba\s*2k|\b(?:xbox|playstation|ps4|ps5)\b/i.test(title)) return false;
        var normalized = text(title);
        if (event.teams) {
            var league = event.sport === 'nhl' ? /\bnhl\b|нхл/i : /\bnba\b|нба/i;
            return league.test(title) && dateMatches(title, event.date) && event.teams.every(function (t) { return hasAlias(normalized, t.aliases); });
        }
        if (event.sport === 'ufc') {
            if (!/\bufc\b/i.test(title)) return false;
            var number = (title.match(/\bUFC\s+(\d{2,4})\b/i) || [])[1];
            if (event.number ? number !== event.number : !dateMatches(title, event.date) || event.fighters.length !== 2 || !event.fighters.every(function (f) { return normalized.indexOf(f) >= 0; })) return false;
            var early = /early|ранни/i.test(title), prelims = /prelim|прелим|предварительн/i.test(title);
            return part.id === 'early' ? early && prelims : part.id === 'prelims' ? prelims && !early : !prelims;
        }
        if (!dateMatches(title, part.date || event.date) || !hasAlias(normalized, event.aliases)) return false;
        if (event.sport === 'nascar') return /nascar|наскар/i.test(title) && !/xfinity|o.?reilly|craftsman|truck|трак|иксфинити|квалификац|qualif|practice|практик|тренировк/i.test(title);
        if (!/formula\s*1|формула\s*1|\bf1\b/i.test(title) || !SESSION[part.id][1].test(title)) return false;
        var sprintQual = SESSION.SQ[1].test(title), sprint = SESSION.Sprint[1].test(title);
        if (part.id === 'Qual' && sprint) return false;
        if (part.id === 'Sprint' && sprintQual) return false;
        if (part.id === 'Race' && /qualif|квалификац|sprint|спринт|practice|практик|тренировк|свободн/i.test(title)) return false;
        return true;
    }
    function recordings(event, part, results) {
        var seen = new Set();
        return results.filter(function (r) {
            if (!matches(event, part, r)) return false;
            var hash = magnet(r, event.title).match(/[?&]xt=urn:btih:([^&]+)/i)[1].toLowerCase();
            if (seen.has(hash)) return false;
            seen.add(hash); return true;
        }).sort(function (a, b) {
            function rank(r) { return (russian(r.Title) ? 1000 : 0) + Math.min(Number(r.Seeders) || 0, 100) + (/1080/.test(r.Title) ? 20 : 0); }
            return rank(b) - rank(a);
        });
    }
    var core = { SPORTS: SPORTS, schedule: schedule, matches: matches, recordings: recordings, magnet: magnet, monthKey: monthKey };
    if (typeof module !== 'undefined' && module.exports) module.exports = core;
    if (!root || !root.Lampa || root.krajcik_sports) return;
    root.krajcik_sports = { version: VERSION };

    var L = root.Lampa, cache = {}, pending = {}, networks = new Set();
    function escape(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function stamp(date) { return new Date(date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    function request(url) {
        return new Promise(function (resolve, reject) {
            var net = new L.Reguest(); networks.add(net); net.timeout(15000);
            function end(fn, data) { networks.delete(net); net.clear(); fn(data); }
            net.native(url, function (data) { end(resolve, data); }, function () { end(reject, new Error('Источник расписания недоступен')); });
        });
    }
    function load(sport, month) {
        var key = sport + month;
        if (cache[key] && Date.now() - cache[key].at < 600000) return Promise.resolve(cache[key].events);
        if (pending[key]) return pending[key];
        pending[key] = request('https://site.api.espn.com/apis/site/v2/sports/' + SPORTS[sport].path + '/scoreboard?dates=' + month + '&limit=1000').then(function (data) {
            if (!Array.isArray(data.events)) throw new Error('Источник вернул неизвестный формат');
            var events = schedule(sport, data); cache[key] = { at: Date.now(), events: events }; return events;
        }).finally(function () { delete pending[key]; });
        return pending[key];
    }
    function restore() { L.Controller.toggle('content'); }
    function message(value) { L.Noty.show(value); restore(); }
    function poster(sport) {
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="' + SPORTS[sport].color + '"/><text x="320" y="200" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="64" fill="white">' + SPORTS[sport].title + '</text></svg>');
    }
    function card(event) {
        var grouped = event.sport === 'f1' || event.sport === 'ufc';
        var date = grouped && event.sport === 'f1' ? stamp(event.date).split(',')[0] + ' — ' + stamp(event.end).split(',')[0] : stamp(event.date);
        return {
            title: event.title, cover: poster(event.sport), overview: date,
            params: { style: { name: 'wide' }, module: L.Maker.module('Card').only('Card', 'Style', 'Callback'), emit: {
                onlyEnter: function () { choose(event); }, onlyLong: function () { choose(event, true); },
                onlyFocus: function () { L.Background.change(''); }
            } }
        };
    }
    function choose(event, alternatives) {
        if (event.parts.length === 1) return search(event, event.parts[0], alternatives);
        L.Select.show({ title: event.title, items: event.parts.map(function (part) {
            return { title: part.title, subtitle: part.date ? stamp(part.date) : 'Начало турнира: ' + stamp(event.date) + ' · время части не указано',
                onSelect: function () { search(event, part, alternatives); } };
        }), onBack: restore });
    }
    function play(event, part, record) {
        var title = event.title + ' · ' + part.title + ' · ' + stamp(part.date || event.date);
        var uri = magnet(record, title);
        if (!uri) return message('Неподдерживаемая ссылка записи');
        L.Torrent.back(restore);
        L.Torrent.start(Object.assign({}, record, { Title: title, MagnetUri: uri, Link: uri, poster: poster(event.sport) }), { title: title, img: poster(event.sport) });
    }
    function search(event, part, alternatives) {
        if (part.date && Date.parse(part.date) > Date.now()) return message('Сессия ещё не состоялась');
        var cancelled = false, results = [], queries = SPORTS[event.sport].queries.slice();
        L.Modal.open({ title: 'Поиск записи', html: $('<div class="krajcik-sports-search"></div>').text(event.title + ' · ' + part.title),
            onBack: function () { cancelled = true; L.Parser.clear(); L.Modal.close(); restore(); } });
        function next() {
            if (cancelled) return;
            var query = queries.shift();
            if (!query) {
                L.Modal.close(); restore();
                var found = recordings(event, part, results);
                if (!found.length) return message('Запись пока не найдена');
                if (alternatives) return L.Select.show({ title: 'Варианты записи', items: found.map(function (record, i) {
                    var quality = (record.Title.match(/\b(?:2160|1080|720|480)p?\b/i) || ['Качество не указано'])[0];
                    return { title: (i + 1) + '. ' + quality + ' · ' + (russian(record.Title) ? 'RU по описанию' : 'Язык не подтверждён'),
                        subtitle: L.Utils.bytesToSize(Number(record.Size) || 0) + ' · сидов: ' + (Number(record.Seeders) || 0), onSelect: function () { play(event, part, record); } };
                }), onBack: restore });
                play(event, part, found[0]); return;
            }
            L.Parser.get({ search: query, from_search: true, other: true }, function (data) {
                if (cancelled) return;
                results = results.concat(data.Results || []); next();
            }, function () {
                if (cancelled) return;
                cancelled = true; L.Modal.close(); message('Парсер недоступен. Проверьте настройки Lampa.');
            });
        }
        next();
    }
    function history(sport) {
        var months = [];
        for (var i = 0; i < 12; i++) {
            var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
            months.push({ title: d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }), month: monthKey(d) });
        }
        L.Select.show({ title: SPORTS[sport].title + ' · архив', items: months, onBack: restore, onSelect: function (item) {
            var cancelled = false;
            L.Modal.open({ title: 'Расписание', html: $('<div></div>').text(item.title), onBack: function () { cancelled = true; L.Modal.close(); restore(); } });
            load(sport, item.month).then(function (events) {
                if (cancelled) return; L.Modal.close();
                if (!events.length) return message('За этот месяц событий не найдено');
                L.Select.show({ title: SPORTS[sport].title + ' · ' + item.title, items: events.map(function (event) {
                    return { title: escape(event.title), subtitle: escape(stamp(event.date)), onSelect: function () { choose(event); } };
                }), onBack: restore });
            }).catch(function () { if (!cancelled) { L.Modal.close(); message('Не удалось загрузить расписание'); } });
        } });
    }
    function start() {
        if (root.krajcik_sports.started) return;
        if (!L.ContentRows || !L.Maker || !L.Parser) return L.Noty.show('Спорт: требуется Lampa 3.x');
        root.krajcik_sports.started = true;
        if (L.Manifest) L.Manifest.plugins = { type: 'other', version: VERSION, name: 'Спорт без спойлеров', description: 'NHL, NBA, UFC, F1 и NASCAR Cup: расписание и записи', component: 'krajcik_sports' };
        L.SettingsApi.addComponent({ component: 'krajcik_sports', name: 'Спорт без спойлеров', icon: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="3"/></svg>' });
        Object.keys(SPORTS).forEach(function (sport, index) {
            L.SettingsApi.addParam({ component: 'krajcik_sports', param: { name: 'krajcik_sports_' + sport, type: 'trigger', default: true }, field: { name: SPORTS[sport].title, description: 'Показывать ряд на главной. Изменения применятся при следующем открытии главной.' } });
            L.ContentRows.add({ name: 'krajcik_sports_' + sport, title: SPORTS[sport].title, screen: 'main', index: index,
                call: function () {
                    if (!L.Storage.get('krajcik_sports_' + sport, true)) return;
                    return function (done) {
                        var current = new Date(), previous = new Date(current.getFullYear(), current.getMonth() - 1, 1);
                        Promise.all([load(sport, monthKey(current)), load(sport, monthKey(previous))]).then(function (groups) {
                            var events = unique(groups.flat().map(function (e) { return e.id; })).map(function (id) { return groups.flat().find(function (e) { return e.id === id; }); });
                            events.sort(function (a, b) { return Date.parse(b.date) - Date.parse(a.date); });
                            var cards = events.slice(0, 12).map(card);
                            var more = { id: sport, sport: sport, title: 'Ранее · ' + SPORTS[sport].title, date: current.toISOString(), end: current.toISOString(), parts: [] };
                            var extra = card(more); extra.overview = 'Выбрать месяц'; extra.params.emit.onlyEnter = extra.params.emit.onlyLong = function () { history(sport); };
                            cards.push(extra); done({ title: SPORTS[sport].title, results: cards });
                        }).catch(function () {
                            var retry = card({ title: 'Расписание недоступно', sport: sport, date: current.toISOString(), parts: [] });
                            retry.overview = 'Нажмите для повторной загрузки'; retry.params.emit.onlyEnter = function () { history(sport); };
                            done({ title: SPORTS[sport].title, results: [retry] });
                        });
                    };
                }
            });
        });
    }
    if (root.appready) start();
    else L.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });
})(typeof window !== 'undefined' ? window : null);
