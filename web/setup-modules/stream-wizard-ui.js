function setStreamWizardMode(mode, btn){
  document.querySelectorAll('.stream-choice-card').forEach(x => x.classList.remove('active'));
  if(btn) btn.classList.add('active');

  const input = document.getElementById('streamWizardUrl');
  const result = document.getElementById('streamWizardResult');
  if(!input) return;

  if(mode === 'aiostreams'){
    input.placeholder = umT('setup.streams.pasteYourConfiguredAiostreamsManifestJsonUrlPlaceholder', 'Paste your configured AIOStreams manifest.json URL');
    if(result) result.innerHTML = umT('setup.streams.pasteYourConfiguredAiostreamsManifestUrl', '<div class="stream-checking">🌊 Paste your configured AIOStreams manifest URL, then press Check Addon.</div>');
  } else if(mode === 'comet'){
    input.placeholder = umT('setup.streams.pasteYourConfiguredCometManifestJsonUrlPlaceholder', 'Paste your configured Comet manifest.json URL');
    if(result) result.innerHTML = umT('setup.streams.pasteYourConfiguredCometManifestUrl', '<div class="stream-checking">☄️ Paste your configured Comet manifest URL, then press Check Addon.</div>');
  } else {
    input.placeholder = 'https://your-addon/.../manifest.json';
    if(result) result.innerHTML = '';
  }

  input.focus();
}


function setProvider(type, el){
  document.querySelectorAll('.stream-provider').forEach(x => x.classList.remove('active'));
  if(el) el.classList.add('active');

  const input = document.getElementById('streamWizardUrl');
  const helper = document.getElementById('streamHelperText');

  if(!input || !helper) return;

  const guides = {
    custom: "Paste any configured Stremio addon manifest URL.",
    aiostreams: "Go to your AIOStreams setup → copy your manifest.json URL.",
    comet: "Use your configured Comet instance manifest.",
    torrentio: "Use your Torrentio manifest with your settings applied.",
    mediafusion: "Paste your MediaFusion manifest.",
    stremthru: "Paste your StremThru configured manifest.",
    hdhub: "Paste your HDHub manifest if self-hosted or configured."
  };

  input.placeholder = "https://your-addon/.../manifest.json";
  helper.textContent = guides[type] || "";
  input.focus();
}


function detectStreamProviderFromUrl(url){
  const u = String(url || '').toLowerCase();
  if(u.includes('aio')) return 'aiostreams';
  if(u.includes('comet')) return 'comet';
  if(u.includes('torrentio')) return 'torrentio';
  if(u.includes('mediafusion')) return 'mediafusion';
  if(u.includes('stremthru')) return 'stremthru';
  if(u.includes('hdhub')) return 'hdhub';
  return 'custom';
}

function markStreamProviderAdded(url){
  const provider = detectStreamProviderFromUrl(url);
  document.querySelectorAll('.stream-provider').forEach(card => {
    if(card.dataset.provider === provider){
      card.classList.add('added');
      if(!card.querySelector('.stream-provider-added')){
        const badge = document.createElement('div');
        badge.className = 'stream-provider-added';
        badge.textContent = umT('setup.guided.added', '✅ Added');
        card.appendChild(badge);
      }
    }
  });
}


function openProviderSetup(provider){
  const links = {
    custom: "",
    aiostreams: "https://aiostreams.elfhosted.com/",
    comet: "https://comet.elfhosted.com/",
    torrentio: "https://torrentio.strem.fun/configure",
    mediafusion: "https://mediafusion.elfhosted.com/configure",
    stremthru: "https://stremthru.elfhosted.com/",
    hdhub: "",
    torbox: "https://torbox.app/?ref=316b598e-423a-4a69-a5f0-e529ffa49c22",
    realdebrid: "http://real-debrid.com/?id=9867306"
  };

  const url = links[provider];
  if(url){
    window.open(url, "_blank", "noopener,noreferrer");
  }
}


// Custom catalog and public MDBList row controller lives in /setup-modules/custom-rows.js

function toggleCard(header){
  const body = header.nextElementSibling;
  const open = body.style.display === 'block';
  body.style.display = open ? 'none' : 'block';
  header.querySelector('.card-toggle').textContent = open ? 'Open' : 'Close';
}
