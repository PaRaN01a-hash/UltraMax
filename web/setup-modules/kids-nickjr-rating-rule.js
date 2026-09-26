(function () {
  var rating =
    document.getElementById("maxRating");

  if (!rating) {
    return;
  }

  rating.addEventListener(
    "change",
    function () {
      if (
        typeof window.syncKidsNickJrOption ===
        "function"
      ) {
        window.syncKidsNickJrOption();
      }
    }
  );
})();
