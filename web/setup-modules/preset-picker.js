var _pickerKey = null;
var _pickerCard = null;
var _pickerFolders = [];

function s3PresetClick(card, key){
  if((key === 'latest' || key === 'decades') && !getDiscoveryProviderState().hasMdblist){
    showBanner(
      umT('setup.discoveryProviders.mdblistPresetUnavailable', 'Requires an MDBList API key.'),
      'error'
    );
    return;
  }
  _pickerKey = key;
  _pickerCard = card;
  _pickerFolders = getPresetFolders(key);
  if(!_pickerFolders.length){ return; }
  var modal = document.getElementById('presetPickerModal');
  var title = document.getElementById('pickerTitle');
  var list = document.getElementById('pickerList');
  if(!modal) return;
  var nameEl = card.querySelector('.s3-preset-name');
  if(title) title.textContent = nameEl ? nameEl.textContent : key;
  list.innerHTML = _pickerFolders.map(function(folder, idx){
    var cover = folder.coverImageUrl || '';
    return '<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--hover);border:1px solid var(--border);border-radius:10px;cursor:pointer;">'
      + '<input type="checkbox" data-idx="'+idx+'" checked style="width:16px;height:16px;accent-color:var(--violet);flex-shrink:0;">'
      + (cover ? '<img src="'+cover+'" style="width:48px;height:27px;object-fit:cover;border-radius:5px;flex-shrink:0;" loading="lazy">' : '<div style="width:48px;height:27px;background:var(--bg2);border-radius:5px;flex-shrink:0;"></div>')
      + '<span style="font-size:13px;color:var(--text);font-weight:600;">'+escapeHtml(folder.title)+'</span>'
      + '</label>';
  }).join('');
  modal.style.display = 'flex';
}

function pickerSelectAll(){ document.querySelectorAll('#pickerList input[type=checkbox]').forEach(function(cb){ cb.checked = true; }); }
function pickerSelectNone(){ document.querySelectorAll('#pickerList input[type=checkbox]').forEach(function(cb){ cb.checked = false; }); }

function closePresetPicker(){
  var modal = document.getElementById('presetPickerModal');
  if(modal) modal.style.display = 'none';
  _pickerKey = null; _pickerCard = null; _pickerFolders = [];
}

function confirmPresetPicker(){
  var selectedFolders = Array.from(document.querySelectorAll('#pickerList input[type=checkbox]'))
    .map(function(cb, idx){ return cb.checked ? _pickerFolders[idx] : null; })
    .filter(Boolean);
  if(selectedFolders.length){
    var titles = {streaming:'Streaming Services',latest:'New & Latest',trending:'Trending & Popular',genres:'Genres',anime:'Anime',documentaries:'Documentaries',bollywood:'Bollywood',international:'International Cinema',themed:'Themed',collections:'Film Collections',studios:'Studios',directors:'Directors',actors:'Actors',trakt:'Trakt',decades:'By Decade',kids:'Kids & Family',sports:'Sports',universes:'Universes',uk:'UK'};
    v2Collections.push({ title: titles[_pickerKey] || _pickerKey, folders: selectedFolders });

    console.log(
      '[SPORTS-STATE] after preset push',
      {
        key:_pickerKey,
        collectionTitles:(v2Collections || []).map(function(c){ return c && c.title; }),
        sportsFolders:(v2Collections || [])
          .filter(function(c){ return c && c.title === 'Sports'; })
          .map(function(c){
            return (c.folders || []).map(function(f){
              return {
                title:f.title,
                rows:(f.rows || []).slice()
              };
            });
          })
      }
    );

    /*
     * Collection membership is independent of Step 2 selection. Keep this
     * compatibility hook for warning/UI refreshes, but never auto-select or
     * auto-hide rows merely because a collection references them.
     */
    if(typeof syncHiddenFromCollections === 'function'){
      syncHiddenFromCollections();
    }

    if(typeof syncCatalogOrder === 'function'){
      syncCatalogOrder();
    }

    if(typeof persistStep2State === 'function'){
      persistStep2State();
    }

    if(_pickerCard){ _pickerCard.classList.remove('just-added'); void _pickerCard.offsetWidth; _pickerCard.classList.add('just-added'); }
    renderCollectionsDebounced();
    if(typeof afterPresetAdded === 'function') afterPresetAdded(_pickerKey);
  }
  closePresetPicker();
}

function getPresetFolders(key){
  var orig = v2Collections.length;

  try {
    loadPreset(key, { previewOnly: true });

    if(v2Collections.length > orig){
      var added = v2Collections[v2Collections.length - 1];
      return getEffectiveCollectionFolders(
        Array.isArray(added.folders) ? added.folders : []
      );
    }

    return [];
  } finally {
    // Opening or cancelling the picker must never leave a preset committed.
    if(v2Collections.length > orig){
      v2Collections.splice(orig);
    }
  }
}

/* ULTRA MAX STEP 3 PRESET EXPERIENCE */
(function(){
  var PRESET_GROUPS = [
    { key:'start', eyebrow:'QUICK START', title:'Start here', desc:'The most useful everyday collection layouts.', presets:['streaming','latest','trending','genres'] },
    { key:'specialist', eyebrow:'BROWSE & SPECIALIST', title:'Explore by interest', desc:'Focused collections for families, factual, anime, sport, themes and eras.', presets:['kids','documentaries','anime','sports','themed','decades'] },
    { key:'people', eyebrow:'PEOPLE & INDUSTRY', title:'People and studios', desc:'Keep actors, directors and production studios together.', presets:['actors','directors','studios'] },
    { key:'worlds', eyebrow:'FRANCHISES & WORLDS', title:'Franchises and universes', desc:'Movie series and connected screen universes.', presets:['collections','universes'] },
    { key:'regions', eyebrow:'REGIONS & CULTURE', title:'International and UK', desc:'Regional cinema and UK-focused collections.', presets:['international','bollywood','uk'] },
    { key:'connected', eyebrow:'CONNECTED', title:'Account collections', desc:'Collections powered by connected services.', presets:['trakt'] }
  ];

  var PRESET_TITLES = {
    streaming:'Streaming Services',
    latest:'New & Latest',
    trending:'Trending & Popular',
    genres:'Genres',
    anime:'Anime',
    documentaries:'Documentaries',
    bollywood:'Bollywood',
    international:'International Cinema',
    themed:'Themed',
    collections:'Film Collections',
    studios:'Studios',
    directors:'Directors',
    actors:'Actors',
    trakt:'Trakt',
    decades:'By Decade',
    kids:'Kids & Family',
    sports:'Sports',
    universes:'Universes',
    uk:'UK'
  };

  function allPresetKeys(){
    var keys = [];
    PRESET_GROUPS.forEach(function(group){
      group.presets.forEach(function(key){
        if(keys.indexOf(key) === -1) keys.push(key);
      });
    });
    return keys;
  }

  function normaliseCollectionTitle(value){
    return String(value || '').trim().toLowerCase();
  }

  window.addAllCollectionPresets = function(button){
    if(button && button.disabled) return;

    var originalLabel = button ? button.textContent : '';
    if(button){
      button.disabled = true;
      button.textContent = 'Adding collections…';
    }

    try {
      var discovery = typeof getDiscoveryProviderState === 'function'
        ? getDiscoveryProviderState()
        : {};
      var existingTitles = new Set(
        (Array.isArray(v2Collections) ? v2Collections : [])
          .map(function(collection){
            return normaliseCollectionTitle(collection && collection.title);
          })
          .filter(Boolean)
      );

      var added = 0;
      var alreadyThere = 0;
      var unavailable = [];

      allPresetKeys().forEach(function(key){
        var title = PRESET_TITLES[key] || key;
        var titleKey = normaliseCollectionTitle(title);

        if(existingTitles.has(titleKey)){
          alreadyThere += 1;
          return;
        }

        if((key === 'latest' || key === 'decades') && !discovery.hasMdblist){
          unavailable.push(title);
          return;
        }

        var folders = getPresetFolders(key);
        if(!folders.length){
          unavailable.push(title);
          return;
        }

        v2Collections.push({
          title: title,
          folders: folders
        });
        existingTitles.add(titleKey);
        added += 1;
      });

      /*
       * Match the normal preset-commit hooks. Collection membership remains
       * independent from Step 2 selection: this bulk action changes only the
       * user's collection list, never their selected/hidden catalog rows.
       */
      if(added){
        if(typeof syncHiddenFromCollections === 'function'){
          syncHiddenFromCollections();
        }
        if(typeof syncCatalogOrder === 'function'){
          syncCatalogOrder();
        }
        if(typeof persistStep2State === 'function'){
          persistStep2State();
        }
        if(typeof saveDraftState === 'function'){
          saveDraftState();
        }
        if(typeof renderCollectionsDebounced === 'function'){
          renderCollectionsDebounced();
        } else if(typeof renderCollections === 'function'){
          renderCollections();
        }
      }

      var message = added
        ? 'Added ' + added + ' collection' + (added === 1 ? '' : 's') + ' with all available folders.'
        : 'All available preset collections are already added.';

      if(alreadyThere){
        message += ' ' + alreadyThere + ' already present.';
      }
      if(unavailable.length){
        message += ' Skipped ' + unavailable.length + ' unavailable preset' + (unavailable.length === 1 ? '' : 's') + '.';
      }

      if(typeof showBanner === 'function'){
        showBanner(message, added ? 'success' : 'info');
      }
    } finally {
      if(button){
        button.disabled = false;
        button.textContent = originalLabel || '＋ Add all collections';
      }
    }
  };

  var META = {
    streaming:{icon:'📡',tag:'Services',desc:'Group the major streaming services into clean, ready-made collections.'},
    latest:{icon:'🆕',name:'New & Latest',tag:'Fresh',desc:'New releases, currently airing titles and the latest provider additions.'},
    trending:{icon:'🔥',name:'Trending & Popular',tag:'Hot now',desc:'Trending, popular, in-theatres and anticipated rows grouped together.'},
    genres:{icon:'🎭',tag:'Browse',desc:'Build familiar genre collections for quick browsing by mood or type.'},
    anime:{icon:'🍥',tag:'Specialist',desc:'Anime discovery, shonen, isekai, slice of life and studio spotlights.'},
    kids:{icon:'🧒',tag:'Family',desc:'Kids movies, family favourites, preschool and animated studios.'},
    documentaries:{icon:'🎥',tag:'Factual',desc:'Documentaries, true crime, nature, history, science and more.'},
    bollywood:{icon:'🇮🇳',tag:'Cinema',desc:'Bollywood discovery grouped by action, comedy, romance and drama.'},
    international:{icon:'🌍',tag:'World cinema',desc:'Korean, Japanese, Chinese, French and other international cinema.'},
    themed:{icon:'✨',tag:'Curated',desc:'Mind-benders, space, time travel, horror and other themed groups.'},
    collections:{icon:'🗂',tag:'Franchises',desc:'Turn film franchises and long-running movie collections into folders.'},
    studios:{icon:'🎬',tag:'Industry',desc:'Group rows around major studios and production labels.'},
    directors:{icon:'🎥',tag:'People',desc:'Create collections around notable directors and their filmographies.'},
    actors:{icon:'⭐',tag:'People',desc:'Build actor-focused collections from the people rows you use.'},
    trakt:{icon:'🔗',tag:'Account',desc:'Bring Trakt trending, popular, anticipated and personal rows together.'},
    decades:{icon:'📅',tag:'Timeline',desc:'Organise your home by decade from classic cinema to the current era.'},
    sports:{icon:'🏆',tag:'Sports',desc:'Live sport, football, basketball, wrestling and specialist sports rows.'},
    universes:{icon:'🌌',tag:'Worlds',desc:'Group connected film and TV universes into dedicated collections.'},
    uk:{icon:'🇬🇧',tag:'UK',desc:'BBC, ITV, Channel 4, Sky, BritBox and other UK-focused rows.'}
  };

  function makeTrendingCard(){
    var existing = document.querySelector('#s3PresetsGrid .s3-preset-card[data-preset="trending"]');
    if(existing) return existing;
    var card = document.createElement('div');
    card.className = 's3-preset-card';
    card.dataset.preset = 'trending';
    card.onclick = function(){ if(typeof window.s3PresetClick === 'function') window.s3PresetClick(card, 'trending'); };
    card.innerHTML =
      '<div class="s3-preset-strip">' +
        '<img src="https://ultramax.vip/images/quick/trending_new__trending_movies__cover.png" loading="lazy" alt="">' +
        '<img src="https://ultramax.vip/images/quick/trending_new__trending_tv__cover.png" loading="lazy" alt="">' +
        '<img src="https://ultramax.vip/images/quick/trending_new__new_movies__cover.png" loading="lazy" alt="">' +
        '<img src="https://ultramax.vip/images/quick/trending_new__new_series__cover.png" loading="lazy" alt="">' +
      '</div>' +
      '<div class="s3-preset-body"><span class="s3-preset-icon">🔥</span><div class="s3-preset-name" data-i18n="setup.step3.presets.trending">Trending</div><div class="s3-preset-add">+ Add collection</div></div>';
    return card;
  }

  function upgradeCard(card){
    if(!card || card.dataset.experienceReady === '1') return;
    var key = card.dataset.preset || '';
    var meta = META[key] || {};
    var body = card.querySelector('.s3-preset-body');
    var icon = card.querySelector('.s3-preset-icon');
    var name = card.querySelector('.s3-preset-name');
    var add = card.querySelector('.s3-preset-add');
    if(!body || !icon || !name || !add) return;

    if(meta.icon) icon.textContent = meta.icon;
    if(meta.name){ name.textContent = meta.name; name.removeAttribute('data-i18n'); }

    var titleLine = document.createElement('div');
    titleLine.className = 's3-preset-titleline';
    body.insertBefore(titleLine, body.firstChild);
    titleLine.appendChild(icon);
    titleLine.appendChild(name);

    var desc = document.createElement('p');
    desc.className = 's3-preset-desc';
    desc.textContent = meta.desc || 'Create a ready-made collection from these rows.';
    body.appendChild(desc);

    var footer = document.createElement('div');
    footer.className = 's3-preset-footer';
    var tag = document.createElement('span');
    tag.className = 's3-preset-tag';
    tag.textContent = meta.tag || 'Collection';
    add.textContent = 'Choose folders';
    add.removeAttribute('data-i18n');
    footer.appendChild(tag);
    footer.appendChild(add);
    body.appendChild(footer);

    var strip = card.querySelector('.s3-preset-strip');
    if(strip){
      strip.querySelectorAll('img').forEach(function(img){
        img.addEventListener('error', function(){ img.style.visibility = 'hidden'; strip.classList.add('has-missing-art'); }, {once:true});
      });
    }
    card.dataset.experienceReady = '1';
  }

  function buildExperience(){
    var panel = document.getElementById('presetsPanel');
    var grid = document.getElementById('s3PresetsGrid');
    if(!panel || !grid || panel.dataset.experienceReady === '1') return;

    var sticky = document.getElementById('s3StickyPresets');
    if(sticky) sticky.remove();

    var label = panel.querySelector(':scope > .s3-label');
    if(label){ label.textContent = 'Presets'; label.removeAttribute('data-i18n'); }
    var intro = panel.querySelector(':scope > p');
    if(intro){
      intro.textContent = 'Start with an everyday collection below. More specialised presets are organised underneath.';
      intro.removeAttribute('data-i18n');
    }

    var bulk = document.createElement('div');
    bulk.className = 's3-preset-bulk-actions';
    bulk.innerHTML =
      '<div class="s3-preset-bulk-copy"><strong>Add everything</strong><span>Load every available preset collection with all of its folders in one go.</span></div>' +
      '<button type="button" class="nav-btn primary s3-add-all-collections">＋ Add all collections</button>';
    var bulkButton = bulk.querySelector('.s3-add-all-collections');
    bulkButton.addEventListener('click', function(event){
      event.preventDefault();
      event.stopPropagation();
      window.addAllCollectionPresets(bulkButton);
    });

    var trending = makeTrendingCard();
    var latest = grid.querySelector('.s3-preset-card[data-preset="latest"]');
    if(trending && !trending.parentNode) grid.insertBefore(trending, latest ? latest.nextSibling : grid.firstChild);

    var cards = Array.from(grid.querySelectorAll(':scope > .s3-preset-card'));
    cards.forEach(upgradeCard);

    var cardsByKey = {};
    cards.forEach(function(card){ cardsByKey[card.dataset.preset || ''] = card; });
    var used = new Set();
    var primarySections = document.createDocumentFragment();
    var secondarySections = document.createDocumentFragment();
    var secondaryPresetCount = 0;
    var secondarySectionCount = 0;

    PRESET_GROUPS.forEach(function(group, groupIndex){
      var section = document.createElement('section');
      section.className = 's3-preset-section' + (groupIndex === 0 ? ' is-primary' : '');
      section.dataset.presetGroup = group.key;

      var heading = document.createElement('div');
      heading.className = 's3-preset-section-heading';
      heading.innerHTML = '<div><span class="s3-preset-section-eyebrow">' + group.eyebrow + '</span><h3>' + group.title + '</h3><p>' + group.desc + '</p></div>';
      section.appendChild(heading);

      var sectionGrid = document.createElement('div');
      sectionGrid.className = 's3-preset-section-grid';
      group.presets.forEach(function(key){
        var card = cardsByKey[key];
        if(!card) return;
        used.add(key);
        card.classList.remove('s3-preset-primary','s3-preset-secondary');
        card.classList.add(groupIndex === 0 ? 's3-preset-primary' : 's3-preset-secondary');
        sectionGrid.appendChild(card);
        if(groupIndex !== 0) secondaryPresetCount += 1;
      });
      if(sectionGrid.children.length){
        section.appendChild(sectionGrid);
        if(groupIndex === 0){
          primarySections.appendChild(section);
        } else {
          secondarySections.appendChild(section);
          secondarySectionCount += 1;
        }
      }
    });

    var ungrouped = cards.filter(function(card){ return !used.has(card.dataset.preset || ''); });
    if(ungrouped.length){
      console.warn('[Ultra MAX] Uncategorised collection presets', ungrouped.map(function(card){ return card.dataset.preset; }));
      var fallback = document.createElement('section');
      fallback.className = 's3-preset-section';
      fallback.dataset.presetGroup = 'uncategorised';
      fallback.innerHTML = '<div class="s3-preset-section-heading"><div><span class="s3-preset-section-eyebrow">OTHER</span><h3>Uncategorised</h3><p>New presets waiting to be assigned to a collection group.</p></div></div>';
      var fallbackGrid = document.createElement('div');
      fallbackGrid.className = 's3-preset-section-grid';
      ungrouped.forEach(function(card){
        card.classList.add('s3-preset-secondary');
        fallbackGrid.appendChild(card);
        secondaryPresetCount += 1;
      });
      fallback.appendChild(fallbackGrid);
      secondarySections.appendChild(fallback);
      secondarySectionCount += 1;
    }

    grid.innerHTML = '';
    grid.className = 's3-presets-experience';
    grid.appendChild(primarySections);

    if(secondarySectionCount){
      var browser = document.createElement('details');
      browser.className = 's3-preset-browser';
      browser.innerHTML =
        '<summary>' +
          '<span class="s3-preset-browser-icon" aria-hidden="true">＋</span>' +
          '<span class="s3-preset-browser-copy">' +
            '<strong>Browse more collection presets</strong>' +
            '<small>Specialist, people, franchises, regions and connected services</small>' +
          '</span>' +
          '<span class="s3-preset-browser-count">' + secondaryPresetCount + ' presets</span>' +
          '<span class="s3-preset-browser-chev" aria-hidden="true">⌄</span>' +
        '</summary>';
      var browserBody = document.createElement('div');
      browserBody.className = 's3-preset-browser-body';
      browserBody.appendChild(secondarySections);
      browserBody.appendChild(bulk);
      browser.appendChild(browserBody);
      grid.appendChild(browser);
    } else {
      grid.appendChild(bulk);
    }

    panel.dataset.experienceReady = '1';

    if(typeof window.updateDiscoveryCapabilityUi === 'function') window.updateDiscoveryCapabilityUi();
  }

  function boot(){ buildExperience(); }
  // Step 3 markup appears before this script, so enhance it immediately while
  // the page is still parsing. Waiting for DOMContentLoaded exposed the old
  // preset grid long enough to create a visible flash/reflow on slower loads.
  boot();
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  window.addEventListener('load', boot, {once:true});
})();
