/* ULTRA MAX COMPACT STEP RAIL SCRIPT */

(function () {
  function polishCompactRail() {
    var toggle = document.getElementById('umSidebarToggle');

    if (toggle) {
      toggle.remove();
    }

    document.body.classList.remove('um-sidebar-collapsed');

    try {
      localStorage.removeItem('ultramaxSidebarCollapsed');
    } catch (error) {
      /* Storage may be unavailable in private browsing. */
    }

    document
      .querySelectorAll('.um-nav-item')
      .forEach(function (item) {
        var label = item.querySelector('.um-nav-label');

        if (!label) return;

        var title = label.textContent.trim();

        item.setAttribute('title', title);
        item.setAttribute('aria-label', title);
      });
  }

  document.addEventListener(
    'DOMContentLoaded',
    polishCompactRail
  );

  window.addEventListener(
    'load',
    polishCompactRail
  );
})();
