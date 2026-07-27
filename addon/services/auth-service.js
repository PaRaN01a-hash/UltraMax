const crypto = require('crypto');
const axios = require('axios');
const { getAnilistViewer } = require('./anilist-service');
const { resolveConfigForProfile } = require('../utils/profiles');

const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 7000}`;

const { getWatchedIds } = require("./watched-filter");

function registerAuthRoutes(app, { loadConfigs, saveConfigs }) {

  // Create a minimal pre-auth config for OAuth (no password/catalogs needed yet)
  app.post('/auth/preauth', (req, res) => {
    const configs = loadConfigs();
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    for(let i=0;i<8;i++) token += chars[Math.floor(Math.random()*chars.length)];
    while(configs[token]) { token = ''; for(let i=0;i<8;i++) token += chars[Math.floor(Math.random()*chars.length)]; }
    configs[token] = { catalogs: [], preauth: true, timestamp: new Date().toISOString() };
    saveConfigs(configs);
    res.json({ ok: true, token });
  });

  // ── Trakt OAuth ──────────────────────────────────────────
  // Step 1: redirect user to Trakt
  // ?profile=<id> connects that device profile's own Trakt account instead
  // of the base config's — carried through the OAuth round-trip via `state`
  // (Trakt only gives us the one redirect_uri, so this is how the callback
  // below learns which profile, if any, initiated the request).
  app.get('/auth/trakt/connect/:token', (req, res) => {
    const { token } = req.params;
    const profileId = String(req.query.profile || '');
    const configs = loadConfigs();
    if (!configs[token]) return res.status(404).send('Config not found');
    if (profileId && (!configs[token].profiles || !configs[token].profiles[profileId])) {
      return res.status(404).send('Profile not found');
    }

    const redirectUri = `${BASE_URL}/auth/trakt/callback`;
    const state = profileId ? `${token}::${profileId}` : token;
    const url = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${TRAKT_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
    res.redirect(url);
  });

  // Step 2: Trakt redirects back here
  app.get('/auth/trakt/callback', async (req, res) => {
    const { code, state: rawState } = req.query;
    if (!code || !rawState) return res.status(400).send('Missing code or state');

    const [token, profileId] = String(rawState).split('::');
    const configs = loadConfigs();
    if (!configs[token]) return res.status(404).send('Config not found');

    const profile = profileId && configs[token].profiles && configs[token].profiles[profileId];
    if (profileId && !profile) return res.status(404).send('Profile not found');
    const profileSuffix = profileId ? `&profile=${encodeURIComponent(profileId)}` : '';

    try {
      const response = await axios.post('https://api.trakt.tv/oauth/token', {
        code,
        client_id: TRAKT_CLIENT_ID,
        client_secret: TRAKT_CLIENT_SECRET,
        redirect_uri: `${BASE_URL}/auth/trakt/callback`,
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

      if (profile) {
        profile.overrides = profile.overrides || {};
        profile.overrides.profileTraktToken = data.access_token;
        profile.overrides.profileTraktRefreshToken = data.refresh_token;
        profile.overrides.profileTraktTokenExpiry = Date.now() + (data.expires_in * 1000);
        profile.overrides.profileTraktUser = traktProfile.username || profile.overrides.profileTraktUser;
      } else {
        configs[token].traktAccessToken = data.access_token;
        configs[token].traktRefreshToken = data.refresh_token;
        configs[token].traktTokenExpiry = Date.now() + (data.expires_in * 1000);
        configs[token].traktUser = traktProfile.username || configs[token].traktUser;
      }
      await saveConfigs(configs);

      if (configs[token].hideWatched) {
        getWatchedIds(token, configs[token].traktAccessToken, configs[token].simklAccessToken, TRAKT_CLIENT_ID, SIMKL_CLIENT_ID)
          .catch(e => console.error('[watched-filter] prewarm failed:', e.message));
      }

      // Redirect back — if preauth config, go to setup; otherwise configure
      if (configs[token].preauth) {
        res.redirect(`/setup.html?token=${token}&trakt=connected${profileSuffix}`);
      } else {
        res.redirect(`/configure/${token}?trakt=connected${profileSuffix}`);
      }
    } catch(e) {
      console.error('[Trakt OAuth]', e.message);
      res.redirect(`/configure/${token}?trakt=error${profileSuffix}`);
    }
  });

  // Disconnect Trakt — ?profile=<id> disconnects that profile's own
  // connection only, leaving the base config's connection untouched.
  app.post('/auth/trakt/disconnect/:token', (req, res) => {
    const { token } = req.params;
    const profileId = String(req.query.profile || '');
    const configs = loadConfigs();
    if (!configs[token]) return res.status(404).json({ ok: false });

    const profile = profileId && configs[token].profiles && configs[token].profiles[profileId];
    if (profile) {
      if (profile.overrides) {
        delete profile.overrides.profileTraktToken;
        delete profile.overrides.profileTraktRefreshToken;
        delete profile.overrides.profileTraktTokenExpiry;
        delete profile.overrides.profileTraktUser;
      }
    } else {
      delete configs[token].traktAccessToken;
      delete configs[token].traktRefreshToken;
      delete configs[token].traktTokenExpiry;
    }
    saveConfigs(configs);
    res.json({ ok: true });
  });

  // Check Trakt connection status — ?profile=<id> resolves that profile's
  // own connection (falling back to the base config's, same as catalogs).
  app.get('/auth/trakt/status/:token', (req, res) => {
    const { token } = req.params;
    const configs = loadConfigs();
    const baseConfig = configs[token];
    if (!baseConfig) return res.status(404).json({ ok: false });
    const config = resolveConfigForProfile(baseConfig, req.query.profile);
    res.json({
      ok: true,
      connected: !!config.traktAccessToken,
      username: config.traktUser || null,
      expired: config.traktTokenExpiry ? Date.now() > config.traktTokenExpiry : false
    });
  });

  // ── Simkl OAuth ──────────────────────────────────────────
  const SIMKL_CLIENT_ID = process.env.SIMKL_CLIENT_ID;
  const SIMKL_CLIENT_SECRET = process.env.SIMKL_CLIENT_SECRET;

  // ?profile=<id> connects that device profile's own Simkl account — same
  // state-encoding trick as Trakt above.
  app.get('/auth/simkl/connect/:token', (req, res) => {
    const { token } = req.params;
    const profileId = String(req.query.profile || '');
    const configs = loadConfigs();
    if (!configs[token]) return res.status(404).send('Config not found');
    if (profileId && (!configs[token].profiles || !configs[token].profiles[profileId])) {
      return res.status(404).send('Profile not found');
    }
    const redirectUri = `${BASE_URL}/auth/simkl/callback`;
    const state = profileId ? `${token}::${profileId}` : token;
    const url = `https://simkl.com/oauth/authorize?response_type=code&client_id=${SIMKL_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
    res.redirect(url);
  });

  app.get('/auth/simkl/callback', async (req, res) => {
    const { code, state: rawState } = req.query;
    if (!code || !rawState) return res.status(400).send('Missing code or state');
    const [token, profileId] = String(rawState).split('::');
    const configs = loadConfigs();
    if (!configs[token]) return res.status(404).send('Config not found');

    const profile = profileId && configs[token].profiles && configs[token].profiles[profileId];
    if (profileId && !profile) return res.status(404).send('Profile not found');
    const profileSuffix = profileId ? `&profile=${encodeURIComponent(profileId)}` : '';

    try {
      const response = await axios.post('https://api.simkl.com/oauth/token', {
        code,
        client_id: SIMKL_CLIENT_ID,
        client_secret: SIMKL_CLIENT_SECRET,
        redirect_uri: `${BASE_URL}/auth/simkl/callback`,
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

      if (profile) {
        profile.overrides = profile.overrides || {};
        profile.overrides.profileSimklToken = data.access_token;
        profile.overrides.profileSimklUser = username || profile.overrides.profileSimklUser;
      } else {
        configs[token].simklAccessToken = data.access_token;
        configs[token].simklUser = username;
      }
      await saveConfigs(configs);

      if (configs[token].hideWatched) {
        getWatchedIds(token, configs[token].traktAccessToken, configs[token].simklAccessToken, TRAKT_CLIENT_ID, SIMKL_CLIENT_ID)
          .catch(e => console.error('[watched-filter] prewarm failed:', e.message));
      }

      if (configs[token].preauth) {
        res.redirect(`/setup.html?token=${token}&simkl=connected${profileSuffix}`);
      } else {
        res.redirect(`/configure/${token}?simkl=connected${profileSuffix}`);
      }
    } catch(e) {
      console.error('[Simkl OAuth]', e.message);
      if (configs[token] && configs[token].preauth) {
        res.redirect(`/setup.html?token=${token}&simkl=error${profileSuffix}`);
      } else {
        res.redirect(`/configure/${token}?simkl=error${profileSuffix}`);
      }
    }
  });

  // ?profile=<id> disconnects only that profile's own Simkl connection.
  app.post('/auth/simkl/disconnect/:token', (req, res) => {
    const { token } = req.params;
    const profileId = String(req.query.profile || '');
    const configs = loadConfigs();
    if (!configs[token]) return res.status(404).json({ ok: false });

    const profile = profileId && configs[token].profiles && configs[token].profiles[profileId];
    if (profile) {
      if (profile.overrides) {
        delete profile.overrides.profileSimklToken;
        delete profile.overrides.profileSimklUser;
      }
    } else {
      delete configs[token].simklAccessToken;
      delete configs[token].simklUser;
    }
    saveConfigs(configs);
    res.json({ ok: true });
  });

  // ?profile=<id> resolves that profile's own connection, falling back to
  // the base config's (same as catalogs).
  app.get('/auth/simkl/status/:token', (req, res) => {
    const { token } = req.params;
    const configs = loadConfigs();
    const baseConfig = configs[token];
    if (!baseConfig) return res.status(404).json({ ok: false });
    const config = resolveConfigForProfile(baseConfig, req.query.profile);
    res.json({ ok: true, connected: !!config.simklAccessToken, username: config.simklUser || null });
  });

  // ── MyAnimeList (MAL) OAuth ──────────────────────────────────────────
  // MAL requires PKCE on top of the usual authorization-code flow, and only
  // supports the "plain" challenge method (challenge === verifier). The
  // verifier has to survive the redirect round-trip, so it's held in-memory
  // here (short-lived, keyed by the encoded OAuth state) rather than persisted.
  const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID;
  const MAL_CLIENT_SECRET = process.env.MAL_CLIENT_SECRET;
  const malPkceVerifiers = new Map(); // state -> { verifier, createdAt }
  const MAL_PKCE_TTL = 10 * 60 * 1000; // 10 minutes — plenty for a login redirect

  function generateMalCodeVerifier() {
    return crypto.randomBytes(64).toString('base64url').slice(0, 128);
  }

  app.get('/auth/mal/connect/:token', (req, res) => {
    const { token } = req.params;
    const profileId = String(req.query.profile || '');
    const configs = loadConfigs();
    if (!configs[token]) return res.status(404).send('Config not found');
    if (profileId && (!configs[token].profiles || !configs[token].profiles[profileId])) {
      return res.status(404).send('Profile not found');
    }

    if (!MAL_CLIENT_ID) {
      return res.status(503).send(
        'MyAnimeList integration is not configured on this server yet. ' +
        'An admin needs to add MAL_CLIENT_ID (and MAL_CLIENT_SECRET) to the addon .env — ' +
        'register an app at https://myanimelist.net/apiconfig to get one.'
      );
    }

    // Sweep stale verifiers so this map can't grow unbounded.
    const now = Date.now();
    for (const [k, v] of malPkceVerifiers.entries()) {
      if (now - v.createdAt > MAL_PKCE_TTL) malPkceVerifiers.delete(k);
    }

    const verifier = generateMalCodeVerifier();
    const state = profileId ? `${token}::${profileId}` : token;
    malPkceVerifiers.set(state, { verifier, createdAt: now });

    const redirectUri = `${BASE_URL}/auth/mal/callback`;
    const url = `https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=${MAL_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(verifier)}&code_challenge_method=plain`;
    res.redirect(url);
  });

  app.get('/auth/mal/callback', async (req, res) => {
    const { code, state: rawState } = req.query;
    if (!code || !rawState) return res.status(400).send('Missing code or state');

    const state = String(rawState);
    const [token, profileId] = state.split('::');
    const configs = loadConfigs();
    if (!configs[token]) return res.status(404).send('Config not found');

    const profile = profileId && configs[token].profiles && configs[token].profiles[profileId];
    if (profileId && !profile) return res.status(404).send('Profile not found');
    const profileSuffix = profileId ? `&profile=${encodeURIComponent(profileId)}` : '';

    const pkce = malPkceVerifiers.get(state);
    malPkceVerifiers.delete(state);

    if (!pkce) {
      return res.redirect(configs[token].preauth ? `/setup.html?token=${token}&mal=error${profileSuffix}` : `/configure/${token}?mal=error${profileSuffix}`);
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
      const malProfile = profileRes.data;

      if (profile) {
        profile.overrides = profile.overrides || {};
        profile.overrides.profileMalToken = data.access_token;
        profile.overrides.profileMalRefreshToken = data.refresh_token;
        profile.overrides.profileMalTokenExpiry = Date.now() + (data.expires_in * 1000);
        profile.overrides.profileMalUser = malProfile?.name || profile.overrides.profileMalUser;
      } else {
        configs[token].malAccessToken = data.access_token;
        configs[token].malRefreshToken = data.refresh_token;
        configs[token].malTokenExpiry = Date.now() + (data.expires_in * 1000);
        configs[token].malUser = malProfile?.name || configs[token].malUser;
      }
      await saveConfigs(configs);

      if (configs[token].preauth) {
        res.redirect(`/setup.html?token=${token}&mal=connected${profileSuffix}`);
      } else {
        res.redirect(`/configure/${token}?mal=connected${profileSuffix}`);
      }
    } catch (e) {
      console.error('[MAL OAuth]', e.message);
      if (configs[token] && configs[token].preauth) {
        res.redirect(`/setup.html?token=${token}&mal=error${profileSuffix}`);
      } else {
        res.redirect(`/configure/${token}?mal=error${profileSuffix}`);
      }
    }
  });

  app.post('/auth/mal/disconnect/:token', async (req, res) => {
    const { token } = req.params;
    const profileId = String(req.query.profile || '');
    const configs = loadConfigs();
    if (!configs[token]) return res.status(404).json({ ok: false });

    const profile = profileId && configs[token].profiles && configs[token].profiles[profileId];
    if (profileId && !profile) {
      return res.status(404).json({ ok: false, error: 'Profile not found' });
    }
    if (profile) {
      if (profile.overrides) {
        delete profile.overrides.profileMalToken;
        delete profile.overrides.profileMalRefreshToken;
        delete profile.overrides.profileMalTokenExpiry;
        delete profile.overrides.profileMalUser;
      }
    } else {
      delete configs[token].malAccessToken;
      delete configs[token].malRefreshToken;
      delete configs[token].malTokenExpiry;
      delete configs[token].malUser;
    }
    await saveConfigs(configs);
    res.json({ ok: true });
  });

  app.get('/auth/mal/status/:token', (req, res) => {
    const { token } = req.params;
    const configs = loadConfigs();
    const baseConfig = configs[token];
    if (!baseConfig) return res.status(404).json({ ok: false });
    const config = resolveConfigForProfile(baseConfig, req.query.profile);
    res.json({
      ok: true,
      connected: !!config.malAccessToken,
      username: config.malUser || null,
      configured: !!MAL_CLIENT_ID
    });
  });

  // ── AniList OAuth ──────────────────────────────────────────
  // Plain authorization-code flow (no PKCE). AniList access tokens don't
  // expire, so there's no refresh-token bookkeeping needed here.
  const ANILIST_CLIENT_ID = process.env.ANILIST_CLIENT_ID;
  const ANILIST_CLIENT_SECRET = process.env.ANILIST_CLIENT_SECRET;

  app.get('/auth/anilist/connect/:token', (req, res) => {
    const { token } = req.params;
    const profileId = String(req.query.profile || '');
    const configs = loadConfigs();
    if (!configs[token]) return res.status(404).send('Config not found');
    if (profileId && (!configs[token].profiles || !configs[token].profiles[profileId])) {
      return res.status(404).send('Profile not found');
    }

    if (!ANILIST_CLIENT_ID) {
      return res.status(503).send(
        'AniList integration is not configured on this server yet. ' +
        'An admin needs to add ANILIST_CLIENT_ID (and ANILIST_CLIENT_SECRET) to the addon .env — ' +
        'register an app at https://anilist.co/settings/developer to get one.'
      );
    }

    const redirectUri = `${BASE_URL}/auth/anilist/callback`;
    const state = profileId ? `${token}::${profileId}` : token;
    const url = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`;
    res.redirect(url);
  });

  app.get('/auth/anilist/callback', async (req, res) => {
    const { code, state: rawState } = req.query;
    if (!code || !rawState) return res.status(400).send('Missing code or state');

    const [token, profileId] = String(rawState).split('::');
    const configs = loadConfigs();
    if (!configs[token]) return res.status(404).send('Config not found');

    const profile = profileId && configs[token].profiles && configs[token].profiles[profileId];
    if (profileId && !profile) return res.status(404).send('Profile not found');
    const profileSuffix = profileId ? `&profile=${encodeURIComponent(profileId)}` : '';

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

      if (profile) {
        profile.overrides = profile.overrides || {};
        profile.overrides.profileAnilistToken = data.access_token;
        profile.overrides.profileAnilistUserId = viewer?.id || null;
        profile.overrides.profileAnilistUser = viewer?.name || profile.overrides.profileAnilistUser;
      } else {
        configs[token].anilistAccessToken = data.access_token;
        configs[token].anilistUserId = viewer?.id || null;
        configs[token].anilistUser = viewer?.name || configs[token].anilistUser;
      }
      await saveConfigs(configs);

      if (configs[token].preauth) {
        res.redirect(`/setup.html?token=${token}&anilist=connected${profileSuffix}`);
      } else {
        res.redirect(`/configure/${token}?anilist=connected${profileSuffix}`);
      }
    } catch (e) {
      console.error('[AniList OAuth]', e.message);
      if (configs[token] && configs[token].preauth) {
        res.redirect(`/setup.html?token=${token}&anilist=error${profileSuffix}`);
      } else {
        res.redirect(`/configure/${token}?anilist=error${profileSuffix}`);
      }
    }
  });

  app.post('/auth/anilist/disconnect/:token', async (req, res) => {
    const { token } = req.params;
    const profileId = String(req.query.profile || '');
    const configs = loadConfigs();
    if (!configs[token]) return res.status(404).json({ ok: false });

    const profile = profileId && configs[token].profiles && configs[token].profiles[profileId];
    if (profileId && !profile) {
      return res.status(404).json({ ok: false, error: 'Profile not found' });
    }
    if (profile) {
      if (profile.overrides) {
        delete profile.overrides.profileAnilistToken;
        delete profile.overrides.profileAnilistUserId;
        delete profile.overrides.profileAnilistUser;
      }
    } else {
      delete configs[token].anilistAccessToken;
      delete configs[token].anilistUserId;
      delete configs[token].anilistUser;
    }
    await saveConfigs(configs);
    res.json({ ok: true });
  });

  app.get('/auth/anilist/status/:token', (req, res) => {
    const { token } = req.params;
    const configs = loadConfigs();
    const baseConfig = configs[token];
    if (!baseConfig) return res.status(404).json({ ok: false });
    const config = resolveConfigForProfile(baseConfig, req.query.profile);
    res.json({
      ok: true,
      connected: !!config.anilistAccessToken,
      username: config.anilistUser || null,
      configured: !!ANILIST_CLIENT_ID
    });
  });

}

module.exports = { registerAuthRoutes };
