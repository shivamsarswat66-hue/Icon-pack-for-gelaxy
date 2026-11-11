#!/usr/bin/env node
/**
 * Build-time catalogue importer.
 *
 * Pulls popular films (and a guaranteed slice of Indian cinema) from Wikidata +
 * Wikipedia and writes data/movies.extra.js in exactly the same shape as the
 * hand-curated catalogue — same genres, same keyword vocabulary, no ratings we
 * can't verify.
 *
 *   node tools/import-wikidata.js --limit 900 --india 350
 *
 * Why at build time: no runtime API cost, no rate-limit risk for visitors, and
 * the whole catalogue stays searchable offline and instantly.
 */
const fs = require("fs");
const path = require("path");
const lookup = require("../src/lookup");
const { movies: core, byId, ALL_GENRES, INDUSTRIES } = require("../data/movies");

lookup.init({ movies: core, byId, genres: ALL_GENRES, industries: INDUSTRIES });

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const LIMIT = arg("limit", 900);
const INDIA = arg("india", 350);

const UA = { "User-Agent": "CineMatchCatalogueBot/1.0 (one-off import; contact: repo owner)", Accept: "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wikimedia answers bursts with 429; back off politely instead of dying.
async function request(url, opts, label = "request", attempt = 1) {
  const res = await fetch(url, opts);
  if ((res.status === 429 || res.status >= 500) && attempt <= 6) {
    const wait = 6000 * attempt;
    console.log(`\n   ${label} ${res.status} — backing off ${wait / 1000}s`);
    await sleep(wait);
    return request(url, opts, label, attempt + 1);
  }
  return res;
}

async function sparql(query) {
  const res = await request("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
    body: new URLSearchParams({ query, format: "json" }),
  }, "sparql");
  if (!res.ok) throw new Error("SPARQL HTTP " + res.status + " " + (await res.text()).slice(0, 200));
  return res.json();
}

async function wiki(params) {
  const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", ...params });
  const res = await request(url, { headers: UA }, "wikipedia");
  if (!res.ok) throw new Error("wiki HTTP " + res.status);
  return res.json();
}

async function wikidata(params) {
  const url = "https://www.wikidata.org/w/api.php?" + new URLSearchParams({ format: "json", ...params });
  const res = await request(url, { headers: UA }, "wikidata");
  if (!res.ok) throw new Error("wikidata HTTP " + res.status);
  return res.json();
}

// popular films that have an English Wikipedia article
async function popular(limit) {
  const q = `
SELECT ?film ?sitelinks WHERE {
  ?film wdt:P31 wd:Q11424 ; wikibase:sitelinks ?sitelinks .
  ?article schema:about ?film ; schema:isPartOf <https://en.wikipedia.org/> .
}
ORDER BY DESC(?sitelinks) LIMIT ${limit}`;
  const j = await sparql(q);
  return j.results.bindings.map((b) => ({ qid: b.film.value.split("/").pop(), sitelinks: Number(b.sitelinks.value) }));
}

// Indian films, regardless of global popularity
async function indian(limit) {
  const q = `
SELECT ?film ?sitelinks WHERE {
  ?film wdt:P31 wd:Q11424 ; wdt:P495 wd:Q668 ; wikibase:sitelinks ?sitelinks .
  ?article schema:about ?film ; schema:isPartOf <https://en.wikipedia.org/> .
}
ORDER BY DESC(?sitelinks) LIMIT ${limit}`;
  const j = await sparql(q);
  return j.results.bindings.map((b) => ({ qid: b.film.value.split("/").pop(), sitelinks: Number(b.sitelinks.value) }));
}

async function main() {
  console.log("· querying Wikidata…");
  const [pop, ind] = [await popular(LIMIT), await indian(INDIA)];
  const seen = new Set();
  const queue = [];
  for (const f of pop.concat(ind)) {
    if (seen.has(f.qid)) continue;
    seen.add(f.qid);
    queue.push(f);
  }
  console.log(`· ${queue.length} candidate films (${pop.length} popular + ${ind.length} Indian)`);

  // ---- page titles so we can grab intros in bulk -------------------------
  const titles = new Map(); // qid -> enwiki title
  const claimsByQid = new Map();
  const refIds = new Set();
  for (let i = 0; i < queue.length; i += 40) {
    const chunk = queue.slice(i, i + 40).map((f) => f.qid);
    const j = await wikidata({
      action: "wbgetentities",
      props: "sitelinks|claims",
      sitefilter: "enwiki",
      ids: chunk.join("|"),
    });
    for (const [qid, e] of Object.entries(j.entities || {})) {
      const t = e?.sitelinks?.enwiki?.title;
      if (t) titles.set(qid, t);
      const claims = e?.claims || {};
      claimsByQid.set(qid, claims);
      for (const prop of ["P136", "P495", "P57", "P364"]) {
        for (const c of claims[prop] || []) {
          const id = c?.mainsnak?.datavalue?.value?.id;
          if (id) refIds.add(id);
        }
      }
    }
    process.stdout.write(`\r  titles+claims ${Math.min(i + 40, queue.length)}/${queue.length}`);
    await sleep(700);
  }
  console.log("");

  // ---- intros: real Wikipedia prose for the most popular films only --------
  // Batch extracts are expensive and get rate-limited hard; the REST summary
  // endpoint is cheaper. Everything else gets a factual composed line instead.
  const extracts = new Map();
  const withTitle = [...titles.entries()].sort(
    (a, b) => (queue.find((q) => q.qid === b[0])?.sitelinks || 0) - (queue.find((q) => q.qid === a[0])?.sitelinks || 0)
  );
  const TIER1 = Math.min(withTitle.length, arg("intros", 300));
  for (let i = 0; i < TIER1; i++) {
    const [qid, title] = withTitle[i];
    const url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title.replace(/ /g, "_"));
    try {
      const res = await request(url, { headers: UA }, "summary");
      if (res.ok) {
        const j = await res.json();
        const ex = j.extract || "";
        if (ex && !/\bmay refer to\b/i.test(ex)) extracts.set(qid, ex);
      }
    } catch (_) {}
    process.stdout.write(`\r  intros ${i + 1}/${TIER1}`);
    await sleep(1100);
  }
  console.log("");

  // ---- labels for every referenced item ----------------------------------
  const labels = {};
  const refList = [...refIds];
  for (let i = 0; i < refList.length; i += 45) {
    const j = await wikidata({ action: "wbgetentities", props: "labels", languages: "en", ids: refList.slice(i, i + 45).join("|") });
    for (const [id, e] of Object.entries(j.entities || {})) labels[id] = e?.labels?.en?.value || "";
    process.stdout.write(`\r  labels ${Math.min(i + 45, refList.length)}/${refList.length}`);
    await sleep(600);
  }
  console.log("");

  // ---- compose ------------------------------------------------------------
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const taken = new Set(core.map((m) => norm(m.title) + "|" + m.year));
  const takenTitles = new Set(core.map((m) => norm(m.title)));
  const out = [];

  for (const { qid, sitelinks } of queue) {
    const title = titles.get(qid);
    const extract = extracts.get(qid) || "";
    if (!title) continue;
    if (/^list of/i.test(title)) continue;

    const claims = claimsByQid.get(qid) || {};
    const idsOf = (p) => (claims[p] || []).map((c) => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);
    const first = (p) => claims[p]?.[0]?.mainsnak?.datavalue?.value;

    const yearClaim = first("P577")?.time;
    const year = yearClaim ? Number(String(yearClaim).slice(1, 5)) : Number((extract.match(/\b(19\d{2}|20\d{2})\b/) || [])[1]);
    if (!year || year < 1940 || year > 2026) continue;

    const cleanTitle = title.replace(/\s*\((?:[^)]*film[^)]*|\d{4}[^)]*)\)\s*$/i, "").trim();
    const key = norm(cleanTitle) + "|" + year;
    if (taken.has(key)) continue;
    // same title, same year already curated → keep the curated one
    const genreLabels = idsOf("P136").map((id) => labels[id]).filter(Boolean);
    const countryLabels = idsOf("P495").map((id) => labels[id]).filter(Boolean);
    const langLabels = idsOf("P364").map((id) => labels[id]).filter(Boolean);
    const director = idsOf("P57").map((id) => labels[id]).filter(Boolean)[0] || "";
    const dur = first("P2047")?.amount;

    let genres = [...new Set([...lookup.genresFromExtract(extract), ...lookup.genresFromLabels(genreLabels)])];
    if (!genres.length) genres = lookup.inferGenres(extract);
    if (!genres.length) continue; // no usable signal → skip rather than guess

    const baseIndustry = lookup.industryFrom(countryLabels.concat(langLabels));
    let industry = baseIndustry;
    if (/hindi-language/i.test(extract)) industry = "BW";
    else if (/\b(tamil|telugu|malayalam|kannada|marathi|bengali|punjabi|gujarati)-language/i.test(extract)) industry = "IN";

    // Real prose when we have it; otherwise a factual line built only from
    // verified facts (year, country, language, genre, director) — never invented.
    let synopsis = lookup.briefSynopsis(extract);
    if (!synopsis || synopsis.length < 30) {
      const lang = langLabels.find((l) => /language$/i.test(l)) || langLabels[0] || "";
      const nation = countryLabels[0] || "";
      const parts = [
        `${year} ${lang ? lang.replace(/ language$/i, "").toLowerCase() + "-language " : ""}${nation ? nation + " " : ""}${genres[0].toLowerCase()} film`,
      ];
      if (director) parts.push(`directed by ${director}`);
      if (dur) parts.push(`${Math.round(Number(dur))} minutes`);
      synopsis = parts.join(", ") + ".";
    }
    if (!synopsis || synopsis.length < 20) continue;
    if (takenTitles.has(norm(cleanTitle)) && industry !== "BW") {
      // avoid near-duplicate titles in different years unless clearly Indian
    }

    const slug = norm(cleanTitle).replace(/ /g, "-").slice(0, 40) + "-" + year;
    out.push({
      id: "ex-" + slug,
      title: cleanTitle,
      year,
      industry,
      industryName: INDUSTRIES[industry] || "World Cinema",
      rating: null,
      runtime: dur ? Math.round(Number(dur)) : null,
      director,
      genres: genres.slice(0, 3),
      keywords: lookup.keywordsFrom(synopsis + " " + genreLabels.join(" ")),
      synopsis,
      source: "wikidata",
      sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      popularity: sitelinks,
    });
    taken.add(key);
  }

  // de-dupe ids (same normalised title+year twice happens with remakes)
  const seenId = new Set();
  const final = out.filter((m) => (seenId.has(m.id) ? false : (seenId.add(m.id), true)));

  const header = `/**
 * AUTO-GENERATED by tools/import-wikidata.js — do not edit by hand.
 * ${final.length} films imported from Wikidata/Wikipedia on ${new Date().toISOString().slice(0, 10)}.
 * No ratings: none are fabricate-able from open data, and the ranker treats a
 * missing rating as neutral rather than inventing a score.
 */
module.exports = ${JSON.stringify(final, null, 0)};
`;
  fs.writeFileSync(path.join(__dirname, "..", "data", "movies.extra.js"), header);
  const mix = final.reduce((a, m) => ((a[m.industry] = (a[m.industry] || 0) + 1), a), {});
  console.log(`\n✅ wrote data/movies.extra.js — ${final.length} films`);
  console.log("   by industry:", Object.entries(mix).map(([k, v]) => `${INDUSTRIES[k] || k}=${v}`).join("  "));
  const withKw = final.filter((m) => m.keywords.length).length;
  console.log(`   with keywords: ${withKw}/${final.length}  |  avg genres: ${(final.reduce((a, m) => a + m.genres.length, 0) / final.length).toFixed(2)}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
