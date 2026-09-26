(function () {
  'use strict';

  // Android TV / Fire TV WebViews decide whether to summon the on-screen
  // keyboard using touch-interaction heuristics, and a text field focused
  // via D-pad "Select" (not a tap) frequently doesn't trigger it. On TV,
  // D-pad users move focus between inputs constantly just to navigate the
  // page, so opening the keyboard on every focus is disruptive — instead,
  // only summon it on an explicit Enter/Select press while an editable
  // field is focused. No-op outside the native app shell (regular browsers
  // ignore this file's Capacitor check and never reach the plugin call).
  var isNativeApp =
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform();

  if (!isNativeApp) return;

  function isEditable(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    var type = (el.getAttribute('type') || 'text').toLowerCase();
    var nonTextTypes = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'hidden'];
    return nonTextTypes.indexOf(type) === -1 && !el.disabled && !el.readOnly;
  }

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    if (!isEditable(event.target)) return;
    try {
      var Keyboard = window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard;
      if (!Keyboard || !Keyboard.show) return;
      // Consume this Enter press ourselves so it opens the keyboard instead
      // of submitting a surrounding form — typing/submission happens via
      // the on-screen keyboard afterwards.
      event.preventDefault();
      Keyboard.show();
    } catch (error) {
      // Plugin not available on this build — safe to ignore.
    }
  });
})();
