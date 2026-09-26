function showResult(token){
  const modal = document.getElementById('resultModal');
  const el = document.getElementById('resultToken');
  const manifestUrl = DISPLAY_URL + '/c/' + token + '/manifest.json';
  if(el) el.value = manifestUrl;
  if(modal) modal.style.display = 'flex';
}

function closeModal(){
  const modal = document.getElementById('resultModal');
  if(modal) modal.style.display = 'none';
}

function copyToken(){
  const el = document.getElementById('resultToken');
  if(!el) return;

  el.focus();
  el.select();
  el.setSelectionRange(0, (el.value || '').length);

  alert(umT('setup.auth.urlSelectedLongPressOrUse', 'URL selected. Long-press or use Copy from your device menu.'));
}

function fallbackCopy(text){
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, ta.value.length);

  try {
    document.execCommand('copy');
    const btns = document.querySelectorAll('button');
    btns.forEach(function(btn){
      if((btn.textContent || '').includes('Select URL')){
        btn.textContent = umT('setup.auth.copied', 'Copied!');
        setTimeout(function(){ btn.textContent = umT('setup.auth.selectUrl', 'Select URL'); }, 1500);
      }
    });
  } catch(e) {
    alert(text);
  }

  document.body.removeChild(ta);
}

const DRAFT_KEY = 'ultramaxDraftV1';

// Draft save/restore lifecycle lives in /setup-modules/draft-state.js

// Custom-row state, builder preload, and form getters live in /setup-modules/custom-rows.js

// Per-row catalog override controller lives in /setup-modules/catalog-row-overrides.js

// Config serialization, generation, cache warm, and pre-push refresh live in /setup-modules/generation-controller.js

// Stream display formatter lives in /setup-modules/stream-display-formatter.js

// Device Profiles controller lives in /setup-modules/device-profiles.js

function copyUrl(){
  const url = document.getElementById('urlDisplay').textContent;
  const btn = event.target;
  const orig = btn.textContent;
  navigator.clipboard.writeText(url).catch(function(){
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  });
  btn.textContent = umT('setup.deviceProfiles.copied2', 'Copied!');
  setTimeout(function(){ btn.textContent = orig; }, 2000);
}

function copyToken(){
  const token = document.getElementById('tokenDisplay').textContent;
  const btn = document.getElementById('copyTokenBtn');
  navigator.clipboard.writeText(token).catch(function(){
    const ta = document.createElement('textarea');
    ta.value = token;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  });
  btn.textContent = umT('setup.deviceProfiles.copied3', 'Copied!');
  setTimeout(function(){ btn.textContent = umT('setup.deviceProfiles.copy', 'Copy'); }, 2000);
}

function makeSprockets(){
  // Sprockets removed in new layout — no-op
}

// Toggle parent categories (Themed, Regional) that contain sub-sections
