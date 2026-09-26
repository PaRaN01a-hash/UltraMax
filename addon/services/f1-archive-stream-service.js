"use strict";

const {
  getF1HistoryMeta,
  isF1HistoryId
} = require("./f1-history-service");

const {
  resolveF1ArchivedTorrents
} = require("./motorsport-torrent-service");

const DEFAULT_STREAM_LIMIT = 10;

function parseBooleanFlag(value) {
  return /^(1|true|yes|on)$/i.test(
    String(value || "").trim()
  );
}

function isArchiveType(type) {
  return type === "movie" || type === "tv";
}

function parseReleasedMs(meta) {
  const released =
    meta?.released;

  if (!released) {
    return null;
  }

  const parsed =
    Date.parse(released);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function isClearlyPastEvent(meta, now = Date.now()) {
  const releasedMs =
    parseReleasedMs(meta);

  if (releasedMs === null) {
    return false;
  }

  return releasedMs < now;
}

function formatBytes(size) {
  const value =
    Number(size);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  const gib =
    value / 1024 / 1024 / 1024;

  if (gib >= 1) {
    return `${gib.toFixed(1)} GB`;
  }

  const mib =
    value / 1024 / 1024;

  return `${Math.max(1, Math.round(mib))} MB`;
}

function buildStreamTitle(result) {
  return [
    "Formula 1 Archive",
    result.resolution,
    result.sessionLabel || result.session,
    formatBytes(result.size),
    Number.isFinite(Number(result.seeders))
      ? `S:${Number(result.seeders)}`
      : null,
    result.source
  ]
    .filter(Boolean)
    .join(" • ");
}

function torrentsToStremioStreams(
  results,
  limit = DEFAULT_STREAM_LIMIT
) {
  const seen =
    new Set();

  const streams = [];

  for (const result of results || []) {
    const infoHash =
      String(result?.infoHash || "")
        .trim()
        .toLowerCase();

    if (
      !/^[a-f0-9]{40}$/.test(infoHash) &&
      !/^[a-z2-7]{32}$/.test(infoHash)
    ) {
      continue;
    }

    if (seen.has(infoHash)) {
      continue;
    }

    seen.add(infoHash);

    streams.push({
      infoHash,
      title:
        [
          buildStreamTitle(result),
          result.title
        ]
          .filter(Boolean)
          .join("\n"),
      name:
        buildStreamTitle(result),
      behaviorHints: {
        filename:
          result.title ||
          "Formula 1 Archive",
        ...(Number(result.size) > 0
          ? {
              videoSize:
                Number(result.size)
            }
          : {})
      }
    });

    if (streams.length >= limit) {
      break;
    }
  }

  return streams;
}

async function resolveF1ArchiveStreams(
  {
    type,
    id,
    enabled =
      parseBooleanFlag(
        process.env.ULTRAMAX_MOTORSPORT_TORRENTS_ENABLED
      ),
    now,
    getMeta = getF1HistoryMeta,
    resolveTorrents = resolveF1ArchivedTorrents,
    streamLimit = DEFAULT_STREAM_LIMIT
  }
) {
  if (
    !isArchiveType(type) ||
    !isF1HistoryId(id)
  ) {
    return {
      handled: false,
      streams: []
    };
  }

  if (!enabled) {
    return {
      handled: true,
      streams: []
    };
  }

  const meta =
    await getMeta(
      id,
      type
    );

  if (!meta) {
    return {
      handled: true,
      streams: []
    };
  }

  if (
    !isClearlyPastEvent(
      meta,
      now == null ? Date.now() : now
    )
  ) {
    return {
      handled: true,
      streams: []
    };
  }

  const resolved =
    await resolveTorrents(meta);

  return {
    handled: true,
    streams:
      torrentsToStremioStreams(
        resolved?.results || [],
        streamLimit
      )
  };
}

module.exports = {
  buildStreamTitle,
  formatBytes,
  isClearlyPastEvent,
  parseBooleanFlag,
  resolveF1ArchiveStreams,
  torrentsToStremioStreams
};
