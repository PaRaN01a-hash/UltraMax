function polishApiKeyFields(){
  const fields = [
    {
      id: 'mdblistKey',
      title: 'MDBList API Key',
      note: 'Free key required. Powers curated lists, discovery rows and Ultra MAX setup generation.',
      mainUrl: 'https://mdblist.com/preferences/',
      mainText: 'Get Free MDBList Key'
    },
    {
      id: 'tmdbKey',
      title: 'TMDB API Key',
      note: 'Free key required. Powers movies, shows, filters, collections and metadata.',
      mainUrl: 'https://www.themoviedb.org/settings/api',
      mainText: 'Get Free TMDB Key'
    }
  ];

  fields.forEach(function(cfg){
    const input = document.getElementById(cfg.id);
    if(!input) return;

    const block = input.closest('.field-block');
    if(!block || block.dataset.polishedApi === '1') return;

    block.dataset.polishedApi = '1';
    block.classList.add('api-key-hero');

    const label = block.querySelector('.field-label');
    if(label){
      label.innerHTML = '🔑 ' + cfg.title + ' <span class="badge badge-required">' + umT('setup.badge.required','REQUIRED') + '</span>';
    }

    const note = document.createElement('div');
    note.className = 'api-key-note';
    note.textContent = cfg.note;

    const actions = document.createElement('div');
    actions.className = 'api-key-actions';
    actions.innerHTML =
      '<a class="primary" href="' + cfg.mainUrl + '" target="_blank" rel="noopener">' + cfg.mainText + '</a>' +
      '<a href="#" onclick="showHowToUse();return false;">' + umT('setup.apiKeys.howDoIUseThis','How do I use this?') + '</a>';

    block.appendChild(note);
    block.appendChild(actions);
  });
}


// D-pad focus trapping shared by this page's modals: Tab/Shift+Tab and
// Up/Down arrows cycle through the modal's focusable elements instead of
// leaking focus onto the page behind it.
function umFocusableIn(container){
  return Array.prototype.filter.call(
    container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    function(el){ return el.offsetParent!==null; }
  );
}
function umTrapFocus(container){
  if(container.__umTrapped) return;
  container.__umTrapped=true;
  container.addEventListener('keydown', function(event){
    var isCycleKey = event.key==='Tab' || event.key==='ArrowDown' || event.key==='ArrowUp';
    if(!isCycleKey) return;
    var items=umFocusableIn(container);
    if(!items.length) return;
    var backward = event.key==='ArrowUp' || (event.key==='Tab' && event.shiftKey);
    var idx=items.indexOf(document.activeElement);
    event.preventDefault();
    var next = backward
      ? items[idx<=0 ? items.length-1 : idx-1]
      : items[idx===-1 || idx===items.length-1 ? 0 : idx+1];
    if(next) next.focus();
  });
}

function showHowToUse(){
  const old = document.getElementById('howtoOverlay');
  if(old) old.remove();

  const d = document.createElement('div');
  d.id = 'howtoOverlay';
  d.className = 'howto-overlay';

  d.innerHTML = `
    <div class="howto-card" role="dialog" aria-modal="true" aria-labelledby="guideModalTitle">
      <header class="guide-modal-header">
        <h2 class="guide-modal-title" id="guideModalTitle">🚀 ULTRA MAX SETUP GUIDE</h2>
        <button type="button" class="howto-close" aria-label="Close guide" onclick="dismissHowToUse()">×</button>
      </header>

      <p class="guide-modal-intro">Ultra MAX is a four-step setup. Only the essentials are required; everything else can be added when you need it.</p>

      <div class="guide-sections">
        <section class="guide-section">
          <h3 class="guide-section-title">1. Start Fresh or Load Existing</h3>
          <p class="guide-section-copy">Choose <strong>New Setup</strong> to start fresh, then pick <strong>Full Ultra MAX</strong> or <strong>Kids</strong>. Kids mode starts with safer catalog choices, age restrictions and isolated Nuvio handling.</p>
          <p class="guide-section-copy">Already have a setup? Choose <strong>Load Existing</strong> and enter your setup token to continue editing it.</p>
        </section>

        <section class="guide-section">
          <h3 class="guide-section-title">2. Add the Essentials</h3>
          <p class="guide-section-copy">Create a password so your setup can be edited later. Then add at least one discovery provider: <strong>TMDB</strong> or <strong>MDBList</strong>.</p>
          <p class="guide-section-copy">TMDB powers TMDB-backed discovery. MDBList unlocks MDBList-specific catalogues, list search and import tools. Add both for the fullest Ultra MAX experience.</p>
          <a class="guide-link" href="https://mdblist.com/?ref=ultramax" target="_blank" rel="noopener noreferrer">Get a free MDBList key →</a>
          <a class="guide-link" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">Get a TMDB v3 key →</a>
        </section>

        <section class="guide-section">
          <h3 class="guide-section-title">3. Connect Nuvio — Optional</h3>
          <p class="guide-section-copy">Connect Nuvio once and choose the profile Ultra MAX should use. This lets later steps install the add-on and work with collections for the correct profile.</p>
          <p class="guide-section-copy">You can skip this completely and connect later.</p>
        </section>

        <section class="guide-section">
          <h3 class="guide-section-title">4. Pick Your Catalogues</h3>
          <p class="guide-section-copy">In Step 2, choose the rows you actually want: movies, series, streaming providers, networks, studios, genres, decades, countries, curated lists and more.</p>
          <p class="guide-section-copy">Search, select, hide and reorder rows before moving on. You do not need to fill every category.</p>
        </section>

        <section class="guide-section">
          <h3 class="guide-section-title">5. Build Collections — Optional</h3>
          <p class="guide-section-copy">Step 3 lets you group rows into Nuvio collections, use presets, create your own folders and customise artwork.</p>
          <p class="guide-section-copy">If Nuvio is connected, you can compare your Ultra MAX collections with the selected Nuvio profile before pushing changes.</p>
        </section>

        <section class="guide-section">
          <h3 class="guide-section-title">6. Optional Extras Live in Step 1</h3>
          <p class="guide-section-copy">Open only the cards you need: Recommendations, Language &amp; Metadata, Artwork, Connections and Content Rules. Streams can also be configured here with debrid providers or manual add-on links.</p>
          <p class="guide-section-copy">Poster services, Pictorium, Cloud Library, Trakt, Simkl, language filters and advanced content rules are all optional.</p>
        </section>

        <section class="guide-section">
          <h3 class="guide-section-title">7. Generate, Install and Edit Later</h3>
          <p class="guide-section-copy">Step 4 reviews your setup and generates your personalised Ultra MAX add-on. Install it directly in Nuvio, use the Stremio install option, or copy the generated add-on URL.</p>
          <p class="guide-section-copy">Your setup token identifies the configuration and your password protects editing. Local progress is also autosaved while you build.</p>
        </section>
      </div>

      <p class="guide-modal-intro">The simple route is enough for most people: essentials → catalogues → optional collections → generate.</p>

      <aside class="guide-support-card">
        <h3 class="guide-support-title">Enjoying Ultra MAX?</h3>
        <p class="guide-support-copy">Ultra MAX is built and maintained in spare time. If it has made your setup easier, you can support future development with a coffee.</p>
        <a class="guide-support-button" href="https://ko-fi.com/ultramaxaddon" target="_blank" rel="noopener noreferrer" aria-label="Buy me a coffee on Ko-fi (opens in a new tab)">☕ Buy me a coffee</a>
      </aside>

      <footer class="guide-modal-footer">
        <button type="button" class="nav-btn primary guide-start-button" onclick="dismissHowToUse(); if(typeof setStep==='function') setStep(1);">Start Building →</button>
      </footer>
    </div>
  `;

  document.body.appendChild(d);

  requestAnimationFrame(function(){
    var closeBtn = d.querySelector('.howto-close');
    if(closeBtn) closeBtn.focus();
    umTrapFocus(d);
  });
}

function dismissHowToUse(){
  try{ localStorage.setItem('um_onboarding_seen', '1'); }catch(e){}
  const el = document.getElementById('howtoOverlay');
  if(el) el.remove();
}

function openSupportModal(){
  const old = document.getElementById('supportModal');
  if(old) old.remove();

  const d = document.createElement('div');
  d.id = 'supportModal';
  d.className = 'support-modal-overlay';

  d.innerHTML = `
    <div class="support-modal-card" role="dialog" aria-modal="true" aria-labelledby="supportModalTitle">
      <button type="button" class="support-close" data-i18n-aria-label="setup.support.closeAria" aria-label="Close support form" onclick="closeSupportModal()">×</button>
      <h2 id="supportModalTitle" data-i18n="setup.support.title">Contact Support</h2>
      <p class="support-modal-intro" data-i18n="setup.support.intro">Send us a message and we'll get back to you.</p>

      <form id="supportForm" onsubmit="return submitSupportMessage(event)">
        <div class="support-field">
          <label for="supportSubject" data-i18n="setup.support.subjectLabel">Subject</label>
          <input type="text" id="supportSubject" maxlength="150" data-i18n-placeholder="setup.support.subjectPlaceholder" placeholder="What's this about?" autocomplete="off">
        </div>
        <div class="support-field">
          <label for="supportMessage" data-i18n="setup.support.messageLabel">Message</label>
          <textarea id="supportMessage" maxlength="5000" data-i18n-placeholder="setup.support.messagePlaceholder" placeholder="Describe the issue or question..."></textarea>
        </div>
        <div class="support-field">
          <label for="supportReplyEmail" data-i18n="setup.support.emailLabel">Reply email (optional)</label>
          <input type="email" id="supportReplyEmail" maxlength="254" data-i18n-placeholder="setup.support.emailPlaceholder" placeholder="you@example.com">
          <div class="support-field-hint" data-i18n="setup.support.emailHint">Only used if you want a reply.</div>
        </div>
        <div class="support-honeypot" aria-hidden="true">
          <label for="supportCompany">Company</label>
          <input type="text" id="supportCompany" name="company" tabindex="-1" autocomplete="off">
        </div>
        <div id="supportStatus" class="support-status" role="status" aria-live="polite"></div>
        <div class="support-modal-actions">
          <button type="button" class="support-btn support-btn-cancel" data-i18n="setup.support.cancelBtn" onclick="closeSupportModal()">Cancel</button>
          <button type="submit" id="supportSendBtn" class="support-btn support-btn-send" data-i18n="setup.support.sendBtn">Send Message</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(d);
  if(typeof umApplyTranslations === 'function') umApplyTranslations(d);

  requestAnimationFrame(function(){
    const first = document.getElementById('supportSubject');
    if(first) first.focus();
    umTrapFocus(d);
  });
}

function closeSupportModal(){
  const el = document.getElementById('supportModal');
  if(el) el.remove();
}

function submitSupportMessage(event){
  if(event) event.preventDefault();

  const statusEl = document.getElementById('supportStatus');
  const sendBtn = document.getElementById('supportSendBtn');
  const subjectEl = document.getElementById('supportSubject');
  const messageEl = document.getElementById('supportMessage');
  const emailEl = document.getElementById('supportReplyEmail');
  const honeypotEl = document.getElementById('supportCompany');

  const subject = ((subjectEl && subjectEl.value) || '').trim();
  const message = ((messageEl && messageEl.value) || '').trim();
  const replyEmail = ((emailEl && emailEl.value) || '').trim();
  const company = ((honeypotEl && honeypotEl.value) || '').trim();

  function setStatus(text, kind){
    if(!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'support-status' + (kind ? ' is-' + kind : '');
  }

  if(!subject){
    setStatus(umT('setup.support.errorEmptySubject','Please enter a subject.'), 'error');
    if(subjectEl) subjectEl.focus();
    return false;
  }
  if(!message){
    setStatus(umT('setup.support.errorEmptyMessage','Please enter a message.'), 'error');
    if(messageEl) messageEl.focus();
    return false;
  }
  if(replyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail)){
    setStatus(umT('setup.support.errorInvalidEmail','Please enter a valid email address, or leave it blank.'), 'error');
    if(emailEl) emailEl.focus();
    return false;
  }

  if(sendBtn) sendBtn.disabled = true;
  setStatus(umT('setup.support.sendingBtn','Sending...'), 'sending');

  let locale = 'en';
  try{ locale = localStorage.getItem('um_lang') || navigator.language || 'en'; }catch(e){}

  const context = {
    step: (typeof currentStep !== 'undefined' ? currentStep : null),
    locale: locale,
    mode: (typeof umIsStandalone === 'function' && umIsStandalone()) ? 'native' : 'web',
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString()
  };

  fetch(API_BASE + '/api/support-message', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ subject: subject, message: message, replyEmail: replyEmail, company: company, context: context })
  })
  .then(function(res){
    return res.json().catch(function(){ return {}; }).then(function(data){ return { ok: res.ok, data: data }; });
  })
  .then(function(result){
    if(result.ok && result.data && result.data.ok){
      setStatus(umT('setup.support.successMsg','Message sent! Thanks for reaching out.'), 'success');
      if(subjectEl) subjectEl.value = '';
      if(messageEl) messageEl.value = '';
      if(emailEl) emailEl.value = '';
      setTimeout(closeSupportModal, 1600);
    } else {
      const msg = (result.data && result.data.error) || umT('setup.support.errorGeneric','Something went wrong. Please try again.');
      setStatus(msg, 'error');
      if(sendBtn) sendBtn.disabled = false;
    }
  })
  .catch(function(){
    setStatus(umT('setup.support.errorGeneric','Something went wrong. Please try again.'), 'error');
    if(sendBtn) sendBtn.disabled = false;
  });

  return false;
}

// These controls are invoked from both legacy inline menu actions and
// the newer Step 1 Project & Help card. Publish them explicitly so script
// ordering or browser quirks cannot leave those buttons inert.
window.showHowToUse = showHowToUse;
window.dismissHowToUse = dismissHowToUse;
window.openSupportModal = openSupportModal;
window.closeSupportModal = closeSupportModal;
window.submitSupportMessage = submitSupportMessage;

document.addEventListener('DOMContentLoaded', function(){
  try{
    const seen = localStorage.getItem('um_onboarding_seen');
    const urlParams = new URLSearchParams(window.location.search);
    const hasTokenInUrl = !!urlParams.get('token');
    const hasStoredToken = !!sessionStorage.getItem('um_setup_token');
    if(!seen && !hasTokenInUrl && !hasStoredToken){
      setTimeout(function(){
        if(typeof showHowToUse === 'function') showHowToUse();
      }, 600);
    }
  }catch(e){}
});
