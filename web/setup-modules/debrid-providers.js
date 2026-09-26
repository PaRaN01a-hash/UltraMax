// Multi-provider debrid system
var debridProviders = []; // [{service, apiKey}]

const DEBRID_NAMES = {torbox:'TorBox',realdebrid:'Real-Debrid',alldebrid:'AllDebrid',premiumize:'Premiumize',offcloud:'Offcloud',debridlink:'Debrid-Link',easydebrid:'EasyDebrid'};
const DEBRID_LOGOS = {
  torbox:'/logos/torbox.ico',
  realdebrid:'/logos/realdebrid.ico',
  premiumize:'/logos/premiumize.ico',
  offcloud:'/logos/offcloud.ico',
  debridlink:'/logos/debridlink.ico'
};

function debridProviderMark(service){
  const logo = DEBRID_LOGOS[service];
  if(logo) return `<img class="um-debrid-provider-logo" src="${logo}" alt="">`;
  const name = DEBRID_NAMES[service] || service || '?';
  const initials = name.split(/[-\s]+/).map(part => part.charAt(0)).join('').slice(0,2).toUpperCase();
  return `<span class="um-debrid-provider-fallback" aria-hidden="true">${initials || '?'}</span>`;
}

function renderDebridProviders(){
  const list = document.getElementById('debridProviderList');
  const opts = document.getElementById('debridOptions');
  if(!list) return;
  if(!debridProviders.length){
    list.innerHTML = umT('setup.streams.noProvidersAddedYet', '<div style="font-size:13px;color:var(--muted);margin-bottom:8px;">No providers added yet.</div>');
    if(opts) opts.style.display='none';
    return;
  }
  list.innerHTML = debridProviders.map((p,i) => `
    <div class="um-debrid-provider-row">
      <span class="um-debrid-provider-name">
        ${debridProviderMark(p.service)}
        <strong>${DEBRID_NAMES[p.service]||p.service}</strong>
        <span class="um-debrid-connected-dot" title="Connected" aria-label="Connected"></span>
      </span>
      <button type="button" onclick="removeDebridProvider(${i})" class="um-debrid-remove">Remove</button>
    </div>
  `).join('');
  if(opts) opts.style.display='block';
}

function removeDebridProvider(i){
  debridProviders.splice(i,1);
  renderDebridProviders();
}
async function verifyDebrid(){
  const service = (document.getElementById('debridService')||{}).value || '';
  const apiKey = (document.getElementById('debridApiKey')||{}).value || '';
  const result = document.getElementById('result-debrid');
  if(!service){ result.style.color='#f87171'; result.textContent=umT('setup.streams.pleaseSelectAProvider', 'Please select a provider'); return; }
  if(!apiKey){ result.style.color='#f87171'; result.textContent=umT('setup.streams.pleaseEnterAnApiKey', 'Please enter an API key'); return; }
  result.style.color='#94a3b8'; result.textContent=umT('setup.streams.checking', 'Checking…');
  try {
    let confirmedValid = null;
    try {
      const vr = await fetch('/api/verify-debrid-key', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ service, apiKey }) });
      const vd = await vr.json();
      confirmedValid = vd.valid;
    } catch(e){ confirmedValid = null; }

    if(confirmedValid === false){
      result.style.color='#f87171'; result.textContent=umT('setup.streams.invalidApiKeyPleaseCheckAnd', 'Invalid API key — please check and try again');
      return;
    }

    if(confirmedValid !== true){
      const config = {
        maxResultsPerResolution: 3, maxSize: 0, cachedOnly: false,
        sortCachedUncachedTogether: false, removeTrash: true,
        resultFormat: ['title','video_info','quality_info','size'],
        debridServices: [{ service, apiKey }],
        enableTorrent: false, deduplicateStreams: true,
        scrapeDebridAccountTorrents: false, debridStreamProxyPassword: '',
        languages: { required: [], allowed: ['en'], exclude: [], preferred: ['en'] },
        resolutions: {}, options: { remove_ranks_under: -10000000000, allow_english_in_languages: true, remove_unknown_languages: false }
      };
      const blob = btoa(JSON.stringify(config));
      const testUrl = 'https://comet.feels.legal/' + blob + '/manifest.json';
      const r = await fetch(testUrl);
      if(!r.ok){
        result.style.color='#f87171'; result.textContent=umT('setup.streams.couldNotVerifyCheckYourApi', 'Could not verify — check your API key');
        return;
      }
    }

    const exists = debridProviders.some(p => p.service === service);
    if(exists){
      result.style.color='#f87171'; result.textContent=umT('setup.streams.thisProviderIsAlreadyAdded', 'This provider is already added');
      return;
    }
    debridProviders.push({ service, apiKey });
    renderDebridProviders();
    document.getElementById('debridService').value = '';
    document.getElementById('debridApiKey').value = '';
    result.style.color='#4ade80'; result.textContent='✅ ' + (DEBRID_NAMES[service]||service) + ' added!';
    setTimeout(() => { result.textContent = ''; }, 3000);
  } catch(e){ result.style.color='#f87171'; result.textContent=umT('setup.streams.verificationFailed', 'Verification failed: ')+e.message; }
}


function clearDebrid(){
  debridProviders = [];
  document.getElementById('debridApiKey').value = '';
  document.getElementById('debridService').value = '';
  document.getElementById('result-debrid').textContent = '';
  renderDebridProviders();
}

function updateDebridUI(connected, service, apiKey){ /* legacy no-op */ }
