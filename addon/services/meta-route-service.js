const {
  isKitsuId,
  buildKitsuMeta
} = require("./kitsu-id-service");

const {
  getSportsFixtureMeta,
  isSportsFixtureId
} = require("./sports-fixture-catalog-service");
const {
  getNuvioSportsMeta,
  isNuvioSportsId
} = require("./nuvio-live-sports-service");
const {
  getF1HistoryMeta,
  isF1HistoryId
} = require("./f1-history-service");

const { resolveConfigForProfile } = require("../utils/profiles");
const { getProviderCapabilities } = require("./provider-capability-service");
const { resolveRuntimeTmdbKey } = require("./tmdb-key-health-service");
const { isPremiumizeLibraryContentId, getPremiumizeMeta } = require("./premiumize-library-service");
const { isTorboxLibraryContentId, getTorboxMeta } = require("./torbox-library-service");
const { applyBpStyle } = require("./metadata-service");
const { buildEpisodeReleasedAt } = require("./episode-release-delay-service");

async function handleConfiguredMeta(req, res, deps) {
  const { token, type, id } = req.params;
  const { loadConfigs, readConfig = async token => loadConfigs()[token], fetchCached, TMDB_KEY } = deps;

  const baseConfig = await readConfig(token, req.query.profile);
  const config = resolveConfigForProfile(baseConfig || {}, req.query.profile);
  const capabilities = getProviderCapabilities(config, { serverTmdbKey: TMDB_KEY });
  const runtimeTmdb = await resolveRuntimeTmdbKey(capabilities, {
    serverTmdbKey: TMDB_KEY
  });
  const tmdbKey = runtimeTmdb.tmdbKey;
  const lang = config.language || "en-US";
  const bpStyle = config.betterPostersStyle || null;

  try {
    if (isPremiumizeLibraryContentId(id)) {
      const meta = await getPremiumizeMeta({
        id,
        type,
        token,
        config,
        tmdbKey
      });
      return res.json({ meta: meta || { id, type } });
    }

    if (isTorboxLibraryContentId(id)) {
      const meta = await getTorboxMeta({ id, type, token, config, tmdbKey });
      return res.json({ meta: meta || { id, type } });
    }

    if (isNuvioSportsId(id)) {
      const meta =
        await getNuvioSportsMeta(
          id,
          type || "tv"
        );

      if (meta) {
        return res.json({ meta });
      }

      return res.json({ meta: null });
    }

    if (isSportsFixtureId(id)) {
      const meta =
        await getSportsFixtureMeta(
          id,
          type
        );

      return res.json({
        meta: meta || {
          id,
          type
        }
      });
    }

    if (isF1HistoryId(id)) {
      const meta =
        await getF1HistoryMeta(
          id,
          type
        );

      return res.json({
        meta: meta || {
          id,
          type
        }
      });
    }

    if (isKitsuId(id)) {
      const result = await buildKitsuMeta({
        type,
        id,
        animePresentationMode:
          config.animePresentationMode === "anisync" ? "anisync" : "unified"
      });
      return res.json(result || { meta: { id, type } });
    }

    if (!capabilities.hasAnyDiscoveryProvider || !tmdbKey) {
      return res.json({ meta: { id, type } });
    }

    const tmdbType = type === "series" ? "tv" : "movie";
    const directTmdbMatch = String(id || "").match(/^tmdb:(\d+)$/i);
    let tmdbId = directTmdbMatch ? Number(directTmdbMatch[1]) : null;

    if (!tmdbId) {
      const findRes = await fetchCached(
        `https://api.themoviedb.org/3/find/${id}?api_key=${tmdbKey}&external_source=imdb_id`
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

      tmdbId = result.id;
    } else {
      console.log(
        "META DEBUG:",
        tmdbType,
        id,
        "direct tmdb:",
        tmdbId,
        "lang:",
        lang
      );
    }

    const d = await fetchCached(
      `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${tmdbKey}&append_to_response=credits&language=${lang}`
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

    const isImdbId = /^tt\d+$/i.test(String(id || ""));
    const meta = {
      id,
      ...(isImdbId ? { imdb_id: id } : {}),
      moviedb_id: tmdbId,
      type,
      name: d.title || d.name,
      description: d.overview,
      poster: bpStyle && isImdbId
        ? applyBpStyle(bpStyle, id, lang, {
            type,
            tmdbId,
            title: d.title || d.name,
            releaseDate: d.release_date || d.first_air_date || null
          })
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
              `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season.season_number}?api_key=${tmdbKey}`
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
            released: buildEpisodeReleasedAt(
              ep.air_date,
              config.episodeReleaseDelayHours
            )
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
