function torboxRenderState(message){
  var statusEl = document.getElementById('torboxLibraryStatus');
  var disconnectBtn = document.getElementById('torboxDisconnectBtn');
  var scanBtn = document.getElementById('torboxScanBtn');
  var keyEl = document.getElementById('torboxLibraryApiKey');
  if(disconnectBtn) disconnectBtn.style.display = torboxLibraryConnected ? '' : 'none';
  if(scanBtn) scanBtn.style.display = torboxLibraryConnected && torboxLibraryPersisted && editToken ? '' : 'none';
  if(keyEl) keyEl.placeholder = torboxLibraryConnected
    ? 'Connected — leave blank to keep current key'
    : 'TorBox API key (optional if connected under Streams)';
  if(statusEl){
    statusEl.textContent = message || (torboxLibraryConnected
      ? (torboxLibraryPersisted ? 'Connected. You can scan the library now.' : 'Key verified. Generate/save this setup before scanning.')
      : 'Not connected. Existing TorBox Stream credentials can be reused.');
    statusEl.style.color = torboxLibraryConnected ? '#5ee6a8' : 'var(--muted)';
  }
  if(typeof cloudLibraryRenderSummary === 'function') cloudLibraryRenderSummary();
}

function torboxExistingDebridKey(){
  try {
    var providers = typeof debridProviders !== 'undefined' && Array.isArray(debridProviders) ? debridProviders : [];
    var match = providers.find(function(item){ return item && String(item.service || '').toLowerCase() === 'torbox' && item.apiKey; });
    return match ? String(match.apiKey || '').trim() : '';
  } catch(_error){
    return '';
  }
}

function torboxCandidateKey(){
  var keyEl = document.getElementById('torboxLibraryApiKey');
  var explicit = keyEl ? keyEl.value.trim() : '';
  return explicit || torboxExistingDebridKey();
}

function torboxSelectDefaultRows(){
  TORBOX_LIBRARY_IDS.forEach(function(id){ selected.add(id); });
  catalogOrder = normaliseCatalogOrder(selected, catalogOrder || []);
  if(typeof s2UpdateAll === 'function') s2UpdateAll();
}

async function torboxLibraryTestConnection(){
  var keyEl = document.getElementById('torboxLibraryApiKey');
  var statusEl = document.getElementById('torboxLibraryStatus');
  var btn = document.getElementById('torboxConnectBtn');
  var explicitKey = keyEl ? keyEl.value.trim() : '';
  var key = torboxCandidateKey();
  if(!key){
    if(statusEl){
      statusEl.textContent = torboxLibraryConnected
        ? 'Already connected. Enter a new key only if you want to replace it.'
        : 'Enter a TorBox API key or add TorBox under Streams first.';
      statusEl.style.color = '#ff7b8d';
    }
    return;
  }

  if(btn) btn.disabled = true;
  if(statusEl){ statusEl.textContent = explicitKey ? 'Checking TorBox…' : 'Checking your TorBox Streams connection…'; statusEl.style.color = 'var(--muted)'; }
  try{
    var res = await fetch(API_BASE + '/api/torbox-cloud/test', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({apiKey:key})
    });
    var data = await res.json();
    if(!res.ok) throw new Error(data.error || 'TorBox connection failed');

    torboxLibraryConnected = true;
    torboxDisconnectRequested = false;
    var enabledEl = document.getElementById('torboxLibraryEnabled');
    if(enabledEl) enabledEl.checked = true;
    torboxSelectDefaultRows();

    var passwordEl = document.getElementById('password');
    var rememberedPassword = (typeof _configPassword !== 'undefined' && _configPassword) ? _configPassword : '';
    var password = rememberedPassword || (passwordEl ? passwordEl.value : '');
    var savedNow = false;
    if(editToken && password){
      try{
        var body = explicitKey ? {apiKey:explicitKey} : {};
        var persistRes = await fetch(API_BASE + '/c/' + encodeURIComponent(editToken) + '/torbox/connect', {
          method:'POST',
          headers:{'Content-Type':'application/json','x-config-password':password},
          body:JSON.stringify(body)
        });
        var persistData = await persistRes.json();
        if(persistRes.ok && persistData.connected){
          torboxLibraryPersisted = true;
          savedNow = true;
          if(enabledEl) enabledEl.checked = persistData.enabled !== false;
          if(keyEl) keyEl.value = '';
        }
      }catch(_persistError){}
    }

    var reused = !explicitKey;
    torboxRenderState(savedNow
      ? (reused ? 'Connected using your saved TorBox Streams key. You can scan the library now.' : 'Connected and saved. You can scan the library now.')
      : (reused ? 'TorBox Streams key verified. Generate/save this setup once before scanning the library.' : 'Connected successfully. Generate/save this setup once before scanning the library.'));
  }catch(error){
    torboxLibraryConnected = false;
    torboxLibraryPersisted = false;
    if(statusEl){ statusEl.textContent = error.message || 'TorBox connection failed.'; statusEl.style.color = '#ff7b8d'; }
    if(typeof cloudLibraryRenderSummary === 'function') cloudLibraryRenderSummary();
  }finally{
    if(btn) btn.disabled = false;
  }
}

function torboxDisconnectLibrary(){
  torboxLibraryConnected = false;
  torboxLibraryPersisted = false;
  torboxDisconnectRequested = true;
  var keyEl = document.getElementById('torboxLibraryApiKey');
  if(keyEl) keyEl.value = '';
  var enabledEl = document.getElementById('torboxLibraryEnabled');
  if(enabledEl) enabledEl.checked = false;
  TORBOX_LIBRARY_IDS.forEach(function(id){ selected.delete(id); hidden.delete(id); });
  catalogOrder = (catalogOrder || []).filter(function(id){ return !TORBOX_LIBRARY_IDS.includes(id); });
  if(typeof s2UpdateAll === 'function') s2UpdateAll();
  torboxRenderState('Disconnected from Cloud Library locally. Your TorBox Streams/debrid connection is unchanged. Generate/save to apply this change.');
}

async function torboxScanLibrary(){
  var statusEl = document.getElementById('torboxLibraryStatus');
  var resultEl = document.getElementById('torboxScanSummary');
  var btn = document.getElementById('torboxScanBtn');
  if(!editToken || !torboxLibraryPersisted){
    if(statusEl){ statusEl.textContent = 'Generate/save this setup once before scanning the cloud library.'; statusEl.style.color = '#ff7b8d'; }
    return;
  }
  var passwordEl = document.getElementById('password');
  var rememberedPassword = (typeof _configPassword !== 'undefined' && _configPassword) ? _configPassword : '';
  var password = rememberedPassword || (passwordEl ? passwordEl.value : '');
  if(!password){
    if(statusEl){ statusEl.textContent = 'Enter the setup password before scanning.'; statusEl.style.color = '#ff7b8d'; }
    return;
  }
  if(btn) btn.disabled = true;
  if(statusEl){ statusEl.textContent = 'Scanning TorBox torrents, web downloads and Usenet…'; statusEl.style.color = 'var(--muted)'; }
  try{
    var res = await fetch(API_BASE + '/c/' + encodeURIComponent(editToken) + '/torbox/scan', {
      method:'POST',
      headers:{'x-config-password':password}
    });
    var data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Cloud scan failed');
    var info = data.summary || {};
    if(resultEl){
      resultEl.style.display = 'block';
      resultEl.textContent = (info.files||0) + ' video files · ' + (info.matched||0) + ' matched · ' +
        (info.unmatched||0) + ' need attention · ' + (info.movies||0) + ' movies · ' +
        (info.series||0) + ' series · ' + (info.episodes||0) + ' episodes';
    }
    torboxRenderState('Library scan complete. Matched titles use Ultra MAX metadata and private TorBox playback.');
  }catch(error){
    if(statusEl){ statusEl.textContent = error.message || 'Cloud scan failed.'; statusEl.style.color = '#ff7b8d'; }
  }finally{
    if(btn) btn.disabled = false;
  }
}
