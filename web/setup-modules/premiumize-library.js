function premiumizeRenderState(message){
  var statusEl = document.getElementById('premiumizeLibraryStatus');
  var disconnectBtn = document.getElementById('premiumizeDisconnectBtn');
  var scanBtn = document.getElementById('premiumizeScanBtn');
  var keyEl = document.getElementById('premiumizeApiKey');
  if(disconnectBtn) disconnectBtn.style.display = premiumizeLibraryConnected ? '' : 'none';
  if(scanBtn) scanBtn.style.display = premiumizeLibraryConnected && premiumizeLibraryPersisted && editToken ? '' : 'none';
  if(keyEl) keyEl.placeholder = premiumizeLibraryConnected ? 'Connected — leave blank to keep current key' : 'Premiumize API key';
  if(statusEl){
    statusEl.textContent = message || (premiumizeLibraryConnected
      ? (premiumizeLibraryPersisted ? 'Connected. You can scan the library now.' : 'Key verified. Generate/save this setup before scanning.')
      : 'Not connected.');
    statusEl.style.color = premiumizeLibraryConnected ? '#5ee6a8' : 'var(--muted)';
  }
  if(typeof cloudLibraryRenderSummary === 'function') cloudLibraryRenderSummary();
}

function premiumizeSelectDefaultRows(){
  PREMIUMIZE_LIBRARY_IDS.forEach(function(id){ selected.add(id); });
  catalogOrder = normaliseCatalogOrder(selected, catalogOrder || []);
  if(typeof s2UpdateAll === 'function') s2UpdateAll();
}

async function premiumizeTestConnection(){
  var keyEl = document.getElementById('premiumizeApiKey');
  var statusEl = document.getElementById('premiumizeLibraryStatus');
  var btn = document.getElementById('premiumizeConnectBtn');
  var key = keyEl ? keyEl.value.trim() : '';
  if(!key){
    if(statusEl){
      statusEl.textContent = premiumizeLibraryConnected
        ? 'Already connected. Enter a new key only if you want to replace it.'
        : 'Enter your Premiumize API key first.';
      statusEl.style.color = '#ff7b8d';
    }
    return;
  }
  if(btn) btn.disabled = true;
  if(statusEl){ statusEl.textContent = 'Checking Premiumize…'; statusEl.style.color = 'var(--muted)'; }
  try{
    var res = await fetch(API_BASE + '/api/premiumize/test', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({apiKey:key})
    });
    var data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Premiumize connection failed');

    premiumizeLibraryConnected = true;
    premiumizeDisconnectRequested = false;
    var enabledEl = document.getElementById('premiumizeLibraryEnabled');
    if(enabledEl) enabledEl.checked = true;
    premiumizeSelectDefaultRows();

    // If this is an already-saved setup, persist just the private cloud key
    // immediately so Scan can work without forcing a full Generate cycle.
    // New/preauth setups still wait for Generate, where the ordinary config
    // save owns the password and manifest transition.
    var passwordEl = document.getElementById('password');
    var rememberedPassword = (typeof _configPassword !== 'undefined' && _configPassword) ? _configPassword : '';
    var password = rememberedPassword || (passwordEl ? passwordEl.value : '');
    var savedNow = false;
    if(editToken && password){
      try{
        var persistRes = await fetch(API_BASE + '/c/' + encodeURIComponent(editToken) + '/premiumize/connect', {
          method:'POST',
          headers:{'Content-Type':'application/json','x-config-password':password},
          body:JSON.stringify({apiKey:key})
        });
        var persistData = await persistRes.json();
        if(persistRes.ok && persistData.connected){
          premiumizeLibraryPersisted = true;
          savedNow = true;
          if(enabledEl) enabledEl.checked = persistData.enabled !== false;
          if(keyEl) keyEl.value = '';
        }
      }catch(_persistError){}
    }

    premiumizeRenderState(savedNow
      ? 'Connected and saved. You can scan the library now; Generate/save later to apply the selected Cloud Library rows to your manifest.'
      : 'Connected successfully. Generate/save this setup once before scanning the library.');
  }catch(error){
    premiumizeLibraryConnected = false;
    premiumizeLibraryPersisted = false;
    if(statusEl){ statusEl.textContent = error.message || 'Premiumize connection failed.'; statusEl.style.color = '#ff7b8d'; }
  }finally{
    if(btn) btn.disabled = false;
  }
}

function premiumizeDisconnectLibrary(){
  premiumizeLibraryConnected = false;
  premiumizeLibraryPersisted = false;
  premiumizeDisconnectRequested = true;
  var keyEl = document.getElementById('premiumizeApiKey');
  if(keyEl) keyEl.value = '';
  var enabledEl = document.getElementById('premiumizeLibraryEnabled');
  if(enabledEl) enabledEl.checked = false;
  PREMIUMIZE_LIBRARY_IDS.forEach(function(id){ selected.delete(id); hidden.delete(id); });
  catalogOrder = (catalogOrder || []).filter(function(id){ return !PREMIUMIZE_LIBRARY_IDS.includes(id); });
  if(typeof s2UpdateAll === 'function') s2UpdateAll();
  premiumizeRenderState('Disconnected locally. Generate/save to remove the stored Premiumize connection.');
}

async function premiumizeScanLibrary(){
  var statusEl = document.getElementById('premiumizeLibraryStatus');
  var resultEl = document.getElementById('premiumizeScanSummary');
  var btn = document.getElementById('premiumizeScanBtn');
  if(!editToken || !premiumizeLibraryPersisted){
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
  if(statusEl){ statusEl.textContent = 'Scanning Premiumize and matching titles…'; statusEl.style.color = 'var(--muted)'; }
  try{
    var res = await fetch(API_BASE + '/c/' + encodeURIComponent(editToken) + '/premiumize/scan', {
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
    premiumizeRenderState('Library scan complete. Matched titles will use TMDB artwork and Premiumize playback.');
  }catch(error){
    if(statusEl){ statusEl.textContent = error.message || 'Cloud scan failed.'; statusEl.style.color = '#ff7b8d'; }
  }finally{
    if(btn) btn.disabled = false;
  }
}
