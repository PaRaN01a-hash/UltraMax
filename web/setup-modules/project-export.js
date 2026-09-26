function buildProjectExport(){
  var providers = getDiscoveryProviderState();
  catalogOrder = normaliseCatalogOrder(selected, catalogOrder);
  ensureCollectionIdentities(v2Collections);
  return {
    version: 1,
    collectionsSchemaVersion: COLLECTIONS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    setup: {
      language: (document.getElementById('language') || {}).value || '',
      timezone: (document.getElementById('timezone') || {}).value || getDetectedTimeZone(),
      mdblistKey: providers.mdblistKey,
      tmdbKey: providers.tmdbKey,
      tvdbKey: providers.tvdbKey,
      tvdbPin: providers.tvdbPin,
      rpdbKey: (document.getElementById('rpdbKey') || {}).value || '',
      tpKey: (document.getElementById('tpKey') || {}).value || '',
      traktUser: (document.getElementById('traktUser') || {}).value || '',
      excludeUnreleased: !!((document.getElementById('excludeUnreleased') || {}).checked),
      animePresentationMode: (document.getElementById('animePresentationMode') || {}).value === 'anisync' ? 'anisync' : 'unified',
      preserveKitsuIds: !!((document.getElementById('preserveKitsuIds') || {}).checked),
      digitalReleaseOnly: !!((document.getElementById('digitalReleaseOnly') || {}).checked),
      searchCatalogNames: getSearchCatalogNamesFromForm(),
      hideWatched: !!((document.getElementById('hideWatched') || {}).checked),
      hideUnavailableStreams: !!((document.getElementById('hideUnavailableStreams') || {}).checked),
      episodeReleaseDelayHours: Number((document.getElementById('episodeReleaseDelayHours') || {}).value) || 0,
      maxRating: (document.getElementById('maxRating') || {}).value || '',
      includeAdult: !!((document.getElementById('includeAdult') || {}).checked)
    },
    selectedCatalogs: Array.from(selected || []),
    hiddenCatalogs: Array.from(hidden || []),
    catalogOrder: (typeof catalogOrder !== 'undefined' ? catalogOrder : []),
    collections: JSON.parse(JSON.stringify(v2Collections || [])),
    customCatalogs: JSON.parse(JSON.stringify(getCustomCatalogsFromForm())),
    customMdbLists: JSON.parse(JSON.stringify(getCustomMdbListsFromForm())),
    mergedCatalogs: JSON.parse(JSON.stringify(mergedCatalogs || [])),
    removedMergedCatalogIds: Array.from(removedMergedCatalogIds),
    catalogOverrides: JSON.parse(JSON.stringify(getCatalogOverridesFromForm())),
    nuvioViewMode: getNuvioViewMode()
  };
}

function downloadProjectFile(){
  const data = buildProjectExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ultra-max-project.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function escapeCsv(value){
  const s = String(value == null ? '' : value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildCatalogCsv(){
  const rows = [];
  const selectedIds = Array.from(selected || []);
  const hiddenIds = new Set(Array.from(hidden || []));
  const allSelected = new Set(selectedIds);

  const placements = {};
  (v2Collections || []).forEach(function(coll){
    (coll.folders || []).forEach(function(folder){
      (folder.rows || []).forEach(function(id){
        if(!placements[id]) placements[id] = [];
        placements[id].push({
          collection: coll.title || '',
          folder: folder.title || ''
        });
      });
    });
  });

  rows.push([
    'Catalog Name',
    'Catalog ID',
    'Selected',
    'Hidden',
    'Collection',
    'Folder'
  ]);

  selectedIds.forEach(function(id){
    const pill = document.querySelector('.pill[data-id="' + id + '"]');
    const name = pill ? (pill.textContent || '').replace('👁','').replace('🙈','').trim() : id;
    const hits = placements[id] || [];

    if(hits.length){
      hits.forEach(function(hit){
        rows.push([
          name,
          id,
          'Yes',
          hiddenIds.has(id) ? 'Yes' : 'No',
          hit.collection,
          hit.folder
        ]);
      });
    } else {
      rows.push([
        name,
        id,
        'Yes',
        hiddenIds.has(id) ? 'Yes' : 'No',
        '',
        ''
      ]);
    }
  });

  return rows.map(function(row){
    return row.map(escapeCsv).join(',');
  }).join('\n');
}

function downloadCatalogCsv(){
  const csv = buildCatalogCsv();
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ultra-max-catalogs.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
