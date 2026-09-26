const test = require('node:test');
const assert = require('node:assert/strict');
const { applyBpStyle } = require('../services/metadata-service');

test('Pictorium template expands media type and enriches movie query data', () => {
  const url = applyBpStyle(
    'https://dev.ultramax.vip/pictorium/api/poster/{media_type}/{imdb_id}?rv=67dc78827a&region=GB',
    'tt0137523',
    'en-GB',
    { type: 'movie', tmdbId: 550, title: 'Fight Club', releaseDate: '1999-10-15' }
  );
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/pictorium/api/poster/movie/550');
  assert.equal(parsed.searchParams.get('title'), 'Fight Club');
  assert.equal(parsed.searchParams.get('imdbId'), 'tt0137523');
  assert.equal(parsed.searchParams.get('lang'), 'en');
  assert.equal(parsed.searchParams.get('rd'), '1999-10-15');
  assert.equal(parsed.searchParams.get('region'), 'GB');
});

test('Pictorium template uses fad for series', () => {
  const url = applyBpStyle(
    'https://dev.ultramax.vip/pictorium/api/poster/{media_type}/{imdb_id}?rv=67dc78827a',
    'tt0903747',
    'en-US',
    { type: 'series', tmdbId: 1396, title: 'Breaking Bad', releaseDate: '2008-01-20' }
  );
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/pictorium/api/poster/series/1396');
  assert.equal(parsed.searchParams.get('fad'), '2008-01-20');
  assert.equal(parsed.searchParams.get('rd'), null);
});

test('official Pictorium custom URL keeps its type placeholder contract and private render version', () => {
  const url = applyBpStyle(
    'https://posters.example.test/api/poster/{type}/{imdb_id}?rv=private-rv&api_key=private-key&badges=0',
    'tt0137523',
    'en-GB',
    { type: 'movie', tmdbId: 550, title: 'Fight Club', releaseDate: '1999-10-15' }
  );
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/api/poster/movie/tt0137523');
  assert.equal(parsed.searchParams.get('rv'), 'private-rv');
  assert.equal(parsed.searchParams.get('api_key'), 'private-key');
  assert.equal(parsed.searchParams.get('badges'), '0');
  assert.equal(parsed.searchParams.get('title'), 'Fight Club');
  assert.equal(parsed.searchParams.get('imdbId'), 'tt0137523');
  assert.equal(parsed.searchParams.get('lang'), 'en');
  assert.equal(parsed.searchParams.get('rd'), '1999-10-15');
});

test('new hosted Pictorium template uses TMDB id directly and keeps IMDb context', () => {
  const url = applyBpStyle(
    'https://ultramax.vip/pictorium/api/poster/{media_type}/{tmdb_id}?region=GB',
    'tt0137523',
    'en-GB',
    { type: 'movie', tmdbId: 550, title: 'Fight Club', releaseDate: '1999-10-15' }
  );
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/pictorium/api/poster/movie/550');
  assert.equal(parsed.searchParams.get('imdbId'), 'tt0137523');
  assert.ok(parsed.searchParams.get('rv'));
});

test('hosted TMDB-first template safely falls back to IMDb when TMDB id is unavailable', () => {
  const url = applyBpStyle(
    'https://ultramax.vip/pictorium/api/poster/{media_type}/{tmdb_id}?region=GB',
    'tt0137523',
    'en-GB',
    { type: 'movie', title: 'Fight Club' }
  );
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/pictorium/api/poster/movie/tt0137523');
});

