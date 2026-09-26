/* ULTRA MAX STEP 3 IMAGE FALLBACKS */

(function installStep3ImageFallbacks() {
  function markFailedImage(image) {
    if (!image || image.classList.contains('s3-img-failed')) {
      return;
    }

    image.classList.add('s3-img-failed');

    /*
      A transparent data image prevents the browser from continuing
      to display its broken-image icon while preserving the tile.
    */
    image.src =
      'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  }

  function prepareImages(root) {
    const scope = root || document;

    scope
      .querySelectorAll('#step-3 .s3-preset-strip img')
      .forEach(function (image) {
        if (image.dataset.s3FallbackReady === '1') {
          return;
        }

        image.dataset.s3FallbackReady = '1';

        image.addEventListener(
          'error',
          function () {
            markFailedImage(image);
          },
          { once: true }
        );

        /*
          Handles images that failed before this listener was installed.
        */
        if (image.complete && image.naturalWidth === 0) {
          markFailedImage(image);
        }
      });
  }

  function updatePreviewVisibility() {
    const step2 = document.getElementById('step-2');
    const previewButton =
      document.getElementById('s2StepPreviewBtn');
    const previewFab =
      document.querySelector('.s2-preview-fab');

    const step2Active =
      Boolean(step2 && step2.classList.contains('active'));

    if (previewButton) {
      previewButton.style.setProperty(
        'display',
        step2Active ? 'flex' : 'none',
        'important'
      );
    }

    if (previewFab) {
      previewFab.style.setProperty(
        'display',
        'none',
        'important'
      );
    }
  }

  function initialise() {
    prepareImages(document);
    updatePreviewVisibility();

    const observer = new MutationObserver(function (mutations) {
      let refreshPreview = false;

      mutations.forEach(function (mutation) {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class'
        ) {
          refreshPreview = true;
        }

        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) {
            prepareImages(node);
          }
        });
      });

      if (refreshPreview) {
        updatePreviewVisibility();
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initialise,
      { once: true }
    );
  } else {
    initialise();
  }
})();
