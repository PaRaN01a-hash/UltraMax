(function () {
  function element(id) {
    return document.getElementById(id);
  }

  window.showSetupModeChooser = function () {
    document.body.classList.add('um-route-choosing');

    var chooser = element('umModeChooser');
    var startStage = element('umModeStart');
    var profileStage = element('umModeProfile');
    var reopen = element('umModeReopen');
    var toolbar = element('step1Toolbar');
    var quick = element('quickSetupV3');
    var advanced = element('advancedBuilderContainer');
    var returning = element('returningBox');
    var backBar = element('advancedBackBar');

    if (chooser) chooser.classList.remove('hidden');
    if (startStage) startStage.classList.remove('hidden');
    if (profileStage) profileStage.classList.add('hidden');
    if (reopen) reopen.classList.remove('visible');

    if (toolbar) toolbar.style.display = 'none';
    if (quick) quick.style.display = 'none';
    if (advanced) advanced.style.display = 'none';
    if (returning) returning.classList.remove('open');
    if (backBar) backBar.style.display = 'none';

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  window.showNewSetupChoices = function () {
    var startStage = element('umModeStart');
    var profileStage = element('umModeProfile');

    if (startStage) startStage.classList.add('hidden');
    if (profileStage) profileStage.classList.remove('hidden');

    var chooser = element('umModeChooser');
    if (chooser) {
      chooser.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  function kidsSetupCatalogs() {
    return [
      "mdb_88307",
      "mdb_88309",
      "mdb_13",
      "animation_movies",
      "family_movies",
      "family_series",
      "disney_movies",
      "disney_series",
      "studio_disney",
      "mdb_3918",
      "mdb_3928",
      "network_nickelodeon",
      "network_cartoon",
      "network_disney_ch"
    ];
  }

  function buildKidsSetupCollections() {
    return [
      {
        id: "collection-ultramax-kids",
        title: "Ultra MAX Kids",
        collapsed: false,
        folders: [
          {
            id: "folder-ultramax-kids-trending-movies",
            title: "Trending Kids Movies",
            rows: [
              "mdb_88307",
              "mdb_13"
            ],
            tileShape: "LANDSCAPE",
            coverImageUrl:
              "https://ultramax.vip/images/quick/trending_new__trending_movies__cover.png",
            focusGifUrl: "",
            heroBackdropUrl:
              "https://ultramax.vip/images/quick/trending_new__trending_movies__hero.webp",
            focusGifEnabled: false
          },
          {
            id: "folder-ultramax-kids-trending-shows",
            title: "Trending Kids Shows",
            rows: [
              "mdb_88309"
            ],
            tileShape: "LANDSCAPE",
            coverImageUrl:
              "https://ultramax.vip/images/quick/trending_new__trending_tv__cover.png",
            focusGifUrl: "",
            heroBackdropUrl:
              "https://ultramax.vip/images/quick/trending_new__trending_tv__hero.webp",
            focusGifEnabled: false
          },
          {
            id: "folder-ultramax-kids-family-movies",
            title: "Family Movies",
            rows: [
              "family_movies"
            ],
            tileShape: "LANDSCAPE",
            coverImageUrl:
              "https://ultramax.vip/images/quick/genres__family__cover.png",
            focusGifUrl: "",
            heroBackdropUrl:
              "https://ultramax.vip/images/quick/genres__family__hero.webp",
            focusGifEnabled: false
          },
          {
            id: "folder-ultramax-kids-family-shows",
            title: "Family Shows",
            rows: [
              "family_series"
            ],
            tileShape: "LANDSCAPE",
            coverImageUrl:
              "https://ultramax.vip/images/quick/Family_Base.png",
            focusGifUrl: "",
            heroBackdropUrl:
              "https://ultramax.vip/images/quick/hero_family.jpg",
            focusGifEnabled: false
          },
          {
            id: "folder-ultramax-kids-animation",
            title: "Animation",
            rows: [
              "animation_movies"
            ],
            tileShape: "LANDSCAPE",
            coverImageUrl:
              "https://ultramax.vip/images/quick/genres__animation__cover.png",
            focusGifUrl: "",
            heroBackdropUrl:
              "https://ultramax.vip/images/quick/hero_animation.jpg",
            focusGifEnabled: false
          },
          {
            id: "folder-ultramax-kids-disney-plus",
            title: "Disney+",
            rows: [
              "disney_movies",
              "disney_series"
            ],
            tileShape: "LANDSCAPE",
            coverImageUrl:
              "https://ultramax.vip/images/quick/streaming_services__disney__cover.webp",
            focusGifUrl: "",
            heroBackdropUrl:
              "https://ultramax.vip/images/quick/hero_disneyplus.jpg",
            focusGifEnabled: false
          },
          {
            id: "folder-ultramax-kids-walt-disney-studios",
            title: "Walt Disney Studios",
            rows: [
              "studio_disney"
            ],
            tileShape: "LANDSCAPE",
            coverImageUrl:
              "https://ultramax.vip/images/quick/studios__walt_disney_studio__cover.webp",
            focusGifUrl: "",
            heroBackdropUrl:
              "https://ultramax.vip/images/quick/studios__walt_disney_studio__hero.webp",
            focusGifEnabled: false
          },
          {
            id: "folder-ultramax-kids-pixar",
            title: "Pixar",
            rows: [
              "mdb_3918"
            ],
            tileShape: "LANDSCAPE",
            coverImageUrl:
              "https://ultramax.vip/images/quick/studios__pixar__cover.webp",
            focusGifUrl: "",
            heroBackdropUrl:
              "https://ultramax.vip/images/quick/hero_pixar.jpg",
            focusGifEnabled: false
          },
          {
            id: "folder-ultramax-kids-dreamworks",
            title: "DreamWorks",
            rows: [
              "mdb_3928"
            ],
            tileShape: "LANDSCAPE",
            coverImageUrl:
              "https://ultramax.vip/images/quick/dreamworks.jpg",
            focusGifUrl: "",
            heroBackdropUrl:
              "https://ultramax.vip/images/quick/hero_dreamworks_pictures.jpg",
            focusGifEnabled: false
          },
          {
            id: "folder-ultramax-kids-cartoon-network",
            title: "Cartoon Network",
            rows: [
              "network_cartoon"
            ],
            tileShape: "LANDSCAPE",
            coverImageUrl:
              "https://ultramax.vip/images/quick/networks__cartoon_network__cover.webp",
            focusGifUrl: "",
            heroBackdropUrl:
              "https://ultramax.vip/images/quick/hero_cartoon_network.jpg",
            focusGifEnabled: false
          },
          {
            id: "folder-ultramax-kids-nickelodeon",
            title: "Nickelodeon",
            rows: [
              "network_nickelodeon"
            ],
            tileShape: "LANDSCAPE",
            coverImageUrl:
              "https://ultramax.vip/images/quick/networks__nickelodeon__cover.webp",
            focusGifUrl: "",
            heroBackdropUrl:
              "https://ultramax.vip/images/quick/hero_nickelodeon.jpg",
            focusGifEnabled: false
          },
          {
            id: "folder-ultramax-kids-disney-channel",
            title: "Disney Channel",
            rows: [
              "network_disney_ch"
            ],
            tileShape: "LANDSCAPE",
            coverImageUrl:
              "https://ultramax.vip/images/quick/networks__disney_channel__cover.webp",
            focusGifUrl: "",
            heroBackdropUrl:
              "https://ultramax.vip/images/quick/networks__disney_channel__hero.webp",
            focusGifEnabled: false
          }
        ]
      }
    ];
  }

  function createKidsNickJrFolder() {
    return {
      id: "folder-ultramax-kids-nick-jr",
      title: "Nick Jr",
      rows: [
        "network_nickjr"
      ],
      tileShape: "LANDSCAPE",
      coverImageUrl:
        "https://ultramax.vip/images/kids_family.nick_jr.webp",
      focusGifUrl: "",
      heroBackdropUrl:
        "https://ultramax.vip/images/network_nickjr.jpg",
      focusGifEnabled: false
    };
  }

  window.syncKidsNickJrOption = function () {
    if (
      !document.body.classList.contains(
        "um-kids-mode"
      )
    ) {
      return;
    }

    var rating =
      document.getElementById("maxRating");

    var youngest =
      rating && rating.value === "G";

    if (
      typeof selected !== "undefined" &&
      selected
    ) {
      if (youngest) {
        selected.add("network_nickjr");
      } else {
        selected.delete("network_nickjr");
      }
    }

    var legacyPill =
      document.querySelector(
        '.pill[data-id="network_nickjr"]'
      );

    if (legacyPill) {
      legacyPill.classList.toggle(
        "selected",
        youngest
      );
    }

    var modernPill =
      document.getElementById(
        "s2pill-network_nickjr"
      );

    if (modernPill) {
      modernPill.classList.toggle(
        "s2-sel",
        youngest
      );
    }

    if (
      typeof v2Collections !== "undefined" &&
      Array.isArray(v2Collections)
    ) {
      var kidsCollection =
        v2Collections.find(function (
          collection
        ) {
          return (
            collection &&
            collection.id ===
              "collection-ultramax-kids"
          );
        });

      if (
        kidsCollection &&
        Array.isArray(
          kidsCollection.folders
        )
      ) {
        kidsCollection.folders =
          kidsCollection.folders.filter(
            function (folder) {
              return (
                folder.id !==
                "folder-ultramax-kids-nick-jr"
              );
            }
          );

        if (youngest) {
          var nickelodeonIndex =
            kidsCollection.folders.findIndex(
              function (folder) {
                return (
                  folder.id ===
                  "folder-ultramax-kids-nickelodeon"
                );
              }
            );

          var insertAt =
            nickelodeonIndex >= 0
              ? nickelodeonIndex + 1
              : kidsCollection.folders.length;

          kidsCollection.folders.splice(
            insertAt,
            0,
            createKidsNickJrFolder()
          );
        }

        window.v2Collections =
          v2Collections;
      }
    }

    if (
      typeof renderCollections ===
      "function"
    ) {
      renderCollections();
    }

    if (
      typeof s2RestoreFromSelected ===
      "function"
    ) {
      s2RestoreFromSelected();
    }

    if (
      typeof s2UpdatePreview ===
      "function"
    ) {
      s2UpdatePreview();
    }

    if (
      typeof updateCounter ===
      "function"
    ) {
      updateCounter();
    }

    if (
      typeof updateCategoryCounts ===
      "function"
    ) {
      updateCategoryCounts();
    }
  };

  window.enforceKidsSetupBeforeGenerate = function () {
    if (
      !document.body.classList.contains(
        "um-kids-mode"
      )
    ) {
      return;
    }

    var ratingField =
      document.getElementById("maxRating");

    var allowedRatings = [
      "G",
      "PG",
      "PG-13"
    ];

    var rating =
      ratingField &&
      allowedRatings.includes(ratingField.value)
        ? ratingField.value
        : "PG";

    if (ratingField) {
      ratingField.value = rating;
    }

    var approvedCatalogs = [
      "mdb_88307",
      "mdb_88309",
      "mdb_13",
      "animation_movies",
      "family_movies",
      "family_series",
      "disney_movies",
      "disney_series",
      "studio_disney",
      "mdb_3918",
      "mdb_3928",
      "network_nickelodeon",
      "network_cartoon",
      "network_disney_ch"
    ];

    if (rating === "G") {
      approvedCatalogs.push(
        "network_nickjr"
      );
    }

    if (
      typeof selected !== "undefined" &&
      selected
    ) {
      selected.clear();

      approvedCatalogs.forEach(
        function (id) {
          selected.add(id);
        }
      );
    }

    if (
      typeof hidden !== "undefined" &&
      hidden
    ) {
      Array.from(hidden).forEach(
        function (id) {
          if (!approvedCatalogs.includes(id)) {
            hidden.delete(id);
          }
        }
      );
    }

    var adultField =
      document.getElementById(
        "includeAdult"
      );

    if (adultField) {
      adultField.checked = false;
      adultField.disabled = true;
    }

    if (
      typeof buildKidsSetupCollections ===
      "function"
    ) {
      v2Collections =
        buildKidsSetupCollections();

      window.v2Collections =
        v2Collections;
    }

    if (
      rating === "G" &&
      Array.isArray(v2Collections)
    ) {
      var kidsCollection =
        v2Collections.find(
          function (collection) {
            return (
              collection &&
              collection.id ===
                "collection-ultramax-kids"
            );
          }
        );

      if (
        kidsCollection &&
        Array.isArray(
          kidsCollection.folders
        )
      ) {
        var hasNickJr =
          kidsCollection.folders.some(
            function (folder) {
              return (
                folder &&
                folder.id ===
                  "folder-ultramax-kids-nick-jr"
              );
            }
          );

        if (!hasNickJr) {
          var nickelodeonIndex =
            kidsCollection.folders.findIndex(
              function (folder) {
                return (
                  folder &&
                  folder.id ===
                    "folder-ultramax-kids-nickelodeon"
                );
              }
            );

          kidsCollection.folders.splice(
            nickelodeonIndex >= 0
              ? nickelodeonIndex + 1
              : kidsCollection.folders.length,
            0,
            createKidsNickJrFolder()
          );
        }
      }
    }

    if (Array.isArray(v2Collections)) {
      v2Collections.forEach(
        function (collection) {
          (
            collection.folders || []
          ).forEach(function (folder) {
            folder.focusGifUrl = "";
            folder.focusGifEnabled = false;
          });
        }
      );

      window.v2Collections =
        v2Collections;
    }

    if (
      typeof s2UpdateAll ===
      "function"
    ) {
      s2UpdateAll();
    }

    if (
      typeof renderCollections ===
      "function"
    ) {
      renderCollections();
    }

    collapseKidsCatalogGroups();
  };

  function collapseKidsCatalogGroups() {
    if (
      !document.body.classList.contains(
        "um-kids-mode"
      )
    ) {
      return;
    }

    var modernSearch =
      document.getElementById("s2SearchInput");

    if (modernSearch) {
      modernSearch.value = "";
    }

    document
      .querySelectorAll(".s2-cat")
      .forEach(function (category) {
        category.style.display = "";
        category.classList.remove("s2-open");
      });

    document
      .querySelectorAll(".pills-wrap")
      .forEach(function (wrapper) {
        wrapper.classList.remove("open");
      });

    document
      .querySelectorAll(".cat-chevron")
      .forEach(function (chevron) {
        chevron.classList.remove("open");
      });

    document
      .querySelectorAll(".sub-pills")
      .forEach(function (wrapper) {
        wrapper.style.display = "none";
      });

    document
      .querySelectorAll(".sub-cat-chevron")
      .forEach(function (chevron) {
        chevron.classList.remove("open");
      });
  }

  function applyKidsSetupMode() {
    if (typeof clearCurrentBuilderState === "function") {
      clearCurrentBuilderState();
    }

    var catalogIds = kidsSetupCatalogs();

    catalogIds.forEach(function (id) {
      if (typeof selected !== "undefined" && selected) {
        selected.add(id);
      }

      var legacyPill = document.querySelector(
        '.pill[data-id="' + id + '"]'
      );

      if (legacyPill) {
        legacyPill.classList.add("selected");
      }

      var modernPill = document.getElementById(
        "s2pill-" + id
      );

      if (modernPill) {
        modernPill.classList.add("s2-sel");
      }
    });

    if (
      typeof v2Collections !== "undefined"
    ) {
      v2Collections = buildKidsSetupCollections();
      window.v2Collections = v2Collections;
    }

    var adult = document.getElementById(
      "includeAdult"
    );

    if (adult) {
      adult.checked = false;
      adult.disabled = true;
    }

    var rating = document.getElementById(
      "maxRating"
    );

    if (rating) {
      rating.value = "PG";
    }

    var preserveKitsu =
      document.getElementById(
        "preserveKitsuIds"
      );

    if (preserveKitsu) {
      preserveKitsu.checked = false;
    }

    var digitalOnly =
      document.getElementById(
        "digitalReleaseOnly"
      );

    if (digitalOnly) {
      digitalOnly.checked = false;
    }

    if (
      typeof renderCollections === "function"
    ) {
      renderCollections();
    }

    if (
      typeof updateCounter === "function"
    ) {
      updateCounter();
    }

    if (
      typeof updateCategoryCounts === "function"
    ) {
      updateCategoryCounts();
    }

    if (
      typeof s2RestoreFromSelected === "function"
    ) {
      s2RestoreFromSelected();
    }

    if (
      typeof s2UpdatePreview === "function"
    ) {
      s2UpdatePreview();
    }

    window.syncKidsNickJrOption();
    collapseKidsCatalogGroups();

    if (
      typeof saveDraftState === "function"
    ) {
      saveDraftState();
    }
  }

  window.selectSetupMode = function (mode) {
    document.body.classList.remove('um-route-choosing');
    document.body.classList.remove('um-kids-mode');

    var adultField =
      document.getElementById('includeAdult');

    if (adultField) {
      adultField.disabled = false;
    }

    var chooser = element('umModeChooser');
    var reopen = element('umModeReopen');
    var toolbar = element('step1Toolbar');
    var quick = element('quickSetupV3');
    var advanced = element('advancedBuilderContainer');
    var returning = element('returningBox');
    var backBar = element('advancedBackBar');

    if (chooser) chooser.classList.add('hidden');
    if (reopen) reopen.classList.add('visible');
    if (toolbar) toolbar.style.display = 'none';

    if (returning) {
      returning.classList.remove('open');
    }

    if (mode === 'quick') {
      if (quick) quick.style.display = '';
      if (advanced) advanced.style.display = 'none';
      if (backBar) backBar.style.display = 'none';

      setTimeout(function () {
        if (quick) {
          quick.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }, 60);

      return;
    }

    if (mode === 'custom' || mode === 'full') {
      if (quick) quick.style.display = 'none';
      if (advanced) advanced.style.display = '';
      if (backBar) backBar.style.display = 'none';

      setTimeout(function () {
        if (advanced) {
          advanced.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }, 60);

      return;
    }

    if (mode === 'kids') {
      if (quick) quick.style.display = 'none';
      if (advanced) advanced.style.display = '';
      if (backBar) backBar.style.display = 'none';

      document.body.classList.add(
        'um-kids-mode'
      );

      applyKidsSetupMode();

      setTimeout(function () {
        if (advanced) {
          advanced.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }

        if (
          typeof s2Init === 'function'
        ) {
          Promise.resolve(
            s2Init()
          ).then(function () {
            if (
              typeof s2RestoreFromSelected ===
              'function'
            ) {
              s2RestoreFromSelected();
            }

            if (
              typeof s2UpdatePreview ===
              'function'
            ) {
              s2UpdatePreview();
            }

            collapseKidsCatalogGroups();
          });
        }
      }, 80);

      return;
    }

    if (mode === 'restore') {
      if (quick) quick.style.display = 'none';
      if (advanced) advanced.style.display = 'none';

      if (
        typeof openReturningTools === 'function'
      ) {
        openReturningTools();
      } else if (returning) {
        returning.classList.add('open');
      }

      setTimeout(function () {
        if (returning) {
          returning.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });

          var input =
            document.getElementById('returningToken');

          if (input) input.focus();
        }
      }, 80);
    }
  };

  function initialiseSetupModeChooser() {
    var params =
      new URLSearchParams(location.search);

    var token = params.get('token');
    var shortcut = params.get('shortcut');
    var pathHasToken = /^\/configure\/[^/]+\/?$/i.test(location.pathname || '');
    var returningLoadActive =
      window._tokenLoadInProgress === true ||
      window.um_isReturningUser === true;

    if (shortcut === 'load-token') {
      window.selectSetupMode('restore');
      return;
    }

    if (shortcut === 'new-setup') {
      window._skipDraftAutoRestore = true;
      window.showSetupModeChooser();
      if (typeof window.showNewSetupChoices === 'function') {
        window.showNewSetupChoices();
      }
      return;
    }

    if (shortcut === 'continue-setup' || shortcut === 'resume-draft') {
      window._skipDraftAutoRestore = true;
      window.selectSetupMode('full');

      // When Continue includes a remembered token, setup-page-bootstrap owns
      // the authenticated server load first and overlays the local working
      // progress afterwards. Local-only drafts still restore directly.
      if(token) return;

      setTimeout(function(){
        if(typeof restoreDraftState === 'function') restoreDraftState();
      }, 50);
      return;
    }

    if (shortcut === 'setup-guide') {
      window.selectSetupMode('full');
      try {
        params.delete('shortcut');
        history.replaceState(
          history.state,
          '',
          location.pathname +
            (params.toString() ? '?' + params.toString() : '') +
            location.hash
        );
      } catch (_error) {}
      setTimeout(function () {
        if (typeof window.showHowToUse === 'function') {
          window.showHowToUse();
        } else if (typeof showHowToUse === 'function') {
          showHowToUse();
        }
      }, 60);
      return;
    }

    if (shortcut === 'support') {
      window.selectSetupMode('full');
      try {
        params.delete('shortcut');
        history.replaceState(
          history.state,
          '',
          location.pathname +
            (params.toString() ? '?' + params.toString() : '') +
            location.hash
        );
      } catch (_error) {}
      setTimeout(function () {
        if (typeof window.openSupportModal === 'function') {
          window.openSupportModal();
        } else if (typeof openSupportModal === 'function') {
          openSupportModal();
        }
      }, 60);
      return;
    }

    if (token || pathHasToken || returningLoadActive) {
      // Returning-user auth can begin before DOMContentLoaded. Do not let this
      // late initializer put the setup chooser back over a config that is
      // already authenticating/loading just because ?token= is no longer in
      // the URL (the load flow switches to /configure/<token> via pushState).
      window.selectSetupMode('full');
      return;
    }

    var nativeMode = params.get('native') === '1' ||
      (typeof umIsStandalone === 'function' && umIsStandalone());
    if (
      nativeMode &&
      typeof window.hasRecoverableDraftState === 'function' &&
      window.hasRecoverableDraftState()
    ) {
      // A native app relaunch should feel like a resume, not a factory reset.
      // The autosave module restores the draft a moment later; keep the builder
      // visible now so the setup-mode chooser does not cover the recovered form.
      window.selectSetupMode('full');
      window._nativeDraftResumePending = true;
      return;
    }

    window.showSetupModeChooser();
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initialiseSetupModeChooser
    );
  } else {
    initialiseSetupModeChooser();
  }
})();
