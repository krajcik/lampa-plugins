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

function boot({ disabled = [], ready = true, source = code } = {}) {
    const jobs = [], rows = [], settings = [], components = [], notices = [];
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
        Parser: { get() { searches++; } }, Torrent: { start() { plays++; } },
        SettingsApi: { addComponent() {}, addParam: p => settings.push(p) },
        Storage: { get: key => !disabled.includes(key.replace('krajcik_sports_', '')) },
        Listener: { follow(name, fn) { readyHandler = fn; } },
        Noty: { show: value => notices.push(value) },
        Reguest: function () {
            const job = { cleared: 0 };
            this.timeout = () => {};
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
    return { Lampa, window, context, jobs, rows, settings, components, notices, original,
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
    assert.match(sports.searchParams(event, event.parts.find(p => p.id === 'Qual')).search, /2026 Singapore Qual/);
});

test('native CUB titles/time map to a search without retaining signed live URLs', () => {
    const data = { id: 4651, title: 'НБА. Вашингтон - Торонто (RU)', time_start: 1792794600000, streams: { hls: 'SECRET_SIGNED_URL' }, description: 'SECRET_RESULT' };
    const event = sports.nativeEvent(data);
    assert.equal(event.sport, 'nba');
    assert.equal(event.title, 'НБА. Вашингтон - Торонто');
    assert.equal(event.date, '2026-10-23T22:30:00.000Z');
    assert.doesNotMatch(JSON.stringify(event), /SECRET|streams|description/);
    assert.equal(sports.nativeEvent({ ...data, time_start: 1e100 }), null);
    assert.equal(sports.nativeEvent({ ...data, title: 'АПЛ. Футбол' }), null);
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
    assert.equal(comp.rows[0].results.length, 5);
    assert.equal(comp.loader.at(-1), false);
    assert.equal(env.jobs.length, 5);
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
    assert.equal(env.jobs.length, 10);
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
    const env = boot({ disabled: ['nhl', 'ufc', 'f1', 'nascar'], ready: false });
    vm.runInContext(code, env.context);
    env.ready(); const wrapper = env.Lampa.Component.create; env.ready();
    assert.equal(env.Lampa.Component.create, wrapper);
    assert.equal(env.settings.length, 5);
    assert.equal(env.counts().styleCount, 1);
    const comp = env.Lampa.Component.create({ component: 'cub_sport' }); comp.create(); await tick();
    assert.equal(env.jobs.length, 1);
    assert.match(env.jobs[0].url, /basketball\/nba/);
    comp.destroy(); await tick();
});
