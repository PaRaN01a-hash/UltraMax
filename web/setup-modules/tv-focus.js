(function () {
  'use strict';

  var tvFocusableSelectors = [
    '.s1-tile',
    '.s3-sticky-toggle',
    '.s3-preset-card',
    '.s3-viewmode-card',
    '.s2-preset',
    '.s2-pill',
    '.s2-cat-head',
    '.cat-header',
    '.sub-cat-header',
    '.coll-card-header',
    '.folder-header',
    '.sum-section-title',
    '.um-kbd-toggle'
  ].join(',');

  function isNativeInteractive(element) {
    return !!element.closest(
      'button, input, select, textarea, a[href], label'
    );
  }

  function prepareTvFocusableElements(root) {
    var scope = root && root.querySelectorAll ? root : document;

    scope.querySelectorAll(tvFocusableSelectors).forEach(function (element) {
      if (isNativeInteractive(element)) {
        return;
      }

      if (!element.hasAttribute('tabindex')) {
        element.setAttribute('tabindex', '0');
      }

      if (!element.hasAttribute('role')) {
        element.setAttribute('role', 'button');
      }
    });
  }

  function isVisible(element) {
    if (!element || !element.isConnected) {
      return false;
    }

    var style = window.getComputedStyle(element);
    var rect = element.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    var target = document.activeElement;

    if (
      !target ||
      target === document.body ||
      target.matches('input, select, textarea, button, a[href]')
    ) {
      return;
    }

    if (
      target.matches('[role="button"], ' + tvFocusableSelectors) &&
      isVisible(target)
    ) {
      event.preventDefault();
      target.click();
    }
  });

  document.addEventListener('focusin', function (event) {
    var target = event.target;

    if (!isVisible(target)) {
      return;
    }

    window.requestAnimationFrame(function () {
      try {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      } catch (error) {
        target.scrollIntoView(false);
      }
    });
  });

  function initialiseTvFocus() {
    prepareTvFocusableElements(document);

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) {
            return;
          }

          if (node.matches && node.matches(tvFocusableSelectors)) {
            prepareTvFocusableElements(node.parentNode || document);
          } else {
            prepareTvFocusableElements(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseTvFocus);
  } else {
    initialiseTvFocus();
  }
})();
