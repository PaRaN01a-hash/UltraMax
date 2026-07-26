const {
  isKitsuId,
  buildKitsuMeta
} = require("./kitsu-id-service");
const { resolveConfigForProfile } = require("../utils/profiles");

async function handleConfiguredMeta(req, res, deps) {
  const { token, type, id } = req.params;
  const { loadConfigs, fetchCached, TMDB_KEY } = deps;

  const configs = loadConfigs();
  const config = resolveConfigForProfile(configs[token] || {}, req.query.profile);
  const lang = config.language || "en-US";
  const bpStyle = config.betterPostersStyle || null;

  try {
    if (isKitsuId(id)) {
      const result = await buildKitsuMeta({ type, id });
      return res.json(result || { meta: { id, type } });
    }

    const tmdbType = type === "series" ? "tv" : "movie";

    const findRes = await fetchCached(
      `https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`
    );

    const result = findRes[`${tmdbType}_results`]?.[0];

    console.log(
      "META DEBUG:",
      tmdbType,
      id,
      "result:",
      result?.id,
      "lang:",
      lang
    );

    if (!result) {
      return res.json({ meta: { id, type } });
    }

    const tmdbId = result.id;

    const d = await fetchCached(
      `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits&language=${lang}`
    );

    const castPeople = (d.credits?.cast || [])
      .slice(0, 12)
      .map(person => ({
        name: person.name,
        character: person.character || "",
        image: person.profile_path
          ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
          : null,
        profile: person.profile_path
          ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
          : null
      }));

    const cast = castPeople.map(person => person.name);

    const meta = {
      id,
      imdb_id: id,
      moviedb_id: tmdbId,
      type,
      name: d.title || d.name,
      description: d.overview,
      poster: bpStyle && id
        ? bpStyle.replace('{imdb_id}', id)
        : d.poster_path
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
      cast,
      credits: castPeople,
      castImages: castPeople,
      people: castPeople
    };

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

    return res.json({ meta });

  } catch (e) {
    return res.json({ meta: { id, type } });
  }
}

module.exports = {
  handleConfiguredMeta
};
