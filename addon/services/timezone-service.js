const DEFAULT_TIMEZONE = "UTC";

function isValidTimeZone(value) {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: value.trim()
    }).format(new Date());

    return true;
  } catch (_) {
    return false;
  }
}

function normalizeTimeZone(value, fallback = DEFAULT_TIMEZONE) {
  const candidate =
    typeof value === "string"
      ? value.trim()
      : "";

  if (isValidTimeZone(candidate)) return candidate;

  if (isValidTimeZone(fallback)) return fallback;

  return DEFAULT_TIMEZONE;
}

function getLocalDateParts(timestamp, timeZone) {
  const zone = normalizeTimeZone(timeZone);
  const date = timestamp instanceof Date
    ? timestamp
    : new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Invalid timestamp");
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(
    parts
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day)
  };
}

function getLocalDateKey(timestamp, timeZone) {
  const { year, month, day } = getLocalDateParts(timestamp, timeZone);

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

function toUserTime(timestamp, timeZone, options = {}) {
  const zone = normalizeTimeZone(timeZone);
  const date = timestamp instanceof Date
    ? timestamp
    : new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Invalid timestamp");
  }

  return new Intl.DateTimeFormat(
    options.locale || "en-GB",
    {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...options
    }
  ).format(date);
}

function isSameLocalDate(leftTimestamp, rightTimestamp, timeZone) {
  return (
    getLocalDateKey(leftTimestamp, timeZone) ===
    getLocalDateKey(rightTimestamp, timeZone)
  );
}

function isToday(timestamp, timeZone, now = new Date()) {
  return isSameLocalDate(timestamp, now, timeZone);
}

module.exports = {
  DEFAULT_TIMEZONE,
  isValidTimeZone,
  normalizeTimeZone,
  getLocalDateParts,
  getLocalDateKey,
  toUserTime,
  isSameLocalDate,
  isToday
};
