/**
 * Second pass for imported films whose synopsis is still credits/cast rather
 * than story. Many of them point at a *disambiguation* article ("Highway"),
 * because that is the Wikidata sitelink. One search+extract request per film
 * finds the article for the right year and reads its intro.
 *
 *   node tools/fix-weak-synopses.js [--top=150]
 */
const fs = require("fs");
const path = require("path");
const FILE = path.join(__dirname, "..", "data", "movies.extra.js");
const API = "https://en.wikipedia.org/w/api.php";
const UA = "CineMatch/1.3 (catalogue enrichment; contact: app owner)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOP = Number((process.argv.find((a) => a.startsWith("--top=")) || "--top=150").split("=")[1]);

const CAST_ONLY = /\b(stars?|starring|features?|appears|cameo|debut|lead roles|supporting roles)\b/i;
const PLOT = /\b(follows|tells|centres|centers|revolves|is about|when|story of|chronicles|narrates|after|set in|struggles|attempts|seeks|tries|journey|plot)\b/i;
const isWeak = (s) =>
  !s ||
  /^A \d{4} .{0,60}film from .{0,40}, directed by/i.test(s) ||
  /— .{0,30}-language film, /.test(s) ||
  (CAST_ONLY.test(s) && !PLOT.test(s)) ||
  /\b(written and produced by|produced by .* directed by)\b/i.test(s) && !PLOT.test(s);

function pick(sentences) {
  const credit = (x) =>
    /^(the film |it )?(stars?|starring|features?|was released|released on|produced by|directed by|written by)/i.test(x) ||
    (CAST_ONLY.test(x) && !PLOT.test(x));
  const plot = sentences.filter((x) => PLOT.test(x) && !credit(x) && x.length > 35);
  if (plot.length) return plot.slice(0, 2).join(" ");
  return "";
}

async function searchIntro(title, year) {
  const term = `${title} ${year} film`;
  const url =
    `${API}?action=query&format=json&formatversion=2&origin=*&redirects=1` +
    `&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrlimit=3&gsrnamespace=0` +
    `&prop=extracts&exintro=1&explaintext=1&exsentences=5&exlimit=max`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const pages = ( await res.json())?.query?.pages || [];
  for (const p of pages) {
    const text = String(p.extract || "");
    if (!text || !new RegExp(`\\b${year}\\b`).test(text)) continue;
    if (!/\bfilm\b/i.test(text.slice(0, 300))) continue;
    const sentences = text
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .filter((x) => x.length > 20);
    const body = pick(sentences);
    if (body.length > 40) return body.length > 230 ? body.slice(0, 230).replace(/[\s,;:]+$/, "") + "…" : body;
  }
  return "";
}

(async () => {
  const MOVIES = require(FILE);
  const targets = MOVIES
    .filter((m) => isWeak(m.synopsis))
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, TOP);
  console.log(`weak synopses to repair: ${targets.length}`);

  let fixed = 0;
  for (let i = 0; i < targets.length; i++) {
    const m = targets[i];
    try {
      const body = await searchIntro(m.title, m.year);
      if (body) {
        m.synopsis = body;
        fixed++;
      }
    } catch (err) {
      if (/429/.test(err.message)) {
        console.log("  throttled — pausing 20s");
        await sleep(20000);
      }
    }
    if (i % 15 === 0) console.log(`  ${i + 1}/${targets.length} (fixed ${fixed})`);
    await sleep(900);
  }
  fs.writeFileSync(FILE, "module.exports = " + JSON.stringify(MOVIES, null, 0) + ";\n");
  console.log(`done — ${fixed} synopses now describe the story`);
})();
