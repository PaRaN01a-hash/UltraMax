/*
 * Ultra MAX i18n loader (pilot).
 *
 * Usage in a page:
 *   <p data-i18n="home.tagline">Your Stremio & Nuvio catalog hub</p>
 *   <input data-i18n-placeholder="home.onboarding.tokenPlaceholder" placeholder="Setup token">
 *   <script>window.umReady.then(() => { el.textContent = umT('home.onboarding.tokenError', 'Enter a valid setup token.'); })</script>
 *
 * The element's existing text/attribute is the English fallback shown
 * before the dictionary loads (and if the fetch ever fails), so pages
 * degrade to their current hardcoded copy rather than going blank.
 *
 * Locale is picked up from (in order): ?lang= URL param, a remembered
 * choice in localStorage, the device/browser language, then "en".
 */
(function () {
  'use strict';

  var DEFAULT_LOCALE = 'en';
  var STORAGE_KEY = 'um_lang';
  var SUPPORTED = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'tr', 'ar', 'he', 'sv'];

  function detectLocale() {
    try {
      var urlLang = new URLSearchParams(location.search).get('lang');
      if (urlLang && SUPPORTED.indexOf(urlLang) !== -1) {
        try { localStorage.setItem(STORAGE_KEY, urlLang); } catch (e) {}
        return urlLang;
      }
    } catch (e) {}

    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
    } catch (e) {}

    try {
      var nav = (navigator.language || navigator.userLanguage || '')
        .slice(0, 2)
        .toLowerCase();
      if (nav && SUPPORTED.indexOf(nav) !== -1) return nav;
    } catch (e) {}

    return DEFAULT_LOCALE;
  }

  var locale = detectLocale();
  window.umLocale = locale;

  function getByPath(obj, path) {
    return path.split('.').reduce(function (acc, part) {
      return acc && typeof acc === 'object' ? acc[part] : undefined;
    }, obj);
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function mergeWithFallback(base, override) {
    var merged = {};
    Object.keys(base || {}).forEach(function (k) { merged[k] = base[k]; });
    Object.keys(override || {}).forEach(function (k) { merged[k] = override[k]; });
    return merged;
  }

  // `root` scopes re-application to a subtree (e.g. after re-rendering a
  // dynamic section) instead of the whole document. Defaults to document.
  function applyTranslations(dict, root) {
    var scope = root || document;

    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      var value = getByPath(dict, el.getAttribute('data-i18n'));
      if (typeof value === 'string') el.textContent = value;
    });

    // Same as data-i18n, but sets innerHTML instead of textContent — for
    // static chrome (never user input) where the English source has inline
    // markup (e.g. <strong>) worth preserving in translation.
    scope.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var value = getByPath(dict, el.getAttribute('data-i18n-html'));
      if (typeof value === 'string') el.innerHTML = value;
    });

    scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var value = getByPath(dict, el.getAttribute('data-i18n-placeholder'));
      if (typeof value === 'string') el.setAttribute('placeholder', value);
    });

    scope.querySelectorAll('[data-i18n-aria-label]').forEach(function (el) {
      var value = getByPath(dict, el.getAttribute('data-i18n-aria-label'));
      if (typeof value === 'string') el.setAttribute('aria-label', value);
    });

    scope.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var value = getByPath(dict, el.getAttribute('data-i18n-title'));
      if (typeof value === 'string') el.setAttribute('title', value);
    });

    try { document.documentElement.setAttribute('lang', locale); } catch (e) {}
  }

  // Lets a page re-apply translations to a subtree after it re-renders
  // dynamic content (e.g. innerHTML swaps) that carries data-i18n* attributes.
  // No-op (returns without throwing) if the dictionary hasn't loaded yet.
  window.umApplyTranslations = function (root) {
    if (window.umDict) applyTranslations(window.umDict, root);
  };

  var resolveReady;
  window.umDict = null;
  window.umReady = new Promise(function (resolve) { resolveReady = resolve; });

  // umT('a.b.c', 'English fallback', { name: x }) — {name} placeholders in
  // the resolved string are substituted from the params object.
  window.umT = function (key, fallback, params) {
    var value = window.umDict ? getByPath(window.umDict, key) : undefined;
    var text = typeof value === 'string' ? value : (fallback !== undefined ? fallback : key);

    if (params) {
      Object.keys(params).forEach(function (name) {
        text = text.split('{' + name + '}').join(String(params[name]));
      });
    }

    return text;
  };

  window.umSetLocale = function (code) {
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) {}
    var url = new URL(location.href);
    url.searchParams.set('lang', code);
    location.href = url.pathname + url.search + url.hash;
  };

  function boot() {
    var basePromise = fetchJson('/i18n/en.json').catch(function () { return {}; });
    var localePromise = locale === DEFAULT_LOCALE
      ? basePromise
      : fetchJson('/i18n/' + locale + '.json').catch(function () { return {}; });

    Promise.all([basePromise, localePromise]).then(function (results) {
      var dict = mergeWithFallback(results[0], results[1]);
      window.umDict = dict;
      applyTranslations(dict);
      resolveReady(dict);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
