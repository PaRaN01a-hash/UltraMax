"use strict";

const MAX_EPISODE_RELEASE_DELAY_HOURS = 168;

function normalizeEpisodeReleaseDelayHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.min(Math.round(hours), MAX_EPISODE_RELEASE_DELAY_HOURS);
}

function buildEpisodeReleasedAt(airDate, delayHours) {
  if (!airDate) return null;

  const match = String(airDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const baseMs = Date.UTC(year, month - 1, day);

  if (!Number.isFinite(baseMs)) return null;

  const date = new Date(baseMs);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const hours = normalizeEpisodeReleaseDelayHours(delayHours);
  return new Date(baseMs + (hours * 60 * 60 * 1000)).toISOString();
}

module.exports = {
  MAX_EPISODE_RELEASE_DELAY_HOURS,
  normalizeEpisodeReleaseDelayHours,
  buildEpisodeReleasedAt
};
