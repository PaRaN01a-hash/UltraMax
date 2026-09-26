// Phase A shared wizard state foundation. The legacy Step 3 and Step 4
// controllers remain authoritative for their visible flows for now; adapters
// publish safe connection/context changes here so later phases can converge on
// one owner without changing today's UI.
if (typeof window.ULTRAMAX_SHARED_WIZARD_CONTEXT_ENABLED === 'undefined') {
  window.ULTRAMAX_SHARED_WIZARD_CONTEXT_ENABLED = true;
}

(function initialiseUltraMaxWizardContext(global) {
  if (global.UltraMaxWizardContext) return;

  const listeners = new Set();
  let connectionGeneration = 0;
  let rememberedRestoreAttempted = false;
  let rememberedRestorePromise = null;
  let pendingBinding = null;
  const privateState = {
    version: 1,
    ultraMax: {
      token: null,
      profileId: null,
      profileName: null
    },
    nuvio: {
      status: 'disconnected',
      accessToken: null,
      accountFingerprint: null,
      profiles: [],
      selectedProfileId: null,
      connectedAt: null,
      lastValidatedAt: null,
      binding: {
        ultraMaxToken: null,
        ultraMaxProfileId: null
      },
      bindingState: 'unbound',
      selectionSource: null
    }
  };

  function enabled() {
    return global.ULTRAMAX_SHARED_WIZARD_CONTEXT_ENABLED !== false;
  }

  function safeString(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text || null;
  }

  function safeNumericProfileId(value) {
    if (typeof value === 'number') {
      return Number.isSafeInteger(value) && value >= 0 ? value : null;
    }
    if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  function normaliseProfile(profile) {
    if (!profile || typeof profile !== 'object') return null;
    const rawPublicId =
      profile.profileId !== undefined ? profile.profileId :
      profile.profileUuid !== undefined ? profile.profileUuid :
      profile.publicId !== undefined ? profile.publicId :
      profile.id;
    const profileId = safeString(rawPublicId);
    const numericProfileId = safeNumericProfileId(
      profile.numericProfileId !== undefined
        ? profile.numericProfileId
        : profile.profile_index !== undefined
          ? profile.profile_index
          : safeNumericProfileId(rawPublicId)
    );
    const id = profileId || (
      numericProfileId !== null ? String(numericProfileId) : null
    );
    if (!id) return null;
    return {
      id,
      profileId,
      numericProfileId,
      name: safeString(profile.name) || ('Profile ' + id),
      avatarUrl: safeString(profile.avatarUrl || profile.avatar_url),
      avatarColor: safeString(
        profile.avatarColor || profile.avatar_color_hex
      ),
      usesPrimaryAddons: !!(
        profile.usesPrimaryAddons !== undefined
          ? profile.usesPrimaryAddons
          : profile.uses_primary_addons
      ),
      usesPrimaryPlugins: !!(
        profile.usesPrimaryPlugins !== undefined
          ? profile.usesPrimaryPlugins
          : profile.uses_primary_plugins
      )
    };
  }

  function normaliseProfiles(profiles) {
    const seen = new Set();
    return (Array.isArray(profiles) ? profiles : [])
      .map(normaliseProfile)
      .filter(function(profile) {
        if (!profile) return false;
        const identity = profile.profileId
          ? 'public:' + profile.profileId
          : 'numeric:' + profile.numericProfileId;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
  }

  function publicSnapshot() {
    const selectedProfile = privateState.nuvio.profiles.find(function(profile) {
      return profile.id === privateState.nuvio.selectedProfileId;
    }) || null;
    return {
      version: privateState.version,
      ultraMax: {
        token: privateState.ultraMax.token,
        profileId: privateState.ultraMax.profileId,
        profileName: privateState.ultraMax.profileName
      },
      nuvio: {
        status: privateState.nuvio.status,
        accountFingerprint: privateState.nuvio.accountFingerprint,
        profiles: privateState.nuvio.profiles.map(function(profile) {
          return Object.assign({}, profile);
        }),
        selectedProfileId: privateState.nuvio.selectedProfileId,
        selectedProfilePublicId: selectedProfile
          ? selectedProfile.profileId
          : null,
        selectedNumericProfileId: selectedProfile
          ? selectedProfile.numericProfileId
          : null,
        connectedAt: privateState.nuvio.connectedAt,
        lastValidatedAt: privateState.nuvio.lastValidatedAt,
        binding: {
          ultraMaxToken: privateState.nuvio.binding.ultraMaxToken,
          ultraMaxProfileId: privateState.nuvio.binding.ultraMaxProfileId
        },
        bindingState: privateState.nuvio.bindingState,
        pendingBinding: !!pendingBinding,
        rememberedRestoreAttempted
      }
    };
  }

  function notify(type, reason) {
    if (!enabled()) return;
    const event = {
      type,
      reason: safeString(reason),
      snapshot: publicSnapshot()
    };
    listeners.forEach(function(listener) {
      try {
        listener(event);
      } catch (_error) {
        // A subscriber cannot block context updates.
      }
    });
  }

  function invalidateCollections(reason) {
    if (
      enabled() &&
      typeof global.invalidateCollectionSyncState === 'function'
    ) {
      global.invalidateCollectionSyncState(
        safeString(reason) || 'wizardContextChanged'
      );
    }
  }

  function clearBindingAndSelection(reason) {
    pendingBinding = null;
    const preserveGlobalProfile = reason === 'ultraMaxContextChanged';
    if (!preserveGlobalProfile) {
      privateState.nuvio.selectedProfileId = null;
      privateState.nuvio.selectionSource = null;
    }
    privateState.nuvio.binding.ultraMaxToken = null;
    privateState.nuvio.binding.ultraMaxProfileId = null;
    privateState.nuvio.bindingState =
      reason === 'ultraMaxContextChanged' ? 'cleared' : 'unbound';
    invalidateCollections(reason);
    notify('nuvioBindingCleared', reason);
  }
  function setUltraMaxContext(token, profileId, profileName) {
    if (!enabled()) return publicSnapshot();
    const nextToken = safeString(token);
    const nextProfileId = safeString(profileId);
    const nextProfileName = safeString(profileName);
    const identityChanged =
      privateState.ultraMax.token !== nextToken ||
      privateState.ultraMax.profileId !== nextProfileId;
    const nameChanged = privateState.ultraMax.profileName !== nextProfileName;

    const mayCompletePendingBinding = !!(
      pendingBinding &&
      !privateState.ultraMax.token &&
      nextToken &&
      privateState.ultraMax.profileId === nextProfileId &&
      pendingBinding.profileId === privateState.nuvio.selectedProfileId &&
      pendingBinding.accountFingerprint === privateState.nuvio.accountFingerprint &&
      pendingBinding.connectionGeneration === connectionGeneration
    );

    privateState.ultraMax.token = nextToken;
    privateState.ultraMax.profileId = nextProfileId;
    privateState.ultraMax.profileName = nextProfileName;

    if (identityChanged && mayCompletePendingBinding) {
      privateState.nuvio.binding.ultraMaxToken = nextToken;
      privateState.nuvio.binding.ultraMaxProfileId = nextProfileId;
      privateState.nuvio.bindingState = 'bound';
      pendingBinding = null;
      invalidateCollections('ultraMaxContextChanged');
      notify('nuvioProfileSelected', 'pendingBindingCompleted');
    } else if (identityChanged) {
      clearBindingAndSelection('ultraMaxContextChanged');
    }
    if (identityChanged || nameChanged) {
      notify('ultraMaxContextChanged', identityChanged ? 'identity' : 'displayName');
    }
    return publicSnapshot();
  }

  function clearUltraMaxContext() {
    return setUltraMaxContext(null, null, null);
  }

  function beginNuvioConnection() {
    if (!enabled()) return;
    privateState.nuvio.status = 'connecting';
    privateState.nuvio.bindingState = 'unbound';
    notify('nuvioConnecting', 'legacyAdapter');
  }

  function setNuvioProfiles(profiles) {
    if (!enabled()) return [];
    const previousSelected = privateState.nuvio.profiles.find(
      function(profile) {
        return profile.id === privateState.nuvio.selectedProfileId;
      }
    ) || null;
    privateState.nuvio.profiles = normaliseProfiles(profiles);
    const nextSelected = privateState.nuvio.profiles.find(
      function(profile) {
        return profile.id === privateState.nuvio.selectedProfileId;
      }
    ) || null;
    const selectedIdentityChanged = !!(
      previousSelected &&
      nextSelected &&
      (
        previousSelected.profileId !== nextSelected.profileId ||
        previousSelected.numericProfileId !== nextSelected.numericProfileId
      )
    );
    if (
      privateState.nuvio.selectedProfileId &&
      (!nextSelected || selectedIdentityChanged)
    ) {
      privateState.nuvio.selectedProfileId = null;
      privateState.nuvio.selectionSource = null;
      privateState.nuvio.binding.ultraMaxToken = null;
      privateState.nuvio.binding.ultraMaxProfileId = null;
      privateState.nuvio.bindingState = 'unbound';
      pendingBinding = null;
      invalidateCollections('nuvioSelectedProfileUnavailable');
      notify('nuvioBindingCleared', 'nuvioSelectedProfileUnavailable');
    }
    notify('nuvioProfilesChanged', 'legacyAdapter');
    return privateState.nuvio.profiles.map(function(profile) {
      return Object.assign({}, profile);
    });
  }

  function setNuvioConnected(connectionData) {
    if (!enabled()) return publicSnapshot();
    const data = connectionData || {};
    const nextFingerprint = safeString(data.accountFingerprint);
    const previousFingerprint = privateState.nuvio.accountFingerprint;
    const accountChanged = !!(
      privateState.nuvio.accessToken &&
      (
        previousFingerprint !== nextFingerprint ||
        !nextFingerprint
      )
    );

    if (accountChanged) {
      privateState.nuvio.profiles = [];
      clearBindingAndSelection('nuvioAccountChanged');
    }

    privateState.nuvio.status = 'connected';
    privateState.nuvio.accessToken =
      typeof data.accessToken === 'string' && data.accessToken
        ? data.accessToken
        : null;
    privateState.nuvio.accountFingerprint = nextFingerprint;
    privateState.nuvio.connectedAt =
      safeString(data.connectedAt) || new Date().toISOString();
    privateState.nuvio.lastValidatedAt =
      safeString(data.lastValidatedAt) || privateState.nuvio.connectedAt;
    setNuvioProfiles(data.profiles);

    if (!privateState.nuvio.selectedProfileId) {
      const preferred = nuvioGetPreferredProfile(privateState.nuvio.profiles);
      if (preferred) {
        privateState.nuvio.selectedProfileId = preferred.id;
        privateState.nuvio.selectionSource = 'globalPreference';
      }
    }
    notify('nuvioConnected', accountChanged ? 'accountChanged' : 'legacyAdapter');
    return publicSnapshot();
  }

  function selectNuvioProfile(profileId, source) {
    if (!enabled()) return null;
    const id = safeString(profileId);
    const profile = privateState.nuvio.profiles.find(function(candidate) {
      return candidate.id === id;
    });
    if (!profile) {
      clearNuvioProfileSelection('invalidNuvioProfile');
      return null;
    }
    privateState.nuvio.selectedProfileId = profile.id;
    privateState.nuvio.selectionSource = safeString(source) || 'shared';
    privateState.nuvio.binding.ultraMaxToken = null;
    privateState.nuvio.binding.ultraMaxProfileId = null;
    privateState.nuvio.bindingState = 'unbound';
    pendingBinding = null;
    nuvioSavePreferredProfile(profile);
    notify('nuvioProfileSelected', privateState.nuvio.selectionSource);
    return Object.assign({}, profile);
  }

  function clearNuvioProfileSelection(reason) {
    if (!enabled()) return;
    clearBindingAndSelection(reason || 'nuvioProfileSelectionCleared');
  }

  function markNuvioExpired() {
    if (!enabled()) return;
    connectionGeneration += 1;
    privateState.nuvio.status = 'expired';
    privateState.nuvio.accessToken = null;
    clearBindingAndSelection('nuvioExpired');
    notify('nuvioExpired', 'sessionExpired');
  }

  function clearNuvioConnection(reason) {
    if (!enabled()) return;
    connectionGeneration += 1;
    pendingBinding = null;
    privateState.nuvio.status = 'disconnected';
    privateState.nuvio.accessToken = null;
    privateState.nuvio.accountFingerprint = null;
    privateState.nuvio.profiles = [];
    privateState.nuvio.selectedProfileId = null;
    privateState.nuvio.connectedAt = null;
    privateState.nuvio.lastValidatedAt = null;
    privateState.nuvio.binding.ultraMaxToken = null;
    privateState.nuvio.binding.ultraMaxProfileId = null;
    privateState.nuvio.bindingState = 'unbound';
    privateState.nuvio.selectionSource = null;
    invalidateCollections(reason || 'nuvioDisconnected');
    notify('nuvioDisconnected', reason || 'nuvioDisconnected');
  }

  function getSelectedNuvioProfile() {
    const profile = privateState.nuvio.profiles.find(function(candidate) {
      return candidate.id === privateState.nuvio.selectedProfileId;
    });
    return profile ? Object.assign({}, profile) : null;
  }

  function isBoundToCurrentUltraMaxContext() {
    return !!(
      privateState.nuvio.selectedProfileId &&
      privateState.nuvio.binding.ultraMaxToken === privateState.ultraMax.token &&
      privateState.nuvio.binding.ultraMaxProfileId === privateState.ultraMax.profileId
    );
  }

  function bindNuvioToCurrentUltraMaxContext() {
    if (!enabled() || !getSelectedNuvioProfile()) return false;
    if (!privateState.ultraMax.token) {
      pendingBinding = {
        profileId: privateState.nuvio.selectedProfileId,
        accountFingerprint: privateState.nuvio.accountFingerprint,
        ultraMaxProfileId: privateState.ultraMax.profileId,
        connectionGeneration
      };
      privateState.nuvio.binding.ultraMaxToken = null;
      privateState.nuvio.binding.ultraMaxProfileId = null;
      privateState.nuvio.bindingState = 'pending';
      notify('nuvioProfileSelected', 'pendingUltraMaxToken');
      return true;
    }
    pendingBinding = null;
    privateState.nuvio.binding.ultraMaxToken = privateState.ultraMax.token;
    privateState.nuvio.binding.ultraMaxProfileId = privateState.ultraMax.profileId;
    privateState.nuvio.bindingState = 'bound';
    notify('nuvioProfileSelected', 'boundToUltraMaxContext');
    return true;
  }

  function markNuvioConnectionError() {
    if (!enabled()) return;
    privateState.nuvio.status = 'error';
    privateState.nuvio.accessToken = null;
    privateState.nuvio.accountFingerprint = null;
    privateState.nuvio.profiles = [];
    clearBindingAndSelection('nuvioConnectionError');
    notify('nuvioConnectionError', 'connectionFailed');
  }

  async function connectWithCredentials(email, password, options) {
    if (!enabled()) return { stale: true };
    const generation = ++connectionGeneration;
    beginNuvioConnection();
    try {
      const result = await nuvioLoginAndListProfiles(email, password);
      if (generation !== connectionGeneration) return { stale: true };
      setNuvioConnected(result);
      if (options && options.remember) {
        if (result.refreshToken) nuvioSaveSession(result.refreshToken);
        nuvioSaveCredentials(email, password);
      } else {
        nuvioClearSession();
        nuvioClearCredentials();
      }
      return { stale: false, snapshot: publicSnapshot() };
    } catch (error) {
      if (generation === connectionGeneration) markNuvioConnectionError();
      throw error;
    }
  }

  function restoreRememberedSessionOnce() {
    if (!enabled()) return Promise.resolve(null);
    if (rememberedRestorePromise) return rememberedRestorePromise;
    if (rememberedRestoreAttempted) return Promise.resolve(null);
    rememberedRestoreAttempted = true;
    const generation = ++connectionGeneration;
    notify('nuvioRestoreAttempted', 'pageLifecycle');
    rememberedRestorePromise = (async function() {
      const restored = await nuvioTryRestoreSession();
      if (
        generation !== connectionGeneration ||
        !restored ||
        !restored.accessToken
      ) {
        return null;
      }
      setNuvioConnected(restored);
      return publicSnapshot();
    })().finally(function() {
      rememberedRestorePromise = null;
    });
    return rememberedRestorePromise;
  }

  async function disconnectNuvio(reason) {
    if (!enabled()) return;
    connectionGeneration += 1;
    rememberedRestorePromise = null;
    nuvioClearSession();
    nuvioClearPreferredProfile();
    clearNuvioConnection(reason || 'globalDisconnect');
    const adapters = global.UltraMaxWizardContextAdapters || {};
    if (
      adapters.step3Collections &&
      typeof adapters.step3Collections.resetForSharedDisconnect === 'function'
    ) {
      adapters.step3Collections.resetForSharedDisconnect();
    }
    if (
      adapters.step4Finalise &&
      typeof adapters.step4Finalise.resetForSharedDisconnect === 'function'
    ) {
      adapters.step4Finalise.resetForSharedDisconnect();
    }
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return function() {};
    listeners.add(listener);
    return function() {
      listeners.delete(listener);
    };
  }

  function unsubscribe(listener) {
    listeners.delete(listener);
  }

  global.UltraMaxWizardContext = Object.freeze({
    version: 1,
    getSnapshot: publicSnapshot,
    setUltraMaxContext,
    clearUltraMaxContext,
    beginNuvioConnection,
    setNuvioConnected,
    markNuvioConnectionError,
    markNuvioExpired,
    clearNuvioConnection,
    setNuvioProfiles,
    selectNuvioProfile,
    clearNuvioProfileSelection,
    getNuvioAccessToken: function() {
      return enabled() ? privateState.nuvio.accessToken : null;
    },
    getSelectedNuvioProfile,
    isNuvioConnected: function() {
      return enabled() &&
        privateState.nuvio.status === 'connected' &&
        !!privateState.nuvio.accessToken;
    },
    isBoundToCurrentUltraMaxContext,
    bindNuvioToCurrentUltraMaxContext,
    connectWithCredentials,
    restoreRememberedSessionOnce,
    getRememberedCredentials: function() {
      return enabled() ? nuvioGetSavedCredentials() : null;
    },
    wasRememberedRestoreAttempted: function() {
      return rememberedRestoreAttempted;
    },
    disconnectNuvio,
    subscribe,
    unsubscribe
  });
})(window);

const NUVIO_API_BASE = window.location.origin + '/api/nuvio';
const NUVIO_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTIxMzQ2LCJleHAiOjE5MzkyMDEzNDZ9.tmQaj682pwzehpqlgCDMnySOqiUvpgRbrE43T4VJpDI';

function nuvioHeaders(accessToken) {
  const headers = { 'apikey': NUVIO_ANON_KEY, 'Content-Type': 'application/json', 'X-Client-Info': 'UltraMAX/1.0' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  return headers;
}

const NUVIO_MAX_429_RETRIES = 3;

function nuvioSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function nuvioFetch(url, options, actionLabel) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (networkErr) {
      throw new Error(
        `Couldn't reach Nuvio while trying to ${actionLabel} (network/CORS error). ` +
        `This can happen on some TV browsers or if you're offline. Try again on a phone/desktop browser. ` +
        `[${networkErr.message || networkErr}]`
      );
    }

    if (res.status === 429 && attempt < NUVIO_MAX_429_RETRIES) {
      const retryAfterSec = parseFloat(res.headers.get('Retry-After'));
      const backoffMs = !isNaN(retryAfterSec) ? retryAfterSec * 1000 : 1000 * Math.pow(2, attempt);
      await nuvioSleep(backoffMs);
      continue;
    }

    if (!res.ok) {
      let bodyText = '';
      let bodyJson = null;
      try {
        bodyText = await res.text();
        bodyJson = JSON.parse(bodyText);
      } catch {}

      const serverMsg = bodyJson?.error_description || bodyJson?.msg || bodyJson?.message || bodyText;

      if (res.status === 401 || res.status === 403) {
        throw new Error(`Login failed while trying to ${actionLabel} (${res.status}). Check your Nuvio email and password.`);
      }

      if (res.status === 429) {
        throw new Error(`Nuvio is temporarily rate-limiting requests while trying to ${actionLabel}. Please wait a moment and try again.`);
      }

      throw new Error(
        `Nuvio returned an error while trying to ${actionLabel} (HTTP ${res.status}). ` +
        (serverMsg ? `Details: ${serverMsg}` : 'No further details were provided.')
      );
    }

    return res;
  }
}

async function nuvioLogin(email, password) {
  const res = await nuvioFetch(
    `${NUVIO_API_BASE}/auth/login`,
    { method: 'POST', headers: nuvioHeaders(), body: JSON.stringify({ email, password }) },
    'log in'
  );
  const data = await res.json();
  return { accessToken: data.access_token, refreshToken: data.refresh_token, userId: data.user?.id };
}

async function nuvioRefreshSession(refreshToken) {
  const res = await nuvioFetch(
    `${NUVIO_API_BASE}/auth/refresh`,
    { method: 'POST', headers: nuvioHeaders(), body: JSON.stringify({ refresh_token: refreshToken }) },
    'restore your saved Nuvio session'
  );
  const data = await res.json();
  return { accessToken: data.access_token, refreshToken: data.refresh_token, userId: data.user?.id };
}

async function nuvioAccountFingerprint(userId) {
  if (
    !userId ||
    !globalThis.crypto ||
    !globalThis.crypto.subtle ||
    typeof TextEncoder !== 'function'
  ) {
    return null;
  }
  try {
    const bytes = new TextEncoder().encode('ultramax:nuvio-account:' + String(userId));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch (_error) {
    return null;
  }
}

const NUVIO_SESSION_STORAGE_KEY = 'ultramax_nuvio_session';
const NUVIO_PROFILE_STORAGE_KEY = 'ultramax_nuvio_profile_v1';
const NUVIO_CREDENTIAL_STORAGE_KEY = 'ultramax_nuvio_credentials_v1';

function nuvioSaveCredentials(email, password) {
  try {
    localStorage.setItem(NUVIO_CREDENTIAL_STORAGE_KEY, JSON.stringify({
      email: String(email || '').trim(),
      password: String(password || ''),
      savedAt: Date.now()
    }));
  } catch (_error) {}
}

function nuvioGetSavedCredentials() {
  try {
    const raw = localStorage.getItem(NUVIO_CREDENTIAL_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || !saved.email || !saved.password) return null;
    return {
      email: String(saved.email),
      password: String(saved.password)
    };
  } catch (_error) {
    return null;
  }
}

function nuvioClearCredentials() {
  try { localStorage.removeItem(NUVIO_CREDENTIAL_STORAGE_KEY); } catch (_error) {}
}

function nuvioSavePreferredProfile(profile) {
  if (!profile || typeof profile !== 'object') return;
  const publicId =
    profile.profileId !== undefined ? profile.profileId :
    profile.profileUuid !== undefined ? profile.profileUuid :
    profile.publicId !== undefined ? profile.publicId :
    profile.id;
  const numericId =
    profile.numericProfileId !== undefined ? profile.numericProfileId :
    profile.profile_index !== undefined ? profile.profile_index :
    null;
  const payload = {
    id: publicId == null ? '' : String(publicId),
    numericProfileId:
      Number.isSafeInteger(Number(numericId)) ? Number(numericId) : null,
    name: String(profile.name || ''),
    savedAt: Date.now()
  };
  try {
    localStorage.setItem(NUVIO_PROFILE_STORAGE_KEY, JSON.stringify(payload));
  } catch (_error) {}
}

function nuvioGetPreferredProfile(profiles) {
  let saved = null;
  try {
    const raw = localStorage.getItem(NUVIO_PROFILE_STORAGE_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch (_error) {}
  if (!saved) return null;

  const candidates = Array.isArray(profiles) ? profiles : [];
  return candidates.find(function(profile) {
    if (!profile) return false;
    const publicId =
      profile.profileId !== undefined ? profile.profileId :
      profile.profileUuid !== undefined ? profile.profileUuid :
      profile.publicId !== undefined ? profile.publicId :
      profile.id;
    const numericId =
      profile.numericProfileId !== undefined ? profile.numericProfileId :
      profile.profile_index !== undefined ? profile.profile_index :
      null;

    return (
      (saved.id && publicId != null && String(publicId) === String(saved.id)) ||
      (
        saved.numericProfileId !== null &&
        saved.numericProfileId !== undefined &&
        numericId !== null &&
        numericId !== undefined &&
        Number(numericId) === Number(saved.numericProfileId)
      )
    );
  }) || null;
}

function nuvioClearPreferredProfile() {
  try { localStorage.removeItem(NUVIO_PROFILE_STORAGE_KEY); } catch (_error) {}
}

function nuvioSaveSession(refreshToken) {
  try {
    localStorage.setItem(NUVIO_SESSION_STORAGE_KEY, JSON.stringify({ refreshToken, savedAt: Date.now() }));
  } catch (e) {
    console.log('Could not save Nuvio session:', e);
  }
}

function nuvioClearSession() {
  try { localStorage.removeItem(NUVIO_SESSION_STORAGE_KEY); } catch (e) {}
}

function nuvioGetSavedRefreshToken() {
  try {
    const raw = localStorage.getItem(NUVIO_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw).refreshToken || null;
  } catch (e) {
    return null;
  }
}

async function nuvioTryRestoreSession() {
  const refreshToken = nuvioGetSavedRefreshToken();
  if (!refreshToken) return null;
  try {
    const {
      accessToken,
      refreshToken: newRefreshToken,
      userId
    } = await nuvioRefreshSession(refreshToken);
    nuvioSaveSession(newRefreshToken);
    const profiles = await nuvioGetAllProfiles(accessToken);
    const accountFingerprint = await nuvioAccountFingerprint(userId);
    return { accessToken, profiles, accountFingerprint };
  } catch (e) {
    nuvioClearSession();
    return null;
  }
}

async function nuvioGetAllProfiles(accessToken) {
  const res = await nuvioFetch(
    `${NUVIO_API_BASE}/rpc/sync_pull_profiles`,
    { method: 'POST', headers: nuvioHeaders(accessToken), body: JSON.stringify({}) },
    'load your Nuvio profiles'
  );
  const profiles = await res.json();
  if (!profiles || profiles.length === 0) throw new Error('No Nuvio profile found on this account.');
  return profiles;
}

async function nuvioGetAddons(accessToken, profileId) {
  const res = await nuvioFetch(
    `${NUVIO_API_BASE}/addons?select=*&profile_id=eq.${profileId}&order=sort_order`,
    { headers: nuvioHeaders(accessToken) },
    'fetch your existing addons'
  );
  return res.json();
}

async function nuvioGetCollections(accessToken, profileId) {
  const res = await nuvioFetch(
    `${NUVIO_API_BASE}/rpc/sync_pull_collections`,
    { method: 'POST', headers: nuvioHeaders(accessToken), body: JSON.stringify({ p_profile_id: profileId }) },
    'fetch your existing collections'
  );
  const rows = await res.json();
  return rows?.[0]?.collections_json || [];
}

// Phase 2 read-only collection comparison. This helper is intentionally
// hard-wired to the pull RPC and performs strict response checks before the
// comparison module sees any remote data. It cannot be configured with an
// alternate method or endpoint.
const NUVIO_COLLECTION_COMPARE_MAX_BYTES = 2 * 1024 * 1024;

async function nuvioPullCollectionsForComparison(accessToken, profileId) {
  if (
    profileId === null ||
    profileId === undefined ||
    String(profileId).trim() === ''
  ) {
    throw new Error('Select a valid Nuvio profile before comparing collections.');
  }

  const res = await nuvioFetch(
    `${NUVIO_API_BASE}/rpc/sync_pull_collections`,
    {
      method: 'POST',
      headers: nuvioHeaders(accessToken),
      body: JSON.stringify({ p_profile_id: profileId })
    },
    'pull collections for a read-only comparison'
  );

  const declaredSize = Number(res.headers.get('Content-Length') || 0);
  if (declaredSize > NUVIO_COLLECTION_COMPARE_MAX_BYTES) {
    throw new Error('Nuvio collection data exceeds the 2 MiB comparison limit.');
  }

  const text = await res.text();
  const actualSize =
    typeof TextEncoder === 'function'
      ? new TextEncoder().encode(text).length
      : text.length;
  if (actualSize > NUVIO_COLLECTION_COMPARE_MAX_BYTES) {
    throw new Error('Nuvio collection data exceeds the 2 MiB comparison limit.');
  }

  let rows;
  try {
    rows = JSON.parse(text);
  } catch (_error) {
    throw new Error('Nuvio returned malformed collection data. Nothing was compared.');
  }

  if (!Array.isArray(rows)) {
    throw new Error('Nuvio returned an invalid collections response. Nothing was compared.');
  }

  // An empty RPC result is valid and means this Nuvio profile currently
  // has no collections configured.
  if (rows.length === 0) {
    return [];
  }

  if (
    !rows[0] ||
    !Object.prototype.hasOwnProperty.call(rows[0], 'collections_json') ||
    !Array.isArray(rows[0].collections_json)
  ) {
    throw new Error('Nuvio returned an invalid collections response. Nothing was compared.');
  }

  return rows[0].collections_json;
}

async function nuvioPushAddons(accessToken, profileId, addons) {
  const payload = addons.map((a, i) => ({ url: a.url, name: a.name, enabled: a.enabled !== false, sort_order: i }));
  await nuvioFetch(
    `${NUVIO_API_BASE}/rpc/sync_push_addons`,
    { method: 'POST', headers: nuvioHeaders(accessToken), body: JSON.stringify({ p_profile_id: profileId, p_addons: payload }) },
    'push your addon to Nuvio'
  );
}

function nuvioEffectiveAddonProfileId(profileId, profiles) {
  if (!isValidNuvioProfileId(profileId)) {
    throw new Error('Invalid Nuvio profile identifier.');
  }

  const numericProfileId = Number(profileId);
  const availableProfiles = Array.isArray(profiles) ? profiles : [];

  const profile = availableProfiles.find(candidate =>
    candidate &&
    Number(candidate.profile_index) === numericProfileId
  );

  if (!profile) {
    throw new Error('Selected Nuvio profile was not found.');
  }

  if (
    numericProfileId !== 1 &&
    typeof profile.uses_primary_addons !== 'boolean'
  ) {
    throw new Error('Selected Nuvio profile is missing add-on store metadata.');
  }

  // Nuvio TV and Mobile both resolve a non-primary profile configured to
  // use primary addons onto profile 1's addon store.
  if (
    numericProfileId !== 1 &&
    profile.uses_primary_addons === true
  ) {
    return 1;
  }

  return numericProfileId;
}

function nuvioEffectiveAddonProfileIds(profileIds, profiles) {
  if (!Array.isArray(profileIds)) {
    throw new Error('Nuvio profile identifiers must be an array.');
  }

  const effectiveIds = [];
  const seen = new Set();

  profileIds.forEach(profileId => {
    const effectiveId = nuvioEffectiveAddonProfileId(
      profileId,
      profiles
    );

    if (!seen.has(effectiveId)) {
      seen.add(effectiveId);
      effectiveIds.push(effectiveId);
    }
  });

  return effectiveIds;
}

function nuvioAddonIdentity(addon) {
  return addon && typeof addon.url === 'string'
    ? addon.url.trim()
    : '';
}

function nuvioManifestUrlFor(manifestUrl) {
  if (typeof manifestUrl !== 'string' || !manifestUrl.trim()) return manifestUrl;
  try {
    const url = new URL(manifestUrl, window.location.origin);
    const host = url.hostname.toLowerCase();
    if (host !== 'ultramax.vip') return manifestUrl;
    const match = url.pathname.match(/^\/[cn]\/([^/]+)(\/p\/[^/]+)?\/manifest\.json$/i);
    if (!match) return manifestUrl;

    // Nuvio TV keeps a local manifest cache keyed by the installed add-on URL.
    // Use a fresh harmless query value on every Ultra MAX push so config-driven
    // manifest presentation changes are fetched instead of reusing stale rows.
    url.pathname = `/n/${match[1]}${match[2] || ''}/manifest.json`;
    url.searchParams.set('um_refresh', Date.now().toString(36));
    return url.toString();
  } catch {
    return manifestUrl;
  }
}

function nuvioUltraMaxManifestIdentity(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, window.location.origin);
    const host = url.hostname.toLowerCase();
    if (!['ultramax.vip', 'ultramax.vip'].includes(host)) return null;
    const match = url.pathname.match(/^\/[cn]\/([^/]+)(?:\/p\/([^/]+))?\/manifest\.json$/i);
    if (!match) return null;
    const pathProfile = match[2] ? decodeURIComponent(match[2]) : '';
    const queryProfile = url.searchParams.get('profile') || '';
    const effectiveProfile = String(pathProfile || queryProfile).toLowerCase();
    url.hash = '';
    url.searchParams.delete('profile');
    url.searchParams.delete('um_refresh');
    url.searchParams.sort();
    return `${url.origin}|${String(match[1]).toLowerCase()}|${effectiveProfile}|${url.search}`;
  } catch {
    return null;
  }
}

function nuvioAddonState(addons) {
  return (Array.isArray(addons) ? addons : []).map((addon, index) => ({
    url: nuvioAddonIdentity(addon),
    name: addon && typeof addon.name === 'string' ? addon.name : '',
    enabled: !addon || addon.enabled !== false,
    sort_order: index
  }));
}

async function nuvioSafelyInstallAddon(accessToken, profileId, manifestUrl, onStatus) {
  const status = onStatus || (() => {});

  // First read establishes that the profile is readable before we prepare
  // any destructive replace-all RPC.
  status('Checking your current addons...');
  await nuvioGetAddons(accessToken, profileId);

  // sync_push_addons replaces the complete profile addon set. Read again
  // immediately before the write and build solely from this freshest state.
  status('Refreshing your addons before install...');
  const freshAddons = await nuvioGetAddons(accessToken, profileId);

  const installIdentity = nuvioUltraMaxManifestIdentity(manifestUrl);
  const unrelatedAddons = freshAddons.filter(addon => {
    const addonUrl = nuvioAddonIdentity(addon);
    if (!addonUrl || addonUrl === manifestUrl) return false;
    return !(
      installIdentity &&
      nuvioUltraMaxManifestIdentity(addonUrl) === installIdentity
    );
  });

  const expectedAddons = [
    { url: manifestUrl, name: 'Ultra MAX', enabled: true },
    ...unrelatedAddons
  ];

  status('Pushing addon to Nuvio...');
  await nuvioPushAddons(accessToken, profileId, expectedAddons);

  // Do not treat a successful HTTP response as proof that the final remote
  // state is correct. Re-read and verify the complete state we intended.
  status('Verifying addon install...');
  const verifiedAddons = await nuvioGetAddons(accessToken, profileId);

  const expectedState = nuvioAddonState(expectedAddons);
  const actualState = nuvioAddonState(verifiedAddons);

  if (JSON.stringify(actualState) !== JSON.stringify(expectedState)) {
    throw new Error(
      'Nuvio addon state changed during installation. Nothing further was written.'
    );
  }

  return verifiedAddons;
}

async function nuvioSafelyReplaceAddons(accessToken, profileId, addons, expectedBaseState, onStatus) {
  const status = onStatus || (() => {});
  const intendedAddons = Array.isArray(addons) ? addons : [];
  const intendedState = nuvioAddonState(intendedAddons);
  const previousState = Array.isArray(expectedBaseState)
    ? expectedBaseState
    : null;

  status('Checking latest Nuvio add-ons before save...');
  const freshAddons = await nuvioGetAddons(accessToken, profileId);
  const freshState = nuvioAddonState(freshAddons);

  if (
    previousState &&
    JSON.stringify(freshState) !== JSON.stringify(previousState)
  ) {
    throw new Error(
      'Your Nuvio add-ons changed since this page was loaded. Reload the profile before saving so nothing is overwritten.'
    );
  }

  status('Saving add-ons to Nuvio...');
  await nuvioPushAddons(accessToken, profileId, intendedAddons);

  status('Verifying add-on save...');
  const verifiedAddons = await nuvioGetAddons(accessToken, profileId);

  if (
    JSON.stringify(nuvioAddonState(verifiedAddons)) !==
    JSON.stringify(intendedState)
  ) {
    throw new Error(
      'Nuvio add-on verification failed after saving. Reload the profile before making any further changes.'
    );
  }

  return verifiedAddons;
}

async function nuvioPushCollections(accessToken, profileId, collections) {
  await nuvioFetch(
    `${NUVIO_API_BASE}/rpc/sync_push_collections`,
    { method: 'POST', headers: nuvioHeaders(accessToken), body: JSON.stringify({ p_profile_id: profileId, p_collections_json: collections }) },
    'push your collections to Nuvio'
  );
}

async function nuvioPushProfiles(accessToken, profiles, clientMaxProfiles) {
  const payload = profiles.map(p => ({
    profile_index: p.profile_index, name: p.name, avatar_color_hex: p.avatar_color_hex,
    uses_primary_addons: p.uses_primary_addons, uses_primary_plugins: p.uses_primary_plugins,
    avatar_id: p.avatar_id, avatar_url: p.avatar_url
  }));
  await nuvioFetch(
    `${NUVIO_API_BASE}/rpc/sync_push_profiles`,
    { method: 'POST', headers: nuvioHeaders(accessToken), body: JSON.stringify({ p_client_max_profiles: clientMaxProfiles || profiles.length, p_profiles: payload }) },
    'update your profile avatar on Nuvio'
  );
}

async function nuvioSetProfileAvatar(accessToken, profiles, profileId, newAvatarUrl) {
  const updated = profiles.map(p => p.profile_index === profileId ? { ...p, avatar_url: newAvatarUrl } : p);
  await nuvioPushProfiles(accessToken, updated, profiles.length);
  return updated;
}

async function nuvioRenameProfile(accessToken, profiles, profileId, newName) {
  const updated = profiles.map(p => p.profile_index === profileId ? { ...p, name: newName } : p);
  await nuvioPushProfiles(accessToken, updated, profiles.length);
  return updated;
}

async function nuvioSafelyRenameProfile(
  accessToken,
  expectedProfiles,
  profileId,
  newName,
  onStatus
) {
  const status = onStatus || (() => {});

  if (!isValidNuvioProfileId(profileId)) {
    throw new Error('Invalid Nuvio profile identifier.');
  }

  const numericProfileId = Number(profileId);
  const trimmedName = String(newName || '').trim();

  if (!trimmedName) {
    throw new Error('Profile name cannot be empty.');
  }

  const expected = Array.isArray(expectedProfiles)
    ? expectedProfiles
    : [];

  const expectedTarget = expected.find(
    profile => Number(profile.profile_index) === numericProfileId
  );

  if (!expectedTarget) {
    throw new Error('Selected Nuvio profile was not found in the loaded profile state.');
  }

  status('Refreshing Nuvio profiles...');

  const freshProfiles = await nuvioGetAllProfiles(accessToken);

  const freshTarget = freshProfiles.find(
    profile => Number(profile.profile_index) === numericProfileId
  );

  if (!freshTarget) {
    throw new Error('Selected Nuvio profile no longer exists.');
  }

  const comparableProfileState = profile => ({
    profile_index: Number(profile.profile_index),
    name: String(profile.name || ''),
    avatar_color_hex: profile.avatar_color_hex || null,
    uses_primary_addons: Boolean(profile.uses_primary_addons),
    uses_primary_plugins: Boolean(profile.uses_primary_plugins),
    avatar_id: profile.avatar_id || null,
    avatar_url: profile.avatar_url || null
  });

  const expectedTargetState = comparableProfileState(expectedTarget);
  const freshTargetState = comparableProfileState(freshTarget);

  if (
    JSON.stringify(expectedTargetState) !==
    JSON.stringify(freshTargetState)
  ) {
    throw new Error(
      'This Nuvio profile changed elsewhere after it was loaded. Refresh the account before renaming it.'
    );
  }

  const updatedProfiles = freshProfiles.map(profile =>
    Number(profile.profile_index) === numericProfileId
      ? { ...profile, name: trimmedName }
      : profile
  );

  status('Renaming Nuvio profile...');

  await nuvioPushProfiles(
    accessToken,
    updatedProfiles,
    Math.max(
      ...updatedProfiles.map(profile => Number(profile.profile_index))
    )
  );

  status('Verifying profile rename...');

  const verifiedProfiles = await nuvioGetAllProfiles(accessToken);

  const verifiedTarget = verifiedProfiles.find(
    profile => Number(profile.profile_index) === numericProfileId
  );

  if (!verifiedTarget) {
    throw new Error(
      'Nuvio accepted the profile update, but the renamed profile could not be verified.'
    );
  }

  if (String(verifiedTarget.name || '') !== trimmedName) {
    throw new Error(
      'Nuvio accepted the profile update, but the profile name did not verify correctly.'
    );
  }

  const expectedIds = updatedProfiles
    .map(profile => Number(profile.profile_index))
    .sort((a, b) => a - b);

  const verifiedIds = verifiedProfiles
    .map(profile => Number(profile.profile_index))
    .sort((a, b) => a - b);

  if (
    JSON.stringify(expectedIds) !==
    JSON.stringify(verifiedIds)
  ) {
    throw new Error(
      'Nuvio profile verification detected an unexpected profile-set change.'
    );
  }

  return verifiedProfiles;
}

// Profile deletion uses Nuvio's dedicated sync_delete_profile_data RPC.
// That RPC removes the profile row and all data scoped to that profile.
// nuvioSafelyDeleteProfile performs a fresh read before deletion and verifies
// both target removal and preservation of unrelated profiles afterwards.
async function nuvioSafelyDeleteProfile(
  accessToken,
  expectedProfiles,
  profileId,
  onStatus
) {
  const status = onStatus || (() => {});

  if (!isValidNuvioProfileId(profileId)) {
    throw new Error('Invalid Nuvio profile identifier.');
  }

  const numericProfileId = Number(profileId);

  if (numericProfileId === 1) {
    throw new Error('The primary profile cannot be deleted.');
  }

  const expected = Array.isArray(expectedProfiles)
    ? expectedProfiles
    : [];

  const expectedTarget = expected.find(function(profile) {
    return Number(profile.profile_index) === numericProfileId;
  });

  if (!expectedTarget) {
    throw new Error(
      'Selected Nuvio profile was not found in the loaded profile state.'
    );
  }

  const comparableProfileState = profile => ({
    profile_index: Number(profile.profile_index),
    name: String(profile.name || ''),
    avatar_color_hex: profile.avatar_color_hex || null,
    uses_primary_addons: Boolean(profile.uses_primary_addons),
    uses_primary_plugins: Boolean(profile.uses_primary_plugins),
    avatar_id: profile.avatar_id || null,
    avatar_url: profile.avatar_url || null
  });

  status('Refreshing Nuvio profiles...');

  const freshProfiles = await nuvioGetAllProfiles(accessToken);

  const freshTarget = freshProfiles.find(function(profile) {
    return Number(profile.profile_index) === numericProfileId;
  });

  if (!freshTarget) {
    throw new Error('Selected Nuvio profile no longer exists.');
  }

  if (
    JSON.stringify(comparableProfileState(expectedTarget)) !==
    JSON.stringify(comparableProfileState(freshTarget))
  ) {
    throw new Error(
      'This Nuvio profile changed elsewhere after it was loaded. Refresh the account before deleting it.'
    );
  }

  status('Deleting Nuvio profile...');

  await nuvioFetch(
    `${NUVIO_API_BASE}/rpc/sync_delete_profile_data`,
    {
      method: 'POST',
      headers: nuvioHeaders(accessToken),
      body: JSON.stringify({
        p_profile_id: numericProfileId
      })
    },
    'delete your Nuvio profile'
  );

  status('Verifying profile deletion...');

  const verifiedProfiles = await nuvioGetAllProfiles(accessToken);

  if (
    verifiedProfiles.some(function(profile) {
      return Number(profile.profile_index) === numericProfileId;
    })
  ) {
    throw new Error(
      'Nuvio accepted the delete request, but the profile still exists.'
    );
  }

  const expectedUnrelated = freshProfiles
    .filter(function(profile) {
      return Number(profile.profile_index) !== numericProfileId;
    })
    .map(comparableProfileState);

  const verifiedUnrelated =
    verifiedProfiles.map(comparableProfileState);

  if (
    JSON.stringify(expectedUnrelated) !==
    JSON.stringify(verifiedUnrelated)
  ) {
    throw new Error(
      'The profile was deleted, but another Nuvio profile changed during verification.'
    );
  }

  return verifiedProfiles;
}

async function nuvioDeleteProfile(accessToken, profiles, profileId) {
  return nuvioSafelyDeleteProfile(
    accessToken,
    profiles,
    profileId
  );
}

async function nuvioLoginAndListProfiles(email, password) {
  const { accessToken, refreshToken, userId } = await nuvioLogin(email, password);
  const profiles = await nuvioGetAllProfiles(accessToken);
  const accountFingerprint = await nuvioAccountFingerprint(userId);
  return { accessToken, refreshToken, profiles, accountFingerprint };
}

async function pushUltraMaxToProfile(accessToken, profileId, options, onStatus) {
  const status = onStatus || (() => {});
  const { manifestUrl, collections, pushCatalogs, pushCollections } = options;
  const installManifestUrl = nuvioManifestUrlFor(manifestUrl);
  if (!pushCatalogs && !pushCollections) {
    throw new Error('Select at least one of Catalogs or Collections to push.');
  }
  if (pushCatalogs) {
    await nuvioSafelyInstallAddon(
      accessToken,
      profileId,
      installManifestUrl,
      status
    );
  }
  if (pushCollections && collections && collections.length > 0) {
    status('Fetching your current collections...');
    const existingCollections = await nuvioGetCollections(accessToken, profileId);
    const newIds = new Set(collections.map(c => c.id));
    const filteredCollections = existingCollections.filter(c => !newIds.has(c.id));
    const mergedCollections = [...filteredCollections, ...collections];
    status('Pushing collections to Nuvio...');
    await nuvioPushCollections(accessToken, profileId, mergedCollections);
  }
  status('Done! Ultra MAX is now live in your Nuvio account.');
}

// Nuvio's addons/collections tables key profiles by an integer profile_id —
// never accept a UUID or other non-numeric value here. A caller that passes
// one gets a clean per-profile failure instead of a raw "invalid input
// syntax for type integer" error surfacing from the backend.
function isValidNuvioProfileId(value) {
  return Number.isInteger(value) || (typeof value === 'string' && /^\d+$/.test(value.trim()));
}

// Returns one result per requested profile ({profileId, ok, error?}), always
// attempting every id even if earlier ones fail. Callers own presenting a
// friendly, translated summary (they alone know display names) — this
// function only performs the pushes and reports raw per-profile outcomes;
// full technical error detail belongs in the caller's console logging, not
// duplicated here as a second summary implementation.
async function pushUltraMaxToProfiles(accessToken, profileIds, options, onStatus) {
  const status = onStatus || (() => {});
  const results = [];

  const profileMetadata =
    options && Array.isArray(options.nuvioProfiles)
      ? options.nuvioProfiles
      : null;

  const routeInheritedAddonStores = Boolean(
    profileMetadata &&
    options &&
    options.pushCatalogs === true &&
    options.pushCollections !== true
  );

  // Catalog-only installs can safely collapse multiple selected profiles onto
  // the physical addon store they actually use. Nuvio TV and Mobile resolve
  // uses_primary_addons profiles to profile 1.
  //
  // Keep one result per originally selected profile so the existing UI summary
  // remains truthful, while each physical addon store is written at most once.
  const effectiveStoreResults = new Map();

  for (let i = 0; i < profileIds.length; i++) {
    const profileId = profileIds[i];
    const prefix = `(${i + 1}/${profileIds.length}) `;

    if (!isValidNuvioProfileId(profileId)) {
      results.push({
        profileId,
        ok: false,
        error: 'Invalid profile identifier (expected a numeric profile id).'
      });
      continue;
    }

    let writeProfileId = profileId;

    if (routeInheritedAddonStores) {
      try {
        writeProfileId = nuvioEffectiveAddonProfileId(
          profileId,
          profileMetadata
        );
      } catch (err) {
        results.push({
          profileId,
          ok: false,
          error: err.message || String(err)
        });
        continue;
      }

      const existingResult = effectiveStoreResults.get(writeProfileId);

      if (existingResult) {
        results.push({
          profileId,
          ok: existingResult.ok,
          ...(existingResult.error
            ? { error: existingResult.error }
            : {})
        });
        continue;
      }
    }

    try {
      await pushUltraMaxToProfile(
        accessToken,
        writeProfileId,
        options,
        (msg) => {
          status(prefix + msg);
        }
      );

      const result = { ok: true };

      if (routeInheritedAddonStores) {
        effectiveStoreResults.set(writeProfileId, result);
      }

      results.push({
        profileId,
        ok: true
      });
    } catch (err) {
      const error = err.message || String(err);
      const result = {
        ok: false,
        error
      };

      if (routeInheritedAddonStores) {
        effectiveStoreResults.set(writeProfileId, result);
      }

      results.push({
        profileId,
        ok: false,
        error
      });
    }
  }

  return results;
}
