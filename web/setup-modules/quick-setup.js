function startNewBuild(){
  const el = document.getElementById('setupFormStart');
  if(el){
    el.scrollIntoView({behavior:'smooth', block:'start'});
  }
  const pass = document.getElementById('password');
  if(pass) setTimeout(function(){ pass.focus(); }, 350);
}

function openReturningTools(){
  var modal = document.getElementById('welcomeModal');
  if(modal){
    document.getElementById('welcomeChoicePanel').style.display = 'none';
    document.getElementById('welcomeTokenPanel').style.display = 'block';
    modal.style.display = 'flex';
    setTimeout(function(){ document.getElementById('welcomeTokenInput').focus(); }, 100);
  }
}



function setBuilderMode(mode){
  const liteBtn = document.getElementById('liteModeBtn');
  const advBtn = document.getElementById('advancedModeBtn');

  if(mode === 'advanced'){
    document.body.classList.remove('lite-mode');
    if(liteBtn) liteBtn.classList.remove('active');
    if(advBtn) advBtn.classList.add('active');
    localStorage.setItem('ultramaxBuilderMode', 'advanced');
  } else {
    document.body.classList.add('lite-mode');
    if(advBtn) advBtn.classList.remove('active');
    if(liteBtn) liteBtn.classList.add('active');
    localStorage.setItem('ultramaxBuilderMode', 'lite');
  }
}

const QUICK_SETUP_V3 = {
  balanced: ["quick_trending_movies","quick_trending_series","popular_movies","popular_series"],
  movies: ["quick_trending_movies","popular_movies","top_movies"],
  series: ["quick_trending_series","popular_series","top_series"],
  quality: ["top_movies","top_series"]
};

let quickChoice = "balanced";

function applyQuickSetupV3(type){
  quickChoice = type;
}

function getQuickStreams(){
  const enabled = document.getElementById('quickStreamEnabled')?.checked;
  const raw = document.getElementById('quickStreamAddons')?.value || "";
  if(!enabled) return [];
  return raw.split("\n").map(x=>x.trim()).filter(Boolean);
}




function showQuickOnlyV3(){
  document.body.classList.add('quick-v3-mode');
  const quick = document.getElementById('quickSetupV3');
  if(quick) {
    quick.style.display = 'block';
    quick.scrollIntoView({ behavior:'smooth', block:'start' });
  }
}

function showAdvancedBuilderV3(){
  document.body.classList.remove('quick-v3-mode');
  const quick = document.getElementById('quickSetupV3');
  if(quick) quick.style.display = 'none';
  const step = document.getElementById('step-1');
  if(step) step.scrollIntoView({ behavior:'smooth', block:'start' });
}



async function quickGenerateV3(){

  const pass = (document.getElementById('quickPassword')?.value || document.getElementById('password')?.value || "");
  if(!pass){ alert(umT('setup.auth.enterPassword', "Enter password")); return; }

  const providers = validateDiscoveryProviders({ showError: false });
  if(!providers.hasAnyDiscoveryProvider){
    alert(umT('setup.discoveryProviders.validation', 'Add a TMDB v3 API key or an MDBList API key in Step 1.'));
    const el = document.getElementById('tmdbKey') || document.getElementById('mdblistKey');
    if(el) el.focus();
    return;
  }

  const payload = {
    password: pass,
    tmdbKey: providers.tmdbKey || null,
    mdblistKey: providers.mdblistKey || null,
    catalogs: QUICK_SETUP_V3[quickChoice],
    catalogOrder: normaliseCatalogOrder(
      QUICK_SETUP_V3[quickChoice],
      catalogOrder
    ),
    streamAddons: getQuickStreams()
  };

  const res = await fetch(API_BASE+'/c/create',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  showResult(data.token);
}
