async function verifyKey(type) {
  const ids = {
    tmdb: "tmdbKey", mdblist: "mdblistKey", tvdb: "tvdbKey", rpdb: "rpdbKey", tp: "tpKey",
    fanart: "fanartKey", omdb: "omdbKey", gemini: "googleAiKey"
  };
  let key = "";
  const el = document.getElementById(ids[type]);
  key = el ? el.value.trim() : "";
  const btn = document.getElementById("verify-"+type);
  const result = document.getElementById("result-"+type);
  if(result) { result.className = "verify-result"; }
  if(!key) {
    if(result) { result.className = "verify-result fail"; result.textContent = umT('setup.streams.enterAKeyFirst', "Enter a key first"); }
    return;
  }
  if(btn) { btn.dataset.label = btn.textContent; btn.textContent = umT('setup.streams.checking2', "Checking..."); btn.disabled = true; }
  try {
    const tvdbPin = type === 'tvdb'
      ? String((document.getElementById('tvdbPin') || {}).value || '').trim()
      : '';
    const verificationUrl = type === 'tvdb'
      ? '/api/v2/providers/verify'
      : '/verify/' + encodeURIComponent(type);
    const verificationBody = type === 'tvdb'
      ? Object.assign({ provider: 'tvdb', key: key }, tvdbPin ? { pin: tvdbPin } : {})
      : { key: key };
    const r = await fetch(verificationUrl, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(verificationBody)
    });
    const d = await r.json();
    if(result) {
      result.className = d.valid ? "verify-result ok" : "verify-result fail";
      result.textContent = (d.valid ? "✓ " : "✗ ") + (d.message || (d.valid ? "Valid key" : "Invalid key"));
    }
  } catch(e) {
    if(result) { result.className = "verify-result fail"; result.textContent = umT('setup.streams.couldNotVerify', "✗ Could not verify"); }
  }
  if(btn) { btn.textContent = btn.dataset.label || "Check"; btn.disabled = false; }
  updateDiscoveryCapabilityUi();
}

// Reused by loadConfigByToken/restoreDraftState/restoreFormState after they
// programmatically populate mdblistKey. A key that came back from a saved
// Ultra MAX token/draft was already accepted and stored — mark it Set/green
// the same way verifyKey() does on a live success, without calling the
// MDBList API (avoids unnecessary requests/rate limiting on every load).
// Do NOT call this for a key the user is still typing and hasn't saved yet.
function restoreTmdbVerifiedState(){
  var input = document.getElementById('tmdbKey');
  var result = document.getElementById('result-tmdb');
  if(!result) return;
  var key = input ? input.value.trim() : '';
  if(key){
    result.className = 'verify-result ok';
    result.textContent = '✓ ' + umT('setup.discoveryProviders.savedKey', 'Saved key');
  } else {
    result.className = 'verify-result';
    result.textContent = '';
  }
}

function restoreTvdbVerifiedState(){
  var input = document.getElementById('tvdbKey');
  var result = document.getElementById('result-tvdb');
  var key = input ? input.value.trim() : '';
  if(!result) return;
  if(key){
    result.className = 'verify-result ok';
    result.textContent = '✓ ' + umT('setup.discoveryProviders.savedKey', 'Saved key');
  } else {
    result.className = 'verify-result';
    result.textContent = '';
  }
}

function restoreMdblistVerifiedState(){
  var input = document.getElementById('mdblistKey');
  var result = document.getElementById('result-mdblist');
  var key = input ? input.value.trim() : '';
  if(result){
    if(key){
      result.className = 'verify-result ok';
      result.textContent = '✓ ' + umT('setup.mdblist.restoredSavedKey', 'Saved key');
    } else {
      result.className = 'verify-result';
      result.textContent = '';
    }
  }
  restoreTmdbVerifiedState();
  restoreTvdbVerifiedState();
  updateDiscoveryCapabilityUi();
}

(function(){
  var mdblistInput = document.getElementById('mdblistKey');
  var mdblistResult = document.getElementById('result-mdblist');
  if(mdblistInput && mdblistResult){
    mdblistInput.addEventListener('input', function(){
      mdblistResult.className = 'verify-result';
      mdblistResult.textContent = '';
    });
  }
  ['tvdbKey','tvdbPin'].forEach(function(id){
    var tvdbInput = document.getElementById(id);
    var tvdbResult = document.getElementById('result-tvdb');
    if(tvdbInput && tvdbResult){
      tvdbInput.addEventListener('input', function(){
        tvdbResult.className = 'verify-result';
        tvdbResult.textContent = '';
      });
    }
  });
  var tmdbInput = document.getElementById('tmdbKey');
  var tmdbResult = document.getElementById('result-tmdb');
  if(tmdbInput && tmdbResult){
    tmdbInput.addEventListener('input', function(){
      tmdbResult.className = 'verify-result';
      tmdbResult.textContent = '';
    });
  }
})();
