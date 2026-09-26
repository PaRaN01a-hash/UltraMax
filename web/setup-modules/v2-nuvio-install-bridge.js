(function(){
  var cachedAccessToken = '';
  var cachedSessionId = '';

  async function postJson(path, payload){
    var response = await fetch(path, {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(payload)
    });

    var data = null;
    try {
      data = await response.json();
    } catch (_error) {
      data = null;
    }

    if(!response.ok || !data || data.ok === false){
      var error = new Error(
        data && data.message
          ? data.message
          : 'Ultra MAX could not complete the Nuvio request.'
      );
      error.code = data && data.code ? data.code : 'NUVIO_REQUEST_FAILED';
      error.status = response.status;
      throw error;
    }

    return data;
  }

  function setupIdFromManifest(manifestUrl){
    try {
      var url = new URL(manifestUrl, window.location.origin);
      var match = url.pathname.match(
        /^\/[cn]\/([A-Z0-9]{8})(?:\/p\/[^/]+)?\/manifest\.json$/i
      );
      return match ? match[1].toUpperCase() : '';
    } catch (_error) {
      return '';
    }
  }

  async function adoptSession(accessToken, force){
    var token = String(accessToken || '').trim();
    if(!token){
      var missing = new Error('Connect Nuvio before installing Ultra MAX.');
      missing.code = 'NUVIO_SESSION_REQUIRED';
      throw missing;
    }

    if(!force && cachedAccessToken === token && cachedSessionId){
      return cachedSessionId;
    }

    var result = await postJson('/api/v2/nuvio/adopt', {
      accessToken: token
    });

    cachedAccessToken = token;
    cachedSessionId = result.session && result.session.sessionId
      ? result.session.sessionId
      : '';

    if(!cachedSessionId){
      throw new Error('Ultra MAX could not create a secure Nuvio install session.');
    }

    return cachedSessionId;
  }

  async function installOne(options, forceSessionRefresh){
    var setupId = setupIdFromManifest(options.manifestUrl);
    if(!setupId){
      var invalid = new Error('Generate the Ultra MAX setup again before installing it in Nuvio.');
      invalid.code = 'INVALID_GENERATED_MANIFEST';
      throw invalid;
    }

    var profileIndex = Number(options.profileIndex);
    if(!Number.isSafeInteger(profileIndex) || profileIndex < 0){
      var profileError = new Error('Choose a valid Nuvio profile.');
      profileError.code = 'NUVIO_INVALID_PROFILE';
      throw profileError;
    }

    var suppliedSessionId = String(options.sessionId || '').trim();
    var sessionId = suppliedSessionId || await adoptSession(
      options.accessToken,
      Boolean(forceSessionRefresh)
    );

    var basePayload = {
      sessionId: sessionId,
      setupId: setupId,
      profileIndex: profileIndex,
      collections: Array.isArray(options.collections)
        ? options.collections
        : []
    };

    var preview = await postJson(
      '/api/v2/nuvio/install/preview',
      basePayload
    );

    if(typeof options.onStatus === 'function'){
      options.onStatus(
        preview.preview.action === 'replace'
          ? 'Verified the existing Ultra MAX add-on. Preparing a safe update…'
          : 'Verified Nuvio. Preparing the Ultra MAX install…'
      );
    }

    var installed = await postJson(
      '/api/v2/nuvio/install',
      Object.assign({}, basePayload, {
        expectedAddonFingerprint:
          preview.preview.expectedAddonFingerprint,
        expectedCollectionFingerprint:
          preview.preview.expectedCollectionFingerprint
      })
    );

    return installed.result;
  }

  async function installOneWithSessionRetry(options){
    try {
      return await installOne(options, false);
    } catch (error) {
      if(
        error &&
        (error.code === 'NUVIO_SESSION_EXPIRED' ||
         error.code === 'NUVIO_AUTH_FAILED')
      ){
        cachedSessionId = '';

        if(String(options.sessionId || '').trim()){
          try {
            sessionStorage.removeItem('ultramax.v2.nuvioSessionId');
          } catch (_error) {}
          throw error;
        }

        return installOne(options, true);
      }
      throw error;
    }
  }

  async function installProfiles(options){
    var profileIds = Array.isArray(options.profileIds)
      ? options.profileIds
      : [];
    var results = [];

    for(var index = 0; index < profileIds.length; index += 1){
      var profileId = Number(profileIds[index]);
      var prefix = '(' + (index + 1) + '/' + profileIds.length + ') ';

      try {
        if(typeof options.onStatus === 'function'){
          options.onStatus(prefix + 'Checking Nuvio before writing anything…');
        }

        var result = await installOneWithSessionRetry({
          sessionId: options.sessionId || '',
          accessToken: options.accessToken,
          profileIndex: profileId,
          manifestUrl: options.manifestUrl,
          collections: options.collections,
          onStatus: function(message){
            if(typeof options.onStatus === 'function'){
              options.onStatus(prefix + message);
            }
          }
        });

        results.push({
          profileId: profileId,
          ok: true,
          result: result
        });
      } catch (error) {
        results.push({
          profileId: profileId,
          ok: false,
          error: error && error.message
            ? error.message
            : String(error),
          code: error && error.code
            ? error.code
            : 'NUVIO_INSTALL_FAILED'
        });
      }
    }

    return results;
  }

  window.UltraMaxV2NuvioInstall = Object.freeze({
    installOne: installOneWithSessionRetry,
    installProfiles: installProfiles,
    setupIdFromManifest: setupIdFromManifest,
    resetSession: function(){
      cachedAccessToken = '';
      cachedSessionId = '';
    }
  });
})();
