function normaliseTitle(meta) {
  return String(
    meta?.name ||
    meta?.title ||
    meta?.id ||
    ""
  )
    .trim()
    .toLowerCase();
}

function inspectMetas(metas) {
  const seenTitles = new Map();
  const seenIds = new Map();

  const exactDuplicates = [];
  const titleCollisions = [];

  let missingPoster = 0;
  let missingDescription = 0;
  let missingId = 0;
  let missingName = 0;

  metas.forEach((meta, index) => {
    const id = String(meta?.id || "").trim();
    const titleKey = normaliseTitle(meta);

    if (!id) missingId++;
    if (!meta?.name && !meta?.title) missingName++;
    if (!meta?.poster) missingPoster++;
    if (!meta?.description && !meta?.overview) missingDescription++;

    if (id && seenIds.has(id)) {
      exactDuplicates.push({
        reason: "same-id",
        key: id,
        firstIndex: seenIds.get(id),
        duplicateIndex: index,
        id,
        name: meta?.name || meta?.title || null
      });
    } else if (titleKey && seenTitles.has(titleKey)) {
      const first = seenTitles.get(titleKey);

      titleCollisions.push({
        reason: "same-title",
        key: titleKey,
        firstIndex: first.index,
        duplicateIndex: index,
        firstId: first.id || null,
        duplicateId: id || null,
        name: meta?.name || meta?.title || null
      });
    }

    if (id && !seenIds.has(id)) {
      seenIds.set(id, index);
    }

    if (titleKey && !seenTitles.has(titleKey)) {
      seenTitles.set(titleKey, {
        index,
        id
      });
    }
  });

  return {
    resultCount: metas.length,
    uniqueIds: seenIds.size,
    uniqueTitles: seenTitles.size,

    exactDuplicateCount: exactDuplicates.length,
    titleCollisionCount: titleCollisions.length,

    missingPoster,
    missingDescription,
    missingId,
    missingName,

    exactDuplicates: exactDuplicates.slice(0, 25),
    titleCollisions: titleCollisions.slice(0, 25),

    // Temporary compatibility fields for the current frontend.
    duplicateCount: exactDuplicates.length,
    duplicates: exactDuplicates.slice(0, 25)
  };
}

function buildDedupePreview(metas) {
  const seenIds = new Set();
  const seenTitles = new Set();
  const kept = [];
  const removed = [];

  metas.forEach((meta, index) => {
    const id = String(meta?.id || "").trim();
    const titleKey = normaliseTitle(meta);

    let reason = null;

    if (id && seenIds.has(id)) {
      reason = "same-id";
    }

    if (reason) {
      removed.push({
        index,
        reason,
        id: id || null,
        name: meta?.name || meta?.title || null
      });

      return;
    }

    kept.push(meta);

    if (id) {
      seenIds.add(id);
    }

    if (titleKey) {
      seenTitles.add(titleKey);
    }
  });

  return {
    originalCount: metas.length,
    deduplicatedCount: kept.length,
    removedCount: removed.length,
    removed,
    sample: kept.slice(0, 20)
  };
}

function registerCatalogInspectorRoutes(app, deps) {
  const {
    handleCatalogService,
    catalogDeps,
    loadConfigs,
    MDBLIST_KEY,
    FILTER_ENABLED
  } = deps;

  app.get(
    "/api/inspect/catalog/:token/:type/:catalogId",
    async (req, res) => {
      const started = Date.now();

      const token = String(req.params.token || "");
      const type = String(req.params.type || "");
      let catalogId = String(req.params.catalogId || "");

      if (!["movie", "series"].includes(type)) {
        return res.status(400).json({
          ok: false,
          error: "type must be movie or series"
        });
      }

      if (!/^[a-zA-Z0-9_.:-]+$/.test(catalogId)) {
        return res.status(400).json({
          ok: false,
          error: "invalid catalog id"
        });
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(token)) {
        return res.status(400).json({
          ok: false,
          error: "invalid token"
        });
      }

      if (catalogId === "search_movie") {
        catalogId = "search_movies";
      }

      const configs = loadConfigs();
      const config = configs[token];

      if (!config) {
        return res.status(404).json({
          ok: false,
          error: "token not found"
        });
      }

      const extra = {};

      if (req.query.skip) {
        const skip = Number.parseInt(req.query.skip, 10);

        if (Number.isFinite(skip) && skip >= 0) {
          extra.skip = skip;
        }
      }

      if (req.query.search) {
        extra.search = String(req.query.search).slice(0, 200);
      }

      if (req.query.tmdbId) {
        extra.tmdbId = String(req.query.tmdbId).slice(0, 50);
      }

      const selectedCatalogs = Array.isArray(config.catalogs)
        ? config.catalogs
        : [];

      const hasAnime = selectedCatalogs.some((id) =>
        String(id).includes("anime") ||
        String(id).includes("bollywood") ||
        String(id).includes("crunchyroll") ||
        String(id).includes("hidive")
      );

      try {
        const result = await handleCatalogService(
          catalogId,
          type,
          extra,
          config.mdblistKey || MDBLIST_KEY,
          hasAnime ? false : FILTER_ENABLED,
          config.language || "en-US",
          config.rpdbKey || null,
          config.tpKey || null,
          config.traktUser || null,
          config.excludeUnreleased || false,
          config.maxRating || null,
          config.includeAdult || false,
          config.customCatalogs || [],
          config.googleAiKey || null,
          config.fanartKey || null,
          config.omdbKey || null,
          catalogDeps,
          config.excludeLanguages || [],
          config.betterPostersStyle || null,
          config.traktAccessToken || null,
          config.simklAccessToken || null,
          token,
          config
        );

        const metas = Array.isArray(result?.metas)
          ? result.metas
          : [];

        const quality = inspectMetas(metas);
        const dedupePreview = buildDedupePreview(metas);

        res.setHeader("Cache-Control", "no-store");

        return res.json({
          ok: true,
          catalog: {
            id: catalogId,
            type,
            token: token.slice(0, 4) + "****",
            selectedInConfig: selectedCatalogs.includes(catalogId)
          },
          request: {
            extra,
            language: config.language || "en-US",
            filterEnabled: hasAnime ? false : FILTER_ENABLED,
            excludeUnreleased: config.excludeUnreleased || false,
            maxRating: config.maxRating || null,
            excludeLanguages: config.excludeLanguages || []
          },
          performance: {
            durationMs: Date.now() - started
          },
          quality,
          dedupePreview,
          sample: metas.slice(0, 20),
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error(
          "CATALOG INSPECTOR ERROR:",
          catalogId,
          error
        );

        return res.status(500).json({
          ok: false,
          catalog: {
            id: catalogId,
            type
          },
          performance: {
            durationMs: Date.now() - started
          },
          error: error?.message || "catalog inspection failed"
        });
      }
    }
  );
}

module.exports = {
  registerCatalogInspectorRoutes
};
