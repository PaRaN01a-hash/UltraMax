(function initialiseStep1OptionGroups(global) {
  function directOptionalSections(shell) {
    return Array.prototype.filter.call(shell.children, function (child) {
      return child && child.tagName === 'DETAILS' && child.classList.contains('opt-subsection');
    });
  }

  function findSectionWith(sections, selector) {
    for (var i = 0; i < sections.length; i += 1) {
      if (sections[i].querySelector(selector)) return sections[i];
    }
    return null;
  }

  function directGroups(shell) {
    return Array.prototype.filter.call(shell.children, function (child) {
      return child && child.tagName === 'DETAILS' && child.classList.contains('step1-option-group');
    });
  }

  function uiIcon(name) {
    var icons = {
      globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
      sparkles: '<path d="m12 3 1.15 3.35L16.5 7.5l-3.35 1.15L12 12l-1.15-3.35L7.5 7.5l3.35-1.15L12 3Z"/><path d="m18 13 .75 2.25L21 16l-2.25.75L18 19l-.75-2.25L15 16l2.25-.75L18 13ZM5 13l.6 1.9L7.5 15.5l-1.9.6L5 18l-.6-1.9-1.9-.6 1.9-.6L5 13Z"/>',
      image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m5 18 5-5 3 3 2-2 4 4"/>',
      link: '<path d="M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      sliders: '<path d="M4 6h8M16 6h4M4 12h3M11 12h9M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
      code: '<path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14"/>',
      media: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9Z"/>',
      layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
      images: '<rect x="5" y="3" width="16" height="14" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2h12"/><circle cx="10" cy="8" r="1.2"/><path d="m7 15 4-4 2.5 2.5L15 12l4 3"/>'
    };
    var body = icons[name] || icons.code;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">' + body + '</svg>';
  }

  function makeActionButton(label, action, danger) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'step1-group-action' + (danger ? ' is-danger' : '');
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  }

  function makeOpenRow(config) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'step1-open-row';
    button.innerHTML =
      '<span class="step1-open-row-icon" aria-hidden="true">' + config.icon + '</span>' +
      '<span class="step1-open-row-copy">' +
        '<span class="step1-open-row-title">' + config.title + '</span>' +
        '<span class="step1-open-row-sub">' + config.subtitle + '</span>' +
      '</span>' +
      '<span class="step1-open-row-arrow" aria-hidden="true">↗</span>';
    button.addEventListener('click', config.action);
    return button;
  }

  function makeGroup(config) {
    var group = document.createElement('details');
    group.className = 'step1-option-group';
    group.id = config.id;

    var summary = document.createElement('summary');
    summary.innerHTML =
      '<span class="step1-option-group-icon" aria-hidden="true">' + config.icon + '</span>' +
      '<span class="step1-option-group-copy">' +
        '<span class="step1-option-group-title">' + config.title + '</span>' +
        '<span class="step1-option-group-sub">' + config.subtitle + '</span>' +
      '</span>' +
      '<span class="step1-option-group-chevron" aria-hidden="true">⌄</span>';

    var body = document.createElement('div');
    body.className = 'step1-option-group-body';

    (config.sections || []).forEach(function (section) {
      if (!section) return;
      section.classList.add('step1-option-group-child');
      body.appendChild(section);
    });

    group.appendChild(summary);
    group.appendChild(body);
    return { group: group, body: body };
  }

  function closeOtherGroups(shell, current) {
    directGroups(shell).forEach(function (group) {
      if (group !== current && group.open) group.removeAttribute('open');
    });
  }

  function makeRuleSection(config) {
    var details = document.createElement('details');
    details.className = 'step1-rule-section';
    details.id = config.id;

    var summary = document.createElement('summary');
    summary.innerHTML =
      '<span class="step1-rule-section-icon" aria-hidden="true">' + config.icon + '</span>' +
      '<span class="step1-rule-section-copy">' +
        '<span class="step1-rule-section-title">' + config.title + '</span>' +
        '<span class="step1-rule-section-sub">' + config.subtitle + '</span>' +
      '</span>' +
      '<span class="step1-rule-section-chevron" aria-hidden="true">⌄</span>';

    var body = document.createElement('div');
    body.className = 'step1-rule-section-body';
    details.appendChild(summary);
    details.appendChild(body);
    return { details: details, body: body };
  }

  function directElementChildren(element) {
    return Array.prototype.filter.call(element.children || [], function (child) {
      return child && child.nodeType === 1;
    });
  }

  function findFieldBlock(root, selector) {
    var control = root.querySelector(selector);
    if (!control || typeof control.closest !== 'function') return null;
    var block = control.closest('.field-block');
    return block && root.contains(block) ? block : null;
  }

  function moveField(root, destination, selector, moved) {
    var block = findFieldBlock(root, selector);
    if (!block || moved.indexOf(block) !== -1) return;
    destination.appendChild(block);
    moved.push(block);
  }

  function compactLongHelp(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.info-box'), function (box) {
      if (!box || box.closest('.step1-inline-help')) return;
      var copy = (box.textContent || '').replace(/\s+/g, ' ').trim();
      if (copy.length < 155) return;

      var details = document.createElement('details');
      details.className = 'step1-inline-help';
      var summary = document.createElement('summary');
      summary.textContent = 'What does this mean?';
      var body = document.createElement('div');
      body.className = 'step1-inline-help-body';

      box.parentNode.insertBefore(details, box);
      body.appendChild(box);
      details.appendChild(summary);
      details.appendChild(body);
    });
  }

  function organiseContentRules(contentFilters) {
    if (!contentFilters || contentFilters.dataset.step1RuleGroups === '1') return;

    var release = makeRuleSection({
      id: 'step1ReleaseRules',
      icon: uiIcon('media'),
      title: 'Release & Ratings',
      subtitle: 'Release timing, age limits and catalogue filters.'
    });
    var anime = makeRuleSection({
      id: 'step1AnimeRules',
      icon: uiIcon('layers'),
      title: 'Anime',
      subtitle: 'Presentation, IDs and anime visibility.'
    });
    var regional = makeRuleSection({
      id: 'step1RegionalRules',
      icon: uiIcon('globe'),
      title: 'Regional Content',
      subtitle: 'Control regional content in general catalogue rows.'
    });

    var moved = [];

    [
      '#excludeUnreleased',
      '#digitalReleaseOnly',
      '#hideWatched',
      '#hideUnavailableStreams',
      '#episodeReleaseDelayHours',
      '#includeAdult',
      '#maxRating'
    ].forEach(function (selector) {
      moveField(contentFilters, release.body, selector, moved);
    });

    [
      '#animePresentationMode',
      '#preserveKitsuIds',
      '#animeFilterPills'
    ].forEach(function (selector) {
      moveField(contentFilters, anime.body, selector, moved);
    });

    moveField(contentFilters, regional.body, '#indianCinemaFilterPills', moved);

    var advanced = null;
    directElementChildren(contentFilters).forEach(function (child) {
      if (
        !advanced &&
        child.tagName === 'DETAILS' &&
        child.classList.contains('opt-subsection') &&
        child.querySelector('#cfMinRating')
      ) {
        advanced = child;
      }
    });
    if (advanced) {
      release.body.appendChild(advanced);
      moved.push(advanced);
    }

    var topSummary = directElementChildren(contentFilters).filter(function (child) {
      return child.tagName === 'SUMMARY';
    })[0] || null;

    directElementChildren(contentFilters).forEach(function (child) {
      if (
        child === topSummary ||
        child === release.details ||
        child === anime.details ||
        child === regional.details ||
        moved.indexOf(child) !== -1
      ) return;
      release.body.appendChild(child);
      moved.push(child);
    });

    contentFilters.appendChild(release.details);
    contentFilters.appendChild(anime.details);
    contentFilters.appendChild(regional.details);

    [release.details, anime.details, regional.details].forEach(function (section) {
      section.addEventListener('toggle', function () {
        if (!section.open) return;
        [release.details, anime.details, regional.details].forEach(function (other) {
          if (other !== section && other.open) other.removeAttribute('open');
        });
      });
    });

    compactLongHelp(contentFilters);
    contentFilters.dataset.step1RuleGroups = '1';
  }

  function initialise() {
    var shell = document.getElementById('optionalEnhancementsShell');
    if (!shell) return;
    if (shell.dataset.simplifiedGroups === '1' && directGroups(shell).length) return;
    if (shell.dataset.simplifiedGroups === '1') delete shell.dataset.simplifiedGroups;

    var sections = directOptionalSections(shell);
    if (!sections.length) return;

    var ai = findSectionWith(sections, '#googleAiKey');
    var metadata = findSectionWith(sections, '#language');
    var posters = document.getElementById('postersSection');
    var betterPosters = document.getElementById('betterPostersSection');
    var pictorium = document.getElementById('pictoriumSection');
    var languageFilter = findSectionWith(sections, '.lang-exclude-cb');
    var cloud = document.getElementById('premiumizeLibrarySection');
    var integrations = findSectionWith(sections, '#traktConnectStatus');
    var search = findSectionWith(sections, '#searchMovieName');
    var contentFilters = findSectionWith(sections, '#excludeUnreleased');
    var streams = document.getElementById('advancedStreamBridgeBlock');

    organiseContentRules(contentFilters);

    var groups = [
      makeGroup({
        id: 'step1LanguageGroup',
        icon: uiIcon('globe'),
        title: 'Language & Region',
        subtitle: 'Metadata language, time zone and language filtering.',
        sections: [metadata, languageFilter]
      }),
      makeGroup({
        id: 'step1RecommendationsGroup',
        icon: uiIcon('sparkles'),
        title: 'Recommendations',
        subtitle: 'AI-powered recommendation rows.',
        sections: [ai]
      }),
      makeGroup({
        id: 'step1ArtworkGroup',
        icon: uiIcon('image'),
        title: 'Artwork',
        subtitle: 'Poster providers, Better Posters and Pictorium.',
        sections: [posters, betterPosters, pictorium]
      }),
      makeGroup({
        id: 'step1ConnectionsGroup',
        icon: uiIcon('link'),
        title: 'Connections',
        subtitle: 'Cloud Library, Trakt, Simkl and other accounts.',
        sections: [cloud, integrations]
      }),
      makeGroup({
        id: 'step1SearchGroup',
        icon: uiIcon('search'),
        title: 'Search',
        subtitle: 'Rename the movie and series search labels shown in Nuvio and Stremio.',
        sections: [search]
      }),
      makeGroup({
        id: 'step1ContentRulesGroup',
        icon: uiIcon('sliders'),
        title: 'Content Rules',
        subtitle: 'Age, release, anime and advanced filters.',
        sections: [contentFilters]
      }),
      makeGroup({
        id: 'step1AdvancedGroup',
        icon: uiIcon('code'),
        title: 'Advanced',
        subtitle: 'Streams, debrid and specialist options.',
        sections: [streams]
      })
    ];

    var assetRow = makeOpenRow({
      icon: uiIcon('images'),
      title: 'Asset Library',
      subtitle: 'Browse Ultra MAX artwork and assets.',
      action: function () {
        if (typeof global.openAssetModal === 'function') global.openAssetModal(-1, -1, 'standalone');
      }
    });
    groups[2].body.insertBefore(assetRow, groups[2].body.firstChild);

    shell.textContent = '';
    groups.forEach(function (entry) {
      shell.appendChild(entry.group);
    });

    directGroups(shell).forEach(function (group) {
      group.addEventListener('toggle', function () {
        if (group.open) closeOtherGroups(shell, group);
      });
    });

    shell.dataset.simplifiedGroups = '1';
  }

  function recheck() {
    initialise();
    setTimeout(initialise, 250);
    setTimeout(initialise, 1000);
  }

  initialise();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', recheck);
  } else {
    recheck();
  }
  global.addEventListener('pageshow', recheck);
})(window);
