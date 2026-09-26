const { fetchTrakt } = require("./api-helpers");
const { traktToMetas } = require("./metadata-service");
const axios = require('axios');
const { mutateAccount, MUTATION_REASONS = { OAUTH_INTEGRATION: "oauth-integration" } } = require("../utils/config-store");

// In-memory blacklist for permanently failed refresh tokens
// Key: userToken, Value: timestamp when blacklisted (24h expiry)
const _traktRefreshBlacklist = new Map();
const BLACKLIST_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function refreshTraktToken(userToken, config) {
  if(!config.traktRefreshToken) return null;

  // Skip tokens that recently failed with a permanent error (400)
  const blacklistedAt = _traktRefreshBlacklist.get(userToken);
  if(blacklistedAt && Date.now() - blacklistedAt < BLACKLIST_TTL) {
    return null;
  }

  try {
    const res = await axios.post('https://api.trakt.tv/oauth/token', {
      refresh_token: config.traktRefreshToken,
      client_id: process.env.TRAKT_CLIENT_ID,
      client_secret: process.env.TRAKT_CLIENT_SECRET,
      grant_type: 'refresh_token'
    }, { headers: { 'Content-Type': 'application/json' } });
    const data = res.data;
    if(!data.access_token) return null;
    await mutateAccount(userToken, account => {
      account.traktAccessToken = data.access_token;
      account.traktRefreshToken = data.refresh_token;
      account.traktTokenExpiry = Date.now() + (data.expires_in * 1000);
    }, { reason: MUTATION_REASONS.OAUTH_INTEGRATION });
    console.log('[Trakt] Token refresh persisted');
    return data.access_token;
  } catch(e) {
    if (e && e.code === "PROFILE_STORE_MIRROR_FAILED") throw e;
    const status = e.response && e.response.status;
    if(status === 400 || status === 401) {
      // Permanent failure — blacklist this token for 24h to stop retry spam
      _traktRefreshBlacklist.set(userToken, Date.now());
      console.error('[Trakt] Refresh permanently failed — blacklisted 24h');
    } else {
      console.error('[Trakt] Refresh failed');
    }
    return null;
  }
}

async function getValidTraktToken(userToken, config) {
  if(!config.traktAccessToken) return null;
  if(config.traktTokenExpiry && Date.now() > config.traktTokenExpiry - 300000) {
    const newToken = await refreshTraktToken(userToken, config);
    return newToken || null;
  }
  return config.traktAccessToken;
}

function buildTraktRecommendationsPath(type) {
  return type === "series" ? "/recommendations/shows" : "/recommendations/movies";
}

function buildTraktPublicListPath(listId, type, skip = 0) {
  const id = Number(listId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const media = type === "series" ? "shows" : "movies";
  const offset = Math.max(0, Number(skip) || 0);
  const page = Math.floor(offset / 100) + 1;
  return `/lists/${id}/items/${media}?limit=100&page=${page}&extended=full`;
}

async function handleTraktCatalog(
  handler,
  type,
  traktUser,
  language,
  rpdbKey,
  tpKey,
  excludeUnreleased,
  traktClientId,
  traktAccessToken = null,
  userToken = null,
  userConfig = null,
  bpStyle = null,
  runtimeDeps = {}
) {
  const resultsMapper = typeof runtimeDeps.traktToMetas === "function"
    ? runtimeDeps.traktToMetas
    : traktToMetas;
  // Refresh token if needed
  let activeToken = traktAccessToken;
  if(traktAccessToken && userToken && userConfig) {
    activeToken = await getValidTraktToken(userToken, userConfig);
  }
  const authHeaders = activeToken
    ? { 'Authorization': `Bearer ${activeToken}`, 'trakt-api-version': '2', 'trakt-api-key': traktClientId }
    : null;
  switch (handler) {
    case "trakt_recommendations": {
      if (!activeToken) return { metas: [] };
      const path = buildTraktRecommendationsPath(type);
      const data = await fetchTrakt(`${path}?limit=50`, traktClientId, authHeaders);
      return {
        metas: await resultsMapper(
          data, type, language, rpdbKey, tpKey, excludeUnreleased, bpStyle, userConfig
        )
      };
    }

    case "trakt_public_list": {
      const path = buildTraktPublicListPath(runtimeDeps?.publicList?.listId, type, runtimeDeps?.skip);
      if (!path) return { metas: [] };
      const data = await fetchTrakt(path, traktClientId);
      return {
        metas: await resultsMapper(
          data, type, language, rpdbKey, tpKey, excludeUnreleased, bpStyle, userConfig
        )
      };
    }

    case "trakt_trending": {
      const path = type === "series" ? "/shows/trending" : "/movies/trending";
      const data = await fetchTrakt(`${path}?limit=50`, traktClientId, authHeaders);
      return {
        metas: await resultsMapper(
          data, type, language, rpdbKey, tpKey, excludeUnreleased, bpStyle, userConfig
        )
      };
    }

    case "trakt_popular": {
      const path = type === "series" ? "/shows/popular" : "/movies/popular";
      const data = await fetchTrakt(`${path}?limit=50&extended=full`, traktClientId, authHeaders);
      return {
        metas: await resultsMapper(
          data, type, language, rpdbKey, tpKey, excludeUnreleased, bpStyle, userConfig
        )
      };
    }

    case "trakt_anticipated": {
      const path = type === "series" ? "/shows/anticipated" : "/movies/anticipated";
      const data = await fetchTrakt(`${path}?limit=50`, traktClientId, authHeaders);
      return {
        metas: await resultsMapper(
          data, type, language, rpdbKey, tpKey, excludeUnreleased, bpStyle, userConfig
        )
      };
    }

    case "trakt_user_favorites": {
      if (!traktUser) return { metas: [] };
      const t = type === "series" ? "shows" : "movies";
      const data = await fetchTrakt(`/users/${traktUser}/favorites/${t}?limit=50`, traktClientId, authHeaders);
      return {
        metas: await resultsMapper(
          data, type, language, rpdbKey, tpKey, excludeUnreleased, bpStyle, userConfig
        )
      };
    }

    case "trakt_user_watchlist": {
      if (!traktUser) return { metas: [] };
      const t = type === "series" ? "shows" : "movies";
      const data = await fetchTrakt(`/users/${traktUser}/watchlist/${t}?limit=50`, traktClientId, authHeaders);
      return {
        metas: await resultsMapper(
          data, type, language, rpdbKey, tpKey, excludeUnreleased, bpStyle, userConfig
        )
      };
    }

    case "trakt_user_collection": {
      if (!traktUser) return { metas: [] };
      const t = type === "series" ? "shows" : "movies";
      const data = await fetchTrakt(`/users/${traktUser}/collection/${t}`, traktClientId, authHeaders);
      return {
        metas: await resultsMapper(
          data, type, language, rpdbKey, tpKey, excludeUnreleased, bpStyle, userConfig
        )
      };
    }

    default:
      return null;
  }
}

module.exports = {
  handleTraktCatalog,
  getValidTraktToken,
  buildTraktRecommendationsPath,
  buildTraktPublicListPath
};
