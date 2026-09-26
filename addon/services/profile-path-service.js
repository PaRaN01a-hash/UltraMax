"use strict";

function rewriteProfilePathUrl(rawUrl) {
  const parsed = new URL(rawUrl, "http://ultramax.local");
  const match = parsed.pathname.match(/^\/(c|n)\/([^/]+)\/p\/([^/]+)\/(.+)$/);
  if (!match) return null;

  const [, scope, token, encodedProfile, rest] = match;
  const profileId = decodeURIComponent(encodedProfile);
  parsed.pathname = `/${scope}/${token}/${rest}`;
  if (!parsed.searchParams.has("profile")) parsed.searchParams.set("profile", profileId);
  return parsed.pathname + (parsed.search ? parsed.search : "");
}

function profilePathMiddleware(req, _res, next) {
  const rewritten = rewriteProfilePathUrl(req.url);
  if (rewritten) req.url = rewritten;
  next();
}

module.exports = { rewriteProfilePathUrl, profilePathMiddleware };
