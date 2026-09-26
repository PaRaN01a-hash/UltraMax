const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { MUTATION_REASONS } = require('../utils/config-store');
const { isValidTimeZone, normalizeTimeZone } = require('./timezone-service');
const { resolveConfigForProfile } = require('../utils/profiles');
const { summarizeUltraPlayCollections, UltraPlayCollectionSyncError } = require('./ultraplay-collection-sync-service');
const { normalizeCollectionCatalogs } = require('./collection-normalize-service');
const { canonicalHash } = require('./collection-schema-service');
const { buildAioMetadataImportPlan, applyAioMetadataImportPlan, AioMetadataImportError } = require('./aiometadata-import-v2-service');
const { getProviderCapabilities, createEffectiveDiscoveryConfig } = require('./provider-capability-service');
const { createMetadataService, applyBpStyle } = require('./metadata-service');

const HANDOFF_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 10 * 60 * 1000;
const BADGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 1000;
const HOME_TUNER_SAMPLE_LIMIT = 16;
const HOME_TUNER_SAMPLE_SIZE = 24;
const HOME_TUNER_CACHE_MS = 5 * 60 * 1000;
const COLLECTIONS_SCHEMA_VERSION = 2;
const SAFE_LANGUAGES = new Set(['en-US','he-IL','hu-HU','es-ES','es-MX','fr-FR','de-DE','it-IT','pt-BR','nl-NL','sv-SE','pl-PL','tr-TR','ar-SA']);
const INSTALL_SENSITIVE_KEYS = new Set(['excludeUnreleased','animeFilter','indianCinemaFilter']);
const SAFE_SETTING_KEYS = new Set([
  'digitalReleaseOnly',
  'hideWatched',
  'includeAdult',
  'minRating',
  'minVotes',
  'minYear',
  'maxYear',
  'excludeUnreleased',
  'animeFilter',
  'indianCinemaFilter',
  'language',
  'timezone'
]);

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function badgeSigningKey(secret) {
  return crypto.createHmac('sha256', String(secret || '')).update('ultraplay-plus-badge-v1').digest();
}

function setupDigest(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('base64url');
}

function normalizeBadgeNotAfter(value, now) {
  if (value === undefined || value === null || value === '') return null;
  const end = Number(value);
  return Number.isFinite(end) && end > Number(now) ? end : false;
}

function issueBadgeClaim(token, secret, now, notAfter = null) {
  const issuedAt = Number(now);
  const requestedEnd = normalizeBadgeNotAfter(notAfter, issuedAt);
  const naturalEnd = issuedAt + BADGE_TTL_MS;
  const exp = requestedEnd ? Math.min(naturalEnd, requestedEnd) : naturalEnd;
  const payload = { v: 1, tier: 'plus', setup: setupDigest(token), iat: issuedAt, exp };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', badgeSigningKey(secret)).update(body).digest('base64url');
  return { claim: `${body}.${signature}`, expiresAt: payload.exp };
}

function verifyBadgeClaim(token, claim, secret, now) {
  const parts = String(claim || '').split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]{20,1200}$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43,100}$/.test(parts[1])) return null;
  const expected = crypto.createHmac('sha256', badgeSigningKey(secret)).update(parts[0]).digest();
  let actual;
  try { actual = Buffer.from(parts[1], 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return null; }
  const at = Number(now);
  if (payload?.v !== 1 || payload?.tier !== 'plus' || payload?.setup !== setupDigest(token)) return null;
  if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp) || payload.iat > at + 5 * 60 * 1000 || payload.exp <= at || payload.exp > payload.iat + BADGE_TTL_MS + 60000) return null;
  return { tier: 'plus', setup: payload.setup, issuedAt: payload.iat, expiresAt: payload.exp };
}

function safeOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function safeSettings(config) {
  const rating = Number(config?.minRating);
  const votes = Number(config?.minVotes);
  const minYear = Number(config?.minYear);
  const maxYear = Number(config?.maxYear);
  return {
    digitalReleaseOnly: !!config?.digitalReleaseOnly,
    hideWatched: !!config?.hideWatched,
    includeAdult: !!config?.includeAdult,
    minRating: Number.isFinite(rating) ? Math.min(10, Math.max(0, rating)) : 0,
    minVotes: Number.isFinite(votes) && votes > 0 ? Math.round(votes) : 0,
    minYear: Number.isInteger(minYear) && minYear > 1888 && minYear < 2200 ? minYear : 0,
    maxYear: Number.isInteger(maxYear) && maxYear > 1888 && maxYear < 2200 ? maxYear : 0,
    excludeUnreleased: !!config?.excludeUnreleased,
    animeFilter: ['allow','reduce','hide'].includes(config?.animeFilter) ? config.animeFilter : 'allow',
    indianCinemaFilter: config?.indianCinemaFilter === 'hide' ? 'hide' : 'allow',
    language: SAFE_LANGUAGES.has(config?.language) ? config.language : 'en-US',
    timezone: normalizeTimeZone(config?.timezone)
  };
}

function normalizePatch(body, current) {
  const patch = body && typeof body.patch === 'object' && body.patch && !Array.isArray(body.patch) ? body.patch : null;
  if (!patch) throw Object.assign(new Error('Settings patch required.'), { status: 400 });
  if (Buffer.byteLength(JSON.stringify(patch)) > 4096) throw Object.assign(new Error('Settings patch is too large.'), { status: 413 });
  for (const key of Object.keys(patch)) {
    if (!SAFE_SETTING_KEYS.has(key)) throw Object.assign(new Error('That Ultra MAX setting is not available in Manager yet.'), { status: 400 });
  }
  const next = safeSettings(current);
  for (const key of ['digitalReleaseOnly', 'hideWatched', 'includeAdult', 'excludeUnreleased']) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      if (typeof patch[key] !== 'boolean') throw Object.assign(new Error(`Invalid ${key} value.`), { status: 400 });
      next[key] = patch[key];
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'minRating')) {
    const value = Number(patch.minRating);
    if (!Number.isFinite(value) || value < 0 || value > 10) throw Object.assign(new Error('Minimum rating must be between 0 and 10.'), { status: 400 });
    next.minRating = Math.round(value * 10) / 10;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'minVotes')) {
    const value = Number(patch.minVotes);
    if (!Number.isFinite(value) || value < 0 || value > 100000000) throw Object.assign(new Error('Minimum votes is out of range.'), { status: 400 });
    next.minVotes = Math.round(value);
  }
  for (const key of ['minYear', 'maxYear']) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      const value = Number(patch[key]);
      if (value === 0) next[key] = 0;
      else if (Number.isInteger(value) && value > 1888 && value < 2200) next[key] = value;
      else throw Object.assign(new Error(`${key === 'minYear' ? 'Minimum' : 'Maximum'} year is invalid.`), { status: 400 });
    }
  }
  if (next.minYear && next.maxYear && next.minYear > next.maxYear) {
    throw Object.assign(new Error('Minimum year cannot be later than maximum year.'), { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'animeFilter')) {
    const value = String(patch.animeFilter || '');
    if (!['allow','reduce','hide'].includes(value)) throw Object.assign(new Error('Anime filter must be Allow, Reduce or Hide.'), { status: 400 });
    next.animeFilter = value;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'indianCinemaFilter')) {
    const value = String(patch.indianCinemaFilter || '');
    if (!['allow','hide'].includes(value)) throw Object.assign(new Error('Indian cinema filter must be Allow or Hide.'), { status: 400 });
    next.indianCinemaFilter = value;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'language')) {
    const value = String(patch.language || '');
    if (!SAFE_LANGUAGES.has(value)) throw Object.assign(new Error('Unsupported Ultra MAX language.'), { status: 400 });
    next.language = value;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'timezone')) {
    const value = String(patch.timezone || '').trim();
    if (!isValidTimeZone(value)) throw Object.assign(new Error('Enter a valid IANA timezone, for example Europe/London.'), { status: 400 });
    next.timezone = normalizeTimeZone(value);
  }
  return next;
}

function registerUltraPlayManagerBridge(app, deps) {
  const {
    readConfig,
    mutateAccount,
    verifyPassword,
    checkAndRecord,
    clearKey,
    importBackupStore = null,
    CATALOG_DEFS = {},
    handleCatalogService = null,
    catalogDeps = null,
    FILTER_ENABLED = true,
    clock = Date.now,
    dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
    bridgeSecret = process.env.ULTRAPLAY_BRIDGE_SECRET || '',
    bridgeOrigin = process.env.ULTRAPLAY_BRIDGE_ORIGIN || ''
  } = deps;

  const allowedOrigin = safeOrigin(bridgeOrigin);
  const enabled = Buffer.byteLength(String(bridgeSecret)) >= 32 && !!allowedOrigin;
  const handoffs = new Map();
  const sessions = new Map();
  const writes = new Set();

  function cleanup() {
    const now = clock();
    for (const [key, value] of handoffs) if (value.expiresAt <= now) handoffs.delete(key);
    for (const [key, value] of sessions) if (value.expiresAt <= now) sessions.delete(key);
    while (handoffs.size > MAX_SESSIONS) handoffs.delete(handoffs.keys().next().value);
    while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  }

  function noStore(res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
  }

  function fail(res, status, message, code) {
    noStore(res);
    return res.status(status).json({ error: message, ...(code ? { code } : {}) });
  }

  const supporterLeaseFile = path.join(dataDir, 'ultraplay-supporter-leases.json');

  function readSupporterLeases() {
    try {
      const parsed = JSON.parse(fs.readFileSync(supporterLeaseFile, 'utf8'));
      return parsed && parsed.version === 1 && parsed.setups && typeof parsed.setups === 'object' && !Array.isArray(parsed.setups)
        ? parsed
        : {version:1,setups:{}};
    } catch {
      return {version:1,setups:{}};
    }
  }

  function writeSupporterLeases(store) {
    fs.mkdirSync(dataDir, {recursive:true});
    const tmp = supporterLeaseFile + '.tmp-' + process.pid + '-' + crypto.randomBytes(5).toString('hex');
    fs.writeFileSync(tmp, JSON.stringify(store), {mode:0o600});
    fs.renameSync(tmp, supporterLeaseFile);
    try { fs.chmodSync(supporterLeaseFile, 0o600); } catch {}
  }

  function supporterLeaseState(token) {
    const store = readSupporterLeases();
    const key = setupDigest(token);
    const row = store.setups[key];
    if (!row || typeof row !== 'object') return {active:false,expiresAt:null};
    const expiresAt = row.expiresAt === null ? null : Number(row.expiresAt);
    if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= clock())) {
      delete store.setups[key];
      try { writeSupporterLeases(store); } catch {}
      return {active:false,expiresAt:null};
    }
    return {active:true,expiresAt};
  }

  function registerSupporterLease(token, expiresAt) {
    const store = readSupporterLeases();
    const key = setupDigest(token);
    store.setups[key] = {expiresAt:expiresAt === null ? null : Number(expiresAt),updatedAt:Number(clock())};
    const now = Number(clock());
    for (const [digest,row] of Object.entries(store.setups)) {
      if (!row || typeof row !== 'object') { delete store.setups[digest]; continue; }
      if (row.expiresAt !== null && (!Number.isFinite(Number(row.expiresAt)) || Number(row.expiresAt) <= now)) delete store.setups[digest];
    }
    writeSupporterLeases(store);
    return supporterLeaseState(token);
  }

  function profileIdValue(value) {
    if (value === undefined || value === null || value === '') return null;
    const profileId = String(value);
    return /^[A-Za-z0-9_-]{1,128}$/.test(profileId) ? profileId : false;
  }

  function resolvedSessionConfig(config, session, res) {
    if (!session.profileId) return config;
    if (!config?.profiles?.[session.profileId]) {
      fail(res, 409, 'The installed Ultra MAX profile no longer exists. Refresh the Nuvio add-on before managing it.', 'PROFILE_SCOPE_MISSING');
      return null;
    }
    return resolveConfigForProfile(config, session.profileId);
  }

  function currentCollectionTarget(config, session, res) {
    if (!session.profileId) return config;
    const profile = config?.profiles?.[session.profileId];
    if (!profile) {
      fail(res, 409, 'The installed Ultra MAX profile no longer exists. Refresh the Nuvio add-on before syncing collections.', 'PROFILE_SCOPE_MISSING');
      return null;
    }
    return profile.overrides || {};
  }

  function collectionState(config, session, res) {
    const resolved = resolvedSessionConfig(config, session, res);
    if (!resolved) return null;
    const collections = normalizeCollectionCatalogs(resolved.collections);
    let folders = 0, sources = 0;
    for (const collection of collections) {
      const rows = Array.isArray(collection?.folders) ? collection.folders : [];
      folders += rows.length;
      for (const folder of rows) {
        const sourceRows = Array.isArray(folder?.sources) ? folder.sources : (Array.isArray(folder?.catalogSources) ? folder.catalogSources : []);
        sources += sourceRows.length;
      }
    }
    const fingerprint = canonicalHash(collections);
    return { count: collections.length, folders, sources, fingerprint, profileId: session.profileId || null };
  }

  function getSession(req, res) {
    cleanup();
    if (!enabled) { fail(res, 404, 'UltraPlay management is not enabled.'); return null; }
    const auth = String(req.headers.authorization || '');
    const match = auth.match(/^Bearer ([A-Za-z0-9_-]{32,200})$/);
    if (!match) { fail(res, 401, 'Unlock Ultra MAX again.'); return null; }
    const session = sessions.get(match[1]);
    if (!session || session.expiresAt <= clock()) {
      sessions.delete(match[1]);
      fail(res, 401, 'Ultra MAX management session expired. Unlock it again.');
      return null;
    }
    if (req.headers.origin !== session.origin) {
      fail(res, 403, 'Ultra MAX management origin mismatch.');
      return null;
    }
    res.setHeader('Access-Control-Allow-Origin', session.origin);
    res.setHeader('Vary', 'Origin');
    noStore(res);
    return { key: match[1], ...session };
  }

  app.post('/api/ultraplay/handoff', async (req, res) => {
    cleanup();
    if (!enabled) return fail(res, 404, 'UltraPlay management is not enabled.');
    if (!constantTimeEqual(req.headers['x-ultraplay-bridge-secret'], bridgeSecret)) return fail(res, 403, 'Forbidden.');
    const token = String(req.body?.token || '');
    if (!/^[A-Za-z0-9_-]{4,160}$/.test(token)) return fail(res, 400, 'Invalid Ultra MAX setup.');
    const profileId = profileIdValue(req.body?.profileId);
    if (profileId === false) return fail(res, 400, 'Invalid Ultra MAX profile scope.');
    const config = await readConfig(token);
    if (!config) return fail(res, 404, 'Ultra MAX setup not found.');
    if (profileId && !config?.profiles?.[profileId]) return fail(res, 409, 'The installed Ultra MAX profile no longer exists.', 'PROFILE_SCOPE_MISSING');
    const plus = req.body?.entitlement === 'plus';
    const plusNotAfter = plus ? normalizeBadgeNotAfter(req.body?.entitlementExpiresAt, clock()) : null;
    if (plus && plusNotAfter === false) return fail(res, 400, 'UltraPlay entitlement has already expired.');
    const code = crypto.randomBytes(32).toString('base64url');
    const expiresAt = clock() + HANDOFF_TTL_MS;
    handoffs.set(code, { token, profileId, origin: allowedOrigin, expiresAt, plus, plusNotAfter });
    noStore(res);
    return res.json({ path: `/ultraplay-unlock.html?code=${encodeURIComponent(code)}`, expiresAt });
  });

  app.post('/api/ultraplay/unlock', async (req, res) => {
    cleanup();
    if (!enabled) return fail(res, 404, 'UltraPlay management is not enabled.');
    const code = String(req.body?.code || '');
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!/^[A-Za-z0-9_-]{32,200}$/.test(code) || !password) return fail(res, 400, 'Enter your Ultra MAX password.');
    const handoff = handoffs.get(code);
    if (!handoff || handoff.expiresAt <= clock()) {
      handoffs.delete(code);
      return fail(res, 410, 'This UltraPlay unlock link expired. Return to UltraPlay and try again.');
    }
    const config = await readConfig(handoff.token);
    if (!config) { handoffs.delete(code); return fail(res, 404, 'Ultra MAX setup not found.'); }
    if (typeof checkAndRecord === 'function' && !checkAndRecord(handoff.token)) return fail(res, 429, 'Too many password attempts. Try again later.');
    if (!verifyPassword(password, config.passwordHash)) return fail(res, 401, 'Incorrect password.');
    if (typeof clearKey === 'function') clearKey(handoff.token);
    handoffs.delete(code);
    const capability = crypto.randomBytes(32).toString('base64url');
    const expiresAt = clock() + SESSION_TTL_MS;
    sessions.set(capability, { token: handoff.token, profileId: handoff.profileId || null, origin: handoff.origin, expiresAt, plus: handoff.plus === true });
    noStore(res);
    const badge = handoff.plus ? issueBadgeClaim(handoff.token, bridgeSecret, clock(), handoff.plusNotAfter) : null;
    return res.json({ capability, origin: handoff.origin, expiresAt, ...(badge ? { badgeClaim: badge.claim, badgeExpiresAt: badge.expiresAt } : {}) });
  });

  app.post('/api/ultraplay/badge/claim', async (req, res) => {
    cleanup();
    if (!enabled) return fail(res, 404, 'UltraPlay management is not enabled.');
    if (!constantTimeEqual(req.headers['x-ultraplay-bridge-secret'], bridgeSecret)) return fail(res, 403, 'Forbidden.');
    const token = String(req.body?.token || '');
    if (!/^[A-Za-z0-9_-]{4,160}$/.test(token) || req.body?.entitlement !== 'plus') return fail(res, 400, 'Invalid UltraPlay badge request.');
    const config = await readConfig(token);
    if (!config) return fail(res, 404, 'Ultra MAX setup not found.');
    const notAfter = normalizeBadgeNotAfter(req.body?.entitlementExpiresAt, clock());
    if (notAfter === false) return fail(res, 400, 'UltraPlay entitlement has already expired.');
    const badge = issueBadgeClaim(token, bridgeSecret, clock(), notAfter);
    noStore(res);
    return res.json({ claim: badge.claim, expiresAt: badge.expiresAt });
  });

  app.post('/api/ultraplay/badge/verify', async (req, res) => {
    cleanup();
    if (!enabled) return fail(res, 404, 'UltraPlay management is not enabled.');
    const token = String(req.body?.token || '');
    const claim = String(req.body?.claim || '');
    if (!/^[A-Za-z0-9_-]{4,160}$/.test(token) || claim.length > 1800) { noStore(res); return res.json({ active: false }); }
    const verified = verifyBadgeClaim(token, claim, bridgeSecret, clock());
    if (!verified || !(await readConfig(token))) { noStore(res); return res.json({ active: false }); }
    noStore(res);
    return res.json({ active: true, tier: 'plus', label: 'PLAY+', detail: 'Verified through UltraPlay+', expiresAt: verified.expiresAt });
  });

  app.post('/api/ultraplay/supporter/register', async (req, res) => {
    cleanup();
    if (!enabled) return fail(res, 404, 'UltraPlay management is not enabled.');
    if (!constantTimeEqual(req.headers['x-ultraplay-bridge-secret'], bridgeSecret)) return fail(res, 403, 'Forbidden.');
    const token = String(req.body?.token || '');
    if (!/^[A-Za-z0-9_-]{4,160}$/.test(token) || req.body?.entitlement !== 'plus') return fail(res, 400, 'Invalid UltraPlay supporter request.');
    if (!(await readConfig(token))) return fail(res, 404, 'Ultra MAX setup not found.');
    const normalized = normalizeBadgeNotAfter(req.body?.entitlementExpiresAt, clock());
    if (normalized === false) return fail(res, 400, 'UltraPlay entitlement has already expired.');
    try {
      const state = registerSupporterLease(token, normalized === null ? null : normalized);
      noStore(res);
      return res.json({active:state.active,expiresAt:state.expiresAt});
    } catch {
      return fail(res, 503, 'Ultra MAX could not persist supporter status.');
    }
  });

  app.post('/api/ultraplay/supporter/status', async (req, res) => {
    cleanup();
    const token = String(req.body?.token || '');
    if (!/^[A-Za-z0-9_-]{4,160}$/.test(token) || !(await readConfig(token))) {
      noStore(res);
      return res.json({active:false,expiresAt:null});
    }
    const state = supporterLeaseState(token);
    noStore(res);
    return res.json(state);
  });

  app.post('/api/ultraplay/artwork/decorate', async (req, res) => {
    cleanup();
    if (!enabled) return fail(res, 404, 'UltraPlay management is not enabled.');
    if (!constantTimeEqual(req.headers['x-ultraplay-bridge-secret'], bridgeSecret)) return fail(res, 403, 'Forbidden.');

    const token = String(req.body?.token || '');
    if (!/^[A-Za-z0-9_-]{4,160}$/.test(token)) return fail(res, 400, 'Invalid Ultra MAX setup.');

    const profileId = profileIdValue(req.body?.profileId);
    if (profileId === false) return fail(res, 400, 'Invalid Ultra MAX profile scope.');

    const requested = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
    if (!requested.length) { noStore(res); return res.json({ items: [] }); }

    const config = await readConfig(token);
    if (!config) return fail(res, 404, 'Ultra MAX setup not found.');
    if (profileId && !config?.profiles?.[profileId]) return fail(res, 409, 'The installed Ultra MAX profile no longer exists.', 'PROFILE_SCOPE_MISSING');

    const effective = profileId ? resolveConfigForProfile(config, profileId) : config;
    const hasArtworkOverride = Boolean(
      effective?.betterPostersStyle ||
      effective?.tpKey ||
      effective?.rpdbKey ||
      effective?.fanartKey ||
      effective?.omdbKey
    );

    if (!hasArtworkOverride) {
      noStore(res);
      return res.json({ items: [] });
    }

    const capabilities = getProviderCapabilities(effective, {
      serverTmdbKey: catalogDeps?.TMDB_KEY
    });
    const metadata = createMetadataService({
      tmdbKey: capabilities.effectiveTmdbKey || catalogDeps?.TMDB_KEY || ''
    });
    const language = effective?.language || 'en-US';

    const decorated = await Promise.all(requested.map(async row => {
      const id = String(row?.id || '').trim();
      const type = row?.type === 'series' ? 'series' : row?.type === 'movie' ? 'movie' : null;
      const title = String(row?.name || '').trim().slice(0, 180);
      if (!type || !/^tt\d{5,12}$/.test(id)) return null;

      let poster = null;

      if (effective?.betterPostersStyle) {
        poster = applyBpStyle(effective.betterPostersStyle, id, language, { type, title });
      } else if (effective?.tpKey) {
        poster = `https://api.top-streaming.stream/${effective.tpKey}/imdb/poster-default/${id}.jpg`;
      } else if (effective?.rpdbKey) {
        poster = `https://api.ratingposterdb.com/${effective.rpdbKey}/imdb/poster-default/${id}.jpg`;
      } else if (effective?.fanartKey || effective?.omdbKey) {
        let tmdbId = null;
        if (effective?.fanartKey) {
          tmdbId = type === 'series'
            ? await metadata.imdbToTmdbSeriesId(id)
            : await metadata.imdbToTmdbMovieId(id);
        }
        poster = await metadata.getBestPoster({
          type,
          tmdbId,
          imdbId: id,
          tmdbPosterPath: null,
          fanartKey: effective?.fanartKey || null,
          omdbKey: effective?.omdbKey || null
        });
      }

      if (typeof poster !== 'string' || poster.length > 1800) return null;
      try {
        const url = new URL(poster);
        if (url.protocol !== 'https:' || url.username || url.password) return null;
      } catch {
        return null;
      }

      return { id, type, poster };
    }));

    noStore(res);
    return res.json({ items: decorated.filter(Boolean) });
  });

  app.post('/api/ultraplay/settings/read', async (req, res) => {
    const session = getSession(req, res); if (!session) return;
    const config = await readConfig(session.token);
    if (!config) return fail(res, 404, 'Ultra MAX setup not found.');
    const resolved = resolvedSessionConfig(config, session, res); if (!resolved) return;
    return res.json({ settings: safeSettings(resolved), profileId: session.profileId || null, expiresAt: session.expiresAt });
  });

  app.post('/api/ultraplay/settings/write', async (req, res) => {
    const session = getSession(req, res); if (!session) return;
    if (writes.has(session.token)) return fail(res, 409, 'Another Ultra MAX setting change is still being verified.');
    writes.add(session.token);
    try {
      const before = await readConfig(session.token);
      if (!before) return fail(res, 404, 'Ultra MAX setup not found.');
      const beforeResolved = resolvedSessionConfig(before, session, res); if (!beforeResolved) return;
      let expected;
      try { expected = normalizePatch(req.body, beforeResolved); }
      catch (error) { return fail(res, error.status || 400, error.message || 'Invalid Ultra MAX settings.'); }
      const beforeSafe = safeSettings(beforeResolved);
      const requestedKeys = Object.keys(req.body.patch || {});
      const changedKeys = requestedKeys.filter(key => beforeSafe[key] !== expected[key]);
      await mutateAccount(session.token, current => {
        let target = current;
        if (session.profileId) {
          const profile = current?.profiles?.[session.profileId];
          if (!profile) throw Object.assign(new Error('The installed Ultra MAX profile no longer exists.'), { status: 409 });
          target = profile.overrides || (profile.overrides = {});
        }
        // Only persist fields the user explicitly changed. This avoids
        // backfilling unrelated defaults into old configs through Manager.
        for (const key of requestedKeys) target[key] = expected[key];
        current.updatedAt = new Date(clock()).toISOString();
      }, { reason: MUTATION_REASONS.EXPLICIT_CONFIG });
      const reread = await readConfig(session.token);
      if (!reread) return fail(res, 502, 'Ultra MAX saved the settings but could not verify them.');
      const rereadResolved = resolvedSessionConfig(reread, session, res); if (!rereadResolved) return;
      const got = safeSettings(rereadResolved);
      if (JSON.stringify(got) !== JSON.stringify(expected)) return fail(res, 502, 'Ultra MAX did not confirm the exact settings change. Refresh before trying again.');
      const reinstallKeys = changedKeys.filter(key => INSTALL_SENSITIVE_KEYS.has(key));
      return res.json({
        settings: got,
        expiresAt: session.expiresAt,
        impact: { changedKeys, reinstallKeys, requiresReinstall: reinstallKeys.length > 0 }
      });
    } finally {
      writes.delete(session.token);
    }
  });


  const MAX_CHANNEL_PREFIX = 'max_channel_';
  const MAX_CHANNEL_STYLES = new Set(['popular','fresh','top-rated','hidden-gems','genre']);
  const MAX_CHANNEL_SORTS = new Set(['popularity.desc','popularity.asc','vote_average.desc','vote_count.desc','primary_release_date.desc','first_air_date.desc']);

  function safeArray(value) { return Array.isArray(value) ? value : []; }
  function discoveryState(config) {
    const catalogs = Array.from(new Set(safeArray(config?.catalogs).filter(id => typeof id === 'string' && id)));
    const customCatalogs = safeArray(config?.customCatalogs).filter(row => row && typeof row === 'object' && typeof row.id === 'string');
    const hiddenCatalogs = Array.from(new Set(safeArray(config?.hiddenCatalogs).filter(id => typeof id === 'string' && id)));
    const catalogOrder = Array.from(new Set(safeArray(config?.catalogOrder).filter(id => typeof id === 'string' && id)));
    return { catalogs, customCatalogs, hiddenCatalogs, catalogOrder, fingerprint: canonicalHash([catalogs, customCatalogs, hiddenCatalogs, catalogOrder]) };
  }

  function defaultChannelName(type, style) {
    const media = type === 'series' ? 'Series' : 'Movies';
    if (style === 'fresh') return `Fresh ${media}`;
    if (style === 'top-rated') return `Top Rated ${media}`;
    if (style === 'hidden-gems') return `Hidden Gem ${media}`;
    if (style === 'genre') return `${media} by Genre`;
    return `Popular ${media}`;
  }

  function boundedNumber(value, min, max, fallback = null, integer = false) {
    if (value === '' || value === null || value === undefined) return fallback;
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) throw Object.assign(new Error('One of the MAX Channel filters is out of range.'), { status: 400 });
    return integer ? Math.round(number) : Math.round(number * 10) / 10;
  }

  function normalizeMaxChannelDraft(body) {
    const draft = body && typeof body.draft === 'object' && body.draft && !Array.isArray(body.draft) ? body.draft : null;
    if (!draft) throw Object.assign(new Error('MAX Channel draft required.'), { status: 400 });
    if (Buffer.byteLength(JSON.stringify(draft)) > 8192) throw Object.assign(new Error('MAX Channel draft is too large.'), { status: 413 });
    const type = draft.type === 'series' ? 'series' : draft.type === 'movie' ? 'movie' : null;
    if (!type) throw Object.assign(new Error('Choose movies or series for this MAX Channel.'), { status: 400 });
    const style = String(draft.style || 'popular').trim().toLowerCase();
    if (!MAX_CHANNEL_STYLES.has(style)) throw Object.assign(new Error('Choose a supported MAX Channel style.'), { status: 400 });
    const nameRaw = String(draft.name || '').trim();
    const name = (nameRaw || defaultChannelName(type, style)).slice(0, 80);
    if (!name) throw Object.assign(new Error('Enter a MAX Channel name.'), { status: 400 });
    const currentYear = new Date(clock()).getUTCFullYear();
    let sortBy = 'popularity.desc', minRating = null, minVotes = null, maxVotes = null, yearFrom = null, yearTo = null;
    if (style === 'fresh') { sortBy = type === 'series' ? 'first_air_date.desc' : 'primary_release_date.desc'; yearFrom = currentYear; minVotes = 20; }
    if (style === 'top-rated') { sortBy = 'vote_average.desc'; minRating = 7; minVotes = 500; }
    if (style === 'hidden-gems') { sortBy = 'vote_average.desc'; minRating = 6.5; minVotes = 50; maxVotes = 5000; }
    if (draft.sortBy !== undefined) {
      const requested = String(draft.sortBy || '').trim();
      if (!MAX_CHANNEL_SORTS.has(requested)) throw Object.assign(new Error('Choose a supported MAX Channel sort.'), { status: 400 });
      sortBy = requested;
    }
    minRating = boundedNumber(draft.minRating, 0, 10, minRating, false);
    minVotes = boundedNumber(draft.minVotes, 0, 100000000, minVotes, true);
    maxVotes = boundedNumber(draft.maxVotes, 0, 100000000, maxVotes, true);
    const maxRuntime = boundedNumber(draft.maxRuntime, 30, 360, null, true);
    yearFrom = boundedNumber(draft.yearFrom, 1889, 2199, yearFrom, true);
    yearTo = boundedNumber(draft.yearTo, 1889, 2199, yearTo, true);
    if (yearFrom && yearTo && yearFrom > yearTo) throw Object.assign(new Error('MAX Channel start year cannot be later than its end year.'), { status: 400 });
    if (minVotes !== null && maxVotes !== null && minVotes > maxVotes) throw Object.assign(new Error('MAX Channel minimum votes cannot exceed maximum votes.'), { status: 400 });
    let source = '', sourceValue = '';
    if (style === 'genre') {
      const genreId = String(draft.genreId || '').trim();
      if (!/^\d{1,6}$/.test(genreId)) throw Object.assign(new Error('Choose a genre for this MAX Channel.'), { status: 400 });
      source = 'genre'; sourceValue = genreId;
    }
    const id = `${MAX_CHANNEL_PREFIX}${type}_${crypto.randomBytes(7).toString('hex')}`;
    const channel = { id, name, type, source, sourceValue, sortBy };
    if (minRating !== null) channel.minRating = minRating;
    if (minVotes !== null) channel.minVotes = minVotes;
    if (maxVotes !== null) channel.maxVotes = maxVotes;
    if (maxRuntime !== null) channel.maxRuntime = maxRuntime;
    if (yearFrom !== null) channel.yearFrom = yearFrom;
    if (yearTo !== null) channel.yearTo = yearTo;
    return { channel, style, summary: { name, type, style, sortBy, minRating, minVotes, maxVotes, maxRuntime, yearFrom, yearTo, genreId: sourceValue || null } };
  }

  function publicMaxChannels(config) {
    const state = discoveryState(config);
    return state.customCatalogs.filter(row => row.id.startsWith(MAX_CHANNEL_PREFIX)).map(row => ({
      id: row.id, name: String(row.name || row.id).slice(0,80), type: row.type === 'series' ? 'series' : 'movie',
      source: String(row.source || '').slice(0,30), sourceValue: String(row.sourceValue || '').slice(0,80),
      sortBy: MAX_CHANNEL_SORTS.has(row.sortBy) ? row.sortBy : 'popularity.desc',
      minRating: Number.isFinite(Number(row.minRating)) ? Number(row.minRating) : null,
      minVotes: Number.isFinite(Number(row.minVotes)) ? Number(row.minVotes) : null,
      maxVotes: Number.isFinite(Number(row.maxVotes)) ? Number(row.maxVotes) : null,
      maxRuntime: Number.isFinite(Number(row.maxRuntime)) ? Number(row.maxRuntime) : null,
      yearFrom: Number.isFinite(Number(row.yearFrom)) ? Number(row.yearFrom) : null,
      yearTo: Number.isFinite(Number(row.yearTo)) ? Number(row.yearTo) : null,
      visibleOnHome: state.catalogs.includes(row.id) && !state.hiddenCatalogs.includes(row.id),
      order: state.catalogOrder.indexOf(row.id)
    }));
  }

  function collectionCatalogIds(config) {
    const ids = new Set();
    for (const collection of safeArray(config?.collections)) for (const folder of safeArray(collection?.folders)) {
      const modern = safeArray(folder?.sources), legacy = safeArray(folder?.catalogSources);
      for (const source of modern.concat(legacy)) {
        const id = String(source?.catalogId || '').trim(); if (id) ids.add(id);
      }
    }
    return ids;
  }

  function homeTunerState(config) {
    const state = discoveryState(config), hidden = new Set(state.hiddenCatalogs), contained = collectionCatalogIds(config);
    const custom = new Map();
    for (const row of safeArray(config?.customCatalogs).concat(safeArray(config?.customMdbLists), safeArray(config?.customTraktLists))) if (row?.id) custom.set(row.id,row);
    const order = state.catalogOrder.length ? [...state.catalogOrder.filter(id => state.catalogs.includes(id)), ...state.catalogs.filter(id => !state.catalogOrder.includes(id))] : [...state.catalogs];
    const rows = order.map((id,index) => {
      const row = custom.get(id), def = CATALOG_DEFS?.[id] || null;
      const name = String(row?.name || def?.name || id.replace(/_/g,' ')).slice(0,120);
      return { id, name, type: row?.type || def?.type || (id.endsWith('_series') ? 'series' : 'movie'), visible: !hidden.has(id), order:index, maxChannel:id.startsWith(MAX_CHANNEL_PREFIX), containedInCollection:contained.has(id) };
    });
    const visible = rows.filter(row => row.visible), names = new Map();
    for (const row of visible) { const key=row.name.trim().toLowerCase(); if(key) names.set(key,(names.get(key)||0)+1); }
    const duplicateNames = [...names.entries()].filter(([,count]) => count > 1).map(([name,count]) => ({name,count})).slice(0,20);
    const containedVisible = visible.filter(row => row.containedInCollection);
    const findings = [];
    if (visible.length > 30) findings.push({kind:'busy-home',severity:'high',message:`${visible.length} catalog rows are visible on Home.`});
    else if (visible.length > 20) findings.push({kind:'busy-home',severity:'medium',message:`${visible.length} catalog rows are visible on Home.`});
    if (duplicateNames.length) findings.push({kind:'duplicate-names',severity:'medium',message:`${duplicateNames.length} visible catalog names are duplicated.`});
    if (containedVisible.length) findings.push({kind:'collection-overlap',severity:'info',message:`${containedVisible.length} visible rows are also referenced by Collections.`});
    if (!findings.length) findings.push({kind:'tidy',severity:'good',message:'The current Home structure is already fairly restrained.'});
    return { total:rows.length, visible:visible.length, hidden:rows.length-visible.length, maxChannels:rows.filter(row=>row.maxChannel).length, collections:safeArray(config?.collections).length, containedInCollections:containedVisible.length, duplicateNames, findings, rows:rows.slice(0,180), fingerprint:state.fingerprint };
  }

  function tunerIdentity(meta, type) {
    const id=String(meta?.id||'').trim(); if(id)return id;
    const name=String(meta?.name||meta?.title||'').trim().toLowerCase();
    const year=String(meta?.releaseInfo||meta?.year||'').match(/\d{4}/)?.[0]||'';
    return name?`${type}:${name}:${year}`:'';
  }

  function tunerOverlap(left,right) {
    if(!left.keys.size||!right.keys.size)return null;
    let intersection=0; for(const key of left.keys)if(right.keys.has(key))intersection++;
    if(intersection<3)return null;
    const smaller=Math.min(left.keys.size,right.keys.size),union=left.keys.size+right.keys.size-intersection;
    return {intersection,smaller,overlapPct:Math.round(intersection/smaller*100),jaccardPct:union?Math.round(intersection/union*100):0};
  }

  async function sampleHomeCatalogs(config, session, rows) {
    if(typeof handleCatalogService!=='function'||!catalogDeps) throw Object.assign(new Error('Home Tuner content sampling is unavailable on this Ultra MAX server.'),{status:503});
    const capabilities=getProviderCapabilities(config,{serverTmdbKey:catalogDeps.TMDB_KEY});
    if(!capabilities.hasAnyDiscoveryProvider||!capabilities.effectiveTmdbKey) throw Object.assign(new Error('Home Tuner needs a working TMDB discovery provider.'),{status:400});
    const effective=createEffectiveDiscoveryConfig(config,{catalogDefs:CATALOG_DEFS,capabilities});
    const requestDeps={...catalogDeps,TMDB_KEY:capabilities.effectiveTmdbKey,...createMetadataService({tmdbKey:capabilities.effectiveTmdbKey})};
    const hasAnime=safeArray(effective.catalogs).some(id=>/anime|bollywood|crunchyroll|hidive/i.test(String(id)));
    const queue=[...rows],results=[];
    async function worker(){while(queue.length){const row=queue.shift();if(!row)break;const started=clock();try{
      const response=await Promise.race([
        handleCatalogService(row.id,row.type,{},capabilities.effectiveMdbKey,hasAnime?false:FILTER_ENABLED,effective.language||'en-US',effective.rpdbKey||null,effective.tpKey||null,effective.traktUser||null,effective.excludeUnreleased||false,effective.maxRating||null,effective.includeAdult||false,effective.customCatalogs||[],effective.googleAiKey||null,effective.fanartKey||null,effective.omdbKey||null,requestDeps,effective.excludeLanguages||[],effective.betterPostersStyle||null,effective.traktAccessToken||null,effective.simklAccessToken||null,session.token,effective,effective.digitalReleaseOnly||false,effective.customMdbLists||[],effective.malAccessToken||null,effective.anilistAccessToken||null,effective.anilistUserId||null,effective.catalogOverrides||{}),
        new Promise((_,reject)=>setTimeout(()=>reject(new Error('sample timeout')),6500))
      ]);
      const metas=safeArray(response?.metas).slice(0,HOME_TUNER_SAMPLE_SIZE),keys=new Set(metas.map(meta=>tunerIdentity(meta,row.type)).filter(Boolean));
      results.push({...row,sampleCount:keys.size,keys,durationMs:Math.max(0,clock()-started),ok:true});
    }catch(error){results.push({...row,sampleCount:0,keys:new Set(),durationMs:Math.max(0,clock()-started),ok:false,error:String(error?.message||'sample failed').slice(0,120)});}}}
    await Promise.all([worker(),worker(),worker()]); return results.sort((a,b)=>a.order-b.order);
  }

  function analyseHomeSamples(home,samples) {
    const usable=samples.filter(row=>row.ok&&row.sampleCount>=6),pairs=[];
    for(let i=0;i<usable.length;i++)for(let j=i+1;j<usable.length;j++){
      if(usable[i].type!==usable[j].type)continue; const overlap=tunerOverlap(usable[i],usable[j]); if(!overlap||overlap.overlapPct<45)continue;
      pairs.push({left:{id:usable[i].id,name:usable[i].name,order:usable[i].order,maxChannel:usable[i].maxChannel,containedInCollection:usable[i].containedInCollection},right:{id:usable[j].id,name:usable[j].name,order:usable[j].order,maxChannel:usable[j].maxChannel,containedInCollection:usable[j].containedInCollection},...overlap,severity:overlap.overlapPct>=75?'high':'medium'});
    }
    pairs.sort((a,b)=>b.overlapPct-a.overlapPct||b.intersection-a.intersection);
    const suggestions=[],suggested=new Set();
    for(const pair of pairs.filter(row=>row.severity==='high')){
      let keep=pair.left,hide=pair.right;
      if(pair.right.maxChannel&&!pair.left.maxChannel){keep=pair.right;hide=pair.left}
      else if(pair.left.containedInCollection&&!pair.right.containedInCollection){keep=pair.right;hide=pair.left}
      else if(pair.right.containedInCollection&&!pair.left.containedInCollection){keep=pair.left;hide=pair.right}
      else if(pair.left.order>pair.right.order){keep=pair.right;hide=pair.left}
      if(suggested.has(hide.id)||suggested.has(keep.id))continue;
      suggested.add(hide.id); suggestions.push({hideId:hide.id,hideName:hide.name,keepId:keep.id,keepName:keep.name,overlapPct:pair.overlapPct,reason:hide.containedInCollection?'Already represented inside a Collection and strongly overlaps another visible row.':'Strong sample overlap with an earlier or more intentional Home row.'});
      if(suggestions.length>=8)break;
    }
    return {sampled:samples.length,successful:samples.filter(row=>row.ok).length,failed:samples.filter(row=>!row.ok).length,sampleSize:HOME_TUNER_SAMPLE_SIZE,pairs:pairs.slice(0,20),suggestions,couldReduceTo:Math.max(0,home.visible-suggestions.length),generatedAt:new Date(clock()).toISOString()};
  }

  app.post('/api/ultraplay/channels/read', async (req,res) => {
    const session=getSession(req,res); if(!session||!requirePlusSession(session,res,'MAX Channels'))return;
    const config=await readConfig(session.token); if(!config)return fail(res,404,'Ultra MAX setup not found.');
    const resolved=resolvedSessionConfig(config,session,res); if(!resolved)return;
    return res.json({channels:publicMaxChannels(resolved),profileId:session.profileId||null,expiresAt:session.expiresAt});
  });

  app.post('/api/ultraplay/channels/preview', async (req,res) => {
    const session=getSession(req,res); if(!session||!requirePlusSession(session,res,'MAX Channels'))return;
    const config=await readConfig(session.token); if(!config)return fail(res,404,'Ultra MAX setup not found.');
    const resolved=resolvedSessionConfig(config,session,res); if(!resolved)return;
    let normalized; try{normalized=normalizeMaxChannelDraft(req.body)}catch(error){return fail(res,error.status||400,error.message||'Invalid MAX Channel.');}
    const current=discoveryState(resolved), stored=sessions.get(session.key); if(!stored)return fail(res,401,'Ultra MAX management session expired. Unlock it again.');
    const previewId=crypto.randomBytes(20).toString('base64url');
    stored.maxChannelPreview={id:previewId,channel:normalized.channel,summary:normalized.summary,beforeFingerprint:current.fingerprint,previewedAt:clock()};
    return res.json({previewId,channel:{id:normalized.channel.id,...normalized.summary},requiresAddonRefresh:true,expiresAt:session.expiresAt});
  });

  app.post('/api/ultraplay/channels/apply', async (req,res) => {
    const session=getSession(req,res); if(!session||!requirePlusSession(session,res,'MAX Channels'))return;
    if(req.body?.confirm!==true)return fail(res,409,'Confirm the MAX Channel before adding it.');
    if(writes.has(session.token))return fail(res,409,'Another Ultra MAX change is still being verified.');
    const stored=sessions.get(session.key), draft=stored?.maxChannelPreview, previewId=String(req.body?.previewId||'');
    if(!draft||draft.id!==previewId)return fail(res,410,'That MAX Channel preview expired. Preview it again.','CHANNEL_PREVIEW_EXPIRED');
    writes.add(session.token);
    try{
      const before=await readConfig(session.token); if(!before)return fail(res,404,'Ultra MAX setup not found.');
      const resolved=resolvedSessionConfig(before,session,res); if(!resolved)return;
      const state=discoveryState(resolved); if(state.fingerprint!==draft.beforeFingerprint)return fail(res,409,'Your Ultra MAX catalog setup changed after the preview. Preview the MAX Channel again.','CHANNEL_SETUP_CHANGED');
      const nextCustom=[...state.customCatalogs.filter(row=>row.id!==draft.channel.id),structuredClone(draft.channel)];
      const nextCatalogs=[...state.catalogs.filter(id=>id!==draft.channel.id),draft.channel.id];
      const nextHidden=state.hiddenCatalogs.filter(id=>id!==draft.channel.id);
      const nextOrder=state.catalogOrder.length?[...state.catalogOrder.filter(id=>id!==draft.channel.id),draft.channel.id]:[];
      await mutateAccount(session.token,current=>{const target=rawSessionTarget(current,session,{status(){return this},json(){return null}});if(!target)throw Object.assign(new Error('The installed Ultra MAX profile no longer exists.'),{status:409});target.customCatalogs=nextCustom;target.catalogs=nextCatalogs;target.hiddenCatalogs=nextHidden;target.catalogOrder=nextOrder;current.updatedAt=new Date(clock()).toISOString();},{reason:MUTATION_REASONS.EXPLICIT_CONFIG});
      const reread=await readConfig(session.token); if(!reread)return fail(res,502,'Ultra MAX saved the MAX Channel but could not verify it.');
      const after=resolvedSessionConfig(reread,session,res); if(!after)return; const got=discoveryState(after);
      const saved=got.customCatalogs.find(row=>row.id===draft.channel.id);
      if(!saved||canonicalHash([saved])!==canonicalHash([draft.channel])||!got.catalogs.includes(draft.channel.id)||got.hiddenCatalogs.includes(draft.channel.id))return fail(res,502,'Ultra MAX did not confirm the exact MAX Channel change. Refresh before trying again.','CHANNEL_VERIFY_FAILED');
      stored.maxChannelPreview=null;
      return res.json({ok:true,channel:publicMaxChannels(after).find(row=>row.id===draft.channel.id),channels:publicMaxChannels(after),requiresAddonRefresh:true,profileId:session.profileId||null,expiresAt:session.expiresAt});
    } finally { writes.delete(session.token); }
  });

  app.post('/api/ultraplay/channels/remove', async (req,res) => {
    const session=getSession(req,res); if(!session||!requirePlusSession(session,res,'MAX Channels'))return;
    if(req.body?.confirm!==true)return fail(res,409,'Confirm MAX Channel removal first.');
    const id=String(req.body?.id||''); if(!/^max_channel_[a-z0-9_]+$/i.test(id))return fail(res,400,'Choose a MAX Channel again.');
    if(writes.has(session.token))return fail(res,409,'Another Ultra MAX change is still being verified.');
    writes.add(session.token);
    try{
      const before=await readConfig(session.token); if(!before)return fail(res,404,'Ultra MAX setup not found.');
      const resolved=resolvedSessionConfig(before,session,res); if(!resolved)return; const state=discoveryState(resolved);
      if(!state.customCatalogs.some(row=>row.id===id))return fail(res,404,'That MAX Channel no longer exists.');
      const nextCustom=state.customCatalogs.filter(row=>row.id!==id),nextCatalogs=state.catalogs.filter(value=>value!==id),nextHidden=state.hiddenCatalogs.filter(value=>value!==id),nextOrder=state.catalogOrder.filter(value=>value!==id);
      await mutateAccount(session.token,current=>{const target=rawSessionTarget(current,session,{status(){return this},json(){return null}});if(!target)throw Object.assign(new Error('The installed Ultra MAX profile no longer exists.'),{status:409});target.customCatalogs=nextCustom;target.catalogs=nextCatalogs;target.hiddenCatalogs=nextHidden;target.catalogOrder=nextOrder;current.updatedAt=new Date(clock()).toISOString();},{reason:MUTATION_REASONS.EXPLICIT_CONFIG});
      const reread=await readConfig(session.token); if(!reread)return fail(res,502,'Ultra MAX removed the MAX Channel but could not verify it.');
      const after=resolvedSessionConfig(reread,session,res); if(!after)return; const got=discoveryState(after);
      if(got.customCatalogs.some(row=>row.id===id)||got.catalogs.includes(id))return fail(res,502,'Ultra MAX could not verify MAX Channel removal.','CHANNEL_REMOVE_VERIFY_FAILED');
      return res.json({ok:true,channels:publicMaxChannels(after),requiresAddonRefresh:true,profileId:session.profileId||null,expiresAt:session.expiresAt});
    } finally { writes.delete(session.token); }
  });

  app.post('/api/ultraplay/home-tuner/read', async (req,res) => {
    const session=getSession(req,res); if(!session||!requirePlusSession(session,res,'Home Tuner'))return;
    const config=await readConfig(session.token); if(!config)return fail(res,404,'Ultra MAX setup not found.');
    const resolved=resolvedSessionConfig(config,session,res); if(!resolved)return;
    return res.json({home:homeTunerState(resolved),profileId:session.profileId||null,expiresAt:session.expiresAt});
  });

  app.post('/api/ultraplay/home-tuner/analyse', async (req,res) => {
    const session=getSession(req,res); if(!session||!requirePlusSession(session,res,'Home Tuner'))return;
    const config=await readConfig(session.token); if(!config)return fail(res,404,'Ultra MAX setup not found.');
    const resolved=resolvedSessionConfig(config,session,res); if(!resolved)return; const home=homeTunerState(resolved),stored=sessions.get(session.key);
    if(!stored)return fail(res,401,'Ultra MAX management session expired. Unlock it again.');
    const cached=stored.homeTunerAnalysis;
    if(cached&&cached.fingerprint===home.fingerprint&&clock()-cached.createdAt<HOME_TUNER_CACHE_MS)return res.json({home,analysis:cached.analysis,cached:true,profileId:session.profileId||null,expiresAt:session.expiresAt});
    const candidates=home.rows.filter(row=>row.visible&&['movie','series'].includes(row.type)&&!/^(search_|similar_|recommended_|collection_)/i.test(row.id)).slice(0,HOME_TUNER_SAMPLE_LIMIT);
    let samples; try{samples=await sampleHomeCatalogs(resolved,session,candidates)}catch(error){return fail(res,error.status||500,error.message||'Home Tuner could not sample this setup.');}
    const analysis=analyseHomeSamples(home,samples); stored.homeTunerAnalysis={fingerprint:home.fingerprint,createdAt:clock(),analysis};
    return res.json({home,analysis,cached:false,profileId:session.profileId||null,expiresAt:session.expiresAt});
  });

  app.post('/api/ultraplay/home-tuner/preview', async (req,res) => {
    const session=getSession(req,res); if(!session||!requirePlusSession(session,res,'Home Tuner'))return;
    const config=await readConfig(session.token); if(!config)return fail(res,404,'Ultra MAX setup not found.');
    const resolved=resolvedSessionConfig(config,session,res); if(!resolved)return; const home=homeTunerState(resolved),stored=sessions.get(session.key);
    const analysisEntry=stored?.homeTunerAnalysis;
    if(!stored||!analysisEntry||analysisEntry.fingerprint!==home.fingerprint)return fail(res,409,'Run Scan Home again before previewing a tidy plan.','HOME_TUNER_SCAN_STALE');
    const suggestions=safeArray(analysisEntry.analysis?.suggestions).slice(0,8); if(!suggestions.length)return fail(res,409,'MAX has no high-confidence Home changes to preview.');
    const rawTarget=rawSessionTarget(config,session,res); if(!rawTarget)return;
    const current=discoveryState(resolved),hideIds=Array.from(new Set(suggestions.map(item=>String(item.hideId||'')).filter(id=>current.catalogs.includes(id)&&!current.hiddenCatalogs.includes(id))));
    if(!hideIds.length)return fail(res,409,'Those suggested rows are already hidden. Scan Home again.');
    const previewId=crypto.randomBytes(20).toString('base64url');
    stored.homeTunerPreview={id:previewId,beforeFingerprint:home.fingerprint,hideIds,suggestions:structuredClone(suggestions.filter(item=>hideIds.includes(item.hideId))),rawHidden:Object.prototype.hasOwnProperty.call(rawTarget,'hiddenCatalogs')?{present:true,value:structuredClone(rawTarget.hiddenCatalogs)}:{present:false},createdAt:clock()};
    return res.json({previewId,beforeVisible:home.visible,afterVisible:Math.max(0,home.visible-hideIds.length),hideIds,changes:stored.homeTunerPreview.suggestions,requiresAddonRefresh:true,expiresAt:session.expiresAt});
  });

  app.post('/api/ultraplay/home-tuner/apply', async (req,res) => {
    const session=getSession(req,res); if(!session||!requirePlusSession(session,res,'Home Tuner'))return;
    if(req.body?.confirm!==true)return fail(res,409,'Confirm the Home Tuner plan before applying it.');
    if(writes.has(session.token))return fail(res,409,'Another Ultra MAX change is still being verified.');
    const stored=sessions.get(session.key),preview=stored?.homeTunerPreview,previewId=String(req.body?.previewId||'');
    if(!preview||preview.id!==previewId)return fail(res,410,'That Home Tuner preview expired. Scan Home again.','HOME_TUNER_PREVIEW_EXPIRED');
    writes.add(session.token);
    try{
      const before=await readConfig(session.token); if(!before)return fail(res,404,'Ultra MAX setup not found.');
      const resolved=resolvedSessionConfig(before,session,res); if(!resolved)return; const state=discoveryState(resolved);
      if(state.fingerprint!==preview.beforeFingerprint)return fail(res,409,'Your Ultra MAX Home changed after the preview. Scan it again.','HOME_TUNER_SETUP_CHANGED');
      const nextHidden=Array.from(new Set([...state.hiddenCatalogs,...preview.hideIds]));
      await mutateAccount(session.token,current=>{const target=rawSessionTarget(current,session,{status(){return this},json(){return null}});if(!target)throw Object.assign(new Error('The installed Ultra MAX profile no longer exists.'),{status:409});target.hiddenCatalogs=nextHidden;current.updatedAt=new Date(clock()).toISOString();},{reason:MUTATION_REASONS.EXPLICIT_CONFIG});
      const reread=await readConfig(session.token); if(!reread)return fail(res,502,'Ultra MAX changed Home but could not verify it.');
      const after=resolvedSessionConfig(reread,session,res); if(!after)return; const got=discoveryState(after);
      if(preview.hideIds.some(id=>!got.hiddenCatalogs.includes(id)))return fail(res,502,'Ultra MAX could not verify the Home Tuner changes.','HOME_TUNER_VERIFY_FAILED');
      const rollbackId=crypto.randomBytes(18).toString('base64url');
      stored.homeTunerRollback={id:rollbackId,rawHidden:preview.rawHidden,afterFingerprint:got.fingerprint,createdAt:clock()};stored.homeTunerPreview=null;stored.homeTunerAnalysis=null;
      return res.json({ok:true,home:homeTunerState(after),hidden:preview.hideIds,rollback:{id:rollbackId},requiresAddonRefresh:true,profileId:session.profileId||null,expiresAt:session.expiresAt});
    }finally{writes.delete(session.token)}
  });

  app.post('/api/ultraplay/home-tuner/rollback', async (req,res) => {
    const session=getSession(req,res); if(!session||!requirePlusSession(session,res,'Home Tuner'))return;
    if(req.body?.confirm!==true)return fail(res,409,'Confirm Home Tuner rollback first.');
    if(writes.has(session.token))return fail(res,409,'Another Ultra MAX change is still being verified.');
    const stored=sessions.get(session.key),rollback=stored?.homeTunerRollback,rollbackId=String(req.body?.rollbackId||'');
    if(!rollback||rollback.id!==rollbackId)return fail(res,404,'That Home Tuner rollback is unavailable.','HOME_TUNER_ROLLBACK_NOT_FOUND');
    writes.add(session.token);
    try{
      const before=await readConfig(session.token); if(!before)return fail(res,404,'Ultra MAX setup not found.');
      const resolved=resolvedSessionConfig(before,session,res); if(!resolved)return; const state=discoveryState(resolved);
      if(state.fingerprint!==rollback.afterFingerprint)return fail(res,409,'Ultra MAX changed after Home Tuner ran. I will not roll back over newer changes.','HOME_TUNER_ROLLBACK_STALE');
      await mutateAccount(session.token,current=>{const target=rawSessionTarget(current,session,{status(){return this},json(){return null}});if(!target)throw Object.assign(new Error('The installed Ultra MAX profile no longer exists.'),{status:409});if(rollback.rawHidden.present)target.hiddenCatalogs=structuredClone(rollback.rawHidden.value);else delete target.hiddenCatalogs;current.updatedAt=new Date(clock()).toISOString();},{reason:MUTATION_REASONS.EXPLICIT_CONFIG});
      const reread=await readConfig(session.token); if(!reread)return fail(res,502,'Ultra MAX rolled Home back but could not verify it.');
      const after=resolvedSessionConfig(reread,session,res); if(!after)return; const rawAfter=rawSessionTarget(reread,session,res);if(!rawAfter)return;
      const restored=rollback.rawHidden.present?canonicalHash([rawAfter.hiddenCatalogs])===canonicalHash([rollback.rawHidden.value]):!Object.prototype.hasOwnProperty.call(rawAfter,'hiddenCatalogs');
      if(!restored)return fail(res,502,'Ultra MAX could not verify Home Tuner rollback.','HOME_TUNER_ROLLBACK_VERIFY_FAILED');
      stored.homeTunerRollback=null;stored.homeTunerAnalysis=null;return res.json({ok:true,home:homeTunerState(after),requiresAddonRefresh:true,profileId:session.profileId||null,expiresAt:session.expiresAt});
    }finally{writes.delete(session.token)}
  });

  function requirePlusSession(session, res, feature = 'this Manager feature') {
    if (!session.plus) { fail(res, 403, `UltraPlay+ is required for ${feature}.`, 'PLUS_REQUIRED'); return false; }
    return true;
  }

  function rawSessionTarget(config, session, res) {
    if (!session.profileId) return config;
    const profile = config?.profiles?.[session.profileId];
    if (!profile) { fail(res,409,'The installed Ultra MAX profile no longer exists.','PROFILE_SCOPE_MISSING'); return null; }
    return profile.overrides || (profile.overrides = {});
  }

  function importBackupEntries(target, keys) {
    const out = {};
    for (const key of keys) out[key] = Object.prototype.hasOwnProperty.call(target,key)
      ? { present:true, value:structuredClone(target[key]) }
      : { present:false };
    return out;
  }

  function verifyImportPatch(rawTarget, patch, keys) {
    return keys.every(key => Object.prototype.hasOwnProperty.call(rawTarget,key) && canonicalHash([rawTarget[key]]) === canonicalHash([patch[key]]));
  }

  app.post('/api/ultraplay/import/preview', async (req, res) => {
    const session=getSession(req,res); if(!session||!requirePlusSession(session,res))return;
    let bytes=0; try{bytes=Buffer.byteLength(JSON.stringify(req.body?.document ?? null),'utf8')}catch{return fail(res,400,'Invalid AIOmetadata JSON.');}
    if(bytes<2||bytes>8*1024*1024)return fail(res,413,'AIOmetadata export is too large.');
    const config=await readConfig(session.token);if(!config)return fail(res,404,'Ultra MAX setup not found.');
    const resolved=resolvedSessionConfig(config,session,res);if(!resolved)return;
    let built;try{built=buildAioMetadataImportPlan(req.body.document,resolved,{safeLanguages:SAFE_LANGUAGES,isValidTimeZone,normalizeTimeZone});}
    catch(error){if(error instanceof AioMetadataImportError)return fail(res,error.status||400,error.message,error.code);throw error;}
    const stored=sessions.get(session.key);if(!stored)return fail(res,401,'Ultra MAX management session expired. Unlock it again.');
    stored.aioImport={id:built.privatePlan.id,privatePlan:built.privatePlan,previewedAt:clock()};
    return res.json({preview:built.preview,profileId:session.profileId||null,expiresAt:session.expiresAt});
  });

  app.post('/api/ultraplay/import/apply', async (req, res) => {
    const session=getSession(req,res);if(!session||!requirePlusSession(session,res))return;
    if(writes.has(session.token))return fail(res,409,'Another Ultra MAX change is still being verified.');
    const importId=String(req.body?.importId||''),stored=sessions.get(session.key),draft=stored?.aioImport;
    if(!draft||draft.id!==importId)return fail(res,410,'Import preview expired. Preview the file again.','IMPORT_PREVIEW_EXPIRED');
    const selection=req.body?.selection&&typeof req.body.selection==='object'&&!Array.isArray(req.body.selection)?req.body.selection:{};
    for(const key of Object.keys(selection)){
      if(['settings','credentials','catalogs'].includes(key)){if(typeof selection[key]!=='boolean')return fail(res,400,'Invalid import selection.');continue;}
      if(key==='streamingRegion'){if(typeof selection[key]!=='string'||(selection[key]&&!/^[A-Za-z]{2}$/.test(selection[key])))return fail(res,400,'Invalid streaming region.');continue;}
      return fail(res,400,'Invalid import selection.');
    }
    writes.add(session.token);
    try{
      const before=await readConfig(session.token);if(!before)return fail(res,404,'Ultra MAX setup not found.');
      const effective=resolvedSessionConfig(before,session,res);if(!effective)return;
      let applied;try{applied=applyAioMetadataImportPlan(effective,draft.privatePlan,selection)}catch(error){if(error instanceof AioMetadataImportError)return fail(res,error.status||400,error.message,error.code);throw error;}
      if(!applied.changedKeys.length)return res.json({ok:true,unchanged:true,changedKeys:[],rollback:null,profileId:session.profileId||null,expiresAt:session.expiresAt});
      const rawBefore=rawSessionTarget(before,session,res);if(!rawBefore)return;
      if(!importBackupStore?.save)return fail(res,503,'Ultra MAX import rollback storage is unavailable.','IMPORT_BACKUP_UNAVAILABLE');
      let rollback;try{rollback=importBackupStore.save(session.token,session.profileId,importBackupEntries(rawBefore,applied.changedKeys),{source:'aiometadata',version:draft.privatePlan.version,keys:applied.changedKeys});}
      catch{return fail(res,503,'Ultra MAX could not create the import rollback snapshot.','IMPORT_BACKUP_FAILED');}
      await mutateAccount(session.token,current=>{
        const target=rawSessionTarget(current,session,{status(){return this},json(){return null}});if(!target)throw Object.assign(new Error('The installed Ultra MAX profile no longer exists.'),{status:409});
        for(const key of applied.changedKeys)target[key]=structuredClone(applied.patch[key]);
        current.updatedAt=new Date(clock()).toISOString();
      },{reason:MUTATION_REASONS.EXPLICIT_CONFIG});
      const reread=await readConfig(session.token);if(!reread)return fail(res,502,'Ultra MAX saved the import but could not verify it.');
      const rawAfter=rawSessionTarget(reread,session,res);if(!rawAfter)return;
      if(!verifyImportPatch(rawAfter,applied.patch,applied.changedKeys))return fail(res,502,'Ultra MAX did not confirm the exact AIOmetadata import. Use Roll back if needed.','IMPORT_VERIFY_FAILED');
      stored.aioImport=null;stored.lastImportRollback=rollback.id;
      const catalogs=Array.isArray(resolveConfigForProfile(reread,session.profileId)?.catalogs)?resolveConfigForProfile(reread,session.profileId).catalogs.length:0;
      const resolvedAfter=resolveConfigForProfile(reread,session.profileId);
      const customMdb=Array.isArray(resolvedAfter?.customMdbLists)?resolvedAfter.customMdbLists.length:0;
      const customTrakt=Array.isArray(resolvedAfter?.customTraktLists)?resolvedAfter.customTraktLists.length:0;
      return res.json({ok:true,unchanged:false,changedKeys:applied.changedKeys,rollback:{id:rollback.id,createdAt:rollback.createdAt},profileId:session.profileId||null,summary:{catalogs,customMdbLists:customMdb,customTraktLists:customTrakt,customProviderRows:customMdb+customTrakt},requiresAddonRefresh:applied.changedKeys.some(key=>['catalogs','customCatalogs','customMdbLists','customTraktLists','hiddenCatalogs','catalogOrder','searchEnabled'].includes(key)),expiresAt:session.expiresAt});
    }finally{writes.delete(session.token)}
  });

  app.post('/api/ultraplay/import/rollback', async (req, res) => {
    const session=getSession(req,res);if(!session||!requirePlusSession(session,res))return;
    if(writes.has(session.token))return fail(res,409,'Another Ultra MAX change is still being verified.');
    const rollbackId=String(req.body?.rollbackId||'');if(!importBackupStore?.load)return fail(res,503,'Ultra MAX import rollback storage is unavailable.','IMPORT_BACKUP_UNAVAILABLE');
    const backup=importBackupStore.load(session.token,session.profileId,rollbackId);if(!backup)return fail(res,404,'That import rollback snapshot is unavailable.','IMPORT_BACKUP_NOT_FOUND');
    const keys=Object.keys(backup.entries||{});if(!keys.length)return fail(res,400,'Rollback snapshot is empty.');
    writes.add(session.token);
    try{
      await mutateAccount(session.token,current=>{
        let target=current;if(session.profileId){const profile=current?.profiles?.[session.profileId];if(!profile)throw Object.assign(new Error('The installed Ultra MAX profile no longer exists.'),{status:409});target=profile.overrides||(profile.overrides={});}
        for(const key of keys){const entry=backup.entries[key];if(entry?.present)target[key]=structuredClone(entry.value);else delete target[key];}
        current.updatedAt=new Date(clock()).toISOString();
      },{reason:MUTATION_REASONS.EXPLICIT_CONFIG});
      const reread=await readConfig(session.token);if(!reread)return fail(res,502,'Ultra MAX rolled back the import but could not verify it.');
      let target=reread;if(session.profileId){const profile=reread?.profiles?.[session.profileId];if(!profile)return fail(res,409,'The installed Ultra MAX profile no longer exists.','PROFILE_SCOPE_MISSING');target=profile.overrides||{};}
      const exact=keys.every(key=>{const entry=backup.entries[key];if(!entry?.present)return !Object.prototype.hasOwnProperty.call(target,key);return Object.prototype.hasOwnProperty.call(target,key)&&canonicalHash([target[key]])===canonicalHash([entry.value]);});
      if(!exact)return fail(res,502,'Ultra MAX could not verify the import rollback.','IMPORT_ROLLBACK_VERIFY_FAILED');
      return res.json({ok:true,rolledBackKeys:keys,profileId:session.profileId||null,expiresAt:session.expiresAt});
    }finally{writes.delete(session.token)}
  });

  app.post('/api/ultraplay/collections/read', async (req, res) => {
    const session = getSession(req, res); if (!session) return;
    const config = await readConfig(session.token);
    if (!config) return fail(res, 404, 'Ultra MAX setup not found.');
    const state = collectionState(config, session, res); if (!state) return;
    return res.json({ collections: state, expiresAt: session.expiresAt });
  });

  app.post('/api/ultraplay/collections/write', async (req, res) => {
    const session = getSession(req, res); if (!session) return;
    if (writes.has(session.token)) return fail(res, 409, 'Another Ultra MAX change is still being verified.');
    writes.add(session.token);
    try {
      let expected;
      try { expected = summarizeUltraPlayCollections(req.body?.collections); }
      catch (error) {
        if (error instanceof UltraPlayCollectionSyncError) return fail(res, error.status || 400, error.message, error.code);
        throw error;
      }
      const before = await readConfig(session.token);
      if (!before) return fail(res, 404, 'Ultra MAX setup not found.');
      if (!currentCollectionTarget(before, session, res)) return;
      const beforeState = collectionState(before, session, res); if (!beforeState) return;
      await mutateAccount(session.token, current => {
        let target = current;
        if (session.profileId) {
          const profile = current?.profiles?.[session.profileId];
          if (!profile) throw Object.assign(new Error('The installed Ultra MAX profile no longer exists.'), { status: 409 });
          target = profile.overrides || (profile.overrides = {});
        }
        target.collections = structuredClone(expected.normalized);
        target.collectionsSchemaVersion = COLLECTIONS_SCHEMA_VERSION;
        current.updatedAt = new Date(clock()).toISOString();
      }, { reason: MUTATION_REASONS.PROFILE_COLLECTION });
      const reread = await readConfig(session.token);
      if (!reread) return fail(res, 502, 'Ultra MAX saved the collections but could not verify them.');
      const target = currentCollectionTarget(reread, session, res); if (!target) return;
      const gotCollections = normalizeCollectionCatalogs(target.collections);
      if (target.collectionsSchemaVersion !== COLLECTIONS_SCHEMA_VERSION || canonicalHash(gotCollections) !== expected.fingerprint)
        return fail(res, 502, 'Ultra MAX did not confirm the exact collection sync. Refresh before trying again.', 'COLLECTION_VERIFY_FAILED');
      const afterState = collectionState(reread, session, res); if (!afterState) return;
      if (afterState.fingerprint !== expected.fingerprint)
        return fail(res, 502, 'Ultra MAX collection fingerprint did not match after sync.', 'COLLECTION_FINGERPRINT_MISMATCH');
      return res.json({ ok:true, profileId:session.profileId || null, before:beforeState, after:afterState, unchanged:beforeState.fingerprint===afterState.fingerprint, expiresAt:session.expiresAt });
    } finally { writes.delete(session.token); }
  });

  app.post('/api/ultraplay/session/close', (req, res) => {
    const session = getSession(req, res); if (!session) return;
    sessions.delete(session.key);
    return res.json({ closed: true });
  });

  return { enabled, _handoffs: handoffs, _sessions: sessions };
}

module.exports = { registerUltraPlayManagerBridge, safeSettings, normalizePatch, SAFE_LANGUAGES, INSTALL_SENSITIVE_KEYS, issueBadgeClaim, verifyBadgeClaim, BADGE_TTL_MS };
