const previewCache = new Map();

async function handleTmdbPreview(req, res) {
  try {
    const {
      type = 'movie',
      genre = '',
      minRating = '',
      yearFrom = '',
      yearTo = '',
      query = '',
      person = ''
    } = req.query;

    const network = req.query.network || '';
    const sourceType = req.query.sourceType || '';
    const cacheKey =
      `${type}_${genre}_${network}_${sourceType}_${minRating}_${yearFrom}_${yearTo}_${query}_${person}`;

    const now = Date.now();

    if (previewCache.has(cacheKey)) {
      const cached = previewCache.get(cacheKey);

      if (now - cached.time < 15 * 60 * 1000) {
        return res.json(cached.data);
      }
    }

    const tmdbType = type === 'series' ? 'tv' : type;

    const params = new URLSearchParams({
      api_key: process.env.TMDB_KEY,
      sort_by: 'popularity.desc',
      include_adult: 'false',
      page: '1'
    });

    if (genre) params.append('with_genres', genre);
    if (network) {
      params.append('with_watch_providers', network);
      // UK providers need GB region
      const ukProviders = ['38','103','41','11']; // BBC, Channel 4, ITVX, MUBI
      params.append('watch_region', ukProviders.includes(String(network)) ? 'GB' : 'US');
    }
    if (minRating) params.append('vote_average.gte', minRating);

    if (tmdbType === 'tv') {
      if (yearFrom) {
        params.append('first_air_date.gte', yearFrom + '-01-01');
      }

      if (yearTo) {
        params.append('first_air_date.lte', yearTo + '-12-31');
      }
    } else {
      if (yearFrom) {
        params.append('primary_release_date.gte', yearFrom + '-01-01');
      }

      if (yearTo) {
        params.append('primary_release_date.lte', yearTo + '-12-31');
      }
    }

    let url;
    let j;
    let collection = null;

    if (person) {
      const personParams = new URLSearchParams({
        api_key: process.env.TMDB_KEY,
        query: person,
        include_adult: 'false',
        page: '1'
      });

      const pr = await fetch(
        `https://api.themoviedb.org/3/search/person?${personParams.toString()}`
      );

      const pj = await pr.json();
      const bestPerson = (pj.results || [])[0];

      if (bestPerson && bestPerson.id) {
        // Use with_people to cover both directors and actors
        params.append('with_crew', String(bestPerson.id));

        url =
          `https://api.themoviedb.org/3/discover/${tmdbType}?${params.toString()}`;
      } else {
        j = { results: [] };
      }
    }

    if (!j) {
      if (query && tmdbType === 'movie') {
        const collectionParams = new URLSearchParams({
          api_key: process.env.TMDB_KEY,
          query,
          include_adult: 'false',
          page: '1'
        });

        const cr = await fetch(
          `https://api.themoviedb.org/3/search/collection?${collectionParams.toString()}`
        );

        const cj = await cr.json();

        const q = String(query).toLowerCase().trim();

        collection = (cj.results || []).find(c => {
          const name = String(c.name || '').toLowerCase();

        collection = (cj.results || []).find(c => {
          const name = String(c.name || '').toLowerCase();
          const nameClean = name.replace(' collection', '').trim();
          return nameClean === q || name === q || nameClean.startsWith(q) || q.startsWith(nameClean);
        });
        });

        if (collection && collection.id) {
          const fr = await fetch(
            `https://api.themoviedb.org/3/collection/${collection.id}?api_key=${process.env.TMDB_KEY}`
          );

          const fj = await fr.json();

          let parts = fj.parts || [];

          parts = parts.sort((a, b) => {
            const da = new Date(a.release_date || '1900-01-01');
            const db = new Date(b.release_date || '1900-01-01');
            return da - db;
          });

          j = { results: parts };
        }
      }

      if (!j) {
        if (query && sourceType === 'keyword') {
          // For keywords, look up TMDB keyword ID then use discover
          const kwParams = new URLSearchParams({ api_key: process.env.TMDB_KEY, query, page: '1' });
          const kwr = await fetch(`https://api.themoviedb.org/3/search/keyword?${kwParams}`);
          const kwj = await kwr.json();
          const kw = (kwj.results || []).find(k => k.name.toLowerCase().includes(query.toLowerCase()));
          if (kw) {
            params.append('with_keywords', String(kw.id));
            url = `https://api.themoviedb.org/3/discover/${tmdbType}?${params.toString()}`;
          } else {
            const searchType = tmdbType === 'tv' ? 'tv' : 'movie';
            const searchParams = new URLSearchParams({ api_key: process.env.TMDB_KEY, query, include_adult: 'false', page: '1' });
            url = `https://api.themoviedb.org/3/search/${searchType}?${searchParams.toString()}`;
          }
        } else if (query) {
          const searchType = tmdbType === 'tv' ? 'tv' : 'movie';
          const searchParams = new URLSearchParams({ api_key: process.env.TMDB_KEY, query, include_adult: 'false', page: '1' });
          url = `https://api.themoviedb.org/3/search/${searchType}?${searchParams.toString()}`;
        } else {
          url = `https://api.themoviedb.org/3/discover/${tmdbType}?${params.toString()}`;
        }

        const r = await fetch(url);
        j = await r.json();
      }
    }

    let rawResults = j.results || [];

    if (query && !person) {
      const q = String(query).toLowerCase().trim();

      const badWords = [
        'ninja', 'shocking', 'mockbuster', 'parody', 'ripoff', 'lady'
      ];

      rawResults = rawResults.filter(x => {
        const title = String(x.title || x.name || '').toLowerCase();
        // Only apply title filter for plain text search, not keyword ID discover or collection
        if (sourceType === '' && q && !title.includes(q)) return false;
        if (badWords.some(b => title.includes(b))) return false;
        if (!x.poster_path) return false;
        if (Number(x.vote_average || 0) <= 0) return false;
        return true;
      });
    }

    const results = rawResults.slice(0, 8).map(x => ({
      title: x.title || x.name,
      poster: x.poster_path
        ? `https://image.tmdb.org/t/p/w342${x.poster_path}`
        : null,
      rating: x.vote_average
    }));

    const payload = {
      results,
      collectionId:
        collection && collection.id
          ? collection.id
          : null
    };

    previewCache.set(cacheKey, {
      time: now,
      data: payload
    });

    return res.json(payload);

  } catch (e) {
    console.error('Preview error:', e);

    return res.status(500).json({
      error: 'preview_failed'
    });
  }
}

module.exports = {
  handleTmdbPreview
};
