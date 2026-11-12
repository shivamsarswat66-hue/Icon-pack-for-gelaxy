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
    India: "IN",
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

  // Language is a sharper signal than country for Indian cinema: "Hindi" means
  // Bollywood, "Malayalam" means regional — and India alone no longer means BW.
  const LANGUAGE_INDUSTRY = {
    hindi: "BW",
    urdu: "BW",
    tamil: "IN",
    telugu: "IN",
    malayalam: "IN",
    kannada: "IN",
    marathi: "IN",
    bengali: "IN",
    punjabi: "IN",
    gujarati: "IN",
    odia: "IN",
    oriya: "IN",
    assamese: "IN",
    konkani: "IN",
    tulu: "IN",
    sanskrit: "IN",
  };

  function industryFrom(labels) {
    for (const label of labels) {
      const key = String(label || "").toLowerCase().replace(/\s*language$/, "").trim();
      if (LANGUAGE_INDUSTRY[key]) return LANGUAGE_INDUSTRY[key];
    }
    for (const label of labels) {
      const key = Object.keys(COUNTRY_INDUSTRY).find(
        (k) => k.toLowerCase() === String(label).toLowerCase().trim()
      );
      if (key) return COUNTRY_INDUSTRY[key];
    }
    return "WO";
  }

  /* Only Wikidata's "instance of" settles whether something is a film at all.
   * Award shows, production houses and soundtrack albums all read like films. */
  const FILM_CLASSES = new Set(["Q11424", "Q202866", "Q506240", "Q24862", "Q93204", "Q18011172"]);

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
  const MIN_GAP = 420;
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
  function queuedFetch(url, timeout = 8000) {
    return queued(async () => {
      const opts = { headers: { Accept: "application/json" } };
      // Node needs an explicit User-Agent; browsers forbid setting it.
      if (typeof window === "undefined") opts.headers["User-Agent"] = UA;
      // Never let one slow Wikimedia call hang the UI for half a minute.
      if (typeof AbortController !== "undefined") {
        const ctrl = new AbortController();
        opts.signal = ctrl.signal;
        const timer = setTimeout(() => ctrl.abort(), timeout);
        try {
          return await fetch(url, opts);
        } finally {
          clearTimeout(timer);
        }
      }
      return fetch(url, opts);
    });
  }

  async function getJSON(url, attempt = 1) {
    let res;
    try {
      res = await queuedFetch(url);
    } catch (err) {
      if (err && (err.throttled || err.name === "AbortError")) throw err;
      if (attempt < 3) {
        await sleep(450 * attempt);
        return getJSON(url, attempt + 1);
      }
      throw err;
    }
    if (!res.ok) {
      // Wikimedia answers bursts with 429 + "retry-after: 48". Waiting that out
      // inside a UI request is pointless: fail fast so the caller can try the
      // other host (Wikipedia and Wikidata have separate buckets).
      if (res.status === 429 || res.status === 503) {
        const after = Number(res.headers?.get?.("retry-after") || 0);
        if (after > 0 && after <= 3 && attempt < 2) {
          await sleep(after * 1000);
          return getJSON(url, attempt + 1);
        }
        const err = new Error("throttled");
        err.throttled = true;
        throw err;
      }
      if (res.status >= 500 && attempt < 3) {
        await sleep(600 * attempt);
        return getJSON(url, attempt + 1);
      }
      throw new Error("HTTP " + res.status);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      // Wikimedia answers throttling with plain text, not JSON
      if (attempt < 3) {
        await sleep(1200 * attempt);
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
    // Drop bracketed asides first: "(transl. Lightning Murali)" contains a full
    // stop, which used to cut the sentence in half and lose "…is a 2021 film".
    const t = clean(String(text || "").replace(/\([^)]*\)/g, " "));
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

  const NOT_A_FILM = /\b(video game|soundtrack|album|novel|television series|web series|song|episode|comic|manga|awards?|film institute|production company|record label)\b/;
  const PERSON_WORDS = /\b(director|actor|actress|producer|screenwriter|filmmaker|singer|composer|politician|writer|author|photographer|journalist)\b/;

  function looksLikeFilm(text) {
    const head = firstSentence(text).toLowerCase();
    if (!head) return false;
    // Bracketed asides ("Minnal Murali (transl. Lightning Murali) is a …") were
    // breaking every pattern below, because their full stops split the sentence.
    const flat = head.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ");
    // "Oppenheimer is the soundtrack album…", "Red Dead Redemption is a … game"
    if (NOT_A_FILM.test(flat)) return false;
    // A film introduces itself as "a 2021 … film"; a person as "an actor".
    // "…is a 2021 Indian Malayalam-language superhero film directed by X" — but
    // NOT "…is an American and British film director".
    if (
      /\bis an? (?:[a-z-]+ ){0,5}(?:film|movie)\b(?!\s+(?:director|producer|actor|actress|maker|critic|editor|writer|composer|historian))/i.test(
        flat
      )
    )
      return true;
    if (/\bis an? [0-9]{4}\b/.test(flat) && /\b(film|movie)\b/.test(flat)) return true;
    if (PERSON_WORDS.test(flat)) return false;
    return /\bfilm\b|\bmovie\b/.test(flat);
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
  // We do NOT probe first and then search again — that wasted a request and, worse,
  // treated "any hit" as success, so a term matching a non-film page was chosen.
  async function searchPages(term, limit = 14) {
    const url =
      `${WIKI}?action=query&format=json&formatversion=2&origin=*&redirects=1` +
      `&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrlimit=${limit}&gsrnamespace=0` +
      `&prop=extracts|pageprops|info&exintro=1&exsentences=3&exlimit=max&explaintext=1&ppprop=wikibase_item`;
    const res = await getJSON(url);
    return (res?.query?.pages || []).map((p) => ({
      title: p.title,
      extract: p.extract || "",
      qid: p.pageprops?.wikibase_item,
      size: p.length || 0,
      idx: p.index || 9,
    }));
  }

  /** Is this page plausibly the film the user meant? */
  function filmish(page) {
    if (!page.qid) return false;
    if (/^list of|^lists of|disambiguation|film series|filmography/i.test(page.title)) return false;
    return looksLikeFilm(page.extract) || /\bfilm\b|\(film\)/i.test(page.title);
  }

  /* -------------------------------------------------- Wikidata-only fallback
   * en.wikipedia.org and www.wikidata.org throttle independently. When the
   * Wikipedia search is throttled there is no extract to read, but Wikidata
   * still knows the year, genres, country, director and runtime — enough to
   * build a card the engine can use. This path is what makes the lookup feel
   * reliable instead of "sometimes it works".
   */
  async function lookupViaWikidata(q, { limit = 5 } = {}) {
    const searchUrl =
      `${WD}?action=wbsearchentities&format=json&origin=*&language=en&uselang=en` +
      `&type=item&limit=12&search=${encodeURIComponent(q)}`;
    const found = (await getJSON(searchUrl))?.search || [];
    const ids = found.map((f) => f.id).filter(Boolean);
    if (!ids.length) return [];

    const ents =
      (await getJSON(
        `${WD}?action=wbgetentities&format=json&origin=*&props=claims|labels|descriptions|sitelinks&languages=en` +
          `&ids=${ids.join("|")}`
      ))?.entities || {};

    const allIds = (claims, prop) =>
      (claims?.[prop] || []).map((c) => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);

    const refIds = new Set();
    for (const id of ids) {
      const claims = ents[id]?.claims || {};
      for (const prop of ["P136", "P495", "P57", "P364"]) {
        for (const r of allIds(claims, prop)) refIds.add(r);
      }
    }
    const labels = {};
    const idList = [...refIds];
    if (idList.length) {
      const labRes =
        (await getJSON(
          `${WD}?action=wbgetentities&format=json&origin=*&props=labels&languages=en&ids=${idList.slice(0, 45).join("|")}`
        ))?.entities || {};
      for (const [id, e] of Object.entries(labRes)) labels[id] = e?.labels?.en?.value || "";
    }
    const labelOf = (id) => labels[id] || "";

    const wantedYear = (q.match(/\b(19\d{2}|20\d{2})\b/) || [])[1];

    return ids
      .map((id) => {
        const e = ents[id];
        if (!e) return null;
        const claims = e.claims || {};
        const val = (prop) => claims[prop]?.[0]?.mainsnak?.datavalue?.value;

        const classes = allIds(claims, "P31");
        if (!classes.length || !classes.some((c) => FILM_CLASSES.has(c))) return null;

        const title = clean(e.labels?.en?.value || "").replace(/^[^\p{L}\p{N}]+/u, "");
        if (!title) return null;

        const yearClaim = val("P577")?.time;
        const filmYear = yearClaim ? Number(String(yearClaim).slice(1, 5)) : null;
        if (!filmYear) return null;

        const description = e.descriptions?.en?.value || "";
        const genreLabels = allIds(claims, "P136").map(labelOf).filter(Boolean);
        const countryLabels = allIds(claims, "P495").map(labelOf).filter(Boolean);
        const langLabels = allIds(claims, "P364").map(labelOf).filter(Boolean);
        const director = allIds(claims, "P57").map(labelOf).filter(Boolean)[0] || "";
        const runtimeClaim = val("P2047")?.amount;
        const runtime = runtimeClaim ? Math.round(Number(runtimeClaim)) : null;

        let genres = genresFromLabels(genreLabels);
        if (!genres.length) genres = inferGenres(description);
        if (!genres.length) genres = ["Drama"];

        const industry = industryFrom(countryLabels.concat(langLabels));
        const sitelinks = Object.keys(e.sitelinks || {}).length;
        const synopsis =
          briefSynopsis(description) ||
          `${title} (${filmYear})${langLabels.length ? ` — ${langLabels[0]}-language` : ""} film${
            genreLabels.length ? `, ${genreLabels.slice(0, 2).join(" / ")}` : ""
          }${director ? `, directed by ${director}` : ""}.`;

        let score = titleSimilarity(q, title);
        if (wantedYear && String(filmYear) === wantedYear) score += 0.25;
        score += Math.min(0.15, sitelinks / 100);
        if (/\bfilm\b/i.test(description)) score += 0.06;

        if (score < 0.45) return null;
        return {
          score,
          movie: {
            id: "w-" + String(id).toLowerCase(),
            title,
            year: filmYear,
            industry,
            industryName: INDUSTRIES[industry] || "World Cinema",
            rating: null,
            runtime,
            director,
            genres: genres.slice(0, 3),
            keywords: keywordsFrom(description + " " + genreLabels.join(" ")),
            synopsis,
            source: "wikipedia",
            sourceUrl: `https://www.wikidata.org/wiki/${id}`,
          },
        };
      })
      .filter(Boolean)
      .filter((c, i, arr) => arr.findIndex((x) => x.movie.id === c.movie.id) === i)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((c) => ({ ...c.movie, confidence: Math.min(0.99, 0.55 + c.score * 0.35) }));
  }


  /* ------------------------------------------------- query-service fallback
   * query.wikidata.org is a different service with its own rate limits, so it
   * rescues lookups when both the Wikipedia and Wikidata action APIs are
   * throttled. One request returns the search hits and their facts together.
   */
  async function lookupViaSparql(q, { limit = 5 } = {}) {
    const escaped = String(q).replace(/["\\]/g, " ");
    const query = `
      SELECT ?film ?filmLabel ?date ?genreLabel ?countryLabel ?langLabel ?dirLabel ?runtime ?sitelinks WHERE {
        SERVICE wikibase:mwapi {
          bd:serviceParam wikibase:api "EntitySearch" ; wikibase:endpoint "www.wikidata.org" ;
                          mwapi:search "${escaped}" ; mwapi:language "en" ; mwapi:limit "8" .
          ?film wikibase:apiOutputItem mwapi:item .
        }
        ?film wdt:P31 ?class .
        VALUES ?class { wd:Q11424 wd:Q202866 wd:Q506240 wd:Q24862 wd:Q93204 }
        OPTIONAL { ?film wdt:P577 ?date }
        OPTIONAL { ?film wdt:P136 ?genre }
        OPTIONAL { ?film wdt:P495 ?country }
        OPTIONAL { ?film wdt:P364 ?lang }
        OPTIONAL { ?film wdt:P57 ?dir }
        OPTIONAL { ?film wdt:P2047 ?runtime }
        OPTIONAL { ?film wikibase:sitelinks ?sitelinks }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
      } LIMIT 320`;
    const url =
      "https://query.wikidata.org/sparql?format=json&origin=*&query=" + encodeURIComponent(query);
    const rows = (await getJSON(url))?.results?.bindings || [];
    if (!rows.length) return [];

    const byFilm = new Map();
    for (const r of rows) {
      const id = r.film?.value?.split("/").pop();
      if (!id) continue;
      if (!byFilm.has(id)) {
        byFilm.set(id, {
          id,
          title: r.filmLabel?.value || "",
          year: r.date?.value ? Number(r.date.value.slice(0, 4)) : null,
          genres: new Set(),
          countries: new Set(),
          langs: new Set(),
          director: r.dirLabel?.value || "",
          runtime: r.runtime?.value ? Math.round(Number(r.runtime.value)) : null,
          sitelinks: Number(r.sitelinks?.value || 0),
        });
      }
      const e = byFilm.get(id);
      if (r.genreLabel?.value) e.genres.add(r.genreLabel.value);
      if (r.countryLabel?.value) e.countries.add(r.countryLabel.value);
      if (r.langLabel?.value) e.langs.add(r.langLabel.value);
    }

    const wantedYear = (q.match(/\b(19\d{2}|20\d{2})\b/) || [])[1];
    return [...byFilm.values()]
      .map((e) => {
        const title = clean(e.title).replace(/^[^\p{L}\p{N}]+/u, "");
        if (!title) return null;
        const year = e.year || null;
        if (!year) return null;
        let genres = genresFromLabels([...e.genres]);
        if (!genres.length) genres = ["Drama"];
        const industry = industryFrom([...e.countries, ...e.langs]);
        const synopsis = `${title} (${year})${
          [...e.langs].length ? ` — ${[...e.langs][0]}-language` : ""
        } film${[...e.genres].length ? `, ${[...e.genres].slice(0, 2).join(" / ")}` : ""}${
          e.director ? `, directed by ${e.director}` : ""
        }.`;
        let score = titleSimilarity(q, title);
        if (wantedYear && String(year) === wantedYear) score += 0.25;
        score += Math.min(0.15, e.sitelinks / 100);
        if (score < 0.5) return null;
        return {
          score,
          movie: {
            id: "w-" + String(e.id).toLowerCase(),
            title,
            year,
            industry,
            industryName: INDUSTRIES[industry] || "World Cinema",
            rating: null,
            runtime: e.runtime,
            director: e.director,
            genres: genres.slice(0, 3),
            keywords: keywordsFrom([...e.genres].join(" ") + " " + [...e.langs].join(" ")),
            synopsis,
            source: "wikipedia",
            sourceUrl: `https://www.wikidata.org/wiki/${e.id}`,
          },
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((c) => ({ ...c.movie, confidence: Math.min(0.99, 0.55 + c.score * 0.35) }));
  }

  /* ---------------------------------------------------------- main lookup */
  /**
   * Look a title up online.
   * Returns { status, candidates } where status is:
   *   "ok"    — at least one film candidate
   *   "empty" — the web answered, it just isn't a film we could find (short cache)
   *   "error" — the web did not answer (never cached, so a retry can succeed)
   */
  async function lookupDetailed(query, { limit = 5 } = {}) {
    const q = clean(query);
    if (q.length < 2) return { status: "empty", candidates: [] };
    const key = q.toLowerCase();

    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return { status: hit.status, candidates: hit.candidates };

    const started = Date.now();
    const budget = 15000;
    const checkBudget = () => {
      if (Date.now() - started > budget) throw new Error("lookup timed out");
    };
    try {
      // Three widening passes. Each is a single request that already carries the
      // extracts we need, and they stop as soon as enough film pages show up.
      const year = (q.match(/\b(19\d{2}|20\d{2})\b/) || [])[1];
      const bare = q.replace(/\b(19\d{2}|20\d{2})\b/g, "").replace(/\s+/g, " ").trim();
      const plans = [`${bare} film`, bare, `${bare} movie`].filter((t, i, a) => t.trim() && a.indexOf(t) === i);

      const seen = new Map(); // qid -> page
      let answered = false;
      for (const term of plans) {
        checkBudget();
        let pages = [];
        try {
          pages = await searchPages(term, 14);
          answered = true;
        } catch (_) {
          continue;
        }
        for (const p of pages) if (p.qid && !seen.has(p.qid)) seen.set(p.qid, p);
        const films = [...seen.values()].filter(filmish);
        // A clear title hit means there is nothing to gain from more requests.
        if (films.some((f) => titleSimilarity(q, f.title) >= 0.85)) break;
        if (films.length >= 4) break;
      }
      if (!answered) throw new Error("web unreachable");

      const withQid = [...seen.values()].filter(filmish);
      if (!withQid.length) {
        // Wikipedia answered but had nothing film-shaped; Wikidata may still know it.
        const alt = await lookupViaWikidata(q, { limit }).catch(() => []);
        if (alt.length) return save(key, "ok", alt);
        const third = await lookupViaSparql(q, { limit }).catch(() => []);
        return third.length ? save(key, "ok", third) : save(key, "empty", []);
      }

      checkBudget();
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
        checkBudget();
        const chunk = idList.slice(i, i + 45);
        const labRes = (await getJSON(
          `${WD}?action=wbgetentities&format=json&origin=*&props=labels&languages=en&ids=${chunk.join("|")}`
        ))?.entities || {};
        for (const [id, e] of Object.entries(labRes)) labels[id] = e?.labels?.en?.value || "";
      }
      const labelOf = (id) => labels[id] || "";

      const candidates = withQid
        .map((p) => {
          const e = ents[p.qid];
          const claims = e?.claims || {};
          const val = (prop) => claims[prop]?.[0]?.mainsnak?.datavalue?.value;

          const classes = allIds(claims, "P31");
          // Films only: an empty P31 falls back to the text test so we never drop
          // a real film that simply lacks the statement.
          if (classes.length && !classes.some((c) => FILM_CLASSES.has(c))) return null;

          const yearClaim = val("P577")?.time;
          const filmYear = yearClaim ? Number(String(yearClaim).slice(1, 5)) : yearFromExtract(p.extract);
          if (!filmYear) return null;

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
          score += Math.max(0, 0.12 - Math.min(p.idx, 12) * 0.02); // Wikipedia's own ranking is a signal
          if (year && String(filmYear) === year) score += 0.25;
          if (/\b(film)\b/i.test(p.title)) score += 0.04;
          // well-documented films have long articles; a mild popularity tie-break
          score += Math.min(0.2, Math.log10(Math.max(1000, p.size)) / 25);

          return {
            score,
            movie: {
              id: "w-" + String(p.qid).toLowerCase(),
              title,
              year: filmYear,
              industry,
              industryName: INDUSTRIES[industry] || "World Cinema",
              rating: null,
              runtime,
              director,
              genres: genres.slice(0, 3),
              keywords: keywordsFrom(synopsis + " " + genreLabels.join(" ")),
              synopsis: synopsis || `${title}${filmYear ? ` (${filmYear})` : ""} — added from Wikipedia.`,
              source: "wikipedia",
              sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
              cast,
            },
          };
        })
        .filter(Boolean)
        // a candidate must at least loosely be the thing that was typed
        .filter((c) => c.score >= 0.24)
        .filter((c, i, arr) => arr.findIndex((x) => x.movie.id === c.movie.id) === i)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((c) => ({ ...c.movie, confidence: Math.min(0.99, 0.6 + c.score * 0.35) }));

      return save(key, candidates.length ? "ok" : "empty", candidates);
    } catch (err) {
      // Never cache a failure: the next attempt is allowed to succeed.
      cache.delete(key);
      const alt = await lookupViaWikidata(q, { limit }).catch(() => []);
      if (alt.length) return save(key, "ok", alt);
      const third = await lookupViaSparql(q, { limit }).catch(() => []);
      if (third.length) return save(key, "ok", third);
      return { status: "error", candidates: [], error: String(err && err.message) };
    }
  }

  async function lookup(query, opts) {
    const res = await lookupDetailed(query, opts);
    return res.candidates;
  }

  // Positive results live for half an hour; "nothing found" for a minute only,
  // so a transient throttle can't lock a title out for the session.
  function save(key, status, candidates) {
    const ttl = status === "ok" ? 30 * 60 * 1000 : 60 * 1000;
    cache.set(key, { status, candidates, expires: Date.now() + ttl });
    if (cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of cache) if (v.expires < now) cache.delete(k);
    }
    return { status, candidates };
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

  return { init, lookup, lookupDetailed, register, sanitize, keywordsFrom, genresFromLabels, genresFromExtract, inferGenres, briefSynopsis, industryFrom, looksLikeFilm, _cache: cache };
});
