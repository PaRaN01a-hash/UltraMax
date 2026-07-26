"use strict";

const SUPPORTED_EXPORT_VERSION_PREFIXES = ["2."];

function normaliseType(type, displayType) {
  const raw = String(type || displayType || "").toLowerCase();

  if (raw === "movie") return "movie";
  if (raw === "series" || raw === "show" || raw === "tv") return "series";

  if (raw === "all" || raw === "mixed") {
    const display = String(displayType || "").toLowerCase();

    if (display === "movie") return "movie";
    if (display === "series" || display === "show" || display === "tv") {
      return "series";
    }

    return "all";
  }

  return null;
}

function safeString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function sanitiseName(value, fallback) {
  const name = safeString(value, fallback)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 120);

  return name || fallback;
}

function sanitiseGroup(tags) {
  if (!Array.isArray(tags)) return "Imported";

  const first = tags.find(tag => typeof tag === "string" && tag.trim());

  return sanitiseName(first, "Imported");
}

function extractNumericMdblistId(catalog) {
  const id = safeString(catalog?.id);

  const idMatch = id.match(/^mdblist\.(\d+)$/i);
  if (idMatch) return idMatch[1];

  const metadataUrl = safeString(catalog?.metadata?.url);
  const metadataMatch = metadataUrl.match(
    /mdblist\.com\/lists\/[^/]+\/[^/?#]+(?:[/?#]|$)/i
  );

  /*
   * A normal public MDBList URL does not expose the numeric list ID,
   * so it cannot be passed into Ultra MAX's existing numeric-ID handler.
   */
  if (metadataMatch) return null;

  return null;
}

function extractMdblistSlug(catalog) {
  const sourceUrl = safeString(catalog?.sourceUrl);

  let match = sourceUrl.match(
    /api\.mdblist\.com\/lists\/([^/]+)\/([^/?#]+)\/items/i
  );

  if (match) {
    return {
      author: decodeURIComponent(match[1]),
      slug: decodeURIComponent(match[2])
    };
  }

  const metadataUrl = safeString(catalog?.metadata?.url);

  match = metadataUrl.match(
    /mdblist\.com\/lists\/([^/]+)\/([^/?#]+)/i
  );

  if (match) {
    return {
      author: decodeURIComponent(match[1]),
      slug: decodeURIComponent(match[2])
    };
  }

  const id = safeString(catalog?.id);
  match = id.match(/^mdblist\.([^.]+)\.(.+)$/i);

  if (match && !/^\d+$/.test(match[1])) {
    return {
      author: match[1],
      slug: match[2]
    };
  }

  return null;
}

function buildImportedId(sourceId, type) {
  return `imported_aio_mdb_${sourceId}_${type}`;
}

function convertNumericMdblistCatalog(catalog, index) {
  const sourceId = extractNumericMdblistId(catalog);
  const type = normaliseType(catalog.type, catalog.displayType);

  if (!sourceId) {
    return {
      status: "unsupported",
      reason: "MDBList catalogue does not expose a numeric list ID",
      index,
      originalId: safeString(catalog?.id)
    };
  }

  if (!type || type === "all") {
    return {
      status: "unsupported",
      reason: "Mixed MDBList catalogue needs separate movie/series handling",
      index,
      originalId: safeString(catalog?.id)
    };
  }

  const fallbackName = `Imported MDBList ${sourceId}`;

  return {
    status: "supported",
    index,
    catalog: {
      id: buildImportedId(sourceId, type),
      type,
      name: sanitiseName(catalog.name, fallbackName),
      source: "mdblist",
      sourceValue: sourceId,
      group: sanitiseGroup(catalog.tags),
      enabled: catalog.enabled !== false,
      showInHome: catalog.showInHome === true,
      sort: safeString(catalog.sort, "default"),
      order: safeString(
        catalog.order || catalog.sortDirection,
        "asc"
      ),
      cacheTTL: Number.isFinite(Number(catalog.cacheTTL))
        ? Math.max(60, Math.min(Number(catalog.cacheTTL), 604800))
        : 86400,
      importedFrom: "aiometadata",
      importedOriginalId: safeString(catalog.id)
    }
  };
}

function classifyCatalog(catalog, index) {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    return {
      status: "invalid",
      reason: "Catalogue entry is not an object",
      index
    };
  }

  const source = safeString(catalog.source).toLowerCase();

  if (!source) {
    return {
      status: "invalid",
      reason: "Catalogue source is missing",
      index,
      originalId: safeString(catalog.id)
    };
  }

  if (source === "mdblist") {
    const numericId = extractNumericMdblistId(catalog);

    if (numericId) {
      return convertNumericMdblistCatalog(catalog, index);
    }

    const slug = extractMdblistSlug(catalog);

    return {
      status: "adapter_required",
      reason: slug
        ? "MDBList slug catalogue needs a slug-based fetch adapter"
        : "MDBList catalogue ID could not be resolved",
      index,
      source,
      originalId: safeString(catalog.id),
      slug
    };
  }

  return {
    status: "adapter_required",
    reason: `Source adapter not implemented: ${source}`,
    index,
    source,
    originalId: safeString(catalog.id)
  };
}

function parseAioMetadataExport(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("JSON root must be an object");
  }

  if (!input.config || typeof input.config !== "object") {
    throw new Error("Missing config object");
  }

  if (!Array.isArray(input.config.catalogs)) {
    throw new Error("Missing config.catalogs array");
  }

  const version = safeString(input.version, "unknown");

  const recognisedVersion =
    version === "unknown" ||
    SUPPORTED_EXPORT_VERSION_PREFIXES.some(prefix =>
      version.startsWith(prefix)
    );

  const results = input.config.catalogs.map(classifyCatalog);

  const supported = results.filter(item => item.status === "supported");
  const adapterRequired = results.filter(
    item => item.status === "adapter_required"
  );
  const unsupported = results.filter(
    item => item.status === "unsupported"
  );
  const invalid = results.filter(item => item.status === "invalid");

  const bySource = {};
  const byGroup = {};
  const duplicateIds = [];

  for (const original of input.config.catalogs) {
    const source = safeString(original?.source, "unknown").toLowerCase();
    bySource[source] = (bySource[source] || 0) + 1;
  }

  const seenIds = new Set();

  for (const item of supported) {
    const imported = item.catalog;

    byGroup[imported.group] = (byGroup[imported.group] || 0) + 1;

    if (seenIds.has(imported.id)) {
      duplicateIds.push(imported.id);
    }

    seenIds.add(imported.id);
  }

  return {
    valid: true,
    recognisedVersion,
    version,
    exportedAt: safeString(input.exportedAt) || null,
    totals: {
      found: input.config.catalogs.length,
      supported: supported.length,
      adapterRequired: adapterRequired.length,
      unsupported: unsupported.length,
      invalid: invalid.length,
      duplicateImportedIds: duplicateIds.length
    },
    bySource,
    byGroup,
    duplicateIds: [...new Set(duplicateIds)],
    importedCatalogs: supported.map(item => item.catalog),
    skipped: results
      .filter(item => item.status !== "supported")
      .map(item => ({
        status: item.status,
        reason: item.reason,
        source: item.source || null,
        originalId: item.originalId || null,
        slug: item.slug || null
      }))
  };
}

module.exports = {
  parseAioMetadataExport,
  normaliseType,
  extractNumericMdblistId,
  extractMdblistSlug
};
