const test = require('node:test');
const assert = require('node:assert/strict');
const { score, imdb, identity, englishTitle } = require('../interface.js');

test('IMDb scores reject missing, malformed and out-of-range values', () => {
    for (const value of [null, undefined, '', true, 0, -1, 11, NaN, Infinity, '8.7 / 10', 'NaN']) assert.equal(score(value), null);
    assert.equal(score(8.7), '8.7');
    assert.equal(score(' 9.3 '), '9.3');
    assert.equal(score(10), '10.0');
});

test('movie and TV IDs do not share cache entries and source objects stay unchanged', () => {
    const movie = { id: 1399, title: 'Movie', vote_average: 6.2 };
    const tv = { id: 1399, name: 'Series', first_air_date: '2011-04-17' };
    assert.equal(identity(movie).key, 'movie:1399');
    assert.equal(identity(tv).key, 'tv:1399');
    assert.equal(movie.vote_average, 6.2);
    assert.equal(movie.imdb_rating, undefined);
    assert.deepEqual(identity({ ...movie, external_ids: { imdb_id: 'tt0944947' } }), { key: 'movie:1399', type: 'movie', id: 1399, imdb: 'tt0944947' });
});

test('people, collections, episodes and unrelated provider IDs are never resolved as TMDB titles', () => {
    for (const extra of [{ media_type: 'person' }, { profile_path: '/person.jpg' }, { media_type: 'collection' }, { episode_number: 3 }, { source: 'kinopoisk' }]) assert.equal(identity({ id: 100, title: 'Title', ...extra }), null);
    assert.equal(identity({ Title: 'Torrent', id: 'topic123' }), null);
    assert.equal(imdb('tt12345/../../config'), '');
    assert.equal(imdb(1234567), '');
});

test('compact English title uses the original English or US name, never duplicates the heading', () => {
    assert.equal(englishTitle({ title: 'Интерстеллар', original_title: 'Interstellar', original_language: 'en' }), 'Interstellar');
    assert.equal(englishTitle({ name: 'Друзья', original_name: 'Friends', original_language: 'en' }), 'Friends');
    assert.equal(englishTitle({ title: 'Паразиты', original_title: '기생충', original_language: 'ko', alternative_titles: { titles: [{ iso_3166_1: 'US', title: 'Parasite' }] } }), 'Parasite');
    assert.equal(englishTitle({ title: 'Interstellar', original_title: 'Interstellar', original_language: 'en' }), '');
    assert.equal(englishTitle({ title: 'Паразиты', original_title: '기생충', original_language: 'ko' }), '');
    assert.equal(englishTitle({ title: 'Название', original_title: {}, original_language: 'en' }), '');
});
