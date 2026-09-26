(function () {
  // Only show the D-pad focus ring on devices with no touchscreen (TV
  // boxes / remotes). Phones and tablets always report touch support even
  // when idle, so this stays accurate regardless of current input method.
  var isTouchCapable =
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  if (!isTouchCapable) {
    document.documentElement.classList.add('um-tv-input');
  }
})();
