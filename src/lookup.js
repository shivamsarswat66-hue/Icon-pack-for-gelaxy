/**
 * CineMatch — online lookup for films the bundled catalogue doesn't have.
 *
 * Design notes
 * ------------
 * 1. The search is the easy part. The hard part is turning a Wikipedia page into
 *    something the taste engine can reason about: `genres[]`, `keywords[]`,
 *    `industry`, `year`, `runtime`, `director`. Without those the film would be an
 *    inert card — pretty, but invisible to questioning, ranking and feedback.
 * 2. Nothing is auto-added. `lookup()` only *proposes* candidates; the user confirms.
 * 3. Keyless by design: Wikipedia + Wikidata both send `Access-Control-Allow-Origin: *`,
 *    so this runs in the browser as well as in Node — no API key, no proxy, no cost.
 * 4. Registered films are pushed into the live `movies` array / `byId` map, so every
 *    existing engine path (search, questions, rank, feedback) sees them unchanged.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  if (root) root.CineLookup = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ------------------------------------------------------------------ state */
  let MOVIES = [];
  let BYID = new Map();
  let GENRES = [];
  let INDUSTRIES = {};
  let VOCAB = [];
  const cache = new Map();

  function init({ movies, byId, genres, industries }) {
    MOVIES = movies || [];
    BYID = byId || new Map();
    GENRES = genres || [];
    INDUSTRIES = industries || {};
    const seen = new Map();
    for (const m of MOVIES) for (const k of m.keywords || []) seen.set(k, (seen.get(k) || 0) + 1);
    // most common themes first: they are the vocabulary the ranker already understands
    VOCAB = [...seen.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
    return VOCAB.length;
  }

  /* --------------------------------------------------------- genre mapping */
  // Wikidata genre labels are granular ("action film", "romantic drama").
  // Order matters: the first rule that matches wins, so put sharper ideas first.
  const GENRE_RULES = [
    [/neo[- ]?noir/i, "Crime"],
    [/noir/i, "Crime"],
    [/slasher|splatter|zombie|vampire|ghost|supernatural horror|folk horror/i, "Horror"],
    [/horror/i, "Horror"],
    [/science[- ]fiction|sci[- ]?fi|space opera|cyberpunk|dystopian/i, "Sci-Fi"],
    [/superhero|martial arts|action/i, "Action"],
    [/thriller|suspense|spy fiction/i, "Thriller"],
    [/mystery|whodunit|detective|crime fiction/i, "Mystery"],
    [/crime|gangster|heist|mafia|police procedural/i, "Crime"],
    [/romantic comedy/i, "Romance"],
    [/romance|romantic drama|love story/i, "Romance"],
    [/animated|anime|cartoon/i, "Animation"],
    [/musical comedy|musical/i, "Musical"],
    [/music|concert|band|musician|dance film/i, "Music"],
    [/war film|anti[- ]war|war/i, "War"],
    [/western|spaghetti/i, "Western"],
    [/biopic|biographical|biography/i, "Biography"],
    [/sports|boxing|football|cricket|athlete|racing/i, "Sports"],
    [/adventure|epic film|swashbuckler|road movie/i, "Adventure"],
    [/fantasy|fairy tale|magic realism|sword and sorcery/i, "Fantasy"],
    [/children|family film|kids/i, "Family"],
    [/documentary/i, "Documentary_"], // dropped later — not in our genre set
    [/comedy|satire|parody|screwball|farce/i, "Comedy"],
    [/drama|melodrama|tragedy|slice of life/i, "Drama"],
    [/history|historical|period piece/i, "Drama"],
  ];

  const GENRE_ALIASES = {
    action: "Action",
    adventure: "Adventure",
    animation: "Animation",
    animated: "Animation",
    anime: "Animation",
    biography: "Biography",
    biopic: "Biography",
    comedy: "Comedy",
    crime: "Crime",
    drama: "Drama",
    family: "Family",
    fantasy: "Fantasy",
    horror: "Horror",
    music: "Music",
    musical: "Musical",
    mystery: "Mystery",
    romance: "Romance",
    romantic: "Romance",
    "sci-fi": "Sci-Fi",
    science: "Sci-Fi",
    sport: "Sports",
    sports: "Sports",
    thriller: "Thriller",
    war: "War",
    western: "Western",
  };

  function genresFromLabels(labels) {
    const out = new Set();
    for (const label of labels) {
      const alias = GENRE_ALIASES[String(label).toLowerCase().trim()];
      if (alias && GENRES.includes(alias)) {
        out.add(alias);
        continue;
      }
      for (const [re, genre] of GENRE_RULES) {
        if (re.test(label) && GENRES.includes(genre)) {
          out.add(genre);
          break;
        }
      }
    }
    return [...out].slice(0, 3);
  }

  /* ------------------------------------------------------ industry mapping */
  const COUNTRY_INDUSTRY = {
    India: "BW",
    "United States of America": "HW",
    "United States": "HW",
    "United Kingdom": "EU",
    France: "EU",
    Germany: "EU",
    Italy: "EU",
    Spain: "EU",
    Ireland: "EU",
    Sweden: "EU",
    Denmark: "EU",
    Norway: "EU",
    Poland: "EU",
    Russia: "EU",
    Netherlands: "EU",
    Belgium: "EU",
    "Soviet Union": "EU",
    "South Korea": "KO",
    Korea: "KO",
    Japan: "JP",
    China: "WO",
    "Hong Kong": "WO",
    Taiwan: "WO",
    Iran: "WO",
    Turkey: "WO",
    Brazil: "WO",
    Mexico: "WO",
    Argentina: "WO",
    Nigeria: "WO",
    Australia: "WO",
    Canada: "HW",
    Pakistan: "WO",
    "Sri Lanka": "WO",
    Bangladesh: "WO",
    Nepal: "WO",
  };

  function industryFrom(labels) {
    for (const label of labels) {
      const key = Object.keys(COUNTRY_INDUSTRY).find(
        (k) => k.toLowerCase() === String(label).toLowerCase().trim()
      );
      if (key) return COUNTRY_INDUSTRY[key];
    }
    return "WO";
  }

  /* ------------------------------------------------------ keyword extraction */
  function keywordsFrom(text) {
    const cleaned = String(text || "")
      .toLowerCase()
      .replace(/\b[a-z]+-language\b/g, " ") // "english-language" is not a theme
      .replace(/\blanguage\b/g, " ")
      .replace(/[-_]/g, " ");
    const hay = " " + cleaned + " ";
    const hits = [];
    for (const kw of VOCAB) {
      if (hits.length >= 6) break;
      const needle = kw.replace(/-/g, " ");
      if (needle.length < 4) continue;
      if (hay.includes(" " + needle) || hay.includes(needle + " ") || hay.includes(" " + needle + " ")) {
        hits.push(kw);
      }
    }
    return hits;
  }

  /* --------------------------------------------------------------- helpers */
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

  function briefSynopsis(text, max = 190) {
    const t = clean(text).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ");
    if (!t) return "";
    const first = t.split(/(?<=[.!?])\s/).slice(0, 2).join(" ");
    return first.length > max ? first.slice(0, max).replace(/[\s,;:]+$/, "") + "…" : first;
  }

  function titleSimilarity(query, title) {
    const norm = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const a = norm(query);
    const b = norm(title);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (b.startsWith(a) || a.startsWith(b)) return 0.92;
    const aw = a.split(" ");
    const bw = b.split(" ");
    const shared = aw.filter((w) => w.length > 2 && bw.includes(w)).length;
    const base = shared / Math.max(aw.length, bw.length);
    // crude character overlap for typos
    let same = 0;
    const bwset = new Set(b.replace(/ /g, "").split(""));
    for (const ch of a.replace(/ /g, "")) if (bwset.has(ch)) same++;
    const charRatio = same / Math.max(1, a.replace(/ /g, "").length);
    return Math.max(base, charRatio * 0.8);
  }

  /* ----------------------------------------------------------- http helper */
  const UA = "CineMatch/1.1 (taste-first movie recommender; contact: app owner)";

  // Wikimedia throttles bursts hard ("You are making too many requests").
  // One queue for the whole process: min gap between calls + retry with backoff.
  let chain = Promise.resolve();
  const MIN_GAP = 900;
  let lastCall = 0;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function queued(fn) {
    const run = chain.then(async (...args) => {
      const wait = Math.max(0, lastCall + MIN_GAP + Math.random() * 250 - Date.now());
      if (wait) await sleep(wait);
      lastCall = Date.now();
      return fn(...args);
    });
    chain = run.catch(() => {});
    return run;
  }

  // The queue only wraps the network call itself. Retries happen OUTSIDE it,
  // otherwise a retry would wait on the queue slot it is currently holding (deadlock).
  function queuedFetch(url) {
    return queued(async () => {
      const opts = { headers: { Accept: "application/json" } };
      // Node needs an explicit User-Agent; browsers forbid setting it.
      if (typeof window === "undefined") opts.headers["User-Agent"] = UA;
      return fetch(url, opts);
    });
  }

  async function getJSON(url, attempt = 1) {
    let res;
    try {
      res = await queuedFetch(url);
    } catch (err) {
      if (attempt < 4) {
        await sleep(700 * attempt);
        return getJSON(url, attempt + 1);
      }
      throw err;
    }
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        await sleep(1000 * attempt);
        return getJSON(url, attempt + 1);
      }
      throw new Error("HTTP " + res.status);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      // Wikimedia answers throttling with plain text, not JSON
      if (attempt < 5) {
        await sleep(1500 * attempt);
        return getJSON(url, attempt + 1);
      }
      throw new Error("non-JSON response");
    }
  }

  const WIKI = "https://en.wikipedia.org/w/api.php";
  const WD = "https://www.wikidata.org/w/api.php";

  /* ------------------------------------------------- how a film describes itself
   * Wikipedia's first sentence is the richest signal we get:
   *   "Oppenheimer is a 2023 epic biographical thriller film directed by…"
   *   "Kantara is a 2022 Indian Kannada-language action drama film…"
   * Genres, language and medium all live in that one line, so parse it directly
   * instead of trusting Wikidata's patchy P136 statements.
   */
  const EXTRACT_GENRES = [
    ["science fiction", "Sci-Fi"], ["sci-fi", "Sci-Fi"], ["space opera", "Sci-Fi"],
    ["action", "Action"], ["adventure", "Adventure"], ["animated", "Animation"], ["animation", "Animation"],
    ["anime", "Animation"], ["biographical", "Biography"], ["biopic", "Biography"],
    ["comedy", "Comedy"], ["crime", "Crime"], ["drama", "Drama"], ["family", "Family"],
    ["fantasy", "Fantasy"], ["horror", "Horror"], ["musical", "Musical"], ["music", "Music"],
    ["mystery", "Mystery"], ["romance", "Romance"], ["romantic", "Romance"],
    ["sports", "Sports"], ["sport", "Sports"], ["thriller", "Thriller"], ["war", "War"],
    ["western", "Western"], ["superhero", "Action"], ["martial arts", "Action"],
    ["noir", "Crime"], ["slasher", "Horror"], ["satire", "Comedy"], ["mythological", "Fantasy"],
    ["historical", "Drama"], ["period", "Drama"], ["coming-of-age", "Drama"],
  ];

  function firstSentence(text) {
    const t = clean(text);
    if (!t) return "";
    const m = t.match(/^(.{20,320}?[.!?])(\s|$)/);
    return m ? m[1] : t.slice(0, 200);
  }

  function genresFromExtract(text) {
    const head = firstSentence(text).toLowerCase();
    if (!head) return [];
    // Only trust the descriptive clause — "Captain America: Civil War is a 2016
    // American superhero film …" must not yield "War" from its own title.
    const m = head.match(/\bis an?\s+(.{0,170}?)\s*(?:film|movie)\b/);
    const target = (m ? m[1] : head.slice(0, 170)).trim();
    if (!target) return [];
    const out = [];
    for (const [needle, genre] of EXTRACT_GENRES) {
      if (out.includes(genre)) continue;
      if (new RegExp(`(^|[^a-z])${needle.replace(/[-/]/g, "[- ]")}([^a-z]|$)`).test(target) && GENRES.includes(genre)) {
        out.push(genre);
      }
    }
    return out;
  }

  const NOT_A_FILM = /\b(video game|soundtrack|album|novel|television series|web series|song|episode|comic|manga)\b/;
  const PERSON_WORDS = /\b(director|actor|actress|producer|screenwriter|filmmaker|singer|composer|politician|writer|author|photographer|journalist)\b/;

  function looksLikeFilm(text) {
    const head = firstSentence(text).toLowerCase();
    if (!head) return false;
    // "Oppenheimer is the soundtrack album…", "Red Dead Redemption is a … game"
    if (NOT_A_FILM.test(head)) return false;
    // "Joshua Oppenheimer is an American and British film director…" — a person, not a film
    if (PERSON_WORDS.test(head) && !/^[^.]{0,60}\bis an? [0-9]{4}/.test(head)) return false;
    return /\bfilm\b|\bmovie\b/.test(head);
  }

  function yearFromExtract(text) {
    const m = clean(text).match(/\b(19[0-9]{2}|20[0-9]{2})\b/);
    return m ? Number(m[1]) : null;
  }

  const REGIONAL = /tamil|telugu|malayalam|kannada|marathi|bengali|punjabi|gujarati|assamese|odia|konkani/i;

  function industryFromText(text, countryIndustry) {
    const head = firstSentence(text).toLowerCase();
    if (/hindi/.test(head)) return "BW";
    if (REGIONAL.test(head) || /indian\b/.test(head)) return countryIndustry === "BW" ? "IN" : countryIndustry;
    return countryIndustry;
  }

  // "96 2018 tamil film" finds nothing; "96 film" and then "96" do.
  async function pickSearchTerm(q) {
    const attempts = [`${q} film`, q.replace(/\b(19|20)\d{2}\b/g, "").trim() + " film", q];
    for (const term of attempts) {
      if (!term.trim()) continue;
      try {
        const probe = await getJSON(
          `${WIKI}?action=query&format=json&formatversion=2&origin=*&list=search&srlimit=1&srnamespace=0&srsearch=${encodeURIComponent(term)}`
        );
        if ((probe?.query?.search || []).length) return term;
      } catch (_) {}
    }
    return `${q} film`;
  }

  /* ---------------------------------------------------------- main lookup */
  async function lookup(query, { limit = 5 } = {}) {
    const q = clean(query);
    if (q.length < 2) return [];
    const key = q.toLowerCase();
    if (cache.has(key)) return cache.get(key);

    try {
      const searchTerm = await pickSearchTerm(q);
      const pageUrl =
        `${WIKI}?action=query&format=json&formatversion=2&origin=*&redirects=1` +
        `&generator=search&gsrsearch=${encodeURIComponent(searchTerm)}&gsrlimit=${Math.min(limit + 3, 6)}&gsrnamespace=0` +
        `&prop=extracts|pageprops|info&exintro=1&exsentences=3&exlimit=max&explaintext=1&ppprop=wikibase_item`;
      const pagesRes = await getJSON(pageUrl);
      const pages = pagesRes?.query?.pages || [];
      const order = new Map(pages.map((p, i) => [p.title, i]));
      const withQid = pages
        .map((p) => ({ title: p.title, extract: p.extract || "", qid: p.pageprops?.wikibase_item, size: p.length || 0 }))
        .filter((p) => p.qid && !/^list of|^lists of|disambiguation/i.test(p.title) && looksLikeFilm(p.extract));
      if (!withQid.length) return save(key, []);

      const entUrl =
        `${WD}?action=wbgetentities&format=json&origin=*&props=claims|labels&languages=en` +
        `&ids=${withQid.map((p) => p.qid).join("|")}`;
      const ents = (await getJSON(entUrl))?.entities || {};

      // every referenced item needs a label (ALL values, not just the first)
      const allIds = (claims, prop) =>
        (claims?.[prop] || []).map((c) => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);

      const refIds = new Set();
      for (const p of withQid) {
        const claims = ents[p.qid]?.claims || {};
        for (const prop of ["P136", "P495", "P57", "P161", "P364"]) {
          for (const id of allIds(claims, prop)) refIds.add(id);
        }
      }
      const labels = {};
      const idList = [...refIds];
      for (let i = 0; i < idList.length; i += 45) {
        const chunk = idList.slice(i, i + 45);
        const labRes = (await getJSON(
          `${WD}?action=wbgetentities&format=json&origin=*&props=labels&languages=en&ids=${chunk.join("|")}`
        ))?.entities || {};
        for (const [id, e] of Object.entries(labRes)) labels[id] = e?.labels?.en?.value || "";
      }
      const labelOf = (id) => labels[id] || "";

      const wantedYear = (q.match(/\b(19\d{2}|20\d{2})\b/) || [])[1];

      const candidates = withQid
        .map((p) => {
          const e = ents[p.qid];
          const claims = e?.claims || {};
          const val = (prop) => claims[prop]?.[0]?.mainsnak?.datavalue?.value;

          const yearClaim = val("P577")?.time;
          const year = yearClaim ? Number(String(yearClaim).slice(1, 5)) : yearFromExtract(p.extract);
          if (!year) return null;

          const title = clean(e?.labels?.en?.value || p.title.replace(/\s*\(.*?\)\s*$/, ""))
            .replace(/^[^\p{L}\p{N}]+/u, ""); // "'96" → "96"
          const genreLabels = allIds(claims, "P136").map(labelOf).filter(Boolean);
          const countryLabels = allIds(claims, "P495").map(labelOf).filter(Boolean);
          const langLabels = allIds(claims, "P364").map(labelOf).filter(Boolean);
          const director = allIds(claims, "P57").map(labelOf).filter(Boolean)[0] || "";
          const cast = allIds(claims, "P161").map(labelOf).filter(Boolean).slice(0, 3);
          const runtimeClaim = val("P2047")?.amount;
          const runtime = runtimeClaim ? Math.round(Number(runtimeClaim)) : null;
          const synopsis = briefSynopsis(p.extract);

          // genres: the film's own description wins, Wikidata fills the gaps
          const fromText = genresFromExtract(p.extract);
          const fromClaims = genresFromLabels(genreLabels);
          let genres = [...new Set([...fromText, ...fromClaims])];
          if (!genres.length) genres = inferGenres(synopsis);
          if (!genres.length) genres = ["Drama"];

          const baseIndustry = industryFrom(countryLabels.concat(langLabels));
          const industry = industryFromText(p.extract, baseIndustry);

          let score = titleSimilarity(q, title);
          const idx = order.get(p.title) ?? 9;
          score += Math.max(0, 0.12 - idx * 0.025); // Wikipedia's own ranking is a real signal
          if (wantedYear && String(year) === wantedYear) score += 0.2;
          if (/\b(film)\b/i.test(p.title)) score += 0.03;
          // well-documented films have long articles; a mild popularity tie-break
          score += Math.min(0.2, Math.log10(Math.max(1000, p.size)) / 25);

          return {
            score,
            movie: {
              id: "w-" + String(p.qid).toLowerCase(),
              title,
              year,
              industry,
              industryName: INDUSTRIES[industry] || "World Cinema",
              rating: null,
              runtime,
              director,
              genres: genres.slice(0, 3),
              keywords: keywordsFrom(synopsis + " " + genreLabels.join(" ")),
              synopsis: synopsis || `${title}${year ? ` (${year})` : ""} — added from Wikipedia.`,
              source: "wikipedia",
              sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
              cast,
            },
          };
        })
        .filter(Boolean)
        .filter((c, i, arr) => arr.findIndex((x) => x.movie.id === c.movie.id) === i)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((c) => ({ ...c.movie, confidence: Math.min(0.99, 0.6 + c.score * 0.35) }));

      return save(key, candidates);
    } catch (err) {
      return save(key, []);
    }
  }

  function save(key, value) {
    cache.set(key, value);
    return value;
  }

  function inferGenres(text) {
    const t = String(text || "").toLowerCase();
    const out = [];
    const probes = [
      [/murder|kill|gang|crime|police|detective/, "Crime"],
      [/love|romance|marri|couple/, "Romance"],
      [/war|soldier|army|battle/, "War"],
      [/alien|space|robot|future|scientist/, "Sci-Fi"],
      [/ghost|demon|haunt|supernatural|curse/, "Horror"],
      [/sing|dance|music|band/, "Music"],
      [/school|college|teen|friend/, "Comedy"],
      [/family|father|mother|son|daughter/, "Drama"],
      [/race|boxing|cricket|football|champion/, "Sports"],
      [/adventure|journey|quest|treasure/, "Adventure"],
    ];
    for (const [re, g] of probes) {
      if (re.test(t) && GENRES.includes(g)) out.push(g);
      if (out.length >= 2) break;
    }
    return out;
  }

  /* --------------------------------------------------------- registration */
  // Films the user confirmed. Pushed into the SAME arrays the engine walks,
  // so search / questions / ranking / feedback all pick them up with no changes.
  function register(movie) {
    if (!movie || !movie.id || BYID.has(movie.id)) return false;
    const safe = sanitize(movie);
    if (!safe) return false;
    BYID.set(safe.id, safe);
    MOVIES.push(safe);
    return true;
  }

  function sanitize(m) {
    if (!m || typeof m !== "object") return null;
    const id = String(m.id || "");
    if (!/^w-q\d+$/i.test(id)) return null;
    const title = clean(m.title).slice(0, 120);
    if (!title) return null;
    const year = Number.isFinite(Number(m.year)) ? Math.round(Number(m.year)) : null;
    const genres = (Array.isArray(m.genres) ? m.genres : []).filter((g) => GENRES.includes(g)).slice(0, 3);
    const keywords = (Array.isArray(m.keywords) ? m.keywords : [])
      .filter((k) => typeof k === "string" && k.length < 30)
      .slice(0, 6);
    const industry = INDUSTRIES[m.industry] ? m.industry : "WO";
    return {
      id,
      title,
      year,
      industry,
      industryName: INDUSTRIES[industry] || "World Cinema",
      rating: null,
      runtime: Number.isFinite(Number(m.runtime)) ? Math.round(Number(m.runtime)) : null,
      director: clean(m.director).slice(0, 80),
      genres: genres.length ? genres : ["Drama"],
      keywords,
      synopsis: clean(m.synopsis).slice(0, 400),
      source: "wikipedia",
      sourceUrl: typeof m.sourceUrl === "string" ? m.sourceUrl.slice(0, 300) : "",
    };
  }

  return { init, lookup, register, sanitize, keywordsFrom, genresFromLabels, genresFromExtract, inferGenres, briefSynopsis, industryFrom, looksLikeFilm, _cache: cache };
});
