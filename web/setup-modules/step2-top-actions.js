/* ULTRA MAX STEP 2 TOP ACTIONS */

(function () {
  function installStepTwoTopActions() {
    var target =
      document.getElementById('s2ReviewActions');

    var preview =
      document.getElementById('s2StepPreviewBtn');

    if (
      !target ||
      !preview ||
      document.getElementById('s2StepSummaryBtn')
    ) {
      return;
    }

    var actions = target;

    var summary = document.createElement('button');

    summary.type = 'button';
    summary.id = 's2StepSummaryBtn';
    summary.className = 's2-step-summary-btn';

    summary.innerHTML =
      '<span class="s2-step-summary-icon">📋</span>' +
      '<span class="s2-step-summary-copy">' +
        '<span class="s2-step-summary-title">' + umT('setup.step2.catalogTools.setupSummary', 'Setup Summary') + '</span>' +
        '<span class="s2-step-summary-sub">' + umT('setup.step2.catalogTools.reviewYourCurrentChoices', 'Review your current choices') + '</span>' +
      '</span>';

    summary.onclick = function () {
      if (typeof window.openSummary === 'function') {
        window.openSummary();
      }
    };

    /*
      Move the existing preview button into the shared action row.
      This keeps its existing click handler and live count.
    */
    preview.style.position = 'static';
    preview.style.top = 'auto';
    preview.style.right = 'auto';
    preview.style.margin = '0';

    actions.appendChild(summary);
    actions.appendChild(preview);

  }

  document.addEventListener(
    'DOMContentLoaded',
    function () {
      window.setTimeout(
        installStepTwoTopActions,
        0
      );
    }
  );

  window.addEventListener(
    'load',
    function () {
      window.setTimeout(
        installStepTwoTopActions,
        50
      );
    }
  );
})();
