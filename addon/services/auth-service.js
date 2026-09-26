const crypto = require('crypto');
const axios = require('axios');
const { getAnilistViewer } = require('./anilist-service');
const { resolveConfigForProfile } = require('../utils/profiles');
const { generateToken } = require('../utils/auth');
const { MUTATION_REASONS } = require('../utils/config-store');

const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL || 'https://ultramax.vip';
const TRAKT_CONFIGURED = !!(TRAKT_CLIENT_ID && TRAKT_CLIENT_SECRET);
const TRAKT_AUTHORIZE_ENDPOINT = 'https://trakt.tv/oauth/authorize';
const TRAKT_CALLBACK_URI = new URL('/auth/trakt/callback', BASE_URL).toString();

const { getWatchedIds } = require("./watched-filter");

function registerAuthRoutes(app, { loadConfigs, saveConfigs, readConfig = async token => loadConfigs()[token], hasAccount = async token => Object.prototype.hasOwnProperty.call(loadConfigs(), token), createAccount = async (token, account) => { const configs = loadConfigs(); if (configs[token]) { const error = new Error('Account already exists'); error.code = 'PROFILE_STORE_ACCOUNT_EXISTS'; throw error; } configs[token] = account; await saveConfigs(configs); return account; }, mutateAccount = async (token, mutator) => { const configs = loadConfigs(); if (!configs[token]) return undefined; await mutator(configs[token]); await saveConfigs(configs); return configs[token]; } }) {

  app.get('/auth/capabilities', (req, res) => {
    res.json({
      ok: true,
      providers: {
        trakt: { configured: TRAKT_CONFIGURED },
        simkl: { configured: !!(process.env.SIMKL_CLIENT_ID && process.env.SIMKL_CLIENT_SECRET) },
        mal: { configured: !!(process.env.MAL_CLIENT_ID && process.env.MAL_CLIENT_SECRET) },
        anilist: { configured: !!(process.env.ANILIST_CLIENT_ID && process.env.ANILIST_CLIENT_SECRET) }
      }
    });
  });

  // Create a minimal pre-auth config for OAuth (no password/catalogs needed yet)
  app.post('/auth/preauth', async (req, res) => {
    // Uses the same CSPRNG-backed generator as /c/create and profile ids —
    // this token can end up guarding live OAuth access tokens (see
    // callbacks below) before the user sets a password, so it must not be
    // guessable the way Math.random() would be.
    let token = generateToken();
    while (await hasAccount(token)) token = generateToken();
    await createAccount(token, { catalogs: [], preauth: true, timestamp: new Date().toISOString() });
    res.json({ ok: true, token });
  });

  // ── Trakt OAuth ──────────────────────────────────────────
  // Step 1: redirect user to Trakt
  // ?profile=<id> connects that device profile's own Trakt account instead
  // of the base config's — carried through the OAuth round-trip via `state`
  // (Trakt only gives us the one redirect_uri, so this is how the callback
  // below learns which profile, if any, initiated the request).
  app.get('/auth/trakt/connect/:token', async (req, res) => {
    const { token } = req.params;
    const profileId = String(req.query.profile || '');
    const config = await readConfig(token);
    if (!config) return res.status(404).send('Config not found');
    if (profileId && (!config.profiles || !config.profiles[profileId])) {
      return res.status(404).send('Profile not found');
    }
    if (!TRAKT_CONFIGURED) {
      return res.status(503).json({
        ok: false,
        configured: false,
        provider: 'trakt',
        error: 'Provider configuration is unavailable'
      });
    }

    const state = profileId ? `${token}::${profileId}` : token;
    const authorizationUrl = new URL(TRAKT_AUTHORIZE_ENDPOINT);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', TRAKT_CLIENT_ID);
    authorizationUrl.searchParams.set('redirect_uri', TRAKT_CALLBACK_URI);
    authorizationUrl.searchParams.set('state', state);
    res.redirect(authorizationUrl.toString());
  });

  // Step 2: Trakt redirects back here
  app.get('/auth/trakt/callback', async (req, res) => {
    const { code, state: rawState } = req.query;
    if (!code || !rawState) return res.status(400).send('Missing code or state');

    const [token, profileId] = String(rawState).split('::');
    let config = await readConfig(token);
    if (!config) return res.status(404).send('Config not found');

    const profile = profileId && config.profiles && config.profiles[profileId];
    if (profileId && !profile) return res.status(404).send('Profile not found');
    const profileSuffix = profileId ? `&profile=${encodeURIComponent(profileId)}` : '';

    try {
      const response = await axios.post('https://api.trakt.tv/oauth/token', {
        code,
        client_id: TRAKT_CLIENT_ID,
        client_secret: TRAKT_CLIENT_SECRET,
        redirect_uri: TRAKT_CALLBACK_URI,
        grant_type: 'authorization_code'
      }, { headers: { 'Content-Type': 'application/json' } });

      const data = response.data;
      if (!data.access_token) throw new Error('No access token returned');

      // Get Trakt username
      const profileRes = await axios.get('https://api.trakt.tv/users/me', {
        headers: {
          'Authorization': `Bearer ${data.access_token}`,
          'trakt-api-version': '2',
          'trakt-api-key': TRAKT_CLIENT_ID
        }
      });
      const traktProfile = profileRes.data;

      config = await mutateAccount(token, account => {
        const targetProfile = profileId && account.profiles && account.profiles[profileId];
        if (targetProfile) {
          targetProfile.overrides = targetProfile.overrides || {};
          targetProfile.overrides.profileTraktToken = data.access_token;
          targetProfile.overrides.profileTraktRefreshToken = data.refresh_token;
          targetProfile.overrides.profileTraktTokenExpiry = Date.now() + (data.expires_in * 1000);
          targetProfile.overrides.profileTraktUser = traktProfile.username || targetProfile.overrides.profileTraktUser;
        } else {
          account.traktAccessToken = data.access_token;
          account.traktRefreshToken = data.refresh_token;
          account.traktTokenExpiry = Date.now() + (data.expires_in * 1000);
          account.traktUser = traktProfile.username || account.traktUser;
        }
      }, { reason: MUTATION_REASONS.OAUTH_INTEGRATION });

      if (config.hideWatched) {
        getWatchedIds(token, config.traktAccessToken, config.simklAccessToken, TRAKT_CLIENT_ID, SIMKL_CLIENT_ID)
          .catch(e => console.error('[watched-filter] prewarm failed:', e.message));
      }

      // Redirect back — if preauth config, go to setup; otherwise configure
      if (config.preauth) {
        res.redirect(`/setup.html?token=${token}&trakt=connected${profileSuffix}`);
      } else {
        res.redirect(`/configure/${token}?trakt=connected${profileSuffix}`);
      }
    } catch(e) {
      if (e && e.code === "PROFILE_STORE_MIRROR_FAILED") throw e;
      console.error('[Trakt OAuth] provider flow failed');
      res.redirect(`/configure/${token}?trakt=error${profileSuffix}`);
    }
  });

  // Disconnect Trakt — ?profile=<id> disconnects that profile's own
  // connection only, leaving the base config's connection untouched.
  app.post('/auth/trakt/disconnect/:token', async (req, res) => {
    const { token } = req.params;
    const profileId = String(req.query.profile || '');
    const committed = await mutateAccount(token, account => {
      const profile = profileId && account.profiles && account.profiles[profileId];
      if (profile) {
        if (profile.overrides) {
          delete profile.overrides.profileTraktToken;
          delete profile.overrides.profileTraktRefreshToken;
          delete profile.overrides.profileTraktTokenExpiry;
          delete profile.overrides.profileTraktUser;
        }
      } else {
        delete account.traktAccessToken;
        delete account.traktRefreshToken;
        delete account.traktTokenExpiry;
      }
    }, { reason: MUTATION_REASONS.OAUTH_INTEGRATION });
    if (!committed) return res.status(404).json({ ok: false });
    res.json({ ok: true });
  });

  // Check Trakt connection status — ?profile=<id> resolves that profile's
  // own connection (falling back to the base config's, same as catalogs).
  app.get('/auth/trakt/status/:token', async (req, res) => {
    const { token } = req.params;
    const baseConfig = await readConfig(token);
    if (!baseConfig) return res.status(404).json({ ok: false });

    const profileId = String(req.query.profile || '');
    const profileOverrides =
      profileId &&
      baseConfig.profiles &&
      baseConfig.profiles[profileId] &&
      baseConfig.profiles[profileId].overrides
        ? baseConfig.profiles[profileId].overrides
        : null;
    const profileConnected = !!(profileOverrides && profileOverrides.profileTraktToken);
    const baseConnected = !!baseConfig.traktAccessToken;
    const config = resolveConfigForProfile(baseConfig, profileId);

    res.json({
      ok: true,
      connected: !!config.traktAccessToken,
      username: config.traktUser || null,
      expired: config.traktTokenExpiry ? Date.now() > config.traktTokenExpiry : false,
      configured: TRAKT_CONFIGURED,
      scope: profileConnected ? 'profile' : (baseConnected ? 'base' : 'none'),
      profileId: profileId || null
    });
  });

  // ── Simkl OAuth ──────────────────────────────────────────
  const SIMKL_CLIENT_ID = process.env.SIMKL_CLIENT_ID;
  const SIMKL_CLIENT_SECRET = process.env.SIMKL_CLIENT_SECRET;
  const SIMKL_CONFIGURED = !!(SIMKL_CLIENT_ID && SIMKL_CLIENT_SECRET);
  const SIMKL_AUTHORIZE_ENDPOINT = 'https://simkl.com/oauth/authorize';
  const SIMKL_CALLBACK_URI = new URL('/auth/simkl/callback', BASE_URL).toString();

  // ?profile=<id> connects that device profile's own Simkl account — same
  // state-encoding trick as Trakt above.
  app.get('/auth/simkl/connect/:token', async (req, res) => {
    const { token } = req.params;
    const profileId = String(req.query.profile || '');
    const config = await readConfig(token);
    if (!config) return res.status(404).send('Config not found');
    if (profileId && (!config.profiles || !config.profiles[profileId])) {
      return res.status(404).send('Profile not found');
    }
    if (!SIMKL_CONFIGURED) {
      return res.status(503).json({
        ok: false,
        configured: false,
        provider: 'simkl',
        error: 'Provider configuration is unavailable'
      });
    }
    const state = profileId ? `${token}::${profileId}` : token;
    const authorizationUrl = new URL(SIMKL_AUTHORIZE_ENDPOINT);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', SIMKL_CLIENT_ID);
    authorizationUrl.searchParams.set('redirect_uri', SIMKL_CALLBACK_URI);
    authorizationUrl.searchParams.set('state', state);
    res.redirect(authorizationUrl.toString());
  });

  app.get('/auth/simkl/callback', async (req, res) => {
    const { code, state: rawState } = req.query;
    if (!code || !rawState) return res.status(400).send('Missing code or state');
    const [token, profileId] = String(rawState).split('::');
    let config = await readConfig(token);
    if (!config) return res.status(404).send('Config not found');

    const profile = profileId && config.profiles && config.profiles[profileId];
    if (profileId && !profile) return res.status(404).send('Profile not found');
    const profileSuffix = profileId ? `&profile=${encodeURIComponent(profileId)}` : '';

    try {
      const response = await axios.post('https://api.simkl.com/oauth/token', {
        code,
        client_id: SIMKL_CLIENT_ID,
        client_secret: SIMKL_CLIENT_SECRET,
        redirect_uri: SIMKL_CALLBACK_URI,
        grant_type: 'authorization_code'
      }, { headers: { 'Content-Type': 'application/json' } });
      const data = response.data;
      if (!data.access_token) throw new Error('No access token returned');

      // Get Simkl username
      const profileRes = await axios.get('https://api.simkl.com/users/settings', {
        headers: { 'Authorization': `Bearer ${data.access_token}`, 'simkl-api-key': SIMKL_CLIENT_ID }
      });
      const simklProfile = profileRes.data;
      const username = simklProfile?.user?.name || simklProfile?.account?.username || null;

      config = await mutateAccount(token, account => {
        const targetProfile = profileId && account.profiles && account.profiles[profileId];
        if (targetProfile) {
          targetProfile.overrides = targetProfile.overrides || {};
          targetProfile.overrides.profileSimklToken = data.access_token;
          targetProfile.overrides.profileSimklUser = username || targetProfile.overrides.profileSimklUser;
        } else {
          account.simklAccessToken = data.access_token;
          account.simklUser = username;
        }
      }, { reason: MUTATION_REASONS.OAUTH_INTEGRATION });

      if (config.hideWatched) {
        getWatchedIds(token, config.traktAccessToken, config.simklAccessToken, TRAKT_CLIENT_ID, SIMKL_CLIENT_ID)
          .catch(e => console.error('[watched-filter] prewarm failed:', e.message));
      }

      if (config.preauth) {
        res.redirect(`/setup.html?token=${token}&simkl=connected${profileSuffix}`);
      } else {
        res.redirect(`/configure/${token}?simkl=connected${profileSuffix}`);
      }
    } catch(e) {
      if (e && e.code === "PROFILE_STORE_MIRROR_FAILED") throw e;
      console.error('[Simkl OAuth] provider flow failed');
      if (config && config.preauth) {
        res.redirect(`/setup.html?token=${token}&simkl=error${profileSuffix}`);
      } else {
        res.redirect(`/configure/${token}?simkl=error${profileSuffix}`);
      }
    }
  });

  // ?profile=<id> disconnects only that profile's own Simkl connection.
  app.post('/auth/simkl/disconnect/:token', async (req, res) => {
    const { token } = req.params;
    const profileId = String(req.query.profile || '');
    const committed = await mutateAccount(token, account => {
      const profile = profileId && account.profiles && account.profiles[profileId];
      if (profile) {
        if (profile.overrides) {
          delete profile.overrides.profileSimklToken;
          delete profile.overrides.profileSimklUser;
        }
      } else {
        delete account.simklAccessToken;
        delete account.simklUser;
      }
    }, { reason: MUTATION_REASONS.OAUTH_INTEGRATION });
    if (!committed) return res.status(404).json({ ok: false });
    res.json({ ok: true });
  });

  // ?profile=<id> resolves that profile's own connection, falling back to
  // the base config's (same as catalogs).
  app.get('/auth/simkl/status/:token', async (req, res) => {
    const { token } = req.params;
    const baseConfig = await readConfig(token);
    if (!baseConfig) return res.status(404).json({ ok: false });

    const profileId = String(req.query.profile || '');
    const profileOverrides =
      profileId &&
      baseConfig.profiles &&
      baseConfig.profiles[profileId] &&
      baseConfig.profiles[profileId].overrides
        ? baseConfig.profiles[profileId].overrides
        : null;
    const profileConnected = !!(profileOverrides && profileOverrides.profileSimklToken);
    const baseConnected = !!baseConfig.simklAccessToken;
    const config = resolveConfigForProfile(baseConfig, profileId);

    res.json({
      ok: true,
      connected: !!config.simklAccessToken,
      username: config.simklUser || null,
      configured: SIMKL_CONFIGURED,
      scope: profileConnected ? 'profile' : (baseConnected ? 'base' : 'none'),
      profileId: profileId || null
    });
  });

  // ── MyAnimeList (MAL) OAuth ──────────────────────────────────────────
  // MAL requires PKCE on top of the usual authorization-code flow, and only
  // supports the "plain" challenge method (challenge === verifier). The
  // verifier has to survive the redirect round-trip, so it's held in-memory
  // here (short-lived, keyed by the setup token) rather than persisted.
  const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID;
  const MAL_CLIENT_SECRET = process.env.MAL_CLIENT_SECRET;
  const MAL_CONFIGURED = !!(MAL_CLIENT_ID && MAL_CLIENT_SECRET);
  const malPkceVerifiers = new Map(); // token -> { verifier, createdAt }
  const MAL_PKCE_TTL = 10 * 60 * 1000; // 10 minutes — plenty for a login redirect

  function generateMalCodeVerifier() {
    return crypto.randomBytes(64).toString('base64url').slice(0, 128);
  }

  app.get('/auth/mal/connect/:token', async (req, res) => {
    const { token } = req.params;
    const config = await readConfig(token);
    if (!config) return res.status(404).send('Config not found');

    if (!MAL_CONFIGURED) {
      return res.status(503).json({
        ok: false,
        configured: false,
        provider: 'mal',
        error: 'Provider configuration is unavailable'
      });
    }

    // Sweep stale verifiers so this map can't grow unbounded.
    const now = Date.now();
    for (const [k, v] of malPkceVerifiers.entries()) {
      if (now - v.createdAt > MAL_PKCE_TTL) malPkceVerifiers.delete(k);
    }

    const verifier = generateMalCodeVerifier();
    malPkceVerifiers.set(token, { verifier, createdAt: now });

    const redirectUri = `${BASE_URL}/auth/mal/callback`;
    const url = `https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=${MAL_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${token}&code_challenge=${encodeURIComponent(verifier)}&code_challenge_method=plain`;
    res.redirect(url);
  });

  app.get('/auth/mal/callback', async (req, res) => {
    const { code, state: token } = req.query;
    if (!code || !token) return res.status(400).send('Missing code or state');

    let config = await readConfig(token);
    if (!config) return res.status(404).send('Config not found');

    const pkce = malPkceVerifiers.get(token);
    malPkceVerifiers.delete(token);

    if (!pkce) {
      return res.redirect(config.preauth ? `/setup.html?token=${token}&mal=error` : `/configure/${token}?mal=error`);
    }

    try {
      const response = await axios.post('https://myanimelist.net/v1/oauth2/token', new URLSearchParams({
        client_id: MAL_CLIENT_ID,
        client_secret: MAL_CLIENT_SECRET || '',
        code,
        code_verifier: pkce.verifier,
        grant_type: 'authorization_code',
        redirect_uri: `${BASE_URL}/auth/mal/callback`
      }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

      const data = response.data;
      if (!data.access_token) throw new Error('No access token returned');

      const profileRes = await axios.get('https://api.myanimelist.net/v2/users/@me', {
        headers: { 'Authorization': `Bearer ${data.access_token}` }
      });
      const profile = profileRes.data;

      config = await mutateAccount(token, account => {
        account.malAccessToken = data.access_token;
        account.malRefreshToken = data.refresh_token;
        account.malTokenExpiry = Date.now() + (data.expires_in * 1000);
        account.malUser = profile?.name || account.malUser;
      }, { reason: MUTATION_REASONS.OAUTH_INTEGRATION });

      if (config.preauth) {
        res.redirect(`/setup.html?token=${token}&mal=connected`);
      } else {
        res.redirect(`/configure/${token}?mal=connected`);
      }
    } catch (e) {
      if (e && e.code === "PROFILE_STORE_MIRROR_FAILED") throw e;
      console.error('[MAL OAuth] provider flow failed');
      if (config && config.preauth) {
        res.redirect(`/setup.html?token=${token}&mal=error`);
      } else {
        res.redirect(`/configure/${token}?mal=error`);
      }
    }
  });

  app.post('/auth/mal/disconnect/:token', async (req, res) => {
    const { token } = req.params;
    const committed = await mutateAccount(token, account => {
      delete account.malAccessToken;
      delete account.malRefreshToken;
      delete account.malTokenExpiry;
      delete account.malUser;
    }, { reason: MUTATION_REASONS.OAUTH_INTEGRATION });
    if (!committed) return res.status(404).json({ ok: false });
    res.json({ ok: true });
  });

  app.get('/auth/mal/status/:token', async (req, res) => {
    const { token } = req.params;
    const config = await readConfig(token);
    if (!config) return res.status(404).json({ ok: false });
    res.json({
      ok: true,
      connected: !!config.malAccessToken,
      username: config.malUser || null,
      configured: MAL_CONFIGURED
    });
  });

  // ── AniList OAuth ──────────────────────────────────────────
  // Plain authorization-code flow (no PKCE). AniList access tokens don't
  // expire, so there's no refresh-token bookkeeping needed here.
  const ANILIST_CLIENT_ID = process.env.ANILIST_CLIENT_ID;
  const ANILIST_CLIENT_SECRET = process.env.ANILIST_CLIENT_SECRET;
  const ANILIST_CONFIGURED = !!(ANILIST_CLIENT_ID && ANILIST_CLIENT_SECRET);

  app.get('/auth/anilist/connect/:token', async (req, res) => {
    const { token } = req.params;
    const config = await readConfig(token);
    if (!config) return res.status(404).send('Config not found');

    if (!ANILIST_CONFIGURED) {
      return res.status(503).json({
        ok: false,
        configured: false,
        provider: 'anilist',
        error: 'Provider configuration is unavailable'
      });
    }

    const redirectUri = `${BASE_URL}/auth/anilist/callback`;
    const url = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${token}`;
    res.redirect(url);
  });

  app.get('/auth/anilist/callback', async (req, res) => {
    const { code, state: token } = req.query;
    if (!code || !token) return res.status(400).send('Missing code or state');

    let config = await readConfig(token);
    if (!config) return res.status(404).send('Config not found');

    try {
      const response = await axios.post('https://anilist.co/api/v2/oauth/token', {
        grant_type: 'authorization_code',
        client_id: ANILIST_CLIENT_ID,
        client_secret: ANILIST_CLIENT_SECRET,
        redirect_uri: `${BASE_URL}/auth/anilist/callback`,
        code
      }, { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });

      const data = response.data;
      if (!data.access_token) throw new Error('No access token returned');

      const viewer = await getAnilistViewer(data.access_token);

      config = await mutateAccount(token, account => {
        account.anilistAccessToken = data.access_token;
        account.anilistUserId = viewer?.id || null;
        account.anilistUser = viewer?.name || account.anilistUser;
      }, { reason: MUTATION_REASONS.OAUTH_INTEGRATION });

      if (config.preauth) {
        res.redirect(`/setup.html?token=${token}&anilist=connected`);
      } else {
        res.redirect(`/configure/${token}?anilist=connected`);
      }
    } catch (e) {
      if (e && e.code === "PROFILE_STORE_MIRROR_FAILED") throw e;
      console.error('[AniList OAuth] provider flow failed');
      if (config && config.preauth) {
        res.redirect(`/setup.html?token=${token}&anilist=error`);
      } else {
        res.redirect(`/configure/${token}?anilist=error`);
      }
    }
  });

  app.post('/auth/anilist/disconnect/:token', async (req, res) => {
    const { token } = req.params;
    const committed = await mutateAccount(token, account => {
      delete account.anilistAccessToken;
      delete account.anilistUserId;
      delete account.anilistUser;
    }, { reason: MUTATION_REASONS.OAUTH_INTEGRATION });
    if (!committed) return res.status(404).json({ ok: false });
    res.json({ ok: true });
  });

  app.get('/auth/anilist/status/:token', async (req, res) => {
    const { token } = req.params;
    const config = await readConfig(token);
    if (!config) return res.status(404).json({ ok: false });
    res.json({
      ok: true,
      connected: !!config.anilistAccessToken,
      username: config.anilistUser || null,
      configured: ANILIST_CONFIGURED
    });
  });

}

module.exports = { registerAuthRoutes };
