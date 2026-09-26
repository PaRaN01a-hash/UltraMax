/*
 * Shared left-edge D-pad sidebar nav — one copy instead of four.
 * Used by app.html, account.html, changelog.html, settings.html.
 *
 * A page opts in with:
 *   <link rel="stylesheet" href="/nav.css">
 *   <div id="umNavMount"></div>
 *   <script src="/nav.js"></script>
 *   <script src="/i18n.js"></script>   (must come after nav.js so the
 *                                       injected <span data-i18n> labels
 *                                       still get translated)
 */
(function () {
  'use strict';

  var NAV_HTML =
    '<nav id="umSidebarNav" aria-label="Ultra MAX app navigation">' +
      '<a href="/app.html?native=1" data-app-page="app.html">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>' +
        '<span data-i18n="nav.home">Home</span>' +
      '</a>' +
      '<a href="/setup.html?native=1" data-app-page="setup.html">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="16" cy="12" r="2"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="12" cy="18" r="2"/></svg>' +
        '<span data-i18n="nav.build">Build</span>' +
      '</a>' +
      '<a href="/account.html?native=1" data-app-page="account.html">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>' +
        '<span data-i18n="nav.nuvio">Nuvio</span>' +
      '</a>' +
      '<a href="https://play.ultramax.vip/" target="_blank" rel="noopener noreferrer" data-native-external="1" data-app-page="play" aria-label="Open Ultra Play">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M10 8l6 4-6 4V8z"/></svg>' +
        '<span>Play</span>' +
      '</a>' +
    '</nav>';

  function bindExternalNav() {
    var nav = document.getElementById('umSidebarNav');
    if (!nav || nav.dataset.externalBound === '1') return;
    nav.dataset.externalBound = '1';

    nav.addEventListener('click', function (event) {
      var target = event.target;
      var link =
        target && typeof target.closest === 'function'
          ? target.closest('a[data-native-external]')
          : null;

      if (!link) return;

      try {
        var Browser =
          window.Capacitor &&
          window.Capacitor.Plugins &&
          window.Capacitor.Plugins.Browser;

        if (Browser && typeof Browser.open === 'function') {
          event.preventDefault();
          Browser.open({ url: link.href });
        }
      } catch (_error) {}
    });
  }

  function insertNav() {
    var mount = document.getElementById('umNavMount');
    if (mount) mount.outerHTML = NAV_HTML;
    bindExternalNav();
  }

  // Classic <script src> tags run synchronously in document order, and the
  // mount div is always earlier in the source than this script tag, so it's
  // already parsed into the DOM by the time we get here — no need to wait
  // for DOMContentLoaded in the common case, but guard it anyway in case
  // this file ever gets loaded with defer/async.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertNav);
  } else {
    insertNav();
  }

  // -- Native-mode activation + active nav-item highlighting --------------
  function currentPage() {
    return window.location.pathname.split('/').pop() || 'app.html';
  }

  function rememberedSetupToken() {
    try {
      var raw = localStorage.getItem('ultramax_remembered_setup');
      if (!raw) return '';
      var saved = JSON.parse(raw);
      if (!saved || !saved.token || !saved.password) return '';
      return String(saved.token)
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .toUpperCase();
    } catch (error) {
      return '';
    }
  }

  function applyRememberedBuildRoute() {
    var buildLink = document.querySelector(
      '#umSidebarNav a[data-app-page="setup.html"]'
    );
    if (!buildLink) return;

    var token = rememberedSetupToken();
    var url = new URL('/setup.html', window.location.origin);
    url.searchParams.set('native', '1');
    if (token) url.searchParams.set('token', token);
    buildLink.setAttribute('href', url.pathname + url.search);
  }

  function activateNativeMode() {
    try {
      var hasCapacitor =
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform();

      var userAgent = navigator.userAgent || '';
      var isAndroidWebView =
        /; wv\)/i.test(userAgent) ||
        (/Android/i.test(userAgent) && /Version\/4\.0/i.test(userAgent));

      var forcedNative =
        new URLSearchParams(window.location.search).get('native') === '1';

      if (!(forcedNative || hasCapacitor || isAndroidWebView)) return;

      document.documentElement.classList.add('native-app');

      var page = currentPage();
      var params = new URLSearchParams(window.location.search);
      var activePage = (
        params.get('openMore') === '1' ||
        page === 'changelog.html' ||
        page === 'settings.html'
      ) ? 'more' : page;

      document.querySelectorAll('#umSidebarNav a').forEach(function (link) {
        link.classList.toggle('active', link.dataset.appPage === activePage);
      });
    } catch (error) {
      console.warn('Ultra MAX native detection failed:', error);
    }
  }

  // -- Keep same-origin links tagged with ?native=1 as you navigate -------
  function addNativeMarker() {
    document.querySelectorAll('a[href]').forEach(function (link) {
      var rawHref = link.getAttribute('href');
      if (
        !rawHref ||
        rawHref === '#' ||
        rawHref.startsWith('javascript:') ||
        rawHref.startsWith('mailto:') ||
        rawHref.startsWith('tel:')
      ) {
        return;
      }
      try {
        var url = new URL(rawHref, window.location.origin);
        if (url.origin !== window.location.origin) return;
        url.searchParams.set('native', '1');
        link.setAttribute('href', url.pathname + url.search + url.hash);
      } catch (error) {}
    });
  }

  function boot() {
    activateNativeMode();

    if (!document.documentElement.classList.contains('native-app')) return;

    addNativeMarker();
    applyRememberedBuildRoute();

    if (
      currentPage() === 'app.html' &&
      new URLSearchParams(window.location.search).get('openMore') === '1'
    ) {
      var moreTools = document.querySelector('.home-more-tools');
      if (moreTools) {
        moreTools.open = true;
        window.setTimeout(function () {
          moreTools.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }
    }

    var observer = new MutationObserver(function () {
      addNativeMarker();
      applyRememberedBuildRoute();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // -- D-pad sidebar navigation ---------------------------------------------
  // Left from the first column reaches the rail, Right (or a click) from
  // the rail re-enters content and the rail slides back out (see nav.css).
  function getNav() {
    return document.getElementById('umSidebarNav');
  }

  function isFocusable(el) {
    return !!(el && el.offsetParent !== null);
  }

  function allFocusable() {
    return Array.prototype.filter.call(
      document.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ),
      isFocusable
    );
  }

  function firstContentFocusable(nav) {
    var els = allFocusable().filter(function (el) { return !nav.contains(el); });
    els.sort(function (a, b) {
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) > 10) return ra.top - rb.top;
      return ra.left - rb.left;
    });
    return els[0] || null;
  }

  function hasLeftNeighbor(nav, active) {
    if (!active || !active.getBoundingClientRect) return false;
    var rect = active.getBoundingClientRect();
    return allFocusable().some(function (el) {
      if (el === active || nav.contains(el)) return false;
      var r = el.getBoundingClientRect();
      var sameRow = Math.abs((r.top + r.bottom) / 2 - (rect.top + rect.bottom) / 2) < rect.height;
      return sameRow && r.right <= rect.left + 2;
    });
  }

  document.addEventListener('keydown', function (event) {
    var nav = getNav();
    if (!nav || !document.documentElement.classList.contains('native-app')) return;

    var active = document.activeElement;
    var insideNav = nav.contains(active);

    if (event.key === 'ArrowLeft' && !insideNav) {
      if (hasLeftNeighbor(nav, active)) return;
      event.preventDefault();
      var target = nav.querySelector('a.active') || nav.querySelector('a');
      if (target) target.focus();
      return;
    }

    if (insideNav && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      var links = Array.prototype.slice.call(nav.querySelectorAll('a'));
      var idx = links.indexOf(active);
      var next = links[event.key === 'ArrowUp' ? idx - 1 : idx + 1];
      if (next) next.focus();
      return;
    }

    if (insideNav && event.key === 'ArrowRight') {
      event.preventDefault();
      var contentTarget = firstContentFocusable(nav);
      if (contentTarget) {
        contentTarget.focus();
      } else {
        active.blur();
      }
    }
  });
})();
