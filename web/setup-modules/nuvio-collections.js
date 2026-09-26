function getGeneratedAddonId(){
  /*
   * Nuvio collection sources resolve against the installed add-on manifest id.
   * The dedicated /n/ manifest gives each Ultra MAX token its own stable id.
   */
  var token = String(window.generatedToken || editToken || '').trim().toLowerCase();
  var profileSuffix = window.activeDeviceProfileId
    ? '.' + String(window.activeDeviceProfileId).toLowerCase()
    : '';

  if(token){
    return 'com.ultramax.nuvio.' + token + profileSuffix;
  }

  /* Pre-generation preview only. A real Nuvio push always has a token. */
  return window.activeDeviceProfileId
    ? 'com.ultramax.' + String(window.activeDeviceProfileId).toLowerCase()
    : 'com.ultramax';
}

function isUltraMaxGeneratedAddonId(addonId){
  var id = String(addonId || '').trim();

  /*
   * Legacy collection files used the manifest JSON id.
   */
  if(
    id === 'com.ultramax' ||
    id === 'com.ultramax'
  ){
    return true;
  }

  if(/^com\.ultramax\.nuvio\.[a-z0-9_-]+(?:\.[a-z0-9_-]+)?$/i.test(id)){
    return true;
  }

  /*
   * Current Nuvio collection sources use the installed manifest URL as their
   * addon identity. Accept both the legacy /c/ form and the dedicated /n/
   * form, including device-profile paths, so saved collections can migrate
   * without losing their Ultra MAX source classification.
   */
  try{
    var url = new URL(id);

    var validHost =
      url.hostname === 'ultramax.vip';

    var validPath =
      /^\/[cn]\/[^/]+(?:\/p\/[^/]+)?\/manifest\.json$/.test(
        url.pathname
      );

    return validHost && validPath;
  }catch(e){
    return false;
  }
}


function getCatalogSourceType(id){
  var canonicalId = normalizeCatalogId(id);
  var mergedDef = (mergedCatalogs || []).find(function(item){
    return mergedDerivedIds(item).includes(canonicalId);
  });
  if(mergedDef){
    if(canonicalId.endsWith('_movies')) return 'movie';
    if(canonicalId.endsWith('_series')) return 'series';
    if(mergedDef.type === 'movie' || mergedDef.type === 'series') return mergedDef.type;
  }
  var def = typeof S2_DEFS !== 'undefined' ? S2_DEFS[canonicalId] : null;
  if(def){
    if(def.type === 'tv') return 'tv';
    if(def.type === 'shows') return 'series';
    if(def.type === 'movie' || def.type === 'series') return def.type;
  }

  var custom = (getCustomCatalogsFromForm() || []).concat(getCustomMdbListsFromForm() || [])
    .find(function(item){ return item && item.id === canonicalId; });
  if(custom && (custom.type === 'movie' || custom.type === 'series')) return custom.type;

  // Safe fallback for valid Ultra MAX catalogue ids that are not currently
  // present in S2_DEFS on this setup-page session.
  if(canonicalId.endsWith('_movies')) return 'movie';
  if(canonicalId.endsWith('_series')) return 'series';

  throw new Error('Unable to resolve catalog type for "' + canonicalId + '".');
}

function getNuvioViewMode(){
  const el = document.getElementById('nuvioViewMode');
  return el && el.value ? el.value : 'TABBED_GRID';
}

function safeNuvioId(prefix, value, fallback){
  const base = String(value || fallback || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return prefix + '-' + (base || Math.random().toString(36).slice(2, 9));
}

function buildCollectionsExport(options){
  var preserveUnavailable = !!(options && options.preserveUnavailable);
  console.log(
    '[SPORTS-STATE] buildCollectionsExport',
    {
      collectionTitles:(v2Collections || []).map(function(c){ return c && c.title; }),
      sports:(v2Collections || [])
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

  ensureCollectionIdentities(v2Collections);
  return (v2Collections || []).map(function(coll, collIndex){
    const collTitle = coll.title || 'Collection';

    return {
      id: coll.id,
      title: collTitle,
      folders: (preserveUnavailable
        ? (coll.folders || []).slice()
        : getEffectiveCollectionFolders(coll.folders || [])
      ).map(function(folder, folderIndex){
        // Derive title from first row if not set
        var folderTitle = folder.title;
        if(!folderTitle && folder.rows && folder.rows[0]){
          folderTitle = getCatalogLabel(folder.rows[0]).replace(' · Movies','').replace(' · Series','');
        }
        folderTitle = folderTitle || 'Folder';

        return {
          id: folder.id,
          title: folderTitle,
          hideTitle: false,
          tileShape: (folder.tileShape === 'PORTRAIT' ? 'POSTER' : folder.tileShape) || 'LANDSCAPE',
          focusGifUrl: folder.focusGifUrl || '',
          coverImageUrl: folder.coverImageUrl || '',
          heroBackdropUrl: folder.heroBackdropUrl || '',
          sources: (folder.nativeSources || []).concat((folder.rows || []).map(function(id){
            var canonicalId = normalizeCatalogId(id);
            var sourceType = getCatalogSourceType(canonicalId);
            return { type: sourceType, genre: '', addonId: getGeneratedAddonId(), provider: 'addon', catalogId: canonicalId };
          })),
          catalogSources: (folder.rows || []).map(function(id){
          const canonicalId = normalizeCatalogId(id);
          const sourceType = getCatalogSourceType(canonicalId);
          return {
            addonId: getGeneratedAddonId(),
            catalogId: canonicalId,
            type: sourceType,
            showInHome: false
          };
        }),
        };
      }),
      pinToTop: false,
      viewMode: getNuvioViewMode(),
      showAllTab: true,
      focusGlowEnabled: true
    };
  });
}

async function pushToNuvio(){
  if(!editToken){ alert(umT('setup.auth.generateYourSetupFirst', 'Generate your setup first')); return; }
  const btn = document.getElementById('pushNuvioBtn');
  if(btn){ btn.textContent = umT('setup.auth.saving', 'Saving...'); btn.disabled = true; }
  try {
    // Save collections to server
    await saveCollectionsToServer(editToken);
    // Open the same profile-scoped collections URL that was just saved.
    var profileQuery = window.activeDeviceProfileId
      ? '?profile=' + encodeURIComponent(window.activeDeviceProfileId)
      : '';
    const collectionsUrl = DISPLAY_URL + '/c/' + editToken + '/collections.json' + profileQuery;
    const url = 'https://nuvio.tv/collections/share?url=' + encodeURIComponent(collectionsUrl);
    window.open(url, '_blank');
  } catch(e) {
    alert(umT('setup.auth.failedToPush', 'Failed to push: ') + e.message);
  }
  if(btn){ btn.textContent = umT('setup.auth.pushToNuvio', '🚀 Push to Nuvio'); btn.disabled = false; }
}

async function saveCollectionsToServer(token){
  if(!token) return;
  // Persist the complete layout. The backend derives a capability-filtered
  // collections.json view for Nuvio/Fusion without deleting unavailable rows.
  const nuvioData = buildCollectionsExport({ preserveUnavailable: true });
  var profileQuery = window.activeDeviceProfileId
    ? '?profile=' + encodeURIComponent(window.activeDeviceProfileId)
    : '';
  await fetch('/c/' + token + '/collections' + profileQuery, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ collections: nuvioData, replace: true })
  });
}

function downloadCollectionsJson(){
  // Ensure S2_DEFS is loaded before building collections
  if(typeof S2_DEFS !== 'undefined' && Object.keys(S2_DEFS).length === 0){
    fetch('/catalog-defs.json').then(function(r){ return r.json(); }).then(function(d){
      Object.assign(S2_DEFS, d);
      downloadCollectionsJson();
    });
    return;
  }
  if(!editToken){
    showBanner(umT('setup.auth.generateYourFinalSetupFirstThe', '⚠️ Generate your Final Setup first — the Collections JSON needs your personal manifest URL.'), 'error');
    return;
  }
  const data = buildCollectionsExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ultramax-collections.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Project JSON export and catalog CSV export live in /setup-modules/project-export.js
