/* ULTRA MAX DESKTOP WORKSPACE CONTROLS */

(function () {
  var STORAGE_KEY = 'ultramaxSidebarCollapsed';

  function isDesktopWorkspace() {
    if (
      document.documentElement.classList.contains('um-app-mode') ||
      document.body.classList.contains('um-app-mode')
    ) {
      return false;
    }

    return window.matchMedia('(min-width: 901px)').matches;
  }

  function applySidebarState(collapsed) {
    document.body.classList.toggle(
      'um-sidebar-collapsed',
      Boolean(collapsed) && isDesktopWorkspace()
    );

    var button = document.getElementById('umSidebarToggle');

    if (button) {
      var isCollapsed =
        document.body.classList.contains('um-sidebar-collapsed');

      button.setAttribute(
        'aria-label',
        isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
      );

      button.setAttribute(
        'title',
        isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
      );
    }
  }

  function toggleSidebar() {
    var collapsed =
      !document.body.classList.contains('um-sidebar-collapsed');

    localStorage.setItem(
      STORAGE_KEY,
      collapsed ? '1' : '0'
    );

    applySidebarState(collapsed);
  }

  function installSidebarToggle() {
    var sidebar = document.querySelector('.um-sidebar');

    if (!sidebar || document.getElementById('umSidebarToggle')) {
      return;
    }

    sidebar.style.position = 'sticky';

    var button = document.createElement('button');

    button.type = 'button';
    button.id = 'umSidebarToggle';
    button.className = 'um-sidebar-toggle';
    button.innerHTML = '‹';
    button.onclick = toggleSidebar;

    sidebar.appendChild(button);
  }

  function updateStepPreviewCount() {
    var count = 0;

    if (typeof selected !== 'undefined' && selected && selected.size) {
      count = selected.size;
    }

    var badge = document.getElementById('s2StepPreviewCount');

    if (badge) {
      badge.textContent = count;
    }
  }

  function installStepPreviewButton() {
    if (
      document.documentElement.classList.contains('um-app-mode') ||
      document.body.classList.contains('um-app-mode')
    ) {
      return;
    }

    var target = document.getElementById('s2ReviewActions');

    if (!target || document.getElementById('s2StepPreviewBtn')) {
      return;
    }

    var button = document.createElement('button');

    button.type = 'button';
    button.id = 's2StepPreviewBtn';
    button.className = 's2-step-preview-btn';

    button.innerHTML =
      umT('setup.step2.catalogTools.previewNuvioHome', '<span>📺 Preview Nuvio Home</span>') +
      '<span class="s2-step-preview-count" ' +
      'id="s2StepPreviewCount">0</span>';

    button.onclick = function () {
      if (typeof s2UpdatePreview === 'function') {
        s2UpdatePreview();
      }

      if (typeof s2OpenModal === 'function') {
        s2OpenModal();
      }
    };

    target.appendChild(button);
    updateStepPreviewCount();
  }

  function initialiseWorkspace() {
    installSidebarToggle();
    installStepPreviewButton();

    var stored = localStorage.getItem(STORAGE_KEY);

    /*
      On medium desktop widths, begin collapsed unless the user
      has already chosen a preference.
    */
    var defaultCollapsed =
      window.innerWidth < 1180;

    applySidebarState(
      stored === null
        ? defaultCollapsed
        : stored === '1'
    );

    updateStepPreviewCount();
  }

  document.addEventListener(
    'DOMContentLoaded',
    initialiseWorkspace
  );

  window.addEventListener('resize', function () {
    var stored = localStorage.getItem(STORAGE_KEY);

    applySidebarState(
      stored === null
        ? window.innerWidth < 1180
        : stored === '1'
    );
  });

  /*
    The catalogue builder updates frequently, so refresh the
    preview badge whenever its existing update function runs.
  */
  window.addEventListener('load', function () {
    if (
      typeof window.s2UpdateAll === 'function' &&
      !window.s2UpdateAll.__previewCountWrapped
    ) {
      var originalUpdateAll = window.s2UpdateAll;

      var wrappedUpdateAll = function () {
        var result = originalUpdateAll.apply(this, arguments);

        window.setTimeout(
          updateStepPreviewCount,
          0
        );

        return result;
      };

      wrappedUpdateAll.__previewCountWrapped = true;
      window.s2UpdateAll = wrappedUpdateAll;
    }

    updateStepPreviewCount();
  });
})();
