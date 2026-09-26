function normalizeSearchIntentValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesNormalizedPhrase(
  haystack,
  needle
) {
  const normalizedHaystack =
    normalizeSearchIntentValue(
      haystack
    );

  const normalizedNeedle =
    normalizeSearchIntentValue(
      needle
    );

  if (
    !normalizedHaystack ||
    !normalizedNeedle
  ) {
    return false;
  }

  return (
    ` ${normalizedHaystack} `
      .includes(
        ` ${normalizedNeedle} `
      )
  );
}

function parseSearchIntent(query) {
  const q = normalizeSearchIntentValue(query);

  const intent = {
    requiredGenres: [],
    preferredGenres: [],
    country: null,
    yearMin: null,
    yearMax: null,
    concepts: [],
    semanticConcepts: [],
    semanticConceptGroups: [],
    femaleLead: false,
    minRating: null,
    quality: null
  };

  /*
   * Genres.
   */
  const genreRules = [
    ["horror", "Horror"],
    ["thriller", "Thriller"],
    ["thrillers", "Thriller"],
    ["crime", "Crime"],
    ["comedy", "Comedy"],
    ["funny", "Comedy"],
    ["sci fi", "Sci-Fi"],
    ["science fiction", "Sci-Fi"],
    ["romance", "Romance"],
    ["action", "Action"],
    ["drama", "Drama"],
    ["fantasy", "Fantasy"],
    ["mystery", "Mystery"],
    ["documentary", "Documentary"],
    ["animation", "Animation"],
    ["war", "War"]
  ];

  for (const [needle, genre] of genreRules) {
    if (
      includesNormalizedPhrase(
        q,
        needle
      ) &&
      !intent.requiredGenres.includes(genre)
    ) {
      intent.requiredGenres.push(genre);
    }
  }

  /*
   * Country / origin intent.
   */
  const countryRules = [
    [["british", "uk", "united kingdom"], "GB"],
    [["american", "usa", "united states"], "US"],
    [["french", "france"], "FR"],
    [["german", "germany"], "DE"],
    [["spanish", "spain"], "ES"],
    [["italian", "italy"], "IT"],
    [["korean", "korea", "south korean", "south korea"], "KR"],
    [["japanese", "japan"], "JP"],
    [["indian", "india"], "IN"],
    [["australian", "australia"], "AU"],
    [["canadian", "canada"], "CA"]
  ];

  for (const [aliases, code] of countryRules) {
    const matched = aliases.some(alias => {
      const escaped = alias
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/ /g, "\\s+");

      return new RegExp(`\\b${escaped}\\b`).test(q);
    });

    if (matched) {
      intent.country = code;
      break;
    }
  }

  /*
   * Explicit year ranges:
   *
   *   1995 to 2005
   *   1995-2005
   *   1995 through 2005
   */
  const yearRangeMatch = q.match(
    /\b((?:19|20)\d{2})\s*(?:to|through|-)\s*((?:19|20)\d{2})\b/
  );

  if (yearRangeMatch) {
    const first = Number(yearRangeMatch[1]);
    const second = Number(yearRangeMatch[2]);

    intent.yearMin = Math.min(first, second);
    intent.yearMax = Math.max(first, second);
  }

  /*
   * Decades:
   *
   *   90s
   *   1990s
   *   2000s
   *   early 2000s
   *   mid 1990s
   *   late 80s
   */
  if (intent.yearMin == null) {
    const decadeMatch = q.match(
      /\b(?:(early|mid|late)\s+)?((?:19|20)\d0|\d0)s\b/
    );

    if (decadeMatch) {
      const part = decadeMatch[1] || null;
      let decade = Number(decadeMatch[2]);

      if (decade < 100) {
        decade += decade >= 30
          ? 1900
          : 2000;
      }

      if (part === "early") {
        intent.yearMin = decade;
        intent.yearMax = decade + 3;
      } else if (part === "mid") {
        intent.yearMin = decade + 4;
        intent.yearMax = decade + 6;
      } else if (part === "late") {
        intent.yearMin = decade + 7;
        intent.yearMax = decade + 9;
      } else {
        intent.yearMin = decade;
        intent.yearMax = decade + 9;
      }
    }
  }

  /*
   * Single year:
   *
   *   movies from 1999
   *   films in 2014
   *   released in 2020
   */
  if (intent.yearMin == null) {
    const singleYearMatch = q.match(
      /\b(?:from|in|released in)\s+((?:19|20)\d{2})\b/
    );

    if (singleYearMatch) {
      intent.yearMin = Number(singleYearMatch[1]);
      intent.yearMax = Number(singleYearMatch[1]);
    }
  }

  /*
   * Relative release periods.
   */
  const currentYear = new Date().getUTCFullYear();

  if (
    intent.yearMin == null &&
    /\b(?:recent|recently released|newer)\b/.test(q)
  ) {
    intent.yearMin = currentYear - 3;
    intent.yearMax = currentYear;
  }

  if (intent.yearMin == null) {
    const lastYearsMatch = q.match(
      /\blast\s+(\d{1,2})\s+years?\b/
    );

    if (lastYearsMatch) {
      const years = Math.min(
        Number(lastYearsMatch[1]),
        50
      );

      intent.yearMin = currentYear - years + 1;
      intent.yearMax = currentYear;
    }
  }

  /*
   * Lead-gender intent.
   */
  if (
    q.includes("female lead") ||
    q.includes("female leads") ||
    q.includes("female led") ||
    q.includes("woman lead") ||
    q.includes("women leads")
  ) {
    intent.femaleLead = true;
  }

  /*
   * Quality hints.
   *
   * These remain preferences rather than absolute filters.
   */
  if (
    /\b(?:high rated|highly rated|top rated|best)\b/.test(q)
  ) {
    intent.minRating = 7;
    intent.quality = "high";
  } else if (
    /\b(?:well rated|good rated)\b/.test(q)
  ) {
    intent.minRating = 6;
    intent.quality = "good";
  }

  if (
    /\bpopular\b/.test(q)
  ) {
    intent.quality =
      intent.quality || "popular";
  }

  /*
   * Semantic concepts.
   */
  const conceptRules = [
    /*
     * Keep concept vocabularies deliberately specific.
     *
     * These are ranking signals, not broad keyword expansion.
     * Generic words such as "mind", "tense" or "spacecraft"
     * can make unrelated films look much more relevant than
     * they really are.
     */
    [
      "psychological",
      [
        "psychological",
        "psychology",
        "mind bending",
        "mind-bending"
      ],
      [
        "psychological",
        "psychology",
        "paranoia",
        "hallucination",
        "hallucinations",
        "delusion",
        "delusions"
      ]
    ],
    [
      "slow-burn",
      [
        "slow burn",
        "slow burning",
        "atmospheric"
      ],
      [
        "slow burn",
        "slow burning",
        "atmospheric",
        "brooding",
        "gradual tension"
      ]
    ],
    [
      "space-exploration",
      [
        "space exploration",
        "space travel"
      ],
      [
        "space exploration",
        "space travel",
        "spacecraft",
        "nasa",
        "astronaut",
        "astronauts",
        "space mission"
      ]
    ],
    [
      "realistic-science",
      [
        "realistic science",
        "real science"
      ],
      [
        "realistic science",
        "real science",
        "scientific accuracy",
        "scientifically accurate",
        "hard science",
        "realistic physics"
      ]
    ],
    [
      "family-conflict",
      [
        "dysfunctional family",
        "dysfunctional families"
      ],
      [
        "dysfunctional family",
        "family conflict",
        "family dysfunction"
      ]
    ],
    [
      "revenge",
      [
        "revenge",
        "vengeance"
      ],
      [
        "revenge",
        "vengeance",
        "retribution"
      ]
    ],
    [
      "cyberpunk",
      [
        "cyberpunk",
        "tech noir",
        "futuristic technology",
        "future technology",
        "high tech future",
        "high-tech future",
        "high tech oppressive future",
        "high-tech oppressive future"
      ],
      [
        "cyberpunk",
        "tech noir",
        "simulated reality",
        "virtual reality",
        "man vs machine"
      ]
    ],
    [
      "dystopian",
      [
        "dystopian",
        "dystopia",
        "oppressive future",
        "oppressive futures",
        "oppressive regime",
        "totalitarian future"
      ],
      [
        "dystopian",
        "dystopia",
        "totalitarian",
        "totalitarianism",
        "oppressive regime",
        "post-apocalyptic future"
      ]
    ],
    [
      "post-apocalyptic",
      [
        "post apocalyptic",
        "post-apocalyptic",
        "after the apocalypse",
        "after an apocalypse"
      ],
      [
        "post apocalyptic",
        "post-apocalyptic",
        "apocalypse",
        "apocalyptic",
        "after the apocalypse"
      ]
    ],
    [
      "survival",
      [
        "survival",
        "survive",
        "surviving"
      ],
      [
        "survival",
        "survive",
        "surviving",
        "stranded",
        "fight to survive"
      ]
    ],
    [
      "folk-horror",
      [
        "folk horror",
        "folk-horror"
      ],
      [
        "folk horror",
        "folk-horror",
        "pagan horror",
        "rural horror",
        "occult folklore"
      ]
    ],
    [
      "time-travel",
      [
        "time travel",
        "time-travel",
        "time travelling",
        "time traveling",
        "time traveller",
        "time traveler"
      ],
      [
        "time travel",
        "time-travel",
        "time traveller",
        "time traveler",
        "temporal loop",
        "time loop"
      ]
    ],
    [
      null,
      [
        "weird",
        "strange",
        "bizarre",
        "offbeat"
      ],
      [
        "weird",
        "strange",
        "bizarre",
        "offbeat",
        "absurd",
        "unusual"
      ]
    ],
    [
      "dark-comedy",
      [
        "dark comedy",
        "dark comedies",
        "black comedy",
        "black comedies"
      ],
      [
        "dark comedy",
        "dark comedies",
        "black comedy",
        "black comedies",
        "morbid comedy"
      ]
    ],
    [
      "serial-killer",
      [
        "serial killer",
        "serial killers"
      ],
      [
        "serial killer",
        "serial killers",
        "serial murder",
        "serial murderer",
        "serial murderers"
      ]
    ],
    [
      "supernatural-horror",
      [
        "supernatural horror",
        "supernatural"
      ],
      [
        "supernatural horror",
        "supernatural",
        "paranormal",
        "haunting",
        "haunted",
        "demonic"
      ]
    ],
    [
      "neo-noir",
      [
        "neo noir",
        "neo-noir"
      ],
      [
        "neo noir",
        "neo-noir",
        "modern noir"
      ]
    ],
    [
      "space-exploration",
      [
        "space movies",
        "space movie",
        "astronaut",
        "astronauts"
      ],
      [
        "space exploration",
        "space travel",
        "spacecraft",
        "nasa",
        "astronaut",
        "astronauts",
        "space mission"
      ]
    ],
    [
      null,
      [
        "zombie",
        "zombies",
        "undead"
      ],
      [
        "zombie",
        "zombies",
        "undead",
        "zombie apocalypse"
      ]
    ],
    [
      "surreal",
      [
        "surreal",
        "surrealism",
        "dreamlike",
        "mind bending",
        "mind-bending"
      ],
      [
        "surreal",
        "surrealism",
        "dreamlike",
        "dream-like"
      ]
    ]
  ];

  for (
    const [
      semanticConcept,
      needles,
      aliases
    ] of conceptRules
  ) {
    if (
      needles.some(
        needle =>
          includesNormalizedPhrase(
            q,
            needle
          )
      )
    ) {
      intent.concepts.push(aliases);

      intent.semanticConceptGroups.push({
        semanticConcept:
          semanticConcept || null,
        aliases
      });

      if (
        semanticConcept &&
        !intent.semanticConcepts.includes(
          semanticConcept
        )
      ) {
        intent.semanticConcepts.push(
          semanticConcept
        );
      }
    }
  }

  return intent;
}

module.exports = {
  normalizeSearchIntentValue,
  parseSearchIntent
};
