const axios = require('axios');

const PREWARM_CATALOGS = [
  'trending_movies', 'trending_series',
  'popular_movies', 'popular_series',
  'top_movies', 'top_series',
  'now_movies', 'airing_series',
  'netflix_movies', 'netflix_series',
  'disney_movies', 'disney_series',
  'amazon_movies', 'amazon_series',
  'hbo_movies', 'hbo_series',
  'apple_movies', 'apple_series',
  'action_movies', 'comedy_movies', 'horror_movies', 'thriller_movies', 'scifi_movies',
  'action_series', 'comedy_series', 'drama_series',
  'studio_marvel', 'studio_dc',
  'trakt_trending_movies', 'trakt_trending_series',
  'trakt_popular_movies', 'trakt_popular_series'
];

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 7000}`;
const INTERVAL_MS = 4 * 60 * 1000;

const REFILL_SPACING_MS = 200;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function prewarm() {
  const start = Date.now();
  let hits = 0, misses = 0, errors = 0;
  for (let i = 0; i < PREWARM_CATALOGS.length; i++) {
    const id = PREWARM_CATALOGS[i];
    const type = id.includes('series') ? 'series' : 'movie';
    try {
      const res = await axios.get(`${BASE_URL}/catalog/${type}/${id}.json`, { timeout: 30000 });
      if (res.headers['x-cache-status'] === 'HIT') hits++; else misses++;
    } catch (e) { errors++; }
    // Space out each catalog refill so the TMDB lookups it triggers
    // don't all land on top of each other and trip 429s.
    if (i < PREWARM_CATALOGS.length - 1) await delay(REFILL_SPACING_MS);
  }
  console.log(`[${new Date().toISOString()}] prewarm done in ${Math.round((Date.now()-start)/1000)}s — hits:${hits} misses:${misses} errors:${errors}`);
}

console.log('[prewarm] Starting cache pre-warmer, interval:', INTERVAL_MS/1000, 's');
prewarm();
setInterval(prewarm, INTERVAL_MS);
