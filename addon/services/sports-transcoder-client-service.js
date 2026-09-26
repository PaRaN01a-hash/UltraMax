"use strict";

const TRANSCODER_BASE_URL =
  String(
    process.env.SPORTS_TRANSCODER_BASE_URL ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");

const REQUEST_TIMEOUT_MS =
  Number(
    process.env.SPORTS_TRANSCODER_REQUEST_TIMEOUT_MS
  ) || 5000;

function clean(value) {
  return String(value || "").trim();
}

async function fetchJsonWithTimeout(
  url,
  options = {}
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

  try {
    const response =
      await fetch(
        url,
        {
          ...options,
          signal:
            controller.signal
        }
      );

    const text =
      await response.text();

    let body = null;

    try {
      body =
        text
          ? JSON.parse(text)
          : null;
    } catch (_) {
      body = null;
    }

    if (!response.ok) {
      throw new Error(
        `transcoder ${response.status}`
      );
    }

    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function createSportsTranscoderSession(
  stream
) {
  const sourceUrl =
    clean(
      stream?.url
    );

  if (!sourceUrl || !TRANSCODER_BASE_URL) {
    return null;
  }

  try {
    const body =
      await fetchJsonWithTimeout(
        `${TRANSCODER_BASE_URL}/sessions`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              sourceUrl,

              userAgent:
                clean(
                  stream?.userAgent
                ),

              referrer:
                clean(
                  stream?.referrer
                )
            })
        }
      );

    const playlist =
      clean(
        body?.playlist
      );

    if (!playlist) {
      return null;
    }

    return (
      playlist.startsWith("http")
        ? playlist
        : `${TRANSCODER_BASE_URL}${playlist}`
    );
  } catch (error) {
    console.warn(
      "[sports-transcoder] fallback",
      error?.message || error
    );

    return null;
  }
}

module.exports = {
  createSportsTranscoderSession
};
