const {
  isKitsuId,
  buildKitsuMeta
} = require("./kitsu-id-service");

async function handleMetaRequest({ type, id }, deps) {
  const {
    TMDB_KEY,
    fetchCached
  } = deps;

  try {
    if (isKitsuId(id)) {
      return await buildKitsuMeta({ type, id });
    }

    const tmdbType = type === "series" ? "tv" : "movie";

    const findRes = await fetchCached(
      `https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`
    );

    const result = findRes[`${tmdbType}_results`]?.[0];

    if (!result) {
      return { meta: { id, type } };
    }

    const tmdbId = result.id;

    const d = await fetchCached(
      `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits`
    );

    if (!d) {
      return { meta: { id, type } };
    }

    const cast = (d.credits?.cast || [])
      .slice(0, 5)
      .map(c => c.name);

    const meta = {
      id,
      type,
      name: d.title || d.name,
      description: d.overview,
      poster: d.poster_path
        ? `https://image.tmdb.org/t/p/w500${d.poster_path}`
        : null,
      background: d.backdrop_path
        ? `https://image.tmdb.org/t/p/original${d.backdrop_path}`
        : null,
      releaseInfo: d.release_date
        ? d.release_date.split("-")[0]
        : d.first_air_date
        ? d.first_air_date.split("-")[0]
        : null,
      imdbRating: d.vote_average
        ? d.vote_average.toFixed(1)
        : null,
      genres: (d.genres || []).map(g => g.name),
      cast
    };

    if (type === "series" && d.next_episode_to_air) {
      const next = d.next_episode_to_air;

      meta.releaseInfo =
        `${d.first_air_date?.split("-")[0] || ""} - Next: ` +
        `S${next.season_number}E${next.episode_number} ${next.air_date}`;
    }

    if (type === "series") {
      const seasons = (d.seasons || [])
        .filter(s => s.season_number > 0);

      const seasonData = await Promise.all(
        seasons.map(async season => {
          try {
            return await fetchCached(
              `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season.season_number}?api_key=${TMDB_KEY}`
            );
          } catch {
            return null;
          }
        })
      );

      const videos = [];

      seasonData.forEach((sr, i) => {
        if (!sr) return;

        const season = seasons[i];

        (sr.episodes || []).forEach(ep => {
          videos.push({
            id: `${id}:${season.season_number}:${ep.episode_number}`,
            title: ep.name || `Episode ${ep.episode_number}`,
            season: season.season_number,
            episode: ep.episode_number,
            overview: ep.overview || "",
            thumbnail: ep.still_path
              ? `https://image.tmdb.org/t/p/w300${ep.still_path}`
              : null,
            released: ep.air_date
              ? new Date(ep.air_date).toISOString()
              : null
          });
        });
      });

      videos.sort((a, b) =>
        a.season !== b.season
          ? a.season - b.season
          : a.episode - b.episode
      );

      meta.videos = videos;
    }

    return { meta };

  } catch (e) {
    return { meta: { id, type } };
  }
}

module.exports = {
  handleMetaRequest
};
