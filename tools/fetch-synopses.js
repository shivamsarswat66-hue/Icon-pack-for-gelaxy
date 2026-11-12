/**
 * Replace machine-composed synopses ("A 2014 Hindi-language drama film from
 * Bollywood, directed by …") with the film's real opening lines from Wikipedia.
 *
 *   node tools/fetch-synopses.js [--limit N] [--dry]
 *
 * Batches 20 article titles per request, so ~180 films cost ~10 calls.
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "movies.extra.js");
const API = "https://en.wikipedia.org/w/api.php";
const UA = "CineMatch/1.3 (catalogue enrichment; contact: app owner)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const LIMIT = Number((args.find((a) => a.startsWith("--limit=")) || "").split("=")[1] || 400);
const DRY = args.includes("--dry");

const CAST_ONLY = /\b(stars?|starring|features?|appears|cameo|debut|lead roles|supporting roles)\b/i;
const isGeneric = (s) =>
  !s ||
  /^A \d{4} .{0,60}film from .{0,40}, directed by/i.test(s) ||
  /— .{0,30}-language film, /.test(s) ||
  /added from Wikipedia/i.test(s) ||
  // "The film stars X and Y." is a cast list, not a description
  (CAST_ONLY.test(s) && s.length < 210);

function articleTitle(url) {
  if (!url) return null;
  const m = String(url).match(/wikipedia\.org\/wiki\/(.+)$/);
  return m ? decodeURIComponent(m[1]).replace(/_/g, " ") : null;
}

async function fetchBatch(titles) {
  const url =
    `${API}?action=query&format=json&formatversion=2&origin=*&redirects=1` +
    `&prop=extracts&exintro=1&explaintext=1&exsentences=3&exlimit=max&titles=${encodeURIComponent(titles.join("|"))}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return (await res.json())?.query?.pages || [];
}

function cleanText(text) {
  return String(text || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A synopsis should say what the film is about. Wikipedia intros go
 * "X is a 2004 … film directed by Y." → "The film stars A and B." → actual plot.
 * Credits and cast lists are dropped in favour of the sentences that describe a
 * story; if there is no plot sentence, the factual opener is kept.
 */
const PLOT_MARKERS = /\b(follows|tells|centres|centers|revolves|is about|when|story of|chronicles|narrates|plot|after|set in|struggles|attempts|seeks|tries|journey)\b/i;
function toSynopsis(extract) {
  const t = cleanText(extract);
  if (!t) return "";
  const sentences = t.split(/(?<=[.!?])\s+/).filter((x) => x.length > 20);
  const isCredit = (x) =>
    /^(the film |it )?(stars?|starring|features?|was released|released on|produced by|directed by|written by|shot|filmed)/i.test(x) ||
    (/\b(stars?|starring|features?|cameo|debut)\b/i.test(x) && !PLOT_MARKERS.test(x));

  const plot = sentences.filter((x) => PLOT_MARKERS.test(x) && !isCredit(x));
  const opener = sentences.find((x) => /^[^.]+? is (?:a|an) \d{4}/i.test(x));
  let picked = plot.length ? plot.slice(0, 2) : opener ? [opener] : sentences.slice(0, 1);
  let out = picked.join(" ").trim();
  return out.length > 230 ? out.slice(0, 230).replace(/[\s,;:]+$/, "") + "…" : out;
}

(async () => {
  const MOVIES = require(FILE);
  const targets = MOVIES.filter((m) => isGeneric(m.synopsis) && articleTitle(m.sourceUrl)).slice(0, LIMIT);
  console.log(`films needing a real synopsis: ${targets.length}`);
  if (DRY) targets.slice(0, 5).forEach((m) => console.log("  -", m.title, m.year));

  let updated = 0;
  for (let i = 0; i < targets.length; i += 20) {
    const chunk = targets.slice(i, i + 20);
    const titles = chunk.map((m) => articleTitle(m.sourceUrl));
    let pages = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        pages = await fetchBatch(titles);
        break;
      } catch (err) {
        if (attempt === 3) console.warn("  batch failed:", err.message);
        await sleep(1500 * attempt);
      }
    }
    const byTitle = new Map(pages.map((p) => [String(p.title).toLowerCase(), p]));
    for (const m of chunk) {
      const t = articleTitle(m.sourceUrl);
      const page = byTitle.get(t.toLowerCase()) || pages.find((p) => p.title.toLowerCase().replace(/\s*\(.*\)$/, "") === t.toLowerCase().replace(/\s*\(.*\)$/, ""));
      const text = page?.extract;
      if (!text) continue;
      const syn = toSynopsis(text);
      // only accept something that reads like prose
      if (syn.length < 40 || /^A \d{4} /i.test(syn)) continue;
      m.synopsis = syn;
      updated++;
    }
    console.log(`  ${Math.min(i + 20, targets.length)}/${targets.length} processed (updated ${updated})`);
    await sleep(700);
  }

  if (DRY) return console.log("dry run — nothing written");
  fs.writeFileSync(FILE, "module.exports = " + JSON.stringify(MOVIES, null, 0) + ";\n");
  console.log(`written: ${updated} synopses replaced`);
})();
