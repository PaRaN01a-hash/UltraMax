#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const {
  parseAioMetadataExport
} = require("../services/aiometadata-import-service");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const inputPath = process.argv[2];

if (!inputPath) {
  fail(
    "Usage: node scripts/preview-aiometadata-import.js /path/to/export.json"
  );
}

const resolvedPath = path.resolve(inputPath);

if (!fs.existsSync(resolvedPath)) {
  fail(`File not found: ${resolvedPath}`);
}

const stats = fs.statSync(resolvedPath);

if (!stats.isFile()) {
  fail(`Not a file: ${resolvedPath}`);
}

if (stats.size > 10 * 1024 * 1024) {
  fail("JSON export exceeds the 10 MB preview limit");
}

let parsed;

try {
  parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
} catch (error) {
  fail(`Invalid JSON: ${error.message}`);
}

let preview;

try {
  preview = parseAioMetadataExport(parsed);
} catch (error) {
  fail(error.message);
}

console.log("");
console.log("AIOmetadata import preview");
console.log("==========================");
console.log(`File:                ${resolvedPath}`);
console.log(`Export version:      ${preview.version}`);
console.log(`Version recognised:  ${preview.recognisedVersion ? "yes" : "no"}`);
console.log(`Exported at:         ${preview.exportedAt || "unknown"}`);
console.log("");
console.log(`Catalogues found:    ${preview.totals.found}`);
console.log(`Ready now:           ${preview.totals.supported}`);
console.log(`Need adapters:       ${preview.totals.adapterRequired}`);
console.log(`Unsupported:         ${preview.totals.unsupported}`);
console.log(`Invalid:             ${preview.totals.invalid}`);
console.log(`Duplicate IDs:       ${preview.totals.duplicateImportedIds}`);

console.log("");
console.log("Sources");
console.log("-------");

for (const [source, count] of Object.entries(preview.bySource)
  .sort((a, b) => b[1] - a[1])) {
  console.log(`${source.padEnd(20)} ${count}`);
}

console.log("");
console.log("Largest supported groups");
console.log("------------------------");

for (const [group, count] of Object.entries(preview.byGroup)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)) {
  console.log(`${group.padEnd(28)} ${count}`);
}

console.log("");
console.log("First 10 converted catalogues");
console.log("-----------------------------");

console.log(
  JSON.stringify(preview.importedCatalogs.slice(0, 10), null, 2)
);

console.log("");
console.log("First 20 skipped entries");
console.log("------------------------");

console.log(
  JSON.stringify(preview.skipped.slice(0, 20), null, 2)
);

const outputPath = resolvedPath.replace(
  /\.json$/i,
  ""
) + ".ultramax-preview.json";

fs.writeFileSync(outputPath, JSON.stringify(preview, null, 2));

console.log("");
console.log(`Full preview written to: ${outputPath}`);
console.log("No Ultra MAX configuration was changed.");
