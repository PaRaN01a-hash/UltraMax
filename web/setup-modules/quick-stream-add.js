window.quickAddStream = function(type){
  const CONFIG = {
    comet:      { url: 'https://comet.elfhosted.com',          name: 'Comet' },
    aiostreams: { url: 'https://streams.maxbase.kozow.com',    name: 'AIOStreams' },
    stremthru:  { url: 'https://stremthru.maxbase.kozow.com',  name: 'StremThru' },
  };
  const svc = CONFIG[type];
  if(!svc) return;

  window.open(svc.url, '_blank');

  const input = document.getElementById('streamWizardUrl');
  if(input){
    input.placeholder = '👉 Paste your ' + svc.name + ' manifest URL here...';
    input.style.border = '2px solid var(--violet2)';
    input.style.boxShadow = '0 0 12px rgba(155,95,255,0.3)';
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function(){
      input.style.border = '';
      input.style.boxShadow = '';
      input.placeholder = 'https://your-addon/.../manifest.json';
    }, 10000);
  }

  const instructBox = document.getElementById('streamQuickInstructions');
  if(instructBox){
    instructBox.innerHTML = umT('setup.customCatalog.serviceOpenedInNewTab', '✅ <strong>{name}</strong> opened in a new tab — configure it with your debrid key, copy your manifest URL, then paste it in the field below.', {name: svc.name});
    instructBox.style.display = 'block';
  }
}


window.copyToken = async function(event){
  if(event) event.preventDefault();

  // Try to get the token from tokenDisplay first, then fall back to resultToken
  const tokenEl = document.getElementById('tokenDisplay');
  const manifestEl = document.getElementById('resultToken');
  const text = (tokenEl ? (tokenEl.textContent || '').trim() : '') ||
               (manifestEl ? (manifestEl.value || manifestEl.textContent || '').trim() : '');

  if(!text){
    alert(umT('setup.customCatalog.noTokenToCopyYetPlease', 'No token to copy yet. Please generate your setup first.'));
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('copyTokenBtn');
    if(btn){ btn.textContent = umT('setup.customCatalog.copied', 'Copied!'); setTimeout(()=>{ btn.textContent = umT('setup.customCatalog.copy', 'Copy'); }, 2000); }
    return false;
  } catch(e) {

    try {
      if(el){
        el.focus();
        el.select();
        el.setSelectionRange(0, text.length);
      }

      const ok = document.execCommand('copy');
      if(ok){
        alert(umT('setup.customCatalog.manifestUrlCopied', 'Manifest URL copied.'));
        return false;
      }
    } catch(err) {}

    alert(umT('setup.customCatalog.copyBlockedLongPressTheUrl', 'Copy blocked. Long-press the URL and copy manually.'));
    return false;
  }
};

function showCustomCatalogs(){
  const el = document.getElementById('customCatalogsSection');
  if(el) el.style.display = 'block';
}
function toggleCard(header){
  const body = header.nextElementSibling;
  const open = body.style.display === 'block';
  body.style.display = open ? 'none' : 'block';
  header.querySelector('.card-toggle').textContent = open ? 'Open' : 'Close';
}
