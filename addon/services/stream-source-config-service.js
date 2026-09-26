"use strict";

const { resolveStreamLanguageSettings } = require("./stream-language-service");

function activeDebridServices(config = {}) {
  if (Array.isArray(config.debridServices) && config.debridServices.length) {
    return config.debridServices.filter(item => item && item.service && item.apiKey);
  }

  if (config.debridService && config.debridApiKey) {
    return [{ service: config.debridService, apiKey: config.debridApiKey }];
  }

  return [];
}

function buildCometManifestUrl(config = {}) {
  const debridServices = activeDebridServices(config);
  if (!debridServices.length) return null;

  const languageSettings = resolveStreamLanguageSettings(config);
  const cometConfig = {
    maxResultsPerResolution: 3,
    maxSize:
      Number.isFinite(Number(config.debridMaxSizeGb)) &&
      Number(config.debridMaxSizeGb) > 0
        ? Math.min(Number(config.debridMaxSizeGb), 500) * 1024 * 1024 * 1024
        : 0,
    cachedOnly: !!config.debridCachedOnly,
    sortCachedUncachedTogether: false,
    removeTrash: config.debridRemoveTrash !== false,
    resultFormat: ["title", "video_info", "quality_info", "size"],
    debridServices,
    enableTorrent: false,
    deduplicateStreams: true,
    scrapeDebridAccountTorrents: false,
    debridStreamProxyPassword: "",
    languages: {
      required: [],
      allowed:
        languageSettings.mode === "only"
          ? languageSettings.languages
          : [],
      exclude: [],
      preferred:
        languageSettings.mode === "all"
          ? []
          : languageSettings.languages
    },
    resolutions: {
      "2160p": config.debridRes4k !== false,
      "1080p": config.debridRes1080 !== false,
      "720p": config.debridRes720 !== false,
      "480p": !!config.debridRes480
    },
    options: {
      remove_ranks_under: -10000000000,
      allow_english_in_languages:
        languageSettings.mode !== "only" ||
        languageSettings.languages.includes("en"),
      remove_unknown_languages: false
    }
  };

  const blob = Buffer.from(JSON.stringify(cometConfig)).toString("base64");
  return `https://comet.feels.legal/${blob}/manifest.json`;
}

function buildEffectiveStreamAddons(config = {}) {
  const configured = Array.isArray(config.streamAddons)
    ? config.streamAddons.filter(Boolean)
    : [];

  const cometUrl = buildCometManifestUrl(config);
  const withoutGeneratedComet = configured.filter(
    url =>
      !String(url).includes("comet.feels.legal") &&
      !String(url).includes("comet.maxbase")
  );

  const combined = cometUrl
    ? [cometUrl, ...withoutGeneratedComet]
    : configured;

  return Array.from(new Set(combined)).slice(0, 8);
}

module.exports = {
  activeDebridServices,
  buildCometManifestUrl,
  buildEffectiveStreamAddons
};
