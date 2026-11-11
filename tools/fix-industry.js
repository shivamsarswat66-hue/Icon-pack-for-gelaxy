#!/usr/bin/env node
/**
 * Final data-quality pass over data/movies.extra.js (offline except one SPARQL query).
 *
 * Fixes three ways imported data goes wrong:
 *  1. A genre word in the film's TITLE is not a genre claim
 *     ("Captain America: Civil War" is a superhero film, not a war film).
 *  2. Wikidata says "India" for every Indian film, so Tamil/Telugu/… end up
 *     labelled Bollywood. The original language separates them.
 *  3. Machine-composed synopses literally record the origin we derived
 *     ("A 1985 action film from Hollywood…") — that is the trustworthy source
 *     for industry, so parse it back instead of trusting a stale guess.
 */
const fs = require("fs");
const path = require("path");
const lookup = require("../src/lookup");
const { movies: core, byId, ALL_GENRES, INDUSTRIES } = require("../data/movies");
lookup.init({ movies: core, byId, genres: ALL_GENRES, industries: INDUSTRIES });

const FILE = path.join(__dirname, "..", "data", "movies.extra.js");
const UA = { "User-Agent": "CineMatchCatalogueBot/1.0", Accept: "application/sparql-results+json" };
const REGIONAL = new Set(["tamil", "telugu", "malayalam", "kannada", "bangla", "bengali", "marathi", "odia", "oriya", "punjabi", "assamese", "gujarati", "konkani"]);

const NAME_TO_CODE = Object.fromEntries(Object.entries(INDUSTRIES).map(([code, name]) => [name, code]));

const NATIONALITY = [
  [/\b(south korean|korean)\b/i, "KO"],
  [/\b(japanese|anime)\b/i, "JP"],
  [/\b(american|canadian)\b/i, "HW"],
  [/\b(british|english|irish|scottish|french|german|italian|spanish|swedish|danish|norwegian|finnish|polish|russian|soviet|dutch|belgian|austrian|czech|hungarian|greek|portuguese|swiss|icelandic)\b/i, "EU"],
  [/\b(chinese|hong kong|taiwanese|iranian|turkish|brazilian|mexican|argentinian|nigerian|australian|pakistani|thai|indonesian|filipino|egyptian|israeli|lebanese)\b/i, "WO"],
];

const GENRE_WORDS = [
  ["science fiction", "Sci-Fi"], ["sci-fi", "Sci-Fi"], ["action", "Action"], ["adventure", "Adventure"],
  ["animation", "Animation"], ["animated", "Animation"], ["biography", "Biography"], ["biographical", "Biography"],
  ["comedy", "Comedy"], ["crime", "Crime"], ["drama", "Drama"], ["family", "Family"], ["fantasy", "Fantasy"],
  ["horror", "Horror"], ["music", "Music"], ["musical", "Musical"], ["mystery", "Mystery"], ["romance", "Romance"],
  ["romantic", "Romance"], ["sports", "Sports"], ["thriller", "Thriller"], ["war", "War"], ["western", "Western"],
];

const genresInTitle = (title) => {
  const t = title.toLowerCase();
  const out = [];
  for (const [needle, genre] of GENRE_WORDS) {
    if (new RegExp(`(^|[^a-z])${needle}([^a-z]|$)`).test(t)) out.push(genre);
  }
  return out;
};

const query = `SELECT ?filmLabel ?langLabel WHERE {
  ?film wdt:P31 wd:Q11424 ; wdt:P495 wd:Q668 ; wdt:P364 ?lang ; wikibase:sitelinks ?sl .
  FILTER(?sl >= 2)
  ?film rdfs:label ?filmLabel . FILTER(LANG(?filmLabel) = "en")
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 20000`;
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

(async () => {
  let langs = new Map();
  try {
    const res = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ query, format: "json" }),
    });
    if (res.ok) {
      for (const r of (await res.json()).results.bindings) {
        const key = norm(r.filmLabel.value);
        if (!langs.has(key)) langs.set(key, new Set());
        langs.get(key).add(r.langLabel.value.toLowerCase());
      }
    }
  } catch (_) {
    console.log("  (offline — Indian language refinement skipped)");
  }

  const films = require(FILE);
  const stats = { genre: 0, industry: 0 };
  const out = films
    .map((m) => {
      let genres = m.genres.slice();
      const syn = m.synopsis;
      const composed = /^A \d{4} .* film from /.test(syn);

      /* 1 — drop genres that only exist inside the title */
      const justified = lookup.genresFromExtract(syn);
      const inTitle = genresInTitle(m.title);
      if (inTitle.length) {
        const cleaned = genres.filter((g) => !(inTitle.includes(g) && !justified.includes(g)));
        if (cleaned.length) {
          if (cleaned.length !== genres.length) stats.genre++;
          genres = cleaned;
        }
      }
      for (const g of justified) {
        if (genres.length >= 3) break;
        if (!genres.includes(g)) genres.push(g);
      }
      if (!genres.length) return null;

      /* 2 — industry: composed text → own description → language map */
      let industry = m.industry;
      if (composed) {
        const named = (syn.match(/film from ([^,.]+)/) || [])[1];
        if (named && NAME_TO_CODE[named.trim()]) industry = NAME_TO_CODE[named.trim()];
      } else {
        const hit = NATIONALITY.find(([re]) => re.test(syn));
        if (hit) industry = hit[1];
        if (/\b(indian|hindi)\b/i.test(syn)) {
          const set = langs.get(norm(m.title));
          const regional = set && [...set].some((l) => REGIONAL.has(l));
          const hindi = set && set.has("hindi");
          industry = regional && !hindi ? "IN" : "BW";
        }
      }
      if (industry !== m.industry) stats.industry++;

      return {
        ...m,
        industry,
        industryName: INDUSTRIES[industry] || "World Cinema",
        genres: genres.slice(0, 3),
      };
    })
    .filter(Boolean);

  const header = `/**
 * AUTO-GENERATED by tools/import-wikidata.js → tools/refine-extra.js → tools/fix-industry.js.
 * ${out.length} films from Wikidata/Wikipedia. No ratings: none can be derived from open
 * data, and the ranker treats a missing rating as neutral rather than inventing one.
 */
module.exports = ${JSON.stringify(out, null, 0)};
`;
  fs.writeFileSync(FILE, header);
  const mix = out.reduce((a, m) => ((a[m.industry] = (a[m.industry] || 0) + 1), a), {});
  console.log(`repaired ${out.length} films — genres: ${stats.genre}, industries: ${stats.industry}`);
  console.log("industries:", Object.entries(mix).map(([k, v]) => `${INDUSTRIES[k] || k}=${v}`).join("  "));

  // verification on the cases that were wrong
  const cases = ["Captain America: Civil War", "Commando", "Pretty Woman", "Kantara", "Sairat", "Spider-Man 3", "Star Wars"];
  console.log("\nspot check:");
  for (const t of cases) {
    const m = out.find((x) => x.title === t);
    if (m) console.log(`  ${m.title.padEnd(28)} [${m.industryName}] ${m.genres.join("/")}`);
  }
})();
