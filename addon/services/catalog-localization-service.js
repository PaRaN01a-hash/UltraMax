"use strict";

const SUPPORTED = new Set([
  "en", "es", "fr", "de", "it", "pt", "nl", "sv", "pl", "tr", "he", "hu", "ar"
]);

const LOCALES = Object.freeze({
  es: {
    labels: {
      movies: "Películas", series: "Series", cinema: "Cine", trending: "Tendencias",
      popular: "Popular", topRated: "Mejor valorado", new: "Estrenos", newReleases: "Nuevos estrenos",
      nowPlaying: "En cartelera", airingToday: "Se emite hoy", onTheAir: "En emisión",
      rightNow: "Ahora mismo", aiRecommended: "Recomendado por IA", thisWeek: "Esta semana"
    },
    topics: {
      "Action":"Acción","Comedy":"Comedia","Horror":"Terror","Sci-Fi":"Ciencia ficción",
      "Documentary":"Documental","Romance":"Romance","Thriller":"Suspense","Crime":"Crimen",
      "Animated":"Animación","Animation":"Animación","Family":"Familia","Fantasy":"Fantasía",
      "Adventure":"Aventura","History":"Historia","Rom-Com":"Comedia romántica","Reality TV":"Telerrealidad",
      "War":"Guerra","War & Politics":"Guerra y política","Western":"Wéstern","Mystery":"Misterio",
      "Drama":"Drama","Stand-up Comedy":"Monólogos","Superhero":"Superhéroes","Heist":"Atracos",
      "Detective":"Detectives","Police":"Policía","Prison":"Prisión","Zombie":"Zombis",
      "Paranormal":"Paranormal","Vampire":"Vampiros","Werewolf":"Hombres lobo","Kids":"Infantil",
      "Sports":"Deportes","Music":"Música","Nature":"Naturaleza","Anime":"Anime",
      "Korean":"Coreano","Japanese":"Japonés","Chinese":"Chino","French":"Francés","Spanish":"Español",
      "Italian":"Italiano","German":"Alemán","Mexican":"Mexicano","Argentine":"Argentino","Brazilian":"Brasileño"
    }
  },
  fr: {
    labels: {
      movies: "Films", series: "Séries", cinema: "Cinéma", trending: "Tendances",
      popular: "Populaire", topRated: "Mieux noté", new: "Nouveautés", newReleases: "Nouvelles sorties",
      nowPlaying: "À l’affiche", airingToday: "Diffusé aujourd’hui", onTheAir: "En diffusion",
      rightNow: "En ce moment", aiRecommended: "Recommandé par l’IA", thisWeek: "Cette semaine"
    },
    topics: {
      "Action":"Action","Comedy":"Comédie","Horror":"Horreur","Sci-Fi":"Science-fiction",
      "Documentary":"Documentaire","Romance":"Romance","Thriller":"Thriller","Crime":"Policier",
      "Animated":"Animation","Animation":"Animation","Family":"Famille","Fantasy":"Fantastique",
      "Adventure":"Aventure","History":"Histoire","Rom-Com":"Comédie romantique","Reality TV":"Télé-réalité",
      "War":"Guerre","War & Politics":"Guerre et politique","Western":"Western","Mystery":"Mystère",
      "Drama":"Drame","Stand-up Comedy":"Stand-up","Superhero":"Super-héros","Heist":"Braquage",
      "Detective":"Détective","Police":"Police","Prison":"Prison","Zombie":"Zombies",
      "Paranormal":"Paranormal","Vampire":"Vampires","Werewolf":"Loups-garous","Kids":"Enfants",
      "Sports":"Sports","Music":"Musique","Nature":"Nature","Anime":"Anime"
    }
  },
  de: {
    labels: {
      movies: "Filme", series: "Serien", cinema: "Kino", trending: "Trends",
      popular: "Beliebt", topRated: "Bestbewertet", new: "Neu", newReleases: "Neuerscheinungen",
      nowPlaying: "Jetzt im Kino", airingToday: "Heute im TV", onTheAir: "Läuft",
      rightNow: "Gerade jetzt", aiRecommended: "KI-Empfehlungen", thisWeek: "Diese Woche"
    },
    topics: {
      "Action":"Action","Comedy":"Komödie","Horror":"Horror","Sci-Fi":"Science-Fiction",
      "Documentary":"Dokumentation","Romance":"Romantik","Thriller":"Thriller","Crime":"Krimi",
      "Animated":"Animation","Animation":"Animation","Family":"Familie","Fantasy":"Fantasy",
      "Adventure":"Abenteuer","History":"Geschichte","Rom-Com":"Romantische Komödie","Reality TV":"Reality-TV",
      "War":"Krieg","War & Politics":"Krieg & Politik","Western":"Western","Mystery":"Mystery",
      "Drama":"Drama","Stand-up Comedy":"Stand-up-Comedy","Superhero":"Superhelden","Heist":"Raubüberfall",
      "Kids":"Kinder","Sports":"Sport","Music":"Musik","Nature":"Natur","Anime":"Anime"
    }
  },
  it: {
    labels: {
      movies: "Film", series: "Serie", cinema: "Cinema", trending: "Tendenze",
      popular: "Popolari", topRated: "Più votati", new: "Novità", newReleases: "Nuove uscite",
      nowPlaying: "Al cinema", airingToday: "In onda oggi", onTheAir: "In onda",
      rightNow: "Adesso", aiRecommended: "Consigliati dall’IA", thisWeek: "Questa settimana"
    },
    topics: {
      "Action":"Azione","Comedy":"Commedia","Horror":"Horror","Sci-Fi":"Fantascienza",
      "Documentary":"Documentari","Romance":"Romantico","Thriller":"Thriller","Crime":"Crime",
      "Animated":"Animazione","Animation":"Animazione","Family":"Famiglia","Fantasy":"Fantasy",
      "Adventure":"Avventura","History":"Storia","Rom-Com":"Commedia romantica","Reality TV":"Reality TV",
      "War":"Guerra","War & Politics":"Guerra e politica","Western":"Western","Mystery":"Mistero",
      "Drama":"Drammatico","Stand-up Comedy":"Stand-up comedy","Superhero":"Supereroi","Kids":"Bambini",
      "Sports":"Sport","Music":"Musica","Nature":"Natura","Anime":"Anime"
    }
  },
  pt: {
    labels: {
      movies: "Filmes", series: "Séries", cinema: "Cinema", trending: "Em alta",
      popular: "Popular", topRated: "Mais bem avaliados", new: "Novidades", newReleases: "Novos lançamentos",
      nowPlaying: "Em cartaz", airingToday: "No ar hoje", onTheAir: "No ar",
      rightNow: "Agora", aiRecommended: "Recomendado por IA", thisWeek: "Esta semana"
    },
    topics: {
      "Action":"Ação","Comedy":"Comédia","Horror":"Terror","Sci-Fi":"Ficção científica",
      "Documentary":"Documentário","Romance":"Romance","Thriller":"Suspense","Crime":"Crime",
      "Animated":"Animação","Animation":"Animação","Family":"Família","Fantasy":"Fantasia",
      "Adventure":"Aventura","History":"História","Rom-Com":"Comédia romântica","Reality TV":"Reality TV",
      "War":"Guerra","War & Politics":"Guerra e política","Western":"Faroeste","Mystery":"Mistério",
      "Drama":"Drama","Stand-up Comedy":"Stand-up comedy","Superhero":"Super-heróis","Kids":"Infantil",
      "Sports":"Esportes","Music":"Música","Nature":"Natureza","Anime":"Anime"
    }
  },
  nl: {
    labels: {
      movies: "Films", series: "Series", cinema: "Cinema", trending: "Trending",
      popular: "Populair", topRated: "Best beoordeeld", new: "Nieuw", newReleases: "Nieuwe releases",
      nowPlaying: "Nu in de bioscoop", airingToday: "Vandaag op tv", onTheAir: "Nu op tv",
      rightNow: "Nu", aiRecommended: "AI-aanbevolen", thisWeek: "Deze week"
    },
    topics: {
      "Action":"Actie","Comedy":"Komedie","Horror":"Horror","Sci-Fi":"Sciencefiction",
      "Documentary":"Documentaire","Romance":"Romantiek","Thriller":"Thriller","Crime":"Misdaad",
      "Animated":"Animatie","Animation":"Animatie","Family":"Familie","Fantasy":"Fantasy",
      "Adventure":"Avontuur","History":"Geschiedenis","Rom-Com":"Romantische komedie","Reality TV":"Reality-tv",
      "War":"Oorlog","Western":"Western","Mystery":"Mysterie","Drama":"Drama","Kids":"Kinderen",
      "Sports":"Sport","Music":"Muziek","Nature":"Natuur","Anime":"Anime"
    }
  },
  sv: {
    labels: {
      movies: "Filmer", series: "Serier", cinema: "Bio", trending: "Trendande",
      popular: "Populärt", topRated: "Högst betyg", new: "Nytt", newReleases: "Nya släpp",
      nowPlaying: "På bio nu", airingToday: "Sänds idag", onTheAir: "Sänds nu",
      rightNow: "Just nu", aiRecommended: "AI-rekommenderat", thisWeek: "Den här veckan"
    },
    topics: {
      "Action":"Action","Comedy":"Komedi","Horror":"Skräck","Sci-Fi":"Science fiction",
      "Documentary":"Dokumentär","Romance":"Romantik","Thriller":"Thriller","Crime":"Kriminal",
      "Animated":"Animation","Animation":"Animation","Family":"Familj","Fantasy":"Fantasy",
      "Adventure":"Äventyr","History":"Historia","Reality TV":"Reality-tv","War":"Krig",
      "Western":"Western","Mystery":"Mysterium","Drama":"Drama","Kids":"Barn","Sports":"Sport",
      "Music":"Musik","Nature":"Natur","Anime":"Anime"
    }
  },
  pl: {
    labels: {
      movies: "Filmy", series: "Seriale", cinema: "Kino", trending: "Na czasie",
      popular: "Popularne", topRated: "Najwyżej oceniane", new: "Nowości", newReleases: "Nowe premiery",
      nowPlaying: "Teraz w kinach", airingToday: "Dziś na antenie", onTheAir: "Na antenie",
      rightNow: "Teraz", aiRecommended: "Polecane przez AI", thisWeek: "W tym tygodniu"
    },
    topics: {
      "Action":"Akcja","Comedy":"Komedia","Horror":"Horror","Sci-Fi":"Science fiction",
      "Documentary":"Dokument","Romance":"Romans","Thriller":"Thriller","Crime":"Kryminał",
      "Animated":"Animacja","Animation":"Animacja","Family":"Familijne","Fantasy":"Fantasy",
      "Adventure":"Przygoda","History":"Historia","Reality TV":"Reality TV","War":"Wojna",
      "Western":"Western","Mystery":"Tajemnica","Drama":"Dramat","Kids":"Dla dzieci",
      "Sports":"Sport","Music":"Muzyka","Nature":"Przyroda","Anime":"Anime"
    }
  },
  tr: {
    labels: {
      movies: "Filmler", series: "Diziler", cinema: "Sinema", trending: "Trendler",
      popular: "Popüler", topRated: "En yüksek puanlı", new: "Yeni", newReleases: "Yeni çıkanlar",
      nowPlaying: "Vizyonda", airingToday: "Bugün yayında", onTheAir: "Yayında",
      rightNow: "Şu anda", aiRecommended: "Yapay zekâ önerileri", thisWeek: "Bu hafta"
    },
    topics: {
      "Action":"Aksiyon","Comedy":"Komedi","Horror":"Korku","Sci-Fi":"Bilim kurgu",
      "Documentary":"Belgesel","Romance":"Romantik","Thriller":"Gerilim","Crime":"Suç",
      "Animated":"Animasyon","Animation":"Animasyon","Family":"Aile","Fantasy":"Fantastik",
      "Adventure":"Macera","History":"Tarih","Reality TV":"Reality TV","War":"Savaş",
      "Western":"Western","Mystery":"Gizem","Drama":"Dram","Kids":"Çocuk","Sports":"Spor",
      "Music":"Müzik","Nature":"Doğa","Anime":"Anime"
    }
  },
  he: {
    labels: {
      movies: "סרטים", series: "סדרות", cinema: "קולנוע", trending: "במגמה",
      popular: "פופולרי", topRated: "המדורגים ביותר", new: "חדש", newReleases: "מהדורות חדשות",
      nowPlaying: "עכשיו בקולנוע", airingToday: "משודר היום", onTheAir: "בשידור",
      rightNow: "עכשיו", aiRecommended: "המלצות AI", thisWeek: "השבוע"
    },
    topics: {
      "Action":"אקשן","Comedy":"קומדיה","Horror":"אימה","Sci-Fi":"מדע בדיוני",
      "Documentary":"תיעודי","Romance":"רומנטיקה","Thriller":"מותחן","Crime":"פשע",
      "Animated":"אנימציה","Animation":"אנימציה","Family":"משפחה","Fantasy":"פנטזיה",
      "Adventure":"הרפתקה","History":"היסטוריה","War":"מלחמה","Mystery":"מסתורין",
      "Drama":"דרמה","Kids":"ילדים","Sports":"ספורט","Music":"מוזיקה","Nature":"טבע","Anime":"אנימה"
    }
  },
  hu: {
    labels: {
      movies: "Filmek", series: "Sorozatok", cinema: "Mozi", trending: "Felkapott",
      popular: "Népszerű", topRated: "Legjobbra értékelt", new: "Újdonságok", newReleases: "Új megjelenések",
      nowPlaying: "Most a mozikban", airingToday: "Ma adásban", onTheAir: "Adásban",
      rightNow: "Most", aiRecommended: "MI-ajánlások", thisWeek: "Ezen a héten"
    },
    topics: {
      "Action":"Akció","Comedy":"Vígjáték","Horror":"Horror","Sci-Fi":"Sci-fi",
      "Documentary":"Dokumentumfilm","Romance":"Romantika","Thriller":"Thriller","Crime":"Bűnügyi",
      "Animated":"Animáció","Animation":"Animáció","Family":"Családi","Fantasy":"Fantasy",
      "Adventure":"Kaland","History":"Történelem","War":"Háború","Mystery":"Rejtély",
      "Drama":"Dráma","Kids":"Gyerekek","Sports":"Sport","Music":"Zene","Nature":"Természet","Anime":"Anime"
    }
  },
  ar: {
    labels: {
      movies: "أفلام", series: "مسلسلات", cinema: "سينما", trending: "رائج",
      popular: "شائع", topRated: "الأعلى تقييماً", new: "جديد", newReleases: "إصدارات جديدة",
      nowPlaying: "يعرض الآن", airingToday: "يعرض اليوم", onTheAir: "على الهواء",
      rightNow: "الآن", aiRecommended: "موصى به بالذكاء الاصطناعي", thisWeek: "هذا الأسبوع"
    },
    topics: {
      "Action":"أكشن","Comedy":"كوميديا","Horror":"رعب","Sci-Fi":"خيال علمي",
      "Documentary":"وثائقي","Romance":"رومانسي","Thriller":"إثارة","Crime":"جريمة",
      "Animated":"رسوم متحركة","Animation":"رسوم متحركة","Family":"عائلي","Fantasy":"فانتازيا",
      "Adventure":"مغامرة","History":"تاريخ","War":"حرب","Mystery":"غموض",
      "Drama":"دراما","Kids":"أطفال","Sports":"رياضة","Music":"موسيقى","Nature":"طبيعة","Anime":"أنمي"
    }
  }
});

function normalizeCatalogLanguage(value) {
  const primary = String(value || "en-US").trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.has(primary) ? primary : "en";
}

function splitDecoration(name) {
  const value = String(name || "");
  const match = value.match(/^([^\p{L}\p{N}]*)(.*)$/u);
  return {
    prefix: match ? match[1] : "",
    text: match ? match[2] : value
  };
}

function translateTopic(topic, locale) {
  const clean = String(topic || "").trim();
  return locale.topics[clean] || clean;
}

function translateCore(text, locale) {
  const labels = locale.labels;
  const exact = {
    "Trending": labels.trending,
    "Popular": labels.popular,
    "Top Rated": labels.topRated,
    "Now Playing": labels.nowPlaying,
    "Airing Today": labels.airingToday,
    "On The Air": labels.onTheAir,
    "New Releases": labels.newReleases,
    "Right Now Movies": `${labels.rightNow} · ${labels.movies}`,
    "Right Now Series": `${labels.rightNow} · ${labels.series}`,
    "AI Recommended Movies": `${labels.aiRecommended} · ${labels.movies}`,
    "AI Recommended Series": `${labels.aiRecommended} · ${labels.series}`,
    "Top Movies This Week": `${labels.thisWeek} · ${labels.movies}`,
    "Top Series This Week": `${labels.thisWeek} · ${labels.series}`
  };
  if (exact[text]) return exact[text];

  const plainTopic = translateTopic(text, locale);
  if (plainTopic !== text) return plainTopic;

  let match = text.match(/^Top Rated (.+?) (Movies|Series|Films)$/);
  if (match) {
    const topic = translateTopic(match[1], locale);
    const type = match[2] === "Series" ? labels.series : labels.movies;
    return `${labels.topRated} · ${topic} · ${type}`;
  }

  match = text.match(/^Popular (.+?) (Movies|Series)$/);
  if (match) {
    const topic = translateTopic(match[1], locale);
    const type = match[2] === "Series" ? labels.series : labels.movies;
    return `${labels.popular} · ${topic} · ${type}`;
  }

  match = text.match(/^New (.+?) (Movies|Series)$/);
  if (match) {
    const topic = translateTopic(match[1], locale);
    const type = match[2] === "Series" ? labels.series : labels.movies;
    return `${labels.new} · ${topic} · ${type}`;
  }

  match = text.match(/^Trending (Movies|Series)$/);
  if (match) {
    const type = match[1] === "Series" ? labels.series : labels.movies;
    return `${labels.trending} · ${type}`;
  }

  match = text.match(/^Popular (Movies|Series)$/);
  if (match) {
    const type = match[1] === "Series" ? labels.series : labels.movies;
    return `${labels.popular} · ${type}`;
  }

  match = text.match(/^(.+?) Cinema$/);
  if (match) {
    return `${translateTopic(match[1], locale)} · ${labels.cinema}`;
  }

  match = text.match(/^(.+?) (Movies|Films|Series)$/);
  if (match) {
    const topic = translateTopic(match[1], locale);
    const type = match[2] === "Series" ? labels.series : labels.movies;
    return `${topic} · ${type}`;
  }

  return text;
}

function translateCatalogName(name, language) {
  const lang = normalizeCatalogLanguage(language);
  if (lang === "en") return String(name || "");
  const locale = LOCALES[lang];
  if (!locale) return String(name || "");

  const { prefix, text } = splitDecoration(name);
  return prefix + translateCore(text, locale);
}

function localizeCatalogs(catalogs, language, options = {}) {
  const protectedIds = options.protectedIds instanceof Set
    ? options.protectedIds
    : new Set(Array.isArray(options.protectedIds) ? options.protectedIds : []);

  return (Array.isArray(catalogs) ? catalogs : []).map(catalog => {
    if (!catalog || protectedIds.has(catalog.id)) return catalog;
    return {
      ...catalog,
      name: translateCatalogName(catalog.name, language)
    };
  });
}

module.exports = {
  normalizeCatalogLanguage,
  translateCatalogName,
  localizeCatalogs
};
