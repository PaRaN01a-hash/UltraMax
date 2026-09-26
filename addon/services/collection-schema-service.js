"use strict";

const crypto = require("crypto");

const COLLECTION_LIMITS = Object.freeze({
  maxBytes: 2 * 1024 * 1024,
  maxCollections: 100,
  maxFoldersTotal: 1000,
  maxSourcesPerFolder: 100,
  maxSourcesTotal: 10000,
  maxDepth: 8,
  maxIdLength: 128,
  maxTitleLength: 120,
  maxSourceFieldLength: 256,
  maxUrlLength: 2048
});

const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const ARTWORK_FIELDS = ["coverImageUrl", "focusGifUrl", "heroBackdropUrl"];
const SOURCE_FIELDS = ["type", "genre", "addonId", "provider", "catalogId"];
const CATALOG_SOURCE_FIELDS = ["addonId", "catalogId", "type", "showInHome"];

class CollectionSchemaError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = "CollectionSchemaError";
    this.code = code || "INVALID_COLLECTIONS";
    this.details = details || null;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertSafeTree(value, depth = 0, path = "$") {
  if (depth > COLLECTION_LIMITS.maxDepth) {
    throw new CollectionSchemaError(
      `Collection data exceeds maximum depth ${COLLECTION_LIMITS.maxDepth}`,
      "EXCESSIVE_DEPTH",
      { path }
    );
  }
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value) && !isPlainObject(value)) {
    throw new CollectionSchemaError("Collection data contains a non-plain object", "NON_PLAIN_OBJECT", { path });
  }
  for (const key of Object.keys(value)) {
    if (BLOCKED_KEYS.has(key)) {
      throw new CollectionSchemaError("Collection data contains a blocked object key", "BLOCKED_KEY", {
        path: `${path}.${key}`
      });
    }
    assertSafeTree(value[key], depth + 1, `${path}.${key}`);
  }
}

function assertByteLimit(value) {
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new CollectionSchemaError("Collection data is not valid JSON", "MALFORMED_JSON");
  }
  if (Buffer.byteLength(encoded || "", "utf8") > COLLECTION_LIMITS.maxBytes) {
    throw new CollectionSchemaError(
      `Collection data exceeds ${COLLECTION_LIMITS.maxBytes} bytes`,
      "OVERSIZED_INPUT"
    );
  }
}

function parseCollectionsJson(text, options = {}) {
  if (typeof text !== "string") {
    throw new CollectionSchemaError("Collection JSON must be text", "MALFORMED_JSON");
  }
  if (Buffer.byteLength(text, "utf8") > COLLECTION_LIMITS.maxBytes) {
    throw new CollectionSchemaError(
      `Collection data exceeds ${COLLECTION_LIMITS.maxBytes} bytes`,
      "OVERSIZED_INPUT"
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CollectionSchemaError("Collection data is malformed JSON", "MALFORMED_JSON");
  }
  validateCollections(parsed, options);
  return parsed;
}

function validHttpUrl(value) {
  if (value === "" || value === undefined || value === null) return true;
  if (typeof value !== "string" || value.length > COLLECTION_LIMITS.maxUrlLength) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizedString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function canonicalSource(source, fields) {
  const result = {};
  for (const field of fields) {
    if (field === "showInHome") {
      result[field] = source[field] === undefined ? false : Boolean(source[field]);
    } else {
      result[field] = normalizedString(source[field]);
    }
  }
  return result;
}

function canonicalFolder(folder) {
  return {
    id: normalizedString(folder.id),
    title: normalizedString(folder.title, "Folder"),
    hideTitle: folder.hideTitle === undefined ? false : Boolean(folder.hideTitle),
    tileShape: normalizedString(folder.tileShape, "LANDSCAPE"),
    focusGifUrl: normalizedString(folder.focusGifUrl),
    coverImageUrl: normalizedString(folder.coverImageUrl),
    heroBackdropUrl: normalizedString(folder.heroBackdropUrl),
    sources: (Array.isArray(folder.sources) ? folder.sources : []).map(source =>
      canonicalSource(source, SOURCE_FIELDS)
    ),
    catalogSources: (Array.isArray(folder.catalogSources) ? folder.catalogSources : []).map(source =>
      canonicalSource(source, CATALOG_SOURCE_FIELDS)
    )
  };
}

function canonicalCollection(collection) {
  return {
    id: normalizedString(collection.id),
    title: normalizedString(collection.title, "Collection"),
    folders: (Array.isArray(collection.folders) ? collection.folders : []).map(canonicalFolder),
    pinToTop: collection.pinToTop === undefined ? true : Boolean(collection.pinToTop),
    viewMode: normalizedString(collection.viewMode, "TABBED_GRID"),
    showAllTab: collection.showAllTab === undefined ? true : Boolean(collection.showAllTab),
    focusGlowEnabled:
      collection.focusGlowEnabled === undefined ? true : Boolean(collection.focusGlowEnabled)
  };
}

function validateSource(source, path, errors) {
  if (!isPlainObject(source)) {
    errors.push({ path, code: "NON_PLAIN_SOURCE", message: "Source must be an object" });
    return;
  }
  for (const key of [...SOURCE_FIELDS, ...CATALOG_SOURCE_FIELDS]) {
    if (key === "showInHome" || source[key] === undefined || source[key] === null) continue;
    if (typeof source[key] !== "string" || source[key].length > COLLECTION_LIMITS.maxSourceFieldLength) {
      errors.push({
        path: `${path}.${key}`,
        code: "INVALID_SOURCE_FIELD",
        message: `Source fields must be at most ${COLLECTION_LIMITS.maxSourceFieldLength} characters`
      });
    }
  }
}

function validateCollections(value, options = {}) {
  assertByteLimit(value);
  assertSafeTree(value);
  if (!Array.isArray(value)) {
    throw new CollectionSchemaError("Collections must be a top-level array", "NON_ARRAY_TOP_LEVEL");
  }
  if (value.length > COLLECTION_LIMITS.maxCollections) {
    throw new CollectionSchemaError(
      `Collection count exceeds ${COLLECTION_LIMITS.maxCollections}`,
      "TOO_MANY_COLLECTIONS"
    );
  }

  const entries = value.map((collection, index) => ({
    index,
    id: isPlainObject(collection) && typeof collection.id === "string" ? collection.id : "",
    errors: [],
    collision: false,
    canonical: null
  }));
  const collectionOwners = new Map();
  let folderTotal = 0;
  let sourceTotal = 0;

  value.forEach((collection, collectionIndex) => {
    const entry = entries[collectionIndex];
    const basePath = `$[${collectionIndex}]`;
    if (!isPlainObject(collection)) {
      entry.errors.push({ path: basePath, code: "NON_PLAIN_COLLECTION", message: "Collection must be an object" });
      return;
    }

    if (typeof collection.id !== "string" || !collection.id || collection.id.length > COLLECTION_LIMITS.maxIdLength) {
      entry.errors.push({ path: `${basePath}.id`, code: "INVALID_COLLECTION_ID", message: "Collection ID is required and must be at most 128 characters" });
    } else if (collectionOwners.has(collection.id)) {
      entry.collision = true;
      entries[collectionOwners.get(collection.id)].collision = true;
    } else {
      collectionOwners.set(collection.id, collectionIndex);
    }

    if (
      collection.title !== undefined &&
      (typeof collection.title !== "string" || collection.title.length > COLLECTION_LIMITS.maxTitleLength)
    ) {
      entry.errors.push({ path: `${basePath}.title`, code: "INVALID_TITLE", message: "Collection title must be at most 120 characters" });
    }

    if (collection.folders !== undefined && !Array.isArray(collection.folders)) {
      entry.errors.push({ path: `${basePath}.folders`, code: "INVALID_FOLDERS", message: "Folders must be an array" });
      return;
    }
    const folders = Array.isArray(collection.folders) ? collection.folders : [];
    const folderOwners = new Map();
    folderTotal += folders.length;

    folders.forEach((folder, folderIndex) => {
      const folderPath = `${basePath}.folders[${folderIndex}]`;
      if (!isPlainObject(folder)) {
        entry.errors.push({ path: folderPath, code: "NON_PLAIN_FOLDER", message: "Folder must be an object" });
        return;
      }
      if (typeof folder.id !== "string" || !folder.id || folder.id.length > COLLECTION_LIMITS.maxIdLength) {
        entry.errors.push({ path: `${folderPath}.id`, code: "INVALID_FOLDER_ID", message: "Folder ID is required and must be at most 128 characters" });
      } else if (folderOwners.has(folder.id)) {
        entry.collision = true;
        entries[folderOwners.get(folder.id)].collision = true;
      } else {
        folderOwners.set(folder.id, collectionIndex);
      }
      if (
        folder.title !== undefined &&
        (typeof folder.title !== "string" || folder.title.length > COLLECTION_LIMITS.maxTitleLength)
      ) {
        entry.errors.push({ path: `${folderPath}.title`, code: "INVALID_TITLE", message: "Folder title must be at most 120 characters" });
      }
      for (const artworkField of ARTWORK_FIELDS) {
        if (!validHttpUrl(folder[artworkField])) {
          entry.errors.push({
            path: `${folderPath}.${artworkField}`,
            code: "UNSAFE_URL",
            message: "Artwork URL must use http or https and be at most 2048 characters"
          });
        }
      }

      const sources = Array.isArray(folder.sources) ? folder.sources : [];
      const catalogSources = Array.isArray(folder.catalogSources) ? folder.catalogSources : [];
      if (
        (folder.sources !== undefined && !Array.isArray(folder.sources)) ||
        (folder.catalogSources !== undefined && !Array.isArray(folder.catalogSources))
      ) {
        entry.errors.push({ path: folderPath, code: "INVALID_SOURCES", message: "Sources must be arrays" });
      }
      if (sources.length + catalogSources.length > COLLECTION_LIMITS.maxSourcesPerFolder) {
        entry.errors.push({
          path: folderPath,
          code: "TOO_MANY_SOURCES",
          message: `Folder exceeds ${COLLECTION_LIMITS.maxSourcesPerFolder} sources`
        });
      }
      sourceTotal += sources.length + catalogSources.length;
      sources.forEach((source, sourceIndex) =>
        validateSource(source, `${folderPath}.sources[${sourceIndex}]`, entry.errors)
      );
      catalogSources.forEach((source, sourceIndex) =>
        validateSource(source, `${folderPath}.catalogSources[${sourceIndex}]`, entry.errors)
      );
    });

    if (!entry.errors.length) entry.canonical = canonicalCollection(collection);
  });

  if (folderTotal > COLLECTION_LIMITS.maxFoldersTotal) {
    throw new CollectionSchemaError(
      `Total folder count exceeds ${COLLECTION_LIMITS.maxFoldersTotal}`,
      "TOO_MANY_FOLDERS"
    );
  }
  if (sourceTotal > COLLECTION_LIMITS.maxSourcesTotal) {
    throw new CollectionSchemaError(
      `Total source count exceeds ${COLLECTION_LIMITS.maxSourcesTotal}`,
      "TOO_MANY_SOURCES"
    );
  }

  return {
    side: options.side || "unknown",
    valid: entries.every(entry => !entry.errors.length && !entry.collision),
    entries,
    counts: {
      collections: value.length,
      folders: folderTotal,
      sources: sourceTotal
    }
  };
}

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map(stableSortValue);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const key of Object.keys(value).sort()) result[key] = stableSortValue(value[key]);
  return result;
}

function stableStringify(value) {
  return JSON.stringify(stableSortValue(value));
}

function canonicalHash(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

module.exports = {
  ARTWORK_FIELDS,
  BLOCKED_KEYS,
  CATALOG_SOURCE_FIELDS,
  COLLECTION_LIMITS,
  CollectionSchemaError,
  SOURCE_FIELDS,
  canonicalCollection,
  canonicalFolder,
  canonicalHash,
  isPlainObject,
  parseCollectionsJson,
  stableStringify,
  validateCollections
};
