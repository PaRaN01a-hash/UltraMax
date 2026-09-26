(function(){
  let nuvioAccessToken = null;
  let nuvioV2SessionId = '';
  let nuvioProfiles = [];
  let nuvioSelectedProfileIds = new Set();

  function sharedStep4WizardContext(){
    if(
      window.ULTRAMAX_SHARED_WIZARD_CONTEXT_ENABLED === false ||
      !window.UltraMaxWizardContext
    ){
      return null;
    }
    return window.UltraMaxWizardContext;
  }

  function publishStep4Connection(result){
    const context = sharedStep4WizardContext();
    if(!context || !result) return;
    context.setNuvioConnected({
      accessToken: result.accessToken,
      accountFingerprint: result.accountFingerprint || null,
      profiles: result.profiles || []
    });
  }

  function publishStep4Selection(){
    if(nuvioV2SessionId){
      const selected = Array.from(nuvioSelectedProfileIds);
      if(selected.length === 1){
        try {
          sessionStorage.setItem('ultramax.v2.nuvioProfileIndex', String(selected[0]));
        } catch (_error) {}
      }
      return;
    }

    const context = sharedStep4WizardContext();
    if(!context) return;
    const selectedIds = Array.from(nuvioSelectedProfileIds).map(String);
    const selectedIdentityIds = selectedIds.map(function(numericId){
      const profile = nuvioProfiles.find(function(candidate){
        return String(candidate.profile_index) === numericId;
      });
      return String(profile && profile.id ? profile.id : numericId);
    });
    const existing = context.getSelectedNuvioProfile();

    if(selectedIds.length === 1){
      if(context.selectNuvioProfile(selectedIdentityIds[0], 'step4Finalise')){
        context.bindNuvioToCurrentUltraMaxContext();
      }
      return;
    }

    // Step 4 is intentionally still multi-select in Phase A. Preserve an
    // explicitly selected primary only when it remains part of the Set;
    // never pick an arbitrary profile from a multi-selection.
    if(
      selectedIds.length > 1 &&
      existing &&
      selectedIdentityIds.includes(String(existing.id))
    ){
      return;
    }
    if(selectedIds.length > 1){
      context.clearNuvioProfileSelection('step4MultipleProfilesNoPrimary');
    }
  }

  function hydrateStep4FromSharedPrimary(){
    const context = sharedStep4WizardContext();
    if(
      !context ||
      !context.isNuvioConnected()
    ){
      return false;
    }
    // Prefilling this panel from the Step 1 connection is read-only; it
    // must not depend on isBoundToCurrentUltraMaxContext(), which only
    // becomes true once a checkpoint like generate() has run. Before that
    // it stays "pending" for a not-yet-generated setup, which made this
    // hydrate silently no-op on first entry into this step even though
    // the user was already connected with a profile selected. The actual
    // push still independently validates profile scope server-side.
    const primary = context.getSelectedNuvioProfile();
    const snapshot = context.getSnapshot();
    nuvioAccessToken = context.getNuvioAccessToken();
    nuvioProfiles = snapshot.nuvio.profiles.map(function(profile){
      return {
        profile_index: profile.numericProfileId,
        id: profile.profileId,
        name: profile.name,
        avatar_url: profile.avatarUrl,
        avatar_color_hex: profile.avatarColor,
        uses_primary_addons: profile.usesPrimaryAddons,
        uses_primary_plugins: profile.usesPrimaryPlugins
      };
    });
    // primary.id is the shared wizard context's canonical profile UUID.
    // nuvioSelectedProfileIds (like every other consumer in this panel —
    // toggleRowSelected, row.dataset.profileId, the push call below) is
    // keyed by the NUMERIC profile_index Nuvio's backend expects. Sending
    // the UUID there causes "invalid input syntax for type integer" once
    // it reaches the addons/collections push request.
    const primaryLocal = primary
      ? nuvioProfiles.find(function(p){
          return p.id != null && String(p.id) === String(primary.id);
        })
      : null;
    nuvioSelectedProfileIds = new Set(
      primaryLocal && Number.isSafeInteger(primaryLocal.profile_index)
        ? [primaryLocal.profile_index]
        : []
    );
    renderProfiles();
    updateConfirmState();
    loginStage.style.display = 'none';
    profileStage.style.display = 'block';
    statusEl.textContent = primary
      ? 'Using your default Nuvio profile: ' + primary.name + '. You may select additional profiles here.'
      : 'Nuvio is connected. Choose the profile or profiles for this install.';
    return true;
  }

  function hydrateStep4FromV2Session(session, selectedProfileIndex){
    if(!session || !session.sessionId || !Array.isArray(session.profiles)){
      return false;
    }

    nuvioV2SessionId = String(session.sessionId);
    nuvioProfiles = session.profiles.map(function(profile){
      return {
        profile_index: Number(profile.profileIndex),
        id:
          profile.publicId !== null &&
          profile.publicId !== undefined &&
          String(profile.publicId)
            ? String(profile.publicId)
            : String(profile.profileIndex),
        name: profile.name || ('Profile ' + profile.profileIndex),
        avatar_url: profile.avatarUrl || null,
        avatar_color_hex: profile.avatarColor || null,
        uses_primary_addons: Boolean(profile.usesPrimaryAddons),
        uses_primary_plugins: Boolean(profile.usesPrimaryPlugins)
      };
    }).filter(function(profile){
      return Number.isSafeInteger(profile.profile_index) && profile.profile_index >= 0;
    });

    var preferred = Number(selectedProfileIndex);
    var preferredExists =
      Number.isSafeInteger(preferred) &&
      nuvioProfiles.some(function(profile){
        return profile.profile_index === preferred;
      });

    if(!preferredExists && nuvioProfiles.length === 1){
      preferred = nuvioProfiles[0].profile_index;
      preferredExists = true;
    }

    nuvioSelectedProfileIds = new Set(
      preferredExists ? [preferred] : []
    );

    renderProfiles();
    updateConfirmState();
    loginStage.style.display = 'none';
    profileStage.style.display = 'block';
    statusEl.textContent = preferredExists
      ? 'Using your connected Nuvio profile: ' + nuvioProfileNameFor(preferred) + '.'
      : 'Nuvio is connected. Choose the profile or profiles for this install.';
    statusEl.style.color = 'inherit';
    return true;
  }

  function resetStep4ForSharedDisconnect(){
    nuvioAccessToken = null;
    nuvioProfiles = [];
    nuvioSelectedProfileIds = new Set();
    profileList.innerHTML = '';
    profileStage.style.display = 'none';
    loginStage.style.display = 'none';
    const password = document.getElementById('nuvio-password');
    if(password) password.value = '';
    statusEl.innerHTML = 'Nuvio is not connected. <a href="/app.html?nuvio=connect" class="nuvio-home-connect-link">Connect Nuvio from Home</a>.';
  }

  const loginStage = document.getElementById('nuvio-login-stage');
  const profileStage = document.getElementById('nuvio-profile-stage');
  const profileList = document.getElementById('nuvio-profile-list');
  const statusEl = document.getElementById('nuvio-status');
  const loginBtn = document.getElementById('nuvio-login-btn');
  const confirmBtn = document.getElementById('nuvio-confirm-btn');
  const cancelBtn = document.getElementById('nuvio-cancel-btn');

  async function nuvioHandleRename(p, nameEl, actionsEl){
    const input = document.createElement('input');
    input.type = 'text';
    input.value = p.name;
    input.maxLength = 40;
    input.style.cssText = 'flex:1;min-width:0;background:var(--bg2);border:1px solid var(--border2);color:var(--text);font-family:inherit;font-size:13px;padding:5px 8px;border-radius:6px;outline:none;';
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    async function commit(){
      if (done) return;
      done = true;
      const newName = input.value.trim();
      if (!newName || newName === p.name) { renderProfiles(); return; }
      try {
        statusEl.textContent = umT('setup.nuvioPush.renaming', 'Renaming profile...');
        statusEl.style.color = 'inherit';
        nuvioProfiles = await nuvioRenameProfile(nuvioAccessToken, nuvioProfiles, p.profile_index, newName);
        statusEl.textContent = umT('setup.nuvioPush.renamed', 'Profile renamed.');
        statusEl.style.color = '#4caf50';
      } catch (err) {
        statusEl.textContent = err.message || umT('setup.nuvioPush.renameFailed', 'Could not rename profile.');
        statusEl.style.color = '#ff6b6b';
      }
      renderProfiles();
    }

    input.addEventListener('keydown', function(e){
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') { done = true; renderProfiles(); }
    });
    input.addEventListener('blur', commit);
    input.addEventListener('click', function(e){ e.stopPropagation(); });
  }

  async function nuvioHandleDelete(p){
    if (!confirm(umT('setup.nuvioPush.confirmDelete', 'Delete the Nuvio profile "{name}"? This cannot be undone.', { name: p.name }))) return;
    try {
      statusEl.textContent = umT('setup.nuvioPush.deleting', 'Deleting profile...');
      statusEl.style.color = 'inherit';
      nuvioProfiles = await nuvioDeleteProfile(nuvioAccessToken, nuvioProfiles, p.profile_index);
      nuvioSelectedProfileIds.delete(p.profile_index);
      try { localStorage.removeItem(nuvioSyncKey(p.profile_index)); } catch (e) {}
      statusEl.textContent = umT('setup.nuvioPush.deleted', 'Profile deleted.');
      statusEl.style.color = '#4caf50';
    } catch (err) {
      statusEl.textContent = err.message || umT('setup.nuvioPush.deleteFailed', 'Could not delete profile.');
      statusEl.style.color = '#ff6b6b';
    }
    renderProfiles();
    updateConfirmState();
  }

  function updateConfirmState(){
    confirmBtn.disabled = nuvioSelectedProfileIds.size === 0;
    confirmBtn.textContent = nuvioSelectedProfileIds.size > 1
      ? 'Install Ultra MAX + collections (' + nuvioSelectedProfileIds.size + ' profiles)'
      : 'Install Ultra MAX + collections';
  }

  function step3Copy(key, fallback){
    return window.umT ? window.umT('setup.step3Local.' + key, fallback) : fallback;
  }

  // Pure visual application, no state mutation — shared by toggleRowSelected
  // (user click, which also mutates nuvioSelectedProfileIds) and renderProfiles
  // (redraw from the authoritative Set, so a rerender can never show a check
  // state that disagrees with what a push would actually target).
  function applyRowSelectedStyle(row, isSelected){
    if (isSelected) {
      row.style.borderColor = '#7B2FFF';
      row.style.background = 'rgba(123,47,255,.1)';
      row.querySelector('.nuvio-check').style.opacity = '1';
    } else {
      row.style.borderColor = 'var(--border)';
      row.style.background = 'rgba(255,255,255,.02)';
      row.querySelector('.nuvio-check').style.opacity = '0';
    }
  }

  function toggleRowSelected(row, p, forceState){
    const isSelected = forceState !== undefined ? forceState : !nuvioSelectedProfileIds.has(p.profile_index);
    if (isSelected) {
      nuvioSelectedProfileIds.add(p.profile_index);
    } else {
      nuvioSelectedProfileIds.delete(p.profile_index);
    }
    applyRowSelectedStyle(row, isSelected);
    updateConfirmState();
    publishStep4Selection();
  }

  // The profile bound in Step 1 (shared wizard context), so the matching row
  // can be labelled instead of silently pre-checked with no explanation.
  function getStep1ActiveProfileUuid(){
    const context = sharedStep4WizardContext();
    if(!context) return null;
    const active = context.getSelectedNuvioProfile();
    return active ? active.id : null;
  }

  function renderProfiles(){
    profileList.innerHTML = '';

    if (nuvioProfiles.length) {
      const selectAllRow = document.createElement('div');
      selectAllRow.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:8px;';
      selectAllRow.innerHTML = '<button type="button" id="nuvio-select-all" style="background:transparent;border:none;color:var(--violet2);font-size:11px;cursor:pointer;padding:4px;">' + umT('setup.step4.pushCard.selectAll', 'Select All') + '</button>';
      profileList.appendChild(selectAllRow);

      document.getElementById('nuvio-select-all').addEventListener('click', function(){
        const allSelected = nuvioSelectedProfileIds.size === nuvioProfiles.length;
        Array.from(profileList.querySelectorAll('.nuvio-profile-row')).forEach(function(row, idx){
          toggleRowSelected(row, nuvioProfiles[idx], !allSelected);
        });
        this.textContent = allSelected ? umT('setup.step4.pushCard.selectAll', 'Select All') : umT('setup.step4.pushCard.selectNone', 'Select None');
      });
    }

    const step1ActiveUuid = getStep1ActiveProfileUuid();

    nuvioProfiles.forEach(function(p){
      const row = document.createElement('div');
      row.className = 'nuvio-profile-row';
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;cursor:pointer;background:var(--hover);';
      row.dataset.profileId = p.profile_index;

      const avatarWrap = document.createElement('div');
      avatarWrap.style.cssText = 'width:36px;height:36px;border-radius:50%;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:14px;';

      if (p.avatar_url) {
        const img = document.createElement('img');
        img.src = p.avatar_url;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        img.onerror = function(){
          avatarWrap.textContent = (p.name || '?').charAt(0).toUpperCase();
          avatarWrap.style.background = p.avatar_color_hex || '#7B2FFF';
          img.remove();
        };
        avatarWrap.appendChild(img);
      } else {
        avatarWrap.textContent = (p.name || '?').charAt(0).toUpperCase();
        avatarWrap.style.background = p.avatar_color_hex || '#7B2FFF';
      }

      const infoWrap = document.createElement('div');
      infoWrap.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;';

      const nameEl = document.createElement('div');
      nameEl.textContent = p.name;
      nameEl.style.cssText = 'font-size:13px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

      infoWrap.appendChild(nameEl);

      const primaryAddonProfile = nuvioProfiles.find(function(profile){
        return Number(profile.profile_index) === 1;
      });

      if (
        Number(p.profile_index) !== 1 &&
        Boolean(p.uses_primary_addons)
      ) {
        const inheritedAddonLabel = document.createElement('div');
        inheritedAddonLabel.textContent = primaryAddonProfile && primaryAddonProfile.name
          ? 'Uses ' + primaryAddonProfile.name + '\'s add-ons'
          : 'Uses primary profile add-ons';
        inheritedAddonLabel.style.cssText = 'font-size:10px;font-weight:600;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        infoWrap.appendChild(inheritedAddonLabel);
      } else if (Number(p.profile_index) === 1) {
        const primaryAddonLabel = document.createElement('div');
        primaryAddonLabel.textContent = 'Primary add-on store';
        primaryAddonLabel.style.cssText = 'font-size:10px;font-weight:600;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        infoWrap.appendChild(primaryAddonLabel);
      }

      if (step1ActiveUuid && p.id != null && String(p.id) === String(step1ActiveUuid)) {
        const activeLabel = document.createElement('div');
        activeLabel.textContent = umT('setup.step3Local.activeProfileFromStep1', 'Active profile from Step 1');
        activeLabel.style.cssText = 'font-size:10px;font-weight:600;color:var(--violet2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        infoWrap.appendChild(activeLabel);
      }

      const checkEl = document.createElement('div');
      checkEl.className = 'nuvio-check';
      checkEl.textContent = '✓';
      checkEl.style.cssText = 'color:#7B2FFF;font-weight:700;font-size:16px;opacity:0;transition:opacity .15s;flex-shrink:0;';

      row.appendChild(avatarWrap);
      row.appendChild(infoWrap);
      row.appendChild(checkEl);

      row.addEventListener('click', function(){
        toggleRowSelected(row, p);
      });

      profileList.appendChild(row);

      // Redraw the checked visual from the authoritative Set every time —
      // never leave a row's on-screen state stale after a rerender.
      applyRowSelectedStyle(row, nuvioSelectedProfileIds.has(p.profile_index));
    });
  }

  function normaliseKidsProfile(profile) {
    return {
      profile_index: Number(profile.profile_index),
      name:
        String(profile.name || '').trim() ||
        'Profile ' + Number(profile.profile_index),
      avatar_color_hex:
        profile.avatar_color_hex || '#1E88E5',
      uses_primary_addons:
        Boolean(profile.uses_primary_addons),
      uses_primary_plugins:
        Boolean(profile.uses_primary_plugins),
      avatar_id:
        profile.avatar_id || null,
      avatar_url:
        profile.avatar_url || null
    };
  }

  function saveKidsNuvioBackup(
    profile,
    addons,
    collections
  ) {
    const backup = {
      version: 1,
      createdAt: new Date().toISOString(),
      profile: normaliseKidsProfile(profile),
      addons: Array.isArray(addons) ? addons : [],
      collections:
        Array.isArray(collections)
          ? collections
          : []
    };

    localStorage.setItem(
      'ultramax_kids_nuvio_backup',
      JSON.stringify(backup)
    );

    return backup;
  }

  async function ensureIsolatedKidsProfile(
    accessToken,
    currentProfiles
  ) {
    const maxProfiles = 6;

    const profiles = currentProfiles
      .map(normaliseKidsProfile)
      .sort(
        (a, b) =>
          a.profile_index - b.profile_index
      );

    let kids = profiles.find(
      profile =>
        profile.name.trim().toLowerCase() ===
        'kids'
    );

    let kidsIndex = kids
      ? kids.profile_index
      : null;

    if (!kidsIndex) {
      const used = new Set(
        profiles.map(
          profile => profile.profile_index
        )
      );

      for (
        let index = 1;
        index <= maxProfiles;
        index++
      ) {
        if (!used.has(index)) {
          kidsIndex = index;
          break;
        }
      }
    }

    if (!kidsIndex) {
      throw new Error(
        umT('setup.kidsPush.allSlotsUsed', 'All six Nuvio profile slots are already in use.')
      );
    }

    const payload = profiles.map(profile => ({
      profile_index:
        profile.profile_index,
      name:
        profile.profile_index === kidsIndex
          ? 'Kids'
          : profile.name,
      avatar_color_hex:
        profile.avatar_color_hex ||
        '#1E88E5',
      uses_primary_addons:
        profile.profile_index === kidsIndex
          ? false
          : Boolean(
              profile.uses_primary_addons
            ),
      uses_primary_plugins:
        profile.profile_index === kidsIndex
          ? false
          : Boolean(
              profile.uses_primary_plugins
            ),
      avatar_id:
        profile.avatar_id || null,
      avatar_url:
        profile.avatar_url || null
    }));

    if (!kids) {
      payload.push({
        profile_index: kidsIndex,
        name: 'Kids',
        avatar_color_hex: '#43A047',
        uses_primary_addons: false,
        uses_primary_plugins: false,
        avatar_id: null,
        avatar_url: null
      });
    }

    payload.sort(
      (a, b) =>
        a.profile_index - b.profile_index
    );

    await nuvioPushProfiles(
      accessToken,
      payload,
      maxProfiles
    );

    const refreshed =
      await nuvioGetAllProfiles(
        accessToken
      );

    const verified = refreshed
      .map(normaliseKidsProfile)
      .find(
        profile =>
          profile.profile_index ===
            kidsIndex &&
          profile.name
            .trim()
            .toLowerCase() === 'kids'
      );

    if (!verified) {
      throw new Error(
        umT('setup.kidsPush.profileNotVerified', 'Nuvio accepted the profile update, but the Kids profile could not be verified.')
      );
    }

    if (
      verified.uses_primary_addons ||
      verified.uses_primary_plugins
    ) {
      throw new Error(
        umT('setup.kidsPush.notIsolated', 'The Kids profile exists, but it is not isolated from the primary profile.')
      );
    }

    nuvioProfiles = refreshed;

    return verified;
  }

  function getGeneratedKidsCollections() {
    const collections = Array.isArray(
      window.generatedNuvioCollections
    )
      ? window.generatedNuvioCollections
      : [];

    const kidsCollections =
      collections.filter(collection => {
        const id = String(
          collection && collection.id || ''
        ).toLowerCase();

        const title = String(
          collection && collection.title || ''
        ).toLowerCase();

        return (
          id ===
            'collection-ultramax-kids' ||
          title === 'ultra max kids'
        );
      });

    if (kidsCollections.length === 0) {
      throw new Error(
        umT('setup.kidsPush.noKidsCollection', 'The generated setup does not contain the Ultra MAX Kids collection.')
      );
    }

    return kidsCollections;
  }

  async function doKidsNuvioPush() {
    if (!window.generatedAddonUrl) {
      throw new Error(
        umT('setup.kidsPush.generateFirst', 'Generate the Kids setup before pushing it to Nuvio.')
      );
    }

    // Same staleness risk as the primary doPush() flow: refresh the
    // backend config and the generated collections snapshot from the
    // live wizard state before reading window.generatedAddonUrl /
    // window.generatedNuvioCollections below.
    statusEl.textContent = umT('setup.nuvioPush.refreshingBeforePush', 'Refreshing your latest catalog and collection edits…');
    await ensureFreshGeneratedStateForPush();

    const manifestUrl =
      window.generatedAddonUrl;

    const confirmed = window.confirm(
      umT('setup.kidsPush.confirmPrompt', 'Set up an isolated Nuvio Kids profile?\n\nUltra MAX will create or update the Kids profile, turn off shared add-ons and plugins, then replace that profile’s add-ons and collections with the restricted Kids setup.\n\nA backup of the existing Kids add-ons and collections will be saved in this browser first.')
    );

    if (!confirmed) {
      statusEl.textContent =
        umT('setup.kidsPush.cancelled', 'Kids profile setup cancelled. No changes were made.');

      statusEl.style.color =
        'var(--muted)';

      return;
    }

    statusEl.style.color = 'inherit';

    const originalKidsProfile =
      nuvioProfiles
        .map(normaliseKidsProfile)
        .find(profile =>
          profile.name
            .trim()
            .toLowerCase() === 'kids'
        ) || null;

    statusEl.textContent =
      umT('setup.kidsPush.creatingProfile', 'Creating or verifying the isolated Kids profile...');

    const kidsProfile =
      await ensureIsolatedKidsProfile(
        nuvioAccessToken,
        nuvioProfiles
      );

    statusEl.textContent =
      umT('setup.kidsPush.backingUp', 'Backing up the current Kids profile...');

    const existingAddons =
      await nuvioGetAddons(
        nuvioAccessToken,
        kidsProfile.profile_index
      );

    const existingCollections =
      await nuvioGetCollections(
        nuvioAccessToken,
        kidsProfile.profile_index
      );

    saveKidsNuvioBackup(
      originalKidsProfile || kidsProfile,
      existingAddons,
      existingCollections
    );

    const kidsCollections =
      getGeneratedKidsCollections();

    statusEl.textContent =
      umT('setup.kidsPush.installingAddon', 'Installing the restricted Ultra MAX Kids add-on...');

    await nuvioPushAddons(
      nuvioAccessToken,
      kidsProfile.profile_index,
      [
        {
          url: manifestUrl,
          name: 'Ultra MAX Kids',
          enabled: true
        }
      ]
    );

    statusEl.textContent =
      umT('setup.kidsPush.installingCollection', 'Installing the Ultra MAX Kids collection...');

    await nuvioPushCollections(
      nuvioAccessToken,
      kidsProfile.profile_index,
      kidsCollections
    );

    statusEl.textContent =
      umT('setup.kidsPush.verifying', 'Verifying the Kids profile...');

    const verifiedAddons =
      await nuvioGetAddons(
        nuvioAccessToken,
        kidsProfile.profile_index
      );

    const verifiedCollections =
      await nuvioGetCollections(
        nuvioAccessToken,
        kidsProfile.profile_index
      );

    const addonVerified =
      Array.isArray(verifiedAddons) &&
      verifiedAddons.length === 1 &&
      verifiedAddons[0].url ===
        manifestUrl &&
      verifiedAddons[0].enabled !== false;

    if (!addonVerified) {
      throw new Error(
        umT('setup.kidsPush.addonNotVerified', 'The Kids add-on push completed, but verification did not match the generated manifest.')
      );
    }

    const expectedIds =
      new Set(
        kidsCollections.map(
          collection => collection.id
        )
      );

    const actualIds =
      new Set(
        (
          Array.isArray(
            verifiedCollections
          )
            ? verifiedCollections
            : []
        ).map(
          collection => collection.id
        )
      );

    const collectionsVerified =
      expectedIds.size === actualIds.size &&
      Array.from(expectedIds).every(
        id => actualIds.has(id)
      );

    if (!collectionsVerified) {
      throw new Error(
        umT('setup.kidsPush.collectionsNotVerified', 'The Kids collections were pushed, but the verification result did not match.')
      );
    }

    statusEl.textContent =
      umT('setup.kidsPush.ready', 'Kids profile ready. It is isolated and contains only Ultra MAX Kids.');

    statusEl.style.color = '#4caf50';
  }

  loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('nuvio-email').value.trim();
    const password = document.getElementById('nuvio-password').value;

    if (!email || !password) {
      statusEl.textContent = umT('setup.nuvioPush.missingFields', 'Please enter your Nuvio email and password.');
      statusEl.style.color = '#ff6b6b';
      return;
    }

    if (!window.generatedAddonUrl) {
      statusEl.textContent = umT('setup.nuvioPush.generateFirst', 'Please generate your setup first before pushing to Nuvio.');
      statusEl.style.color = '#ff6b6b';
      return;
    }

    loginBtn.disabled = true;
    statusEl.style.color = 'inherit';
    statusEl.textContent = umT('setup.nuvioPush.loggingIn', 'Logging in...');

    try {
      const result = await nuvioLoginAndListProfiles(email, password);
      nuvioAccessToken = result.accessToken;
      nuvioProfiles = result.profiles;
      publishStep4Connection(result);
      document.getElementById('nuvio-password').value = '';

      if (
        document.body.classList.contains(
          'um-kids-mode'
        )
      ) {
        await doKidsNuvioPush();
        return;
      }

      if (nuvioProfiles.length === 1) {
        nuvioSelectedProfileIds = new Set([nuvioProfiles[0].profile_index]);
        publishStep4Selection();
        await doPush();
      } else {
        nuvioSelectedProfileIds = new Set();
        renderProfiles();
        updateConfirmState();
        loginStage.style.display = 'none';
        profileStage.style.display = 'block';
        statusEl.textContent = step3Copy('selectInstallProfiles', 'Select the profiles where the add-on should be installed.');
      }
    } catch (err) {
      statusEl.textContent = err.message || umT('setup.nuvioPush.loginFailed', 'Login failed.');
      statusEl.style.color = '#ff6b6b';
    } finally {
      loginBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener('click', () => {
    profileStage.style.display = 'none';
    loginStage.style.display = 'block';
    statusEl.textContent = '';
    nuvioAccessToken = null;
    nuvioProfiles = [];
    nuvioSelectedProfileIds = new Set();
  });

  confirmBtn.addEventListener('click', doPush);

  window.UltraMaxWizardContextAdapters =
    window.UltraMaxWizardContextAdapters || {};
  window.UltraMaxWizardContextAdapters.step4Finalise = Object.freeze({
    publishConnection: publishStep4Connection,
    publishProfiles: function(profiles){
      const context = sharedStep4WizardContext();
      return context ? context.setNuvioProfiles(profiles) : [];
    },
    publishMultiProfileSelection: publishStep4Selection,
    getLegacySelectedProfileIds: function(){
      return Array.from(nuvioSelectedProfileIds);
    },
    getV2SessionId: function(){
      return nuvioV2SessionId;
    },
    hydrateFromV2Session: hydrateStep4FromV2Session,
    hydrateFromSharedPrimary: hydrateStep4FromSharedPrimary,
    resetForSharedDisconnect: resetStep4ForSharedDisconnect
  });

  function nuvioProfileNameFor(profileIndex){
    const profile = nuvioProfiles.find(function(p){ return p.profile_index === profileIndex; });
    return (profile && profile.name) || umT('setup.nuvioPush.unnamedProfile', 'this profile');
  }

  async function doPush(){
    try {
      if(
        window.UltraMaxGlobalNuvioSetup &&
        typeof window.UltraMaxGlobalNuvioSetup.refresh === 'function'
      ){
        await window.UltraMaxGlobalNuvioSetup.refresh();
        if(typeof window.UltraMaxGlobalNuvioSetup.getV2SessionId === 'function'){
          nuvioV2SessionId = String(
            window.UltraMaxGlobalNuvioSetup.getV2SessionId() || ''
          ).trim();
        }
      }
    } catch (sessionError) {
      statusEl.textContent =
        sessionError && sessionError.message
          ? sessionError.message
          : 'Could not refresh the Nuvio connection.';
      statusEl.style.color = '#ff6b6b';
      return;
    }

    if (nuvioSelectedProfileIds.size === 0) {
      statusEl.textContent = umT('setup.nuvioPush.selectAtLeastOneProfile', 'Choose at least one Nuvio profile to install Ultra MAX.');
      statusEl.style.color = '#ff6b6b';
      return;
    }

    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    statusEl.style.color = 'inherit';

    // nuvioSelectedProfileIds only ever holds numeric profile_index values
    // (see toggleRowSelected / hydrateStep4FromSharedPrimary), which is what
    // the push request below and the backend's profile_id column expect —
    // never a profile UUID.
    const targetIds = Array.from(nuvioSelectedProfileIds);

    try {
      statusEl.textContent = umT('setup.nuvioPush.refreshingBeforePush', 'Refreshing your latest catalog and collection edits…');
      await ensureFreshGeneratedStateForPush();

      if(
        !window.UltraMaxV2NuvioInstall ||
        typeof window.UltraMaxV2NuvioInstall.installProfiles !== 'function'
      ){
        throw new Error('The verified Nuvio installer is unavailable. Reload Ultra MAX and try again.');
      }

      const results = await window.UltraMaxV2NuvioInstall.installProfiles({
        accessToken: nuvioAccessToken,
        sessionId: nuvioV2SessionId || null,
        profileIds: targetIds,
        manifestUrl: window.generatedAddonUrl,
        collections: window.generatedNuvioCollections || [],
        onStatus: (msg) => { statusEl.textContent = msg; }
      });

      const failures = results.filter(function(r){ return !r.ok; });
      if (failures.length) {
        // Full technical detail (HTTP status, backend error text) stays in
        // the console — the UI only ever shows the profile name + a
        // friendly reason, never raw backend/SQL/HTTP details.
        console.error('Ultra MAX Nuvio install failures:', failures);
      }

      if (failures.length === 0) {
        statusEl.textContent = results.length === 1
          ? umT('setup.nuvioPush.installedToOne', 'Installed to {name}.', { name: nuvioProfileNameFor(targetIds[0]) })
          : umT('setup.nuvioPush.installedToAll', 'Installed to all {count} profiles.', { count: results.length });
        statusEl.style.color = '#4caf50';
      } else if (failures.length === results.length) {
        statusEl.textContent = results.length === 1
          ? umT('setup.nuvioPush.installFailedOne', 'Could not install to {name}. Check the console for details.', { name: nuvioProfileNameFor(targetIds[0]) })
          : umT('setup.nuvioPush.installFailedAll', 'Could not install to any profile. Check the console for details.');
        statusEl.style.color = '#ff6b6b';
      } else {
        const failedNames = failures.map(function(f){ return nuvioProfileNameFor(f.profileId); }).join(', ');
        statusEl.textContent = umT(
          'setup.nuvioPush.installPartial',
          'Installed to {ok}/{total} profiles. Failed: {names} — check the console for details.',
          { ok: results.length - failures.length, total: results.length, names: failedNames }
        );
        statusEl.style.color = '#ffb74d';
      }
    } catch (err) {
      statusEl.textContent = err.message || umT('setup.nuvioPush.somethingWrong', 'Something went wrong. Please try again.');
      statusEl.style.color = '#ff6b6b';
    } finally {
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  }
})();
