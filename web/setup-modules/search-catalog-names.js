(function(){
  "use strict";

  var DEFAULT_SEARCH_CATALOG_NAMES = {
    movie: "Ultra MAX Search",
    series: "Ultra MAX Search"
  };

  function normalizeSearchCatalogName(value, fallback){
    var cleaned = String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    return cleaned || fallback;
  }

  function normalizeSearchCatalogNames(value){
    var names = value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
    return {
      movie: normalizeSearchCatalogName(names.movie, DEFAULT_SEARCH_CATALOG_NAMES.movie),
      series: normalizeSearchCatalogName(names.series, DEFAULT_SEARCH_CATALOG_NAMES.series)
    };
  }

  function getSearchCatalogNamesFromForm(){
    return normalizeSearchCatalogNames({
      movie: (document.getElementById("searchMovieName") || {}).value,
      series: (document.getElementById("searchSeriesName") || {}).value
    });
  }

  function setSearchCatalogNamesOnForm(value){
    var names = normalizeSearchCatalogNames(value);
    var movie = document.getElementById("searchMovieName");
    var series = document.getElementById("searchSeriesName");
    if(movie) movie.value = names.movie;
    if(series) series.value = names.series;
  }

  function resetSearchCatalogNames(){
    setSearchCatalogNamesOnForm(DEFAULT_SEARCH_CATALOG_NAMES);
    if(typeof saveDraftState === "function") saveDraftState();
  }

  window.DEFAULT_SEARCH_CATALOG_NAMES = DEFAULT_SEARCH_CATALOG_NAMES;
  window.normalizeSearchCatalogNames = normalizeSearchCatalogNames;
  window.getSearchCatalogNamesFromForm = getSearchCatalogNamesFromForm;
  window.setSearchCatalogNamesOnForm = setSearchCatalogNamesOnForm;
  window.resetSearchCatalogNames = resetSearchCatalogNames;
})();
