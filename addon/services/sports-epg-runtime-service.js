"use strict";

const fs =
  require("fs/promises");

const path =
  require("path");

const {
  parseXmltvProgrammes
} = require(
  "./sports-xmltv-service"
);

const GUIDE_FILES = {
  "SkySportsFootball.ie":
    "sky-guide.xml",

  "SkySportsMainEvent.ie":
    "sky-guide.xml",

  "NBATV.us":
    "nba-guide.xml"
};

function clean(value) {
  return String(
    value || ""
  ).trim();
}

function baseChannelId(value) {
  return clean(value)
    .split("@", 1)[0];
}

function getGuideDirectory() {
  return clean(
    process.env
      .SPORTS_EPG_GUIDE_DIR
  );
}

function getGuideFileForChannel(
  channelId
) {
  return (
    GUIDE_FILES[
      baseChannelId(channelId)
    ] ||
    null
  );
}

async function readGuide(
  guideDirectory,
  filename
) {
  if (
    !guideDirectory ||
    !filename
  ) {
    return null;
  }

  const root =
    path.resolve(
      guideDirectory
    );

  const target =
    path.resolve(
      root,
      filename
    );

  /*
   * Do not allow a configured filename
   * to escape the guide directory.
   */
  if (
    target !== root &&
    !target.startsWith(
      root +
      path.sep
    )
  ) {
    throw new Error(
      "EPG guide path escaped root"
    );
  }

  try {
    return await fs.readFile(
      target,
      "utf8"
    );
  } catch (error) {
    if (
      error?.code ===
      "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

/*
 * Runtime fetch boundary used by
 * sports-epg-provider-service.
 *
 * No network access.
 * No scraper execution.
 * No epg-grabber execution.
 *
 * It consumes XMLTV files already
 * refreshed into SPORTS_EPG_GUIDE_DIR.
 */
async function fetchRuntimeProgrammes(
  channelIds
) {
  const ids =
    [
      ...new Set(
        (
          Array.isArray(
            channelIds
          )
            ? channelIds
            : []
        )
          .map(
            baseChannelId
          )
          .filter(Boolean)
      )
    ];

  const result = {};

  for (const id of ids) {
    result[id] = [];
  }

  if (!ids.length) {
    return result;
  }

  const guideDirectory =
    getGuideDirectory();

  if (!guideDirectory) {
    return result;
  }

  const groups =
    new Map();

  for (const id of ids) {
    const filename =
      getGuideFileForChannel(id);

    if (!filename) {
      continue;
    }

    if (
      !groups.has(filename)
    ) {
      groups.set(
        filename,
        []
      );
    }

    groups
      .get(filename)
      .push(id);
  }

  for (
    const [
      filename,
      groupIds
    ] of groups
  ) {
    const xml =
      await readGuide(
        guideDirectory,
        filename
      );

    if (!xml) {
      continue;
    }

    const parsed =
      parseXmltvProgrammes(
        xml,
        groupIds
      );

    for (
      const id
      of groupIds
    ) {
      result[id] =
        parsed[id] ||
        [];
    }
  }

  return result;
}

module.exports = {
  GUIDE_FILES,
  baseChannelId,
  getGuideDirectory,
  getGuideFileForChannel,
  readGuide,
  fetchRuntimeProgrammes
};
