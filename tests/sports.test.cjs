const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sports = require('../sports.js');
const fixture = require('./fixtures/espn.json');
const now = Date.parse('2026-11-01T00:00:00Z');
const hash = '0123456789abcdef0123456789abcdef01234567';
function release(Title, extra = {}) {
    return { Title, MagnetUri: 'magnet:?xt=urn:btih:' + hash + '&dn=SECRET_RESULT', Seeders: 2, ...extra };
}
function match(event, title, part = event.parts[0]) { return sports.matches(event, part, release(title)); }

test('calendar keeps one F1 weekend and the individual session times, never score fields', () => {
    const raw = structuredClone(fixture.f1);
    raw.events[0].highlights = [{ title: 'SECRET_WINNER' }];
    raw.events[0].competitions[0].competitors = [{ winner: true, score: 'SECRET_SCORE' }];
    const [event] = sports.schedule('f1', raw, now);
    assert.equal(event.title, 'Гран-при: Singapore');
    assert.equal(event.parts.length, 5);
    assert.equal(event.parts.find(p => p.id === 'Race').date, '2026-10-11T12:00Z');
    assert.equal(event.parts.find(p => p.id === 'FP1').date, '2026-10-09T08:30Z');
    assert.equal(event.parts.find(p => p.id === 'SQ').date, '2026-10-09T12:30Z');
    assert.equal(event.parts.find(p => p.id === 'Sprint').date, '2026-10-10T09:00Z');
    assert.doesNotMatch(JSON.stringify(event), /SECRET|winner|score|highlights/);
});

test('UFC is one tournament; unverified segment times stay unknown', () => {
    const [event] = sports.schedule('ufc', fixture.ufc, now);
    assert.equal(event.title, 'UFC Fight Night: Buckley vs. Malott');
    assert.deepEqual(event.parts.map(p => p.id), ['main', 'prelims', 'early']);
    assert.ok(event.parts.every(p => !p.date));
});

test('future, canceled, missing-date and incomplete team events are omitted', () => {
    const event = fixture.nhl.events[0];
    assert.deepEqual(sports.schedule('nhl', { events: [event] }, Date.parse('2025-01-01')), []);
    assert.deepEqual(sports.schedule('nhl', { events: [{ ...event, status: { type: { name: 'STATUS_CANCELED' } } }] }, now), []);
    assert.deepEqual(sports.schedule('nhl', { events: [{ ...event, date: 'unknown' }, { ...event, competitions: [] }] }, now), []);
});

test('NHL matches both teams and the local date across midnight; wrong opponents and leagues fail', () => {
    const [event] = sports.schedule('nhl', fixture.nhl, now);
    assert.ok(match(event, 'NHL 26/27. Детройт — Ванкувер [22.10.2026, RU, 1080p]'));
    assert.ok(match(event, 'NHL. Detroit Red Wings @ Vancouver Canucks [2026-10-23, EN]'));
    assert.ok(!match(event, 'NHL. Detroit Red Wings @ Boston Bruins [22.10.2026]'));
    assert.ok(!match(event, 'NBA. Детройт — Ванкувер [22.10.2026]'));
    assert.ok(!match(event, 'NHL. Детройт — Ванкувер [22.09.2026]'));
});

test('NBA Russian aliases match a full recording but not a video game or recap', () => {
    const [event] = sports.schedule('nba', fixture.nba, now);
    assert.ok(match(event, 'НБА. Денвер — Оклахома [22.10.2026, RU]'));
    assert.ok(!match(event, 'NBA 2K27. Денвер — Оклахома [22.10.2026]'));
    assert.ok(!match(event, 'NBA. Денвер — Оклахома. Обзор [22.10.2026]'));
});

test('F1 never substitutes qualification, another GP, or a sprint for the race', () => {
    const [event] = sports.schedule('f1', fixture.f1, now);
    const race = event.parts.find(p => p.id === 'Race');
    const qual = event.parts.find(p => p.id === 'Qual');
    assert.ok(match(event, 'Формула 1. Сингапур. Гонка [11.10.2026] RU', race));
    assert.ok(!match(event, 'Формула 1. Сингапур. Квалификация [10.10.2026]', race));
    assert.ok(!match(event, 'Формула 1. Япония. Гонка [11.10.2026]', race));
    assert.ok(!match(event, 'Формула 1. Сингапур. Спринт гонка [11.10.2026]', race));
    assert.ok(!match(event, 'Формула 1. Сингапур. Квалификация спринта [10.10.2026]', qual));
});

test('UFC numbers and card segments are checked independently', () => {
    const event = { sport: 'ufc', title: 'UFC 400', number: '400', date: '2026-10-17T21:00Z' };
    assert.ok(match(event, 'UFC 400. Main Card. RU', { id: 'main' }));
    assert.ok(!match(event, 'UFC 401. Main Card. RU', { id: 'main' }));
    assert.ok(!match(event, 'UFC 400. Early Prelims. RU', { id: 'prelims' }));
    assert.ok(match(event, 'UFC 400. Early Prelims. RU', { id: 'early' }));
    assert.ok(!match(event, 'UFC 400. Highlights', { id: 'main' }));
});

test('NASCAR Cup does not select the Xfinity series at the same venue', () => {
    const [event] = sports.schedule('nascar', fixture.nascar, now);
    assert.ok(match(event, 'NASCAR Cup. Финикс [18.10.2026] RU'));
    assert.ok(!match(event, 'NASCAR Xfinity. Финикс [18.10.2026] RU'));
    assert.ok(!match(event, 'NASCAR Cup. Дейтона [18.10.2026] RU'));
});

test('recordings deduplicate magnets and prefer RU; launch metadata contains no source spoiler', () => {
    const [event] = sports.schedule('nba', fixture.nba, now);
    const ru = release('NBA Денвер — Оклахома [22.10.2026] RU', { Seeders: 1 });
    const en = release('NBA Denver Nuggets — Oklahoma City Thunder [22.10.2026] EN', { MagnetUri: 'magnet:?xt=urn:btih:' + 'b'.repeat(40), Seeders: 100 });
    assert.deepEqual(sports.recordings(event, event.parts[0], [en, ru, { ...ru }]), [ru, en]);
    const uri = sports.magnet(ru, 'Безопасное название');
    assert.doesNotMatch(uri, /SECRET_RESULT/);
    assert.match(uri, new RegExp(encodeURIComponent('Безопасное название')));
    assert.equal(sports.magnet({ Link: 'javascript:alert(1)' }, 'Title'), '');
    assert.equal(sports.magnet({ MagnetUri: 'magnet:?xt=urn:btih:bad' }, 'Title'), '');
});

test('loading twice and repeated appready register only five namespaced rows/settings', () => {
    const rows = [], settings = []; let ready;
    const window = { appready: false, Lampa: {
        ContentRows: { add: row => rows.push(row) }, Maker: {}, Parser: {},
        Listener: { follow: (name, fn) => { ready = fn; } },
        SettingsApi: { addComponent() {}, addParam: param => settings.push(param) }
    } };
    const context = vm.createContext({ window, Set, Promise, console });
    const code = fs.readFileSync(require.resolve('../sports.js'), 'utf8');
    vm.runInContext(code, context); vm.runInContext(code, context);
    ready({ type: 'ready' }); ready({ type: 'ready' });
    assert.equal(rows.length, 5); assert.equal(settings.length, 5);
    assert.equal(new Set(rows.map(r => r.name)).size, 5);
    assert.ok(settings.every(s => s.param.name.startsWith('krajcik_sports_')));
});
