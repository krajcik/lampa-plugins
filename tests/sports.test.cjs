const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sports = require('../sports.js');
const fixture = require('./fixtures/espn.json');
const now = Date.parse('2026-11-01T00:00:00Z');
const code = fs.readFileSync(require.resolve('../sports.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('the shipped script is recognized by the Lampa extension detector', () => {
    assert.ok(/Lampa\./.test(code), 'Lampa extension signature is missing');
});

function boot({ disabled = [], ready = true, source = code, config = {} } = {}) {
    const jobs = [], rows = [], settings = [], components = [], notices = [], ordinaryCalls = [], writes = [], inputs = [];
    const values = { jackett_url: 'https://old.example', jackett_key: 'old-key', parser_torrent_type: 'prowlarr', parser_use_link: 'two', krajcik_sports_jackett_key: 'sports-test-key', ...config };
    let styleCount = 0, readyHandler, searches = 0, plays = 0;
    function original(object) {
        const comp = { rows: [], loader: [], destroyed: false, activity: { loader: value => comp.loader.push(value) },
            create() { comp.activity.loader(true); return comp; },
            build(data) { comp.rows.push(...data); }, append(row) { comp.rows.push(row); },
            empty() { comp.emptyCalled = true; return 'native empty'; },
            queryText: 'Уточнить', find() { return { eq() { return { text(value) { comp.queryText = value; } }; } }; },
            render() { return comp; }, destroy() { comp.destroyed = true; }
        };
        components.push({ object, comp }); return comp;
    }
    const Lampa = {
        Component: { create: original }, Layer: { update() {}, visible() {} },
        ContentRows: { add: row => rows.push(row) }, Maker: {},
        Parser: { get(...args) { searches++; ordinaryCalls.push({ context: this, args }); return 'native request'; } }, Torrent: { start() { plays++; } },
        SettingsApi: { addComponent() {}, addParam: p => settings.push(p) },
        Storage: {
            get: (key, fallback) => key in values ? values[key] : key.replace('krajcik_sports_', '') in sports.SPORTS ? !disabled.includes(key.replace('krajcik_sports_', '')) : fallback,
            set(key, value) { values[key] = value; writes.push({ key, value }); },
            cache: () => ['hash:seen']
        },
        Utils: { hash: value => 'hash:' + value, strToTime: Date.parse, bytesToSize: String },
        Input: { edit: (options, done) => inputs.push({ options, done }) },
        Listener: { follow(name, fn) { readyHandler = fn; } },
        Noty: { show: value => notices.push(value) },
        Reguest: function () {
            const job = { cleared: 0 };
            this.timeout = value => { job.timeout = value; };
            this.clear = () => { job.cleared++; };
            this.native = (url, done, fail) => { Object.assign(job, { url, done, fail }); jobs.push(job); };
        }
    };
    const FixedDate = class extends Date {
        constructor(...args) { super(...(args.length ? args : ['2026-10-24T12:00:00Z'])); }
        static now() { return Date.parse('2026-10-24T12:00:00Z'); }
    };
    const window = { appready: ready, Lampa };
    const context = vm.createContext({ window, document: { createElement: () => ({}), head: { appendChild() { styleCount++; } } }, Date: FixedDate, URL, Set, Promise, console });
    vm.runInContext(source, context);
    return { Lampa, window, context, jobs, rows, settings, components, notices, ordinaryCalls, writes, values, inputs, original,
        ready() { readyHandler({ type: 'ready' }); },
        counts() { return { searches, plays, styleCount }; }
    };
}

test('F1 keeps weekend grouping and exact session times without results or descriptions', () => {
    const raw = structuredClone(fixture.f1);
    raw.events[0].highlights = [{ title: 'SECRET_WINNER' }];
    raw.events[0].competitions[0].competitors = [{ score: 'SECRET_SCORE', winner: true }];
    const [event] = sports.schedule('f1', raw, now);
    assert.equal(event.title, 'Гран-при: Singapore');
    assert.equal(event.parts.length, 5);
    assert.equal(event.parts.find(p => p.id === 'Race').date, '2026-10-11T12:00Z');
    assert.equal(event.parts.find(p => p.id === 'SQ').date, '2026-10-09T12:30Z');
    assert.equal(event.parts.find(p => p.id === 'Sprint').date, '2026-10-10T09:00Z');
    assert.doesNotMatch(JSON.stringify(event), /SECRET|score|winner|highlights/);
});

test('team logos survive normalization, but unsafe image schemes and malformed events do not', () => {
    const raw = structuredClone(fixture.nba);
    const teams = raw.events[0].competitions[0].competitors;
    teams[0].team.logo = 'https://example.org/team.png';
    teams[1].team.logo = 'javascript:alert(1)';
    const [event] = sports.schedule('nba', raw, now);
    assert.equal(event.teams[0].logo, 'https://example.org/team.png');
    assert.equal(event.teams[1].logo, '');
    assert.equal(sports.image('https://user:secret@example.org/x'), '');
    assert.deepEqual(sports.schedule('nba', raw, Date.parse('2025-01-01')), []);
    assert.deepEqual(sports.schedule('nba', { events: [{ ...raw.events[0], date: 'unknown' }, { ...raw.events[0], competitions: [] }] }, now), []);
});

test('UFC groups parts under one tournament and does not invent segment times', () => {
    const [event] = sports.schedule('ufc', fixture.ufc, now);
    assert.deepEqual(event.parts.map(p => p.id), ['full', 'main', 'prelims', 'early']);
    assert.equal(event.parts[0].date, event.date);
    assert.ok(event.parts.slice(1).every(p => !p.date));
});

test('choosing an event produces an editable native torrent search, never a player route', () => {
    for (const sport of Object.keys(sports.SPORTS)) {
        const [event] = sports.schedule(sport, fixture[sport], now);
        const route = sports.searchParams(event, event.parts[0]);
        assert.equal(route.component, 'torrents');
        assert.equal(route.from_search, true);
        assert.ok(route.search);
        assert.ok(route.movie.names.length >= 2);
        assert.ok(!route.url && !route.MagnetUri && !route.autostart);
    }
    const [event] = sports.schedule('f1', fixture.f1, now);
    assert.equal(sports.searchParams(event, event.parts.find(p => p.id === 'Qual')).search, 'Formula 1 2026 Сингапура');
    assert.equal(sports.searchParams(event, event.parts.find(p => p.id === 'Race')).search, 'Formula 1 2026 Сингапура');
});

test('native CUB titles/time map to a search without retaining signed live URLs', () => {
    const data = { id: 4651, title: 'НБА. Вашингтон - Торонто (RU)', time_start: 1792794600000, streams: { hls: 'SECRET_SIGNED_URL' }, description: 'SECRET_RESULT' };
    const event = sports.nativeEvent(data);
    assert.equal(event.sport, 'nba');
    assert.equal(event.title, 'НБА. Вашингтон - Торонто');
    assert.equal(event.date, '2026-10-23T22:30:00.000Z');
    assert.doesNotMatch(JSON.stringify(event), /SECRET|streams|description/);
    assert.equal(sports.nativeEvent({ ...data, time_start: 1e100 }), null);
    assert.equal(sports.nativeEvent({ ...data, title: 'АПЛ. Футбол' }).sport, 'epl');
    assert.equal(sports.nativeEvent({ ...data, title: 'Волейбол. Лига чемпионов' }), null);
});

test('home has no sports rows, calendar requests, parser calls or playback', () => {
    const env = boot();
    const main = env.Lampa.Component.create({ component: 'main' }); main.create();
    assert.equal(main, env.components[0].comp);
    assert.equal(env.rows.length, 0);
    assert.equal(env.jobs.length, 0);
    assert.equal(env.counts().searches, 0);
    assert.equal(env.counts().plays, 0);
});

test('empty sports search keeps its query visible and does not alter ordinary torrent searches', () => {
    const env = boot();
    const comp = env.Lampa.Component.create({ component: 'torrents', search: '<query>', krajcik_sports: true });
    assert.equal(comp.empty(), 'native empty');
    assert.equal(comp.queryText, 'Поиск: <query>');
    const ordinary = env.Lampa.Component.create({ component: 'torrents', search: 'movie' }); ordinary.empty();
    assert.equal(ordinary.queryText, 'Уточнить');
});

test('native sport is interactive while calendars are pending and rows arrive independently', async () => {
    const env = boot();
    const comp = env.Lampa.Component.create({ component: 'cub_sport' }); comp.create();
    await tick();
    assert.equal(comp.rows.length, 1);
    assert.equal(comp.rows[0].results.length, 7);
    assert.equal(comp.loader.at(-1), false);
    assert.equal(env.jobs.length, 7);
    assert.ok(env.jobs.every(j => j.url.startsWith('https://site.api.espn.com/')));
    assert.equal(env.counts().searches, 0);
    env.jobs.find(j => j.url.includes('/hockey/nhl/')).done(fixture.nhl);
    await tick();
    assert.equal(comp.rows.length, 2);
    assert.match(comp.rows[1].title, /NHL/);
    assert.equal(env.jobs.filter(j => j.cleared).length, 1);
    assert.equal(env.counts().searches, 0);
    comp.destroy(); await tick();
});

test('leaving sport cancels its requests and late responses cannot append rows or poison re-entry', async () => {
    const env = boot();
    const comp = env.Lampa.Component.create({ component: 'cub_sport' }); comp.create(); await tick();
    comp.destroy();
    env.jobs.forEach(j => j.done(fixture.nhl)); await tick();
    assert.equal(comp.destroyed, true);
    assert.equal(comp.rows.length, 1);
    assert.equal(env.notices.length, 0);
    assert.ok(env.jobs.every(j => j.cleared === 1));
    const again = env.Lampa.Component.create({ component: 'cub_sport' }); again.create(); await tick();
    assert.equal(env.jobs.length, 14);
    again.destroy(); await tick();
});

test('a malformed calendar response cannot block the other sports or leave the page loading', async () => {
    const env = boot();
    const comp = env.Lampa.Component.create({ component: 'cub_sport' }); comp.create(); await tick();
    assert.doesNotThrow(() => env.jobs.find(j => j.url.includes('/basketball/nba/')).done(null));
    env.jobs.find(j => j.url.includes('/hockey/nhl/')).done(fixture.nhl); await tick();
    assert.equal(comp.rows.length, 2);
    assert.match(comp.rows[1].title, /NHL/);
    assert.equal(comp.loader.at(-1), false);
    assert.equal(env.notices.length, 1);
    comp.destroy(); await tick();
});

test('disabled sports do not load and repeated appready/script loads register only once', async () => {
    const env = boot({ disabled: Object.keys(sports.SPORTS).filter(sport => sport !== 'nba'), ready: false });
    vm.runInContext(code, env.context);
    env.ready(); const wrapper = env.Lampa.Component.create; env.ready();
    assert.equal(env.Lampa.Component.create, wrapper);
    assert.equal(env.settings.length, 9);
    assert.equal(env.counts().styleCount, 1);
    const comp = env.Lampa.Component.create({ component: 'cub_sport' }); comp.create(); await tick();
    assert.equal(env.jobs.length, 1);
    assert.match(env.jobs[0].url, /basketball\/nba/);
    comp.destroy(); await tick();
});

test('sports and ordinary requests use separate backends without changing global parser settings', () => {
    const env = boot(), before = { ...env.values }, complete = () => {}, error = () => {};
    const movie = { component: 'torrents', search: 'The Matrix', from_search: false };
    assert.equal(env.Lampa.Parser.get(movie, complete, error), 'native request');
    const own = { component: 'torrents', search: 'NHL 26/27 Rangers Capitals', from_search: true, krajcik_sports: true };
    env.Lampa.Parser.get(own, complete, error);
    const series = { search: 'Severance', movie: { original_name: 'Severance' } };
    assert.equal(env.Lampa.Parser.get(series, complete, error), 'native request');
    assert.deepEqual(env.ordinaryCalls.map(x => x.args[0]), [movie, series]);
    assert.ok(env.ordinaryCalls.every(x => x.context === env.Lampa.Parser && x.args[1] === complete && x.args[2] === error));
    assert.equal(env.jobs.length, 4);
    assert.deepEqual(env.jobs.map(j => new URL(j.url).pathname.split("/")[4]), ["rutracker", "noname-clubl", "rgfootball", "rutor"]);
    const url = new URL(env.jobs[0].url);
    assert.equal(url.origin, 'https://jackett.home.lurno.ru');
    assert.equal(url.pathname, '/api/v2.0/indexers/rutracker/results');
    assert.equal(url.searchParams.get('Query'), own.search);
    assert.equal(url.searchParams.get('apikey'), 'sports-test-key');
    assert.equal(url.searchParams.get('Category[]'), '5060');
    assert.equal(env.jobs[0].timeout, 120000);
    assert.deepEqual(env.values, before);
    assert.equal(env.writes.length, 0);
    assert.equal(env.counts().plays, 0);
});

test('sports responses retain native playback links and receive the native torrent metadata', () => {
    const env = boot(); let received;
    const input = { krajcik_sports: true, search: 'edited query' };
    env.Lampa.Parser.get(input, data => { received = data; }, assert.fail);
    const raw = { Results: [{ Title: 'seen', PublishDate: '2026-10-24', Size: 123, Link: 'https://jackett.home.lurno.ru/dl/rutracker/?example=1', Seeders: 2 }] };
    env.jobs[0].done(raw);
    env.jobs.slice(1).forEach(job => job.done({ Results: [] }));
    assert.equal(received.Results[0], raw.Results[0]);
    assert.equal(received.Results[0].Link, raw.Results[0].Link);
    assert.equal(received.Results[0].hash, 'hash:seen');
    assert.equal(received.Results[0].viewed, true);
    assert.equal(received.Results[0].size, '123');
    assert.equal(received.Results[0].source_rank, 0);
    assert.equal(env.jobs[0].cleared, 1);
    assert.equal(env.counts().plays, 0);
    assert.equal(env.counts().searches, 0);
});

test('leaving an old sports search cancels only its own request and suppresses late callbacks', () => {
    const env = boot(); let completed = 0, errors = 0;
    const first = { component: 'torrents', krajcik_sports: true, search: 'first' };
    const second = { ...first, search: 'second' };
    const a = env.Lampa.Component.create(first), b = env.Lampa.Component.create(second);
    env.Lampa.Parser.get(first, () => { completed++; }, () => { errors++; });
    env.Lampa.Parser.get(second, () => { completed++; }, () => { errors++; });
    a.destroy();
    env.jobs[0].done({ Results: [] }); env.jobs[0].fail({ status: 500 });
    assert.equal(completed, 0); assert.equal(errors, 0);
    assert.ok(env.jobs.slice(0, 4).every(job => job.cleared === 1));
    assert.ok(env.jobs.slice(4).every(job => job.cleared === 0));
    env.jobs.slice(4).forEach(job => job.done({ Results: [] }));
    assert.equal(completed, 1); assert.equal(errors, 0);
    b.destroy();
    assert.ok(env.jobs.every(job => job.cleared === 1));
});

test('repeating an edited sports search cancels its previous request', () => {
    const env = boot(); let completed = 0;
    const params = { krajcik_sports: true, search: 'original' };
    env.Lampa.Parser.get(params, () => { completed++; }, assert.fail);
    params.search = 'edited';
    env.Lampa.Parser.get(params, () => { completed++; }, assert.fail);
    env.jobs[0].done({ Results: [] });
    assert.equal(completed, 0); assert.equal(env.jobs[0].cleared, 1);
    assert.equal(new URL(env.jobs[4].url).searchParams.get('Query'), 'edited');
    env.jobs.slice(4).forEach(job => job.done({ Results: [] })); assert.equal(completed, 1);
});

test('missing keys and unsafe URLs fail locally without falling back to the movie parser', () => {
    for (const config of [{ krajcik_sports_jackett_key: '' }, { krajcik_sports_jackett_url: 'https://user:password@example.org' }, { krajcik_sports_jackett_url: 'https://example.org?apikey=secret' }]) {
        const env = boot({ config }); let error;
        env.Lampa.Parser.get({ krajcik_sports: true, search: 'NHL' }, assert.fail, value => { error = value; });
        assert.match(error, /Спорт · записи/);
        assert.equal(env.jobs.length, 0); assert.equal(env.counts().searches, 0);
    }
    assert.equal(sports.parserUrl(' https://example.org/jackett/ '), 'https://example.org/jackett');
    assert.equal(sports.parserUrl('file:///tmp/key'), '');
});

test('parser errors and malformed replies do not expose the API key or trigger a second callback', () => {
    for (const reply of [null, {}, { Results: {} }, { Results: [null] }, { Results: [{ Title: 7 }] }, { Results: [], Indexers: [{ Status: 1, Error: 'secret' }] }, { Results: [], Indexers: [{ Status: 0 }] }]) {
        const env = boot(); let errors = 0;
        env.Lampa.Parser.get({ krajcik_sports: true, search: 'NHL' }, assert.fail, () => { errors++; });
        env.jobs.forEach(job => { job.done(reply); job.fail({ status: 500 }); });
        assert.equal(errors, 1);
    }
    for (const status of [401, 500]) {
        const env = boot(); let message;
        env.Lampa.Parser.get({ krajcik_sports: true, search: 'NHL' }, assert.fail, value => { message = value; });
        env.jobs.forEach(job => job.fail({ status, responseURL: job.url }));
        assert.doesNotMatch(message, /sports-test-key|apikey=/);
        assert.match(message, status === 401 ? /API-ключ/ : /недоступн/);
        assert.equal(env.counts().searches, 0);
    }
});

test('the sports API key editor is masked and writes only the sports setting', () => {
    const env = boot();
    const setting = env.settings.find(x => x.param.name === 'krajcik_sports_jackett_key');
    setting.onChange();
    assert.equal(env.inputs[0].options.password, true); assert.equal(env.inputs[0].options.nosave, true);
    assert.equal(env.inputs[0].options.keyboard, 'lampa');
    assert.equal(env.inputs[0].options.nomic, true);
    env.inputs[0].done(' changed-test-key ');
    assert.deepEqual(env.writes, [{ key: 'krajcik_sports_jackett_key', value: 'changed-test-key' }]);
    assert.equal(env.values.jackett_key, 'old-key');
});

test('team searches use the actual season and American game date, while football uses Russian club names', () => {
    const raw = structuredClone(fixture.nhl);
    raw.events[0].date = '2026-01-26T03:00:00Z'; raw.events[0].season.year = 2026;
    const [event] = sports.schedule('nhl', raw, now);
    assert.match(sports.searchParams(event, event.parts[0]).search, /^NHL 25\/26 .*25\.01\.2026$/);
    raw.events[0].season.year = 2027.5;
    assert.equal(sports.schedule('nhl', raw, now)[0].season, '2025-2026');
    for (const sport of ['ucl', 'epl']) {
        const raw = structuredClone(fixture[sport]);
        raw.events[0].competitions[0].competitors[0].score = 'SECRET_SCORE';
        const [event] = sports.schedule(sport, raw, now);
        assert.equal(event.season, '2026-2027');
        assert.ok(event.teams.every(t => t.logo.startsWith('https://')));
        assert.doesNotMatch(JSON.stringify(event), /SECRET_SCORE|score|winner/);
        const route = sports.searchParams(event, event.parts[0]);
        assert.match(route.search, sport === 'ucl' ? /Лига чемпионов 2026-2027 .*псж/i : /Чемпионат Англии 2026-2027 .*ливерпуль/i);
        assert.doesNotMatch(route.search, /Paris Saint|Liverpool|Brentford|Barcelona/);
        assert.ok(route.movie.id.startsWith(event.id));
    }
    const [ufc] = sports.schedule('ufc', fixture.ufc, now);
    assert.equal(sports.searchParams(ufc, ufc.parts.find(p => p.id === 'main')).search, ufc.title);
    const rawF1 = structuredClone(fixture.f1);
    rawF1.events[0].name = 'Gulf Air Bahrain Grand Prix in Malaysia';
    rawF1.events[0].circuit.address.city = 'Kuala lumpur';
    const [bahrain] = sports.schedule('f1', rawF1, now);
    assert.equal(sports.searchParams(bahrain, bahrain.parts[0]).search, 'Formula 1 2026 Бахрейна');
});

test('default sports preference ranks seeded Russian HD first without trusting a contradictory title prefix', () => {
    const entries = [
        { Title: 'Race [2160p/60fps, ENG]', Seeders: 100 },
        { Title: 'Race [720р/60fps, РУ]', Seeders: 10 },
        { Title: 'Race [1080p/50fps, RUS/ENG]', Seeders: 2 },
        { Title: 'Race [2160p, RUS]', Seeders: 0 },
        { Title: 'RU-ENG FULL [1080p, EN]', Seeders: 20 }
    ];
    const sorted = entries.slice().sort(sports.preference);
    assert.equal(sorted[0], entries[2]); assert.equal(sorted[1], entries[1]);
    assert.equal(sorted[2], entries[0]); assert.equal(sorted.at(-1), entries[3]);
    assert.equal(entries.length, sorted.length);
    assert.ok(sports.preference({ Title: 'Race [4K, RUS]', Seeders: 1 }, { Title: 'Race [1080p, RUS]', Seeders: 10 }) < 0);
});

test('per-tracker categories and queries preserve weekend packs and user edits', () => {
    for (const sport of Object.keys(sports.SPORTS)) {
        const [event] = sports.schedule(sport, fixture[sport], now);
        const params = sports.searchParams(event, event.parts[0]);
        const queries = sports.trackerQueries(params);
        assert.equal(queries[0].query, params.search);
        assert.equal(queries[0].category, 5060);
        assert.equal(queries[2].category, 5060);
        assert.equal(queries[3].category, 8000);
        assert.ok(queries[1].category > 100000);
        if (sport === 'f1') {
            assert.equal(queries[1].query, 'Формула 1 2026 Сингапура');
            assert.equal(queries[2].query, 'Формула 1 2026 Сингапура');
            assert.doesNotMatch(JSON.stringify(queries), /Квалификация|Гонка|Qual/);
        }
        if (sport === 'ucl') {
            assert.equal(queries[2].query, 'Paris Saint-Germain Barcelona 2026 20.10.2026');
            assert.equal(queries[3].query, 'Лига чемпионов 2026 20.10');
        }
        params.search = 'my edited query';
        assert.ok(sports.trackerQueries(params).every(q => q.query === 'my edited query'));
        assert.equal(sports.trackerQueries(params)[1].category, 5000);
    }
});

test('partial failures preserve other trackers and do not lose distinct releases or playback links', () => {
    const env = boot(); let received, calls = 0;
    env.Lampa.Parser.get({ krajcik_sports: true, search: 'UFC' }, data => { received = data; calls++; }, assert.fail);
    env.jobs[1].fail({ status: 500 });
    env.jobs[0].done({ Results: [{ Title: 'UFC RU', Seeders: 3, Link: 'https://example.org/dl/rutracker' }] });
    env.jobs[2].done({ Results: [{ Title: 'UFC Full Event EN', Seeders: 2, Link: 'https://example.org/dl/rgfootball' }] });
    assert.equal(calls, 0);
    env.jobs[3].done({ Results: [{ Title: 'UFC RU', Seeders: 1, MagnetUri: 'magnet:?xt=urn:btih:0123456789012345678901234567890123456789' }] });
    assert.equal(calls, 1);
    assert.equal(received.Results.length, 3);
    assert.equal(received.Results[1].Link, 'https://example.org/dl/rgfootball');
    assert.match(env.notices[0], /noname-clubl/);
    env.jobs.forEach(job => job.fail({ status: 500 }));
    assert.equal(calls, 1);
});


test('team events offer separate match/day reviews without changing full recordings or racing sessions', () => {
    for (const sport of Object.keys(sports.SPORTS)) {
        const [event] = sports.schedule(sport, fixture[sport], now);
        const before = JSON.stringify(event);
        const parts = sports.eventParts(event);
        if (['nhl', 'nba', 'ucl', 'epl'].includes(sport)) {
            assert.deepEqual(parts.map(p => p.id), ['full', 'review', 'day_review']);
            const match = sports.searchParams(event, parts[1]), day = sports.searchParams(event, parts[2]);
            assert.equal(match.title, 'Обзор матча');
            assert.equal(day.title, 'Обзор игрового дня');
            assert.equal(match.krajcik_sports_review, 'review');
            assert.equal(day.krajcik_sports_review, 'day_review');
            assert.notEqual(match.movie.id, day.movie.id);
            assert.equal(day.component, 'torrents');
            assert.ok(!day.url && !day.autostart);
            assert.doesNotMatch(day.search, /Canucks|Nuggets|псж|ливерпуль|26\/27|2026-2027/);
            assert.equal(sports.trackerQueries(match).length, 4);
            assert.equal(sports.trackerQueries(day).length, ['ucl', 'epl'].includes(sport) ? 5 : 4);
            match.search = 'edited';
            assert.ok(sports.trackerQueries(match).every(q => q.query === 'edited'));
        } else assert.deepEqual(parts, event.parts);
        assert.equal(JSON.stringify(event), before);
        assert.equal(sports.searchParams(event, event.parts[0]).krajcik_sports_review, '');
    }
    const native = sports.nativeEvent({ id: 1, title: 'НХЛ. Вашингтон — Торонто', time_start: Date.parse('2026-10-23T02:00Z') });
    assert.equal(sports.eventParts(native).length, 3);
});

test('review queries use calibrated dates and retain condensed-game packs', () => {
    const [nhl] = sports.schedule('nhl', fixture.nhl, now);
    assert.equal(sports.searchParams(nhl, sports.eventParts(nhl)[1]).search, 'NHL Highlights 22.10.2026');
    assert.equal(sports.searchParams(nhl, sports.eventParts(nhl)[2]).search, 'NHL Обзор 22.10.2026');
    const [ucl] = sports.schedule('ucl', fixture.ucl, now);
    const queries = sports.trackerQueries(sports.searchParams(ucl, sports.eventParts(ucl)[2]));
    assert.equal(queries[0].query, 'Лига чемпионов Обзор 20.10.2026');
    assert.equal(queries[3].query, 'Лига чемпионов Обзор 2026 20.10');
    assert.equal(queries[2].query, 'Champions League Highlights 20.10.2026');
    assert.equal(queries[4].query, 'Champions League Highlights 21.10.2026');
});

test('review date checks reject RuTracker wildcard false positives while retaining ranges and undated releases', () => {
    const event = { sport: 'nhl', date: '2026-10-23T02:00Z' };
    const keep = title => sports.reviewMatches(title, event, 'day_review', 'rutracker');
    assert.equal(keep('NHL 25/26. On The Fly. Обзор матчей за 22.10.2026 [23.10.2026, EN]'), true);
    assert.equal(keep('NHL 25/26. On The Fly. Обзор матчей за 21.10.2026 [22.10.2026, EN]'), false);
    assert.equal(keep('NHL 2025-2026 / RS / 22.10.2025 / Extended Highlights [23.10.2025]'), false);
    assert.equal(keep('NHL Highlights [22.10] (2026)'), true);
    assert.equal(keep('NHL Highlights [22.10] (2025)'), false);
    assert.equal(keep('NHL Highlights [21-23.10.2026]'), true);
    assert.equal(keep('NHL Highlights 21.10.2026-23.10.2026'), true);
    assert.equal(keep('NHL Обзор за 21.10.2026-23.10.2026'), true);
    assert.equal(keep('NHL Highlights without an explicit date'), true);
    const ucl = { sport: 'ucl', date: '2026-10-20T19:00Z' };
    assert.equal(sports.reviewMatches('UCL Highlights [21.10.2026, RUS]', ucl, 'day_review', 'rgfootball'), true);
    assert.equal(sports.reviewMatches('UCL Highlights [22.10.2026, RUS]', ucl, 'day_review', 'rgfootball'), false);
    assert.equal(sports.reviewMatches('UCL Highlights [21-22.10.2026, RUS]', ucl, 'day_review', 'rgfootball'), true);
});

test('review aggregation removes duplicate topics from date variants, keeps alternative releases and respects manual edits', () => {
    const [event] = sports.schedule('ucl', fixture.ucl, now);
    const params = sports.searchParams(event, sports.eventParts(event)[2]);
    const env = boot(); let received;
    env.Lampa.Parser.get(params, data => { received = data; }, assert.fail);
    env.jobs[0].done({ Results: [{ Title: 'Обзор 20.10.2025' }] });
    env.jobs[1].done({ Results: [] });
    env.jobs[2].done({ Results: [{ Title: 'Highlights 21.10.2026 RU', Guid: 'topic-1' }] });
    env.jobs[3].done({ Results: [{ Title: 'Обзор [20.10] (2026)', Guid: 'topic-1' }] });
    env.jobs[4].done({ Results: [{ Title: 'Highlights 21.10.2026 RU', Guid: 'topic-1' }, { Title: 'Highlights 21.10.2026 EN', Guid: 'topic-2' }] });
    assert.equal(received.Results.length, 3);
    params.search = 'edited date';
    env.Lampa.Parser.get(params, data => { received = data; }, assert.fail);
    env.jobs.slice(5).forEach((job, i) => job.done({ Results: i ? [] : [{ Title: 'Обзор 20.10.2025' }] }));
    assert.equal(received.Results.length, 1);
});
