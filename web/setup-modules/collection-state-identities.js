/* ===== V2 STEP 3 STATE ===== */
let v2Collections = []; window.v2Collections = v2Collections;
let v2CollSortable = null;
let v2FolderSortables = [];
var COLLECTIONS_SCHEMA_VERSION = 2;

/* ===== V2 STEP 3 HELPERS ===== */
function createUltraMaxUuid(){
  var cryptoApi =
    typeof globalThis !== 'undefined'
      ? globalThis.crypto
      : null;

  if(
    cryptoApi &&
    typeof cryptoApi.randomUUID === 'function'
  ){
    return cryptoApi.randomUUID();
  }

  var bytes = new Uint8Array(16);
  if(
    cryptoApi &&
    typeof cryptoApi.getRandomValues === 'function'
  ){
    cryptoApi.getRandomValues(bytes);
  } else {
    for(var i = 0; i < bytes.length; i += 1){
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;

  var hex = Array.from(bytes).map(function(value){
    return value.toString(16).padStart(2, '0');
  }).join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-');
}

function createUltraMaxCollectionId(){
  return 'umc_' + createUltraMaxUuid();
}

function createUltraMaxFolderId(){
  return 'umf_' + createUltraMaxUuid();
}

function validateCollectionIdentities(collections){
  var collectionIds = new Set();
  var folderIds = new Set();
  var result = {
    valid: true,
    missingCollectionIds: [],
    duplicateCollectionIds: [],
    missingFolderIds: [],
    duplicateFolderIds: []
  };

  (Array.isArray(collections) ? collections : []).forEach(function(collection, collectionIndex){
    var collectionId =
      collection && typeof collection.id === 'string'
        ? collection.id.trim()
        : '';

    if(!collectionId){
      result.missingCollectionIds.push(collectionIndex);
    } else if(collectionIds.has(collectionId)){
      result.duplicateCollectionIds.push({
        id: collectionId,
        collectionIndex: collectionIndex
      });
    } else {
      collectionIds.add(collectionId);
    }

    (
      collection &&
      Array.isArray(collection.folders)
        ? collection.folders
        : []
    ).forEach(function(folder, folderIndex){
      var folderId =
        folder && typeof folder.id === 'string'
          ? folder.id.trim()
          : '';

      if(!folderId){
        result.missingFolderIds.push({
          collectionIndex: collectionIndex,
          folderIndex: folderIndex
        });
      } else if(folderIds.has(folderId)){
        result.duplicateFolderIds.push({
          id: folderId,
          collectionIndex: collectionIndex,
          folderIndex: folderIndex
        });
      } else {
        folderIds.add(folderId);
      }
    });
  });

  result.valid = !(
    result.missingCollectionIds.length ||
    result.duplicateCollectionIds.length ||
    result.missingFolderIds.length ||
    result.duplicateFolderIds.length
  );

  return result;
}

function ensureCollectionIdentities(collections){
  var collectionIds = new Set();
  var folderIds = new Set();
  var list = Array.isArray(collections) ? collections : [];

  list.forEach(function(collection){
    if(!collection || typeof collection !== 'object') return;

    var collectionId =
      typeof collection.id === 'string'
        ? collection.id.trim()
        : '';

    if(!collectionId || collectionIds.has(collectionId)){
      do {
        collectionId = createUltraMaxCollectionId();
      } while(collectionIds.has(collectionId));
      collection.id = collectionId;
    }
    collectionIds.add(collectionId);

    (Array.isArray(collection.folders) ? collection.folders : []).forEach(function(folder){
      if(!folder || typeof folder !== 'object') return;

      var folderId =
        typeof folder.id === 'string'
          ? folder.id.trim()
          : '';

      if(!folderId || folderIds.has(folderId)){
        do {
          folderId = createUltraMaxFolderId();
        } while(folderIds.has(folderId));
        folder.id = folderId;
      }
      folderIds.add(folderId);
    });
  });

  return list;
}

function cloneCollectionWithNewIdentities(collection){
  var clone = JSON.parse(JSON.stringify(collection || {}));
  clone.id = createUltraMaxCollectionId();
  clone.folders = (Array.isArray(clone.folders) ? clone.folders : []).map(function(folder){
    folder.id = createUltraMaxFolderId();
    return folder;
  });
  return clone;
}

