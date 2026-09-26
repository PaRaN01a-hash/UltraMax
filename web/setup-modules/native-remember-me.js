(function(){
  var forcedNative =
    new URLSearchParams(window.location.search)
      .get("native") === "1";

  var standalone =
    typeof umIsStandalone === "function" &&
    umIsStandalone();

  if (!(forcedNative || standalone)) return;

  var preferenceKey =
    "ultramax_native_remember_setup_pref_v1";

  function readPreference() {
    try {
      var stored = localStorage.getItem(preferenceKey);
      if (stored === "0") return false;
      if (stored === "1") return true;
    } catch (_error) {}

    // The Android app is a personal device surface. Default Remember Me on,
    // while keeping the visible checkbox available as an explicit opt-out.
    return true;
  }

  function writePreference(checked) {
    try {
      localStorage.setItem(
        preferenceKey,
        checked ? "1" : "0"
      );
    } catch (_error) {}
  }

  var row =
    document.getElementById("rememberMeRow");

  var row2 =
    document.getElementById(
      "rememberMeModalRow"
    );

  if (row) row.style.display = "flex";
  if (row2) row2.style.display = "flex";

  var controls = [
    document.getElementById("rememberMeDevice"),
    document.getElementById("rememberMeModalDevice")
  ].filter(Boolean);

  var checked = readPreference();

  controls.forEach(function(control) {
    control.checked = checked;

    control.addEventListener("change", function() {
      checked = !!control.checked;
      writePreference(checked);

      controls.forEach(function(other) {
        if (other !== control) {
          other.checked = checked;
        }
      });
    });
  });

  // Shared native Remember Me decision for load/generate flows. Keeping this
  // in one place avoids a missing/late checkbox causing a remembered password
  // to be silently discarded.
  window.umShouldRememberSetup = function() {
    return readPreference();
  };
})();
