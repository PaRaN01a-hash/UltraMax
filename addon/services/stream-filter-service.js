"use strict";

const GIB = 1024 * 1024 * 1024;
const MIB = 1024 * 1024;
const {
  detectStreamLanguages,
  resolveStreamLanguageSettings,
  languagePreferenceRank
} = require("./stream-language-service");

function streamText(stream = {}) {
  const hints = stream.behaviorHints || {};
  return [
    stream.name,
    stream.title,
    stream.description,
    hints.filename
  ]
    .map(value => String(value || ""))
    .filter(Boolean)
    .join("\n");
}

function detectStreamResolution(stream = {}) {
  const text = streamText(stream);

  if (
    /\b(?:2160p?|4k|uhd)\b/i.test(text) ||
    /\b3840\s*[x×]\s*2160\b/i.test(text)
  ) {
    return "4k";
  }

  if (
    /\b1080p?\b/i.test(text) ||
    /\b1920\s*[x×]\s*1080\b/i.test(text)
  ) {
    return "1080p";
  }

  if (
    /\b720p?\b/i.test(text) ||
    /\b1280\s*[x×]\s*720\b/i.test(text)
  ) {
    return "720p";
  }

  if (
    /\b(?:480p?|576p?)\b/i.test(text) ||
    /\b(?:720\s*[x×]\s*480|854\s*[x×]\s*480)\b/i.test(text)
  ) {
    return "480p";
  }

  return null;
}

function parseSizeBytes(value) {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  const text = String(value).trim();
  if (!text) return 0;

  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  const match = text.match(/([\d.]+)\s*(TiB|TB|GiB|GB|MiB|MB)\b/i);
  if (!match) return 0;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  const unit = match[2].toLowerCase();
  if (unit === "tib" || unit === "tb") return amount * 1024 * GIB;
  if (unit === "gib" || unit === "gb") return amount * GIB;
  if (unit === "mib" || unit === "mb") return amount * MIB;
  return 0;
}

function detectStreamSizeBytes(stream = {}) {
  const hints = stream.behaviorHints || {};
  const direct = [
    hints.videoSize,
    stream.videoSize,
    stream.size,
    hints.size
  ];

  for (const candidate of direct) {
    const parsed = parseSizeBytes(candidate);
    if (parsed > 0) return parsed;
  }

  const text = streamText(stream);
  const match = text.match(/([\d.]+)\s*(TiB|TB|GiB|GB|MiB|MB)\b/i);
  return match ? parseSizeBytes(match[0]) : 0;
}

function isPromotionalStreamNotice(stream = {}) {
  const text = streamText(stream).toLowerCase();
  const externalUrl = String(stream.externalUrl || "").toLowerCase();

  const hasDirectPlayback = Boolean(
    stream.url ||
    stream.infoHash ||
    stream.ytId
  );
  const hasExternalTarget = Boolean(stream.externalUrl);

  // A stream object with descriptive text but no playable locator is a notice,
  // not a stream. This catches generic maintenance/status cards in addition to
  // the donation and Discord banners users specifically reported.
  if (!hasDirectPlayback && !hasExternalTarget && text.trim()) {
    return true;
  }

  const looksPromotional =
    /\bdonat(?:e|ion|ing)?\b/.test(text) ||
    /\bsupport (?:the|this|our) project\b/.test(text) ||
    /\bkeep (?:the )?project alive\b/.test(text) ||
    /\bjoin (?:the|our) discord\b/.test(text) ||
    /\bdiscord server\b/.test(text) ||
    /\bbuy me a coffee\b/.test(text) ||
    /\bko-?fi\b/.test(text) ||
    /\bpatreon\b/.test(text);

  if (!looksPromotional) return false;
  if (!hasDirectPlayback) return true;

  return /(?:donat|discord|ko-?fi|patreon|buymeacoffee)/i.test(externalUrl);
}

function normalizeSizeLimitGb(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 0;
}

function resolutionEnabled(resolution, config = {}) {
  if (!resolution) return true;
  if (resolution === "4k") return config.debridRes4k !== false;
  if (resolution === "1080p") return config.debridRes1080 !== false;
  if (resolution === "720p") return config.debridRes720 !== false;
  if (resolution === "480p") return !!config.debridRes480;
  return true;
}

function applyStreamFilters(streams, config = {}) {
  const minSizeGb = normalizeSizeLimitGb(config.streamMinSizeGb);
  const maxSizeGb = normalizeSizeLimitGb(config.debridMaxSizeGb);
  const minBytes = minSizeGb ? minSizeGb * GIB : 0;
  const maxBytes = maxSizeGb ? maxSizeGb * GIB : 0;
  const languageSettings = resolveStreamLanguageSettings(config);
  const selectedLanguages = new Set(languageSettings.languages);

  return (Array.isArray(streams) ? streams : []).filter(stream => {
    const resolution = detectStreamResolution(stream);
    if (!resolutionEnabled(resolution, config)) return false;

    const sizeBytes = detectStreamSizeBytes(stream);
    if (minBytes && sizeBytes && sizeBytes < minBytes) return false;
    if (maxBytes && sizeBytes && sizeBytes > maxBytes) return false;

    if (languageSettings.mode === "only" && selectedLanguages.size) {
      const detectedLanguages = detectStreamLanguages(stream);
      // Unknown language is preserved because many addons do not expose
      // language metadata. Known non-matches are filtered out.
      if (
        detectedLanguages.length &&
        !detectedLanguages.some(code => selectedLanguages.has(code))
      ) {
        return false;
      }
    }

    if (config.hideStreamNotices === true && isPromotionalStreamNotice(stream)) {
      return false;
    }

    return true;
  });
}

function resolutionRank(stream) {
  const resolution = detectStreamResolution(stream);
  if (resolution === "4k") return 4;
  if (resolution === "1080p") return 3;
  if (resolution === "720p") return 2;
  if (resolution === "480p") return 1;
  return 0;
}

function sortStreams(streams, config = {}) {
  const list = Array.isArray(streams) ? streams.slice() : [];
  const mode = String(config.streamSortMode || "source").toLowerCase();
  const languageSettings = resolveStreamLanguageSettings(config);
  const useLanguagePriority =
    languageSettings.mode !== "all" && languageSettings.languages.length > 0;

  if (mode === "source" && !useLanguagePriority) return list;

  return list
    .map((stream, index) => ({ stream, index }))
    .sort((left, right) => {
      if (useLanguagePriority) {
        const leftLanguageRank = languagePreferenceRank(
          left.stream,
          languageSettings.languages
        );
        const rightLanguageRank = languagePreferenceRank(
          right.stream,
          languageSettings.languages
        );
        if (leftLanguageRank !== rightLanguageRank) {
          return leftLanguageRank - rightLanguageRank;
        }
      }

      if (mode === "quality") {
        const byQuality = resolutionRank(right.stream) - resolutionRank(left.stream);
        if (byQuality) return byQuality;

        const bySize =
          detectStreamSizeBytes(right.stream) -
          detectStreamSizeBytes(left.stream);
        if (bySize) return bySize;
      } else if (mode === "size-desc") {
        const bySize =
          detectStreamSizeBytes(right.stream) -
          detectStreamSizeBytes(left.stream);
        if (bySize) return bySize;
      } else if (mode === "size-asc") {
        const leftSize = detectStreamSizeBytes(left.stream);
        const rightSize = detectStreamSizeBytes(right.stream);

        if (leftSize && rightSize && leftSize !== rightSize) {
          return leftSize - rightSize;
        }
        if (leftSize && !rightSize) return -1;
        if (!leftSize && rightSize) return 1;
      }

      return left.index - right.index;
    })
    .map(entry => entry.stream);
}

module.exports = {
  GIB,
  streamText,
  detectStreamResolution,
  detectStreamSizeBytes,
  isPromotionalStreamNotice,
  applyStreamFilters,
  sortStreams
};
