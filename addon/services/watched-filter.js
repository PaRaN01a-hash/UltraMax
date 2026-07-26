const watchedCache = new Map(); // token -> { ids: Set, ts: Number }
const WATCHED_TTL = 15 * 60 * 1000; // 15 min

async function getWatchedIds(token, traktToken, simklToken, traktClientId, simklClientId) {
  const cached = watchedCache.get(token);
  if (cached && (Date.now() - cached.ts) < WATCHED_TTL) return cached.ids;

  const ids = new Set();
  try {
    if (traktToken) {
      const movies = await fetch('https://api.trakt.tv/sync/history/movies?limit=1000', {
        headers: { 'Authorization': `Bearer ${traktToken}`, 'trakt-api-version': '2', 'trakt-api-key': traktClientId }
      }).then(r => r.ok ? r.json() : []);
      movies.forEach(m => m.movie?.ids?.imdb && ids.add(m.movie.ids.imdb));

      // Shows: only hide if FULLY completed, not just started
      const showHistory = await fetch('https://api.trakt.tv/sync/history/shows?limit=1000', {
        headers: { 'Authorization': `Bearer ${traktToken}`, 'trakt-api-version': '2', 'trakt-api-key': traktClientId }
      }).then(r => r.ok ? r.json() : []);

      // Dedupe to unique shows (history has one entry per episode watched)
      const uniqueShows = new Map();
      showHistory.forEach(s => {
        if (s.show?.ids?.trakt && !uniqueShows.has(s.show.ids.trakt)) {
          uniqueShows.set(s.show.ids.trakt, s.show);
        }
      });

      // Check completion status per unique show (bounded set, not the whole catalog)
      await Promise.all([...uniqueShows.values()].map(async show => {
        try {
          const progress = await fetch(
            `https://api.trakt.tv/shows/${show.ids.trakt}/progress/watched?hidden=false&specials=false&count_specials=false`,
            { headers: { 'Authorization': `Bearer ${traktToken}`, 'trakt-api-version': '2', 'trakt-api-key': traktClientId } }
          ).then(r => r.ok ? r.json() : null);
          if (progress && progress.aired > 0 && progress.completed >= progress.aired) {
            if (show.ids.imdb) ids.add(show.ids.imdb);
          }
        } catch { /* skip this show on error, fail open per-item */ }
      }));
    }

    if (simklToken) {
      const res = await fetch('https://api.simkl.com/sync/all-items/', {
        headers: { 'Authorization': `Bearer ${simklToken}`, 'simkl-api-key': simklClientId }
      });
      if (res.ok) {
        const data = await res.json();
        (data.movies || []).forEach(m => m.movie?.ids?.imdb && ids.add(m.movie.ids.imdb));
        // Simkl: only fully "completed" status shows
        (data.shows || []).forEach(s => {
          if (s.status === 'completed' && s.show?.ids?.imdb) ids.add(s.show.ids.imdb);
        });
      }
    }
  } catch (e) {
    console.error('[watched-filter] fetch failed, failing open:', e.message);
    return new Set();
  }

  watchedCache.set(token, { ids, ts: Date.now() });
  return ids;
}

function filterWatched(result, watchedIds) {
  if (!watchedIds || watchedIds.size === 0 || !result?.metas) return result;
  result.metas = result.metas.filter(m => !watchedIds.has(m.imdb_id || m.id));
  return result;
}

module.exports = { getWatchedIds, filterWatched };
