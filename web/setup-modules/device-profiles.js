// ── DEVICE PROFILES ──
// A profile is a near-complete alternate config — catalogs, collections,
// streamAddons, debrid settings, streamFormat, everything the wizard
// tracks (see buildConfigPayloadFromForm) except the account password —
// layered on top of the current token. Each profile gets its own install
// URL (?profile=<id>). "Load" pulls a profile's full settings back into
// this form so it can be reviewed/edited, then re-saved onto that same
// profile instead of creating a new one.
window.activeDeviceProfileId = null;
window.activeDeviceProfileName = null;
window.deviceProfiles = [];

async function saveDeviceProfile(){
  const nameEl = document.getElementById('deviceProfileName');
  const resultEl = document.getElementById('deviceProfileResult');
  const token = window.generatedToken || editToken;
  const pass = (document.getElementById('password')||{}).value;

  if (!token) { resultEl.textContent = umT('setup.deviceProfiles.generateYourSetupFirst', 'Generate your setup first.'); return; }

  const isUpdate = !!window.activeDeviceProfileId;
  const name = (nameEl.value || '').trim() || window.activeDeviceProfileName;
  if (!name) { resultEl.textContent = umT('setup.deviceProfiles.giveTheProfileAName', 'Give the profile a name.'); return; }

  // Mirrors the confirm() in generate() for the opposite mistake: without
  // this, a profile left "loaded" (banner easy to miss on Step 4) while the
  // form has since been changed back toward different settings would have
  // those settings silently overwrite this profile's stored catalogs/config
  // with no warning at all.
  if (isUpdate) {
    const proceed = window.confirm(umT('setup.deviceProfiles.thisWillOverwriteThe', 'This will overwrite the "') + name + '" profile with your CURRENT form selections (catalogs, settings, etc). If you\'ve been editing something else since you loaded this profile, those changes will replace it.\n\nContinue and update "' + name + '"?');
    if (!proceed) return;
  }

  resultEl.textContent = isUpdate ? 'Updating…' : 'Saving…';
  try {
    const overrides = buildConfigPayloadFromForm();
    const endpoint = isUpdate
      ? API_BASE + '/c/' + token + '/profiles/' + window.activeDeviceProfileId + '/update'
      : API_BASE + '/c/' + token + '/profiles';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass, name: name, overrides: overrides })
    });
    const data = await res.json();
    if (!res.ok) { resultEl.textContent = data.error || 'Could not save profile.'; return; }

    const profileId = isUpdate ? window.activeDeviceProfileId : data.id;

    // Collections are derived from the current catalog selection, same as
    // the base save flow — snapshot them onto this profile too.
    if (typeof buildCollectionsExport === 'function') {
      fetch(DISPLAY_URL + '/c/' + token + '/collections?profile=' + profileId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collections: buildCollectionsExport(), replace: true })
      }).catch(function(){});
    }

    nameEl.value = '';
    setActiveDeviceProfile(profileId, data.name);
    resultEl.textContent = (isUpdate ? 'Updated "' : 'Saved "') + data.name + '".';
    loadDeviceProfilesList(token);
  } catch (e) {
    resultEl.textContent = umT('setup.deviceProfiles.networkError', 'Network error: ') + (e.message || e);
  }
}

function setActiveDeviceProfile(id, name, skipStatusRefresh){
  window.activeDeviceProfileId = id || null;
  window.activeDeviceProfileName = name || null;
  syncUltraMaxWizardContext('setActiveDeviceProfile');
  const banner = document.getElementById('deviceProfileEditingBanner');
  const nameEl = document.getElementById('deviceProfileName');
  const saveBtn = document.getElementById('saveDeviceProfileBtn');
  if (id) {
    if (banner) {
      banner.style.display = 'flex';
      const editingNameEl = banner.querySelector('.dp-editing-name');
      if (editingNameEl) editingNameEl.textContent = name || '';
    }
    if (nameEl) nameEl.placeholder = umT('setup.deviceProfiles.leaveBlankToKeep', 'Leave blank to keep "{name}"', {name: name});
    if (saveBtn) saveBtn.textContent = umT('setup.deviceProfiles.updateProfile', 'Update Profile');
  } else {
    if (banner) banner.style.display = 'none';
    if (nameEl) nameEl.placeholder = umT('setup.step4.profiles.namePlaceholder', 'Profile name, e.g. 4K TV');
    if (saveBtn) saveBtn.textContent = umT('setup.deviceProfiles.saveProfile', 'Save Profile');
  }

  // Trakt/Simkl can belong to the active Device Profile. Keep their controls
  // tied to the selected profile so Connect/Disconnect is never ambiguous.
  if (typeof updateProfileIntegrationButtonLabels === 'function') {
    updateProfileIntegrationButtonLabels();
  }
  if (typeof renderProfileIntegrationScope === 'function') {
    ['trakt','simkl'].forEach(function(provider){
      renderProfileIntegrationScope(
        provider,
        (window.umIntegrationScopes && window.umIntegrationScopes[provider]) || 'none'
      );
    });
  }

  const token = window.generatedToken || editToken;
  if (token && !skipStatusRefresh) refreshAllIntegrationStatuses(token);
}

function clearActiveDeviceProfile(){
  setActiveDeviceProfile(null, null);
  const resultEl = document.getElementById('deviceProfileResult');
  if (resultEl) resultEl.textContent = '';
}

async function loadDeviceProfileIntoEditor(token, profileId, name){
  const resultEl = document.getElementById('deviceProfileResult');
  if (resultEl) resultEl.textContent = umT('setup.deviceProfiles.loading', 'Loading "') + name + '"…';
  await loadConfigByToken(token, profileId);
  setActiveDeviceProfile(profileId, name, true);
  if (resultEl) resultEl.textContent = umT('setup.deviceProfiles.editing', 'Editing "') + name + '" — change settings above, then Update Profile.';
  setStep(1);
}

async function loadDeviceProfilesList(token){
  const listEl = document.getElementById('deviceProfileList');
  if (!listEl || !token) return;
  try {
    const res = await fetch(API_BASE + '/c/' + token + '/profiles');
    const data = await res.json();
    const profiles = Array.isArray(data.profiles) ? data.profiles : [];

    if(window.activeDeviceProfileId && !window.activeDeviceProfileName){
      const active = profiles.find(function(profile){
        return profile && profile.id === window.activeDeviceProfileId;
      });
      if(active) setActiveDeviceProfile(active.id, active.name, true);
    }

    renderDeviceProfileRows(token, profiles);
  } catch (e) {
    listEl.innerHTML = '';
  }
}

function renderDeviceProfileRows(token, profiles){
  window.deviceProfiles = Array.isArray(profiles) ? profiles : [];
  profiles = window.deviceProfiles;

  const listEl = document.getElementById('deviceProfileList');
  if (!listEl) return;

  const summaryEl = document.getElementById('deviceProfileSummaryText');
  if (summaryEl) {
    summaryEl.textContent = profiles.length
      ? (profiles.length + ' profile' + (profiles.length === 1 ? '' : 's'))
      : 'No profiles yet';
  }

  if (!profiles.length) {
    listEl.innerHTML = umT('setup.deviceProfiles.noDeviceProfilesYet', '<div style="font-size:11px;color:var(--faint);">No device profiles yet.</div>');
    return;
  }

  listEl.innerHTML = profiles.map(function(p){
    const url = DISPLAY_URL + '/c/' + token + '/p/' + encodeURIComponent(p.id) + '/manifest.json';
    const catalogCount = Array.isArray(p.overrides && p.overrides.catalogs) ? p.overrides.catalogs.length : 0;
    const sub = catalogCount ? (catalogCount + ' rows · own settings') : 'inherits base settings';
    const safeName = escapeHtmlUM(p.name);
    const clickName = safeName.replace(/'/g,"\\'");
    return '<div style="display:flex;align-items:center;gap:8px;background:var(--hover);border:1px solid var(--border2);border-radius:8px;padding:8px 10px;flex-wrap:wrap;">' +
      '<div style="flex:1;min-width:180px;">' +
        '<div style="font-size:12px;font-weight:600;color:#fff;">' + safeName + '</div>' +
        '<div style="font-size:10px;color:var(--faint);">' + escapeHtmlUM(sub) + '</div>' +
        renderDeviceProfileAccounts(p) +
      '</div>' +
      '<button type="button" onclick="loadDeviceProfileIntoEditor(\'' + token + '\',\'' + p.id + '\',\'' + clickName + '\')" style="background:transparent;border:1px solid var(--border2);color:var(--text);font-size:11px;padding:6px 10px;border-radius:6px;cursor:pointer;flex-shrink:0;">Load</button>' +
      '<button type="button" onclick="openDeviceProfileAccounts(\'' + token + '\',\'' + p.id + '\',\'' + clickName + '\')" style="background:rgba(67,226,180,.10);border:1px solid rgba(67,226,180,.35);color:#55e6b6;font-size:11px;padding:6px 10px;border-radius:6px;cursor:pointer;flex-shrink:0;">Accounts</button>' +
      '<button type="button" onclick="copyDeviceProfileUrl(this,\'' + url.replace(/'/g,"\\'") + '\')" style="background:rgba(123,47,255,.15);border:1px solid rgba(123,47,255,.3);color:var(--violet2);font-size:11px;padding:6px 10px;border-radius:6px;cursor:pointer;flex-shrink:0;">Copy URL</button>' +
      '<button type="button" onclick="deleteDeviceProfile(\'' + token + '\',\'' + p.id + '\')" style="background:transparent;border:1px solid var(--border2);color:var(--muted);font-size:11px;padding:6px 10px;border-radius:6px;cursor:pointer;flex-shrink:0;">Delete</button>' +
    '</div>';
  }).join('');
}

function escapeHtmlUM(s){
  return String(s || '').replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}


function renderDeviceProfileAccount(provider, account, fallbackUser){
  account = account && typeof account === 'object' ? account : {};
  const username = String(account.username || fallbackUser || '').trim();
  const connected = !!account.connected || !!username;
  const scope = account.scope || (username ? 'profile' : 'none');
  const label = provider === 'simkl' ? 'SIMKL' : 'Trakt';

  if(!connected){
    return '<span style="color:var(--faint);">' + label + ': Not connected</span>';
  }

  const scopeText = scope === 'profile'
    ? 'this profile'
    : scope === 'base'
      ? 'inherited'
      : 'connected';
  const accent = scope === 'profile' ? '#55e6b6' : 'var(--violet2)';
  const identity = username ? escapeHtmlUM(username) : 'Connected';

  return '<span style="color:' + accent + ';">' +
    label + ': ' + identity +
    ' <em style="font-style:normal;opacity:.8;">(' + scopeText + ')</em>' +
  '</span>';
}

function renderDeviceProfileAccounts(profile){
  const accounts = profile && profile.accounts ? profile.accounts : {};
  const overrides = profile && profile.overrides ? profile.overrides : {};
  return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:5px;font-size:10px;line-height:1.35;">' +
    renderDeviceProfileAccount('simkl', accounts.simkl, overrides.profileSimklUser) +
    '<span style="color:var(--border2);">•</span>' +
    renderDeviceProfileAccount('trakt', accounts.trakt, overrides.profileTraktUser) +
  '</div>';
}

async function openDeviceProfileAccounts(token, profileId, name){
  await loadDeviceProfileIntoEditor(token, profileId, name);

  const details = document.getElementById('integrationsDetails');
  if(details) details.open = true;

  if(typeof updateProfileIntegrationButtonLabels === 'function'){
    updateProfileIntegrationButtonLabels();
  }

  setTimeout(function(){
    if(details && typeof details.scrollIntoView === 'function'){
      details.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 120);
}

function copyDeviceProfileUrl(btn, url){
  const orig = btn.textContent;
  navigator.clipboard.writeText(url).catch(function(){
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  });
  btn.textContent = umT('setup.deviceProfiles.copied', 'Copied!');
  setTimeout(function(){ btn.textContent = orig; }, 1500);
}

async function deleteDeviceProfile(token, profileId){
  const pass = (document.getElementById('password')||{}).value;
  if (!pass) { alert(umT('setup.deviceProfiles.enterYourPasswordAboveThenTry', 'Enter your password above, then try deleting again.')); return; }
  if (!confirm(umT('setup.deviceProfiles.deleteThisProfileItsInstallUrl', 'Delete this profile? Its install URL will stop working.'))) return;
  try {
    const res = await fetch(API_BASE + '/c/' + token + '/profiles/' + profileId + '/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Could not delete profile.'); return; }
    if (window.activeDeviceProfileId === profileId) clearActiveDeviceProfile();
    loadDeviceProfilesList(token);
  } catch (e) {
    alert(umT('setup.deviceProfiles.networkError2', 'Network error: ') + (e.message || e));
  }
}
