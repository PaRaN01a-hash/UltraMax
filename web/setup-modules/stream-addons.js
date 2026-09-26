var streamAddonLabels = {};
var streamAddonManifestMeta = {};
var streamAddonProbeAttempted = new Set();

function getStreamStore(){
  return document.getElementById('streamAddons') || document.getElementById('quickStreamAddons');
}

function getStoredStreamAddons(){
  const box = getStreamStore();
  const raw = box ? (box.value || '') : '';
  return raw.split(/\n+/).map(x => x.trim()).filter(Boolean).slice(0, 8);
}

function normaliseStreamAddonLabels(labels, addons){
  const allowed = new Set((addons || getStoredStreamAddons()).map(function(url){
    return String(url || '').trim();
  }).filter(Boolean));
  const safe = {};

  if(!labels || typeof labels !== 'object' || Array.isArray(labels)) return safe;

  Object.keys(labels).slice(0, 8).forEach(function(url){
    if(!allowed.has(url)) return;
    const label = String(labels[url] || '').trim().slice(0, 60);
    if(label) safe[url] = label;
  });

  return safe;
}

function getStoredStreamAddonLabels(){
  streamAddonLabels = normaliseStreamAddonLabels(
    streamAddonLabels,
    getStoredStreamAddons()
  );
  return Object.assign({}, streamAddonLabels);
}

function setStoredStreamAddonLabels(labels){
  streamAddonLabels = normaliseStreamAddonLabels(
    labels,
    getStoredStreamAddons()
  );
  window.streamAddonLabels = streamAddonLabels;
  renderStreamAddonCards();
}

function setStoredStreamAddons(addons){
  const clean = (addons || [])
    .map(function(url){ return String(url || '').trim(); })
    .filter(Boolean)
    .slice(0, 8);

  const box = getStreamStore();
  if(box) box.value = clean.join('\n');

  streamAddonLabels = normaliseStreamAddonLabels(streamAddonLabels, clean);
  window.streamAddonLabels = streamAddonLabels;

  const toggle = document.getElementById('enableStreamBridge') || document.getElementById('quickStreamEnabled');
  if(toggle && clean.length) toggle.checked = true;

  renderStreamAddonCards();
}

window.checkStreamWizardAddon = async function(){
  const input = document.getElementById('streamWizardUrl');
  const result = document.getElementById('streamWizardResult');
  if(!input || !result) return;

  const url = input.value.trim();
  if(!url){
    result.innerHTML = umT(
      'setup.streams.pleasePasteAManifestUrlFirst',
      '<div class="stream-checking">⚠️ Please paste a manifest URL first.</div>'
    );
    return;
  }

  result.innerHTML = umT(
    'setup.streams.checkingAddon',
    '<div class="stream-checking">⏳ Checking addon...</div>'
  );

  try {
    const res = await fetch(API_BASE + '/api/stream-wizard/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifestUrl: url })
    });

    const manifest = await res.json().catch(() => ({}));

    if(!res.ok || !manifest.ok){
      throw new Error(manifest.error || ('HTTP ' + res.status));
    }

    if(manifest.supportsStreams === false){
      throw new Error(
        manifest.warning ||
        'This addon does not appear to provide stream resources.'
      );
    }

    const addons = getStoredStreamAddons();
    if(!addons.includes(url)){
      addons.push(url);
      setStoredStreamAddons(addons);
    }

    streamAddonManifestMeta[url] = {
      name: String(manifest.name || '').trim(),
      version: manifest.version || null,
      catalogCount: Number(manifest.catalogCount) || 0,
      supportsStreams: manifest.supportsStreams !== false
    };
    streamAddonProbeAttempted.add(url);

    if(typeof markStreamProviderAdded === 'function'){
      markStreamProviderAdded(url);
    }

    renderStreamAddonCards();

    const versionText = manifest.version
      ? ' (v' + manifest.version + ')'
      : '';

    const warningText = manifest.warning
      ? '<div style="margin-top:6px;color:#fbbf24;font-size:11px;">⚠️ ' +
        escapeHtml(manifest.warning) +
        '</div>'
      : '';

    const catalogText = Number(manifest.catalogCount) > 0
      ? '<div style="margin-top:7px;color:#9cc7ff;font-size:11px;">📚 This addon also exposes ' +
        Number(manifest.catalogCount) +
        ' catalog' + (Number(manifest.catalogCount) === 1 ? '' : 's') +
        '. You can install the full addon in Nuvio from its card below.</div>'
      : '';

    result.innerHTML =
      '<div class="stream-checking" style="color:#00d2a0;">✅ <strong>' +
      escapeHtml(manifest.name || 'Stream addon') +
      '</strong>' +
      escapeHtml(versionText) +
      ' added successfully!' +
      warningText +
      catalogText +
      '</div>';

    input.value = '';

    const instrBox = document.getElementById('streamQuickInstructions');
    if(instrBox) instrBox.style.display = 'none';

  } catch(e) {
    result.innerHTML = umT(
      'setup.streams.couldNotLoadAddon',
      '<div class="stream-checking" style="color:#FF3D5A;">❌ Could not load addon: {message}. Make sure the URL ends in /manifest.json</div>',
      {message: e.message}
    );
  }
};

function shortStreamUrl(url){
  try{
    const u = new URL(url);
    return '🔒 ' + u.hostname + ' / configured manifest';
  }catch(e){
    return '🔒 configured manifest';
  }
}

function streamAddonDisplayName(url){
  const custom = String(streamAddonLabels[url] || '').trim();
  const detected = String((streamAddonManifestMeta[url] || {}).name || '').trim();
  return custom || detected || streamWizardNameFromUrl(url);
}

function renderStreamAddonCards(){
  const list = document.getElementById('wizardPrettyStreamList');
  if(!list) return;

  const addons = getStoredStreamAddons();

  if(!addons.length){
    list.innerHTML = umT('setup.streams.noStreamAddonsAddedYet', '<em>No stream addons added yet.</em>');
    return;
  }

  streamAddonLabels = normaliseStreamAddonLabels(streamAddonLabels, addons);
  window.streamAddonLabels = streamAddonLabels;

  list.innerHTML = addons.map((url, i) => {
    const name = streamAddonDisplayName(url);
    const meta = streamAddonManifestMeta[url] || {};
    const catalogCount = Number(meta.catalogCount) || 0;
    const catalogAction = catalogCount > 0
      ? '<div class="pretty-stream-catalogs">📚 ' + catalogCount +
        ' catalog' + (catalogCount === 1 ? '' : 's') +
        ' available <button type="button" class="pretty-stream-btn catalog-install" onclick="installFullStreamAddonInNuvio(' + i + ',this)">Install full addon in Nuvio</button></div>'
      : '';

    return `
      <div class="pretty-stream-card" data-stream-index="${i}">
        <div class="pretty-stream-head">
          <span>${escapeHtml(name)}</span>
          <span class="pretty-stream-pill">Priority ${i + 1}</span>
        </div>
        <label class="pretty-stream-rename">
          <span>Display name</span>
          <input type="text" maxlength="60" value="${escapeHtml(name)}" onblur="renameStreamAddon(${i},this.value)" />
        </label>
        <div class="pretty-stream-url">${escapeHtml(shortStreamUrl(url))}</div>
        ${catalogAction}
        <div class="pretty-stream-actions">
          <button type="button" class="pretty-stream-btn" onclick="moveStreamAddon(${i},-1)" ${i === 0 ? 'disabled' : ''}>↑ Up</button>
          <button type="button" class="pretty-stream-btn" onclick="moveStreamAddon(${i},1)" ${i === addons.length - 1 ? 'disabled' : ''}>↓ Down</button>
          <button type="button" class="pretty-stream-btn" onclick="copyStreamAddon(${i})">Copy</button>
          <button type="button" class="pretty-stream-btn danger" onclick="removeStreamAddon(${i})">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  addons.forEach(function(url, index){
    if(streamAddonProbeAttempted.has(url)) return;
    streamAddonProbeAttempted.add(url);
    setTimeout(function(){
      inspectStoredStreamAddon(index, true);
    }, 100 + (index * 150));
  });
}

function streamWizardNameFromUrl(url){
  const u = String(url || '').toLowerCase();
  if(u.includes('comet')) return 'Comet | TB';
  if(u.includes('aio')) return 'AIOStreams';
  if(u.includes('torrentio')) return 'Torrentio';
  if(u.includes('stremthru')) return 'StremThru';
  return 'Stream Addon';
}

async function inspectStoredStreamAddon(i, silent){
  const addons = getStoredStreamAddons();
  const url = addons[i];
  if(!url) return;

  try {
    const res = await fetch(API_BASE + '/api/stream-wizard/check', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({manifestUrl:url})
    });
    const manifest = await res.json().catch(function(){ return {}; });
    if(!res.ok || !manifest.ok) throw new Error(manifest.error || ('HTTP ' + res.status));

    streamAddonManifestMeta[url] = {
      name:String(manifest.name || '').trim(),
      version:manifest.version || null,
      catalogCount:Number(manifest.catalogCount) || 0,
      supportsStreams:manifest.supportsStreams !== false
    };

    renderStreamAddonCards();
  } catch(e) {
    if(!silent){
      const result = document.getElementById('streamWizardResult');
      if(result){
        result.innerHTML = '<div class="stream-checking" style="color:#fbbf24;">Could not inspect that addon right now.</div>';
      }
    }
  }
}

function renameStreamAddon(i, label){
  const addons = getStoredStreamAddons();
  const url = addons[i];
  if(!url) return;

  const clean = String(label || '').trim().slice(0, 60);
  if(clean) streamAddonLabels[url] = clean;
  else delete streamAddonLabels[url];

  window.streamAddonLabels = streamAddonLabels;
  renderStreamAddonCards();
}

function moveStreamAddon(i, direction){
  const addons = getStoredStreamAddons();
  const target = i + Number(direction || 0);
  if(i < 0 || target < 0 || i >= addons.length || target >= addons.length) return;

  const tmp = addons[i];
  addons[i] = addons[target];
  addons[target] = tmp;
  setStoredStreamAddons(addons);
}

function addCheckedStreamAddon(url){
  const decoded = String(url || '')
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"')
    .replace(/&#039;/g,"'");

  const addons = getStoredStreamAddons();
  if(!addons.includes(decoded)) addons.push(decoded);

  setStoredStreamAddons(addons);
  if(typeof markStreamProviderAdded === 'function') markStreamProviderAdded(decoded);

  const result = document.getElementById('streamWizardResult');
  if(result) result.innerHTML += '<div class="stream-added">✅ Added to your Ultra MAX stream addon list.</div>';
}

function removeStreamAddon(i){
  const addons = getStoredStreamAddons();
  const removed = addons[i];
  addons.splice(i, 1);
  if(removed){
    delete streamAddonLabels[removed];
    delete streamAddonManifestMeta[removed];
    streamAddonProbeAttempted.delete(removed);
  }
  setStoredStreamAddons(addons);
}

async function copyStreamAddon(i){
  const addons = getStoredStreamAddons();
  const url = addons[i];
  if(!url) return;

  try{
    await navigator.clipboard.writeText(url);
  }catch(e){
    prompt('Copy stream addon URL', url);
  }
}

function currentNuvioProfileIndex(){
  const keys = ['ultramax.v2.nuvioProfileIndex'];
  for(const key of keys){
    try{
      const value = sessionStorage.getItem(key) || localStorage.getItem(key);
      const n = Number(value);
      if(Number.isSafeInteger(n) && n >= 0) return n;
    }catch(e){}
  }
  return null;
}

async function installFullStreamAddonInNuvio(i, button){
  const addons = getStoredStreamAddons();
  const manifestUrl = addons[i];
  if(!manifestUrl) return;

  const globalNuvio = window.UltraMaxGlobalNuvioSetup;
  const sessionId = globalNuvio && typeof globalNuvio.getV2SessionId === 'function'
    ? String(globalNuvio.getV2SessionId() || '')
    : '';
  const profileIndex = currentNuvioProfileIndex();
  const result = document.getElementById('streamWizardResult');

  if(!sessionId || profileIndex === null){
    if(result){
      result.innerHTML = '<div class="stream-checking" style="color:#fbbf24;">Connect Nuvio from the Ultra MAX home screen first, then return here.</div>';
    }
    return;
  }

  const previousText = button ? button.textContent : '';
  if(button){
    button.disabled = true;
    button.textContent = 'Installing…';
  }

  try{
    const response = await fetch('/api/v2/nuvio/addons/install', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        sessionId:sessionId,
        profileIndex:profileIndex,
        manifestUrl:manifestUrl,
        name:streamAddonDisplayName(manifestUrl)
      })
    });
    const payload = await response.json().catch(function(){ return {}; });
    if(!response.ok || !payload.ok){
      throw new Error(payload.message || 'Nuvio did not accept the addon.');
    }

    if(result){
      result.innerHTML = '<div class="stream-checking" style="color:#00d2a0;">✅ ' +
        escapeHtml(payload.result && payload.result.alreadyInstalled
          ? 'That full addon is already installed in Nuvio.'
          : 'Full addon installed in Nuvio. Its own catalogs can now be used there.') +
        '</div>';
    }
  }catch(e){
    if(result){
      result.innerHTML = '<div class="stream-checking" style="color:#FF3D5A;">❌ ' +
        escapeHtml(e.message || 'Could not install the addon in Nuvio.') +
        '</div>';
    }
  }finally{
    if(button){
      button.disabled = false;
      button.textContent = previousText || 'Install full addon in Nuvio';
    }
  }
}

document.addEventListener('DOMContentLoaded', function(){
  window.streamAddonLabels = streamAddonLabels;
  renderStreamAddonCards();
});
