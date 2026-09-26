(function () {
  var topButton = document.getElementById('umBackToTop');
  var bottomButton = document.getElementById('umGoToBottom');
  var helperButton = document.getElementById('umScrollHelper');
  var buildNav = document.querySelector(
    '.um-build-bottom-nav a.active[href*="/setup.html"]'
  );

  var ticking = false;

  function prefersReducedMotion() {
    return !!(
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function isNativeAppMode() {
    return (
      document.documentElement.classList.contains('um-app-mode') ||
      document.body.classList.contains('um-app-mode') ||
      new URLSearchParams(window.location.search).get('native') === '1'
    );
  }

  function maxScrollTop() {
    return Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
  }

  function returnToTop() {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth'
    });
  }

  function goToBottom() {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      left: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth'
    });
  }

  function hideLegacyHelpers() {
    [topButton, bottomButton, helperButton].forEach(function (button) {
      if (!button) return;
      button.hidden = true;
      button.style.display = 'none';
      button.classList.remove('visible');
      button.setAttribute('aria-hidden', 'true');
      if (document.activeElement === button) button.blur();
    });
  }

  function updateBuildNavAction() {
    if (!buildNav) return;

    var maxScroll = maxScrollTop();
    var nearerTop = window.scrollY < (maxScroll / 2);
    var label = nearerTop
      ? 'Build — jump to bottom'
      : 'Build — jump to top';

    buildNav.setAttribute('aria-label', label);
    buildNav.setAttribute('title', label);
    buildNav.dataset.scrollTarget = nearerTop ? 'bottom' : 'top';
  }

  function requestBuildNavUpdate() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      updateBuildNavAction();
      ticking = false;
    });
  }

  function initNativeBuildScroll() {
    hideLegacyHelpers();

    if (!buildNav || buildNav.dataset.scrollToggleBound === '1') return;

    buildNav.dataset.scrollToggleBound = '1';
    buildNav.addEventListener('click', function (event) {
      event.preventDefault();
      if (buildNav.dataset.scrollTarget === 'top') {
        returnToTop();
      } else {
        goToBottom();
      }
      window.setTimeout(updateBuildNavAction, 350);
    });

    window.addEventListener('scroll', requestBuildNavUpdate, { passive: true });
    window.addEventListener('resize', requestBuildNavUpdate, { passive: true });
    window.addEventListener('pageshow', requestBuildNavUpdate);
    updateBuildNavAction();
  }

  if (isNativeAppMode()) {
    initNativeBuildScroll();
    return;
  }

  if (helperButton) {
    helperButton.hidden = false;
    helperButton.style.display = '';

    var arrow = helperButton.querySelector('.um-scroll-helper-arrow');
    var label = helperButton.querySelector('.um-scroll-helper-label');
    var switchAfter = 640;
    var minScrollable = 720;

    function updateHelper() {
      var maxScroll = maxScrollTop();
      var scrollable = maxScroll > minScrollable;
      var isUp = window.scrollY > switchAfter;

      helperButton.dataset.direction = isUp ? 'up' : 'down';
      helperButton.setAttribute(
        'aria-label',
        isUp ? 'Back to top' : 'Jump to bottom'
      );
      helperButton.setAttribute(
        'title',
        isUp ? 'Back to top' : 'Jump to bottom'
      );
      if (arrow) arrow.textContent = isUp ? '↑' : '↓';
      if (label) label.textContent = isUp ? 'Top' : 'Bottom';

      helperButton.classList.toggle('visible', scrollable);
      helperButton.setAttribute(
        'aria-hidden',
        scrollable ? 'false' : 'true'
      );
      if (!scrollable && document.activeElement === helperButton) {
        helperButton.blur();
      }

      ticking = false;
    }

    function requestHelperUpdate() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateHelper);
    }

    function jumpHelper() {
      if (helperButton.dataset.direction === 'up') returnToTop();
      else goToBottom();
      window.setTimeout(requestHelperUpdate, 350);
    }

    helperButton.addEventListener('click', jumpHelper);
    helperButton.addEventListener('keydown', function (event) {
      if (
        event.key === 'Enter' ||
        event.key === ' ' ||
        event.key === 'Select'
      ) {
        event.preventDefault();
        jumpHelper();
      }
    });

    window.addEventListener('scroll', requestHelperUpdate, { passive: true });
    window.addEventListener('resize', requestHelperUpdate, { passive: true });
    window.addEventListener('pageshow', requestHelperUpdate);

    if (typeof ResizeObserver === 'function') {
      var resizeObserver = new ResizeObserver(requestHelperUpdate);
      resizeObserver.observe(document.documentElement);
      if (document.body) resizeObserver.observe(document.body);
    }

    updateHelper();
    return;
  }

  if (!topButton || !bottomButton) return;

  var visibleAfter = 600;

  function updateLegacyButtons() {
    var shouldShowTop = window.scrollY > visibleAfter;
    var remaining = maxScrollTop() - window.scrollY;
    var shouldShowBottom = remaining > visibleAfter;

    topButton.classList.toggle('visible', shouldShowTop);
    bottomButton.classList.toggle('visible', shouldShowBottom);
    topButton.setAttribute('aria-hidden', shouldShowTop ? 'false' : 'true');
    bottomButton.setAttribute(
      'aria-hidden',
      shouldShowBottom ? 'false' : 'true'
    );

    if (!shouldShowTop && document.activeElement === topButton) {
      topButton.blur();
    }
    if (!shouldShowBottom && document.activeElement === bottomButton) {
      bottomButton.blur();
    }

    ticking = false;
  }

  function requestLegacyUpdate() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateLegacyButtons);
  }

  topButton.addEventListener('click', returnToTop);
  bottomButton.addEventListener('click', goToBottom);
  window.addEventListener('scroll', requestLegacyUpdate, { passive: true });
  updateLegacyButtons();
})();
