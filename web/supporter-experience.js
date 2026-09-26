(() => {
  'use strict';

  const CLAIM_PREFIX = 'um_playplus_badge_v1:';
  const SPLASH_PREFIX = 'um_supporter_home_splash_v1:';
  const claimPattern = /^[A-Za-z0-9_-]{20,1200}\.[A-Za-z0-9_-]{43,100}$/;
  let expiryTimer = null;

  function b64url(bytes) {
    let s = '';
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function setupHash(token) {
    if (!window.crypto?.subtle) return '';
    return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  }

  function currentToken() {
    try {
      if (typeof window.umGetSession === 'function') {
        const remembered = window.umGetSession();
        if (remembered?.token) return String(remembered.token).trim();
      }
    } catch {}
    try {
      const token = sessionStorage.getItem('um_setup_token') || '';
      if (token) return String(token).trim();
    } catch {}
    return '';
  }

  function removeSupporterUi(key) {
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
    document.documentElement.classList.remove('um-supporter-active');
    document.querySelectorAll('[data-um-supporter-ui]').forEach(node => node.remove());
    if (key) {
      try { localStorage.removeItem(key); } catch {}
    }
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    node.dataset.umSupporterUi = '1';
    return node;
  }

  function addIdentityBadge() {
    if (document.querySelector('.um-supporter-identity')) return;
    const badge = make('div', 'um-supporter-identity');
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-label', 'Verified UltraPlay Plus supporter');
    badge.innerHTML = '<span class="um-supporter-identity-mark" aria-hidden="true">✦</span><span><strong>PLAY+ SUPPORTER</strong><small>VERIFIED</small></span>';
    badge.dataset.umSupporterUi = '1';

    const appLogo = document.querySelector('.header .logo');
    if (appLogo) {
      appLogo.insertAdjacentElement('afterend', badge);
      return;
    }

    const navLogo = document.querySelector('.nav-logo');
    if (navLogo) {
      document.body.appendChild(badge);
      badge.classList.add('um-supporter-identity-floating');
      return;
    }

    document.body.appendChild(badge);
    badge.classList.add('um-supporter-identity-floating');
  }

  function addSupporterCard() {
    if (document.querySelector('.um-supporter-home-card')) return;
    const card = make('section', 'um-supporter-home-card');
    card.setAttribute('aria-label', 'Ultra MAX supporter status');
    card.innerHTML = [
      '<div class="um-supporter-home-mark" aria-hidden="true">✦</div>',
      '<div class="um-supporter-home-copy">',
      '<div class="um-supporter-home-kicker">ULTRA MAX · PLAY+ SUPPORTER</div>',
      '<h2>You help power Ultra MAX.</h2>',
      '<p>Thanks for backing the servers, APIs and development behind the project. Your support genuinely keeps this thing moving.</p>',
      '</div>',
      '<div class="um-supporter-home-verified"><span></span> VERIFIED SUPPORTER</div>'
    ].join('');
    card.dataset.umSupporterUi = '1';

    const continueCard = document.getElementById('continueCard');
    if (continueCard?.parentNode) {
      continueCard.parentNode.insertBefore(card, continueCard);
      return;
    }

    const hero = document.querySelector('.hero-content');
    if (hero) {
      hero.appendChild(card);
      card.classList.add('um-supporter-home-card-landing');
      return;
    }

    document.body.prepend(card);
  }

  function showSplash(digest) {
    const sessionKey = SPLASH_PREFIX + digest;
    try {
      if (sessionStorage.getItem(sessionKey) === '1') return;
      sessionStorage.setItem(sessionKey, '1');
    } catch {}

    const splash = make('div', 'um-supporter-welcome');
    splash.setAttribute('role', 'status');
    splash.setAttribute('aria-live', 'polite');
    splash.innerHTML = [
      '<div class="um-supporter-welcome-card">',
      '<div class="um-supporter-welcome-halo" aria-hidden="true"></div>',
      '<div class="um-supporter-welcome-mark" aria-hidden="true">✦</div>',
      '<div class="um-supporter-welcome-kicker">ULTRA MAX SUPPORTER</div>',
      '<div class="um-supporter-welcome-title">Welcome back, PLAY+.</div>',
      '<div class="um-supporter-welcome-copy">You are helping keep Ultra MAX alive, independent and improving. Thank you.</div>',
      '<div class="um-supporter-welcome-status"><span></span> SUPPORTER VERIFIED</div>',
      '</div>'
    ].join('');
    splash.dataset.umSupporterUi = '1';
    document.body.appendChild(splash);
    requestAnimationFrame(() => splash.classList.add('is-visible'));
    setTimeout(() => {
      splash.classList.remove('is-visible');
      setTimeout(() => splash.remove(), 500);
    }, 3000);
  }

  function activate(digest, key, data) {
    document.documentElement.classList.add('um-supporter-active');
    addIdentityBadge();
    addSupporterCard();
    showSplash(digest);

    const rawExpiresAt = data?.expiresAt;
    const expiresAt = rawExpiresAt === null || rawExpiresAt === undefined ? null : Number(rawExpiresAt);
    if (expiresAt !== null && Number.isFinite(expiresAt)) {
      const delay = expiresAt - Date.now();
      if (delay <= 0) {
        removeSupporterUi(key);
        return;
      }
      expiryTimer = setTimeout(() => removeSupporterUi(key), Math.min(delay, 2147483647));
    }
  }

  async function serverLease(token) {
    try {
      const response = await fetch('/api/ultraplay/supporter/status', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({token}),
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      return response.ok && data.active === true ? data : null;
    } catch {
      return null;
    }
  }

  async function init() {
    const token = currentToken();
    if (!/^[A-Za-z0-9_-]{4,160}$/.test(token)) return;

    const digest = await setupHash(token);
    if (!digest) return;
    const key = CLAIM_PREFIX + digest;

    let claim = '';
    try { claim = localStorage.getItem(key) || ''; } catch {}

    if (claimPattern.test(claim)) {
      try {
        const response = await fetch('/api/ultraplay/badge/verify', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({token, claim}),
          cache: 'no-store'
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.active === true && data.label === 'PLAY+') {
          activate(digest, key, data);
          return;
        }
        try { localStorage.removeItem(key); } catch {}
      } catch {}
    }

    const lease = await serverLease(token);
    if (lease) {
      activate(digest, key, lease);
      return;
    }
    document.documentElement.classList.remove('um-supporter-active');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init(), {once:true});
  } else {
    void init();
  }
})();