/**
 * CineMatch taste engine.
 * Pure-JS, no external services: fuzzy title correction, a weighted taste
 * profile, an adaptive "would you watch this?" prober and a diversified ranker.
 */
const { movies, byId, ALL_GENRES, INDUSTRIES } = require("../data/movies");

/* ------------------------------------------------------------------ */
/* text utilities                                                      */
/* ------------------------------------------------------------------ */
const STREAM = 0.95; // partial-title matches rank slightly below full-title matches

const clean = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripArticles = (s) => s.replace(/^(the|a|an|el|la|le)\s+/, "");

/** normalise numbered titles: "part two" == "2", "ii" == "2" */
const numbered = (s) =>
  s
    .replace(/\b(part|chapter|volume|vol)\b/g, " ")
    .replace(/\b(two|ii)\b/g, "2")
    .replace(/\b(three|iii)\b/g, "3")
    .replace(/\b(one|i)\b/g, "1")
    .replace(/\s+/g, " ")
    .trim();

function levenshtein(a, b, max = 40) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

function levRatio(a, b) {
  const d = levenshtein(a, b);
  return 1 - d / Math.max(a.length, b.length, 1);
}

/** consonant skeleton: catches "intersteller" -> "interstellar" style errors */
function skeleton(s) {
  return s
    .replace(/[^a-z0-9]/g, "")
    .replace(/(.)\1+/g, "$1")
    .replace(/[aeiouy]/g, "");
}

function tokenScore(query, title) {
  const q = clean(query);
  const t = clean(title);
  if (!q) return 0;
  if (q === t) return 1;
  const qa = stripArticles(q);
  const ta = stripArticles(t);
  if (qa === ta) return 0.99;
  // drop a trailing year the user typed, e.g. "inception 2010"
  const qn = numbered(qa);
  const tn = numbered(ta);
  if (qn && qn === tn) return 0.99;

  const noYear = q.replace(/\b(19|20)\d{2}\b/g, "").trim();
  if (noYear && (noYear === t || stripArticles(noYear) === ta)) return 0.985;

  const qTokens = qa.split(" ").filter(Boolean);
  const tTokens = ta.split(" ").filter(Boolean);
  const tSet = new Set(tTokens);
  const hits = qTokens.filter((w) => tSet.has(w)).length;
  const coverage = hits / tTokens.length; // how much of the title the user typed
  const precision = hits / Math.max(qTokens.length, 1);

  let score = 0;
  // user typed a clean prefix / substring of the title
  if (ta.startsWith(qa) || t.startsWith(q)) score = Math.max(score, 0.9 + 0.09 * precision);
  if (ta.includes(qa) && qa.length >= 4) score = Math.max(score, 0.88 + 0.08 * precision);

  const lr = levRatio(qa, ta);
  score = Math.max(score, lr * (0.94 + 0.06 * coverage));

  // Skeleton matching only works when there is a skeleton to speak of: "aattam"
  // and "time" both collapse to "tm", which used to make them a 95% match.
  const skQ = skeleton(qa);
  const skT = skeleton(ta);
  if (skQ.length >= 4 && skT.length >= 4) {
    const sk = levRatio(skQ, skT);
    if (sk > 0.86) score = Math.max(score, sk * 0.9);
  }

  // every meaningful word of the title present (in any order)
  if (coverage === 1 && precision >= 0.8) score = Math.max(score, 0.93);

  // partial title entry, e.g. "shawshenk" or "shawshank redemption"
  if (qa.length >= 5) {
    for (let i = 0; i < tTokens.length; i++) {
      for (let len = 1; len <= 3 && i + len <= tTokens.length; len++) {
        const win = tTokens.slice(i, i + len).join(" ");
        if (win.length < 4) continue;
        const wr = levRatio(qa, win);
        if (wr > 0.74) score = Math.max(score, Math.min(wr * STREAM, 0.995));
        const skW = skeleton(win);
        if (skQ.length >= 4 && skW.length >= 4 && qa.length >= 6) {
          const wsr = levRatio(skQ, skW);
          if (wsr > 0.9) score = Math.max(score, Math.min(wsr * STREAM, 0.99));
        }
      }
    }
  }

  return Math.min(score, 0.995);
}

/** Ranked candidate list for a raw user string. */
function search(rawQuery, limit = 6) {
  const q = String(rawQuery || "").trim();
  if (q.length < 2) return [];
  const scored = movies
    .map((m) => {
      let s = tokenScore(q, m.title);
      // small bonus for popularity/quality so ties break sensibly
      if (Number.isFinite(m.rating)) s = Math.min(0.999, s + Math.max(0, (m.rating - 7) * 0.004));
      return { movie: m, score: s };
    })
    // Never suggest a film we don't believe in. Measured: real matches (incl. heavy
    // typos like "shawshenk") score ≥0.90; junk ("animal" → Arrival) scores ≤0.55.
    .filter((x) => x.score >= 0.68)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored;
}

/**
 * Resolve one typed title to a catalogue entry, correcting spelling.
 * confidence: exact | corrected | weak | none
 */
function resolveOne(rawQuery) {
  const q = String(rawQuery || "").trim();
  if (!q) return null;
  const results = search(q, 5);
  if (!results.length) {
    return { query: q, movie: null, confidence: "none", alternatives: [], score: 0 };
  }
  const best = results[0];
  let confidence = "weak";
  if (best.score >= 0.994) confidence = "exact";
  else if (best.score >= 0.76) confidence = "corrected";
  else if (best.score >= 0.58) confidence = "weak";
  else confidence = "none";

  return {
    query: q,
    movie: confidence === "none" ? null : best.movie,
    confidence,
    score: Number(best.score.toFixed(3)),
    alternatives: results.slice(1, 4).map((r) => r.movie),
  };
}

/** Resolve many titles (also splits "A, B, C" pastes). */
function resolveMany(input) {
  const chunks = String(input || "")
    .split(/[\n,;]+|\s+\/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const chunk of chunks) {
    const r = resolveOne(chunk);
    if (!r) continue;
    if (r.movie && seen.has(r.movie.id)) {
      out.push({ ...r, duplicate: true });
      continue;
    }
    if (r.movie) seen.add(r.movie.id);
    out.push(r);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* taste profile                                                       */
/* ------------------------------------------------------------------ */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function newProfile() {
  return {
    genres: {}, // genre -> weight
    keywords: {},
    industries: {},
    liked: [], // movie ids the user says they loved
    disliked: [],
    watched: [],
    watchlist: [],
    answers: {}, // movieId -> true (would watch) | false
    asked: [],
    seedTitles: [], // raw typed titles, kept for the "confirm" screen
    events: [], // audit trail so the UI can explain itself
  };
}

function bump(map, key, delta, lo = -4, hi = 6) {
  map[key] = clamp((map[key] || 0) + delta, lo, hi);
}

function learn(profile, movie, kind) {
  if (!movie) return;
  const W = {
    declared: { g: 2.0, k: 0, i: 0 },
    industry: { g: 0, k: 0, i: 1.6 },
    liked: { g: 1.9, k: 0.6, i: 0.8 },
    dislike: { g: -1.3, k: -0.5, i: -0.3 },
    watched: { g: 1.0, k: 0.3, i: 0.4 },
    watchlist: { g: 0.8, k: 0.3, i: 0.3 },
    answerYes: { g: 1.0, k: 0.45, i: 0.5 },
    answerNo: { g: -0.55, k: -0.3, i: -0.2 },
  }[kind];
  if (!W) return;

  if (kind === "declared") {
    for (const g of movie) bump(profile.genres, g, W.g);
    return;
  }
  if (kind === "industry") {
    bump(profile.industries, movie, W.i);
    return;
  }
  for (const g of movie.genres) bump(profile.genres, g, W.g);
  for (const k of movie.keywords) bump(profile.keywords, k, W.k, -3, 4);
  bump(profile.industries, movie.industry, W.i, -3, 5);
  profile.events.push({ id: movie.id, kind, at: Date.now() });
  if (profile.events.length > 400) profile.events = profile.events.slice(-400);
}

const addOnce = (list, id) => {
  if (!list.includes(id)) list.push(id);
};
const removeAll = (list, id) => {
  const i = list.indexOf(id);
  if (i > -1) list.splice(i, 1);
};

function setGenres(profile, genres = []) {
  for (const g of genres) {
    if (ALL_GENRES.includes(g)) learn(profile, [g], "declared");
  }
}
function setIndustries(profile, codes = []) {
  for (const c of codes) {
    if (INDUSTRIES[c]) learn(profile, c, "industry");
  }
}

function addLiked(profile, ids = []) {
  for (const id of ids) {
    const m = byId.get(id);
    if (!m || profile.liked.includes(id) || profile.disliked.includes(id)) continue;
    profile.liked.push(id);
    removeAll(profile.watched, id);
    removeAll(profile.watchlist, id);
    learn(profile, m, "liked");
  }
}

function feedback(profile, id, action) {
  const m = byId.get(id);
  if (!m) return null;
  if (action === "watched") addOnce(profile.watched, id);
  if (action === "watchlist") addOnce(profile.watchlist, id);
  if (action === "dislike") addOnce(profile.disliked, id);

  if (action === "watched") {
    removeAll(profile.watchlist, id);
    removeAll(profile.disliked, id);
    learn(profile, m, "watched");
  } else if (action === "watchlist") {
    removeAll(profile.watched, id);
    removeAll(profile.disliked, id);
    learn(profile, m, "watchlist");
  } else if (action === "dislike") {
    removeAll(profile.watchlist, id);
    removeAll(profile.watched, id);
    profile.answers[id] = false;
    learn(profile, m, "dislike");
  } else if (action === "clear") {
    removeAll(profile.watched, id);
    removeAll(profile.watchlist, id);
    removeAll(profile.disliked, id);
  }
  return profile;
}

function answerQuestion(profile, id, yes) {
  const m = byId.get(id);
  if (!m) return;
  if (yes === null || yes === undefined) {
    addOnce(profile.asked, id); // skipped: never ask again, don't shift taste
    return;
  }
  profile.answers[id] = !!yes;
  addOnce(profile.asked, id);
  removeAll(profile.disliked, id);
  learn(profile, m, yes ? "answerYes" : "answerNo");
}

/* ------------------------------------------------------------------ */
/* scoring                                                             */
/* ------------------------------------------------------------------ */
/*
 * What changed and why
 * --------------------
 * The first version summed raw genre weights. "Drama" is on ~60% of the
 * catalogue and "Music" on ~5%, so one liked drama outweighed a loved musical
 * and every list drifted towards high-IMDb dramas. Genres and themes are now
 * weighted by how *rare* they are in the catalogue (idf), which is what makes
 * a taste in Music or Horror actually pull its weight.
 *
 * The score is a blend of eight signals, each normalised to 0..1:
 *   genreFit     rarity-weighted match against declared + learned genres
 *   likeFit      item-item similarity to the films the user loved
 *   kwFit        theme (keyword) affinity, signed so dislikes subtract
 *   quality      rating prior — a mild tie-breaker, not the driver
 *   popularity   how well-documented a film is (stops obscurities winning)
 *   industryFit  language/industry affinity
 *   eraFit       how close it sits to the era the user actually watches
 *   directorFit  same director as a film they loved
 *
 * Matching then goes through (a) an absolute match% so the number means
 * something, (b) a floor so a 45%-ish film is never offered, and (c) an MMR
 * pass so eight near-identical picks don't fill the grid.
 */
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

const catStats = (() => {
  const N = Math.max(1, movies.length);
  const gf = {};
  const kf = {};
  for (const m of movies) {
    for (const g of m.genres || []) gf[g] = (gf[g] || 0) + 1;
    for (const k of m.keywords || []) kf[k] = (kf[k] || 0) + 1;
  }
  const idf = (f) => clamp(Math.log((N + 1) / (f + 1)) + 0.25, 0.5, 2.8);
  const gIdf = {};
  const kIdf = {};
  for (const [g, f] of Object.entries(gf)) gIdf[g] = idf(f);
  for (const [k, f] of Object.entries(kf)) kIdf[k] = idf(f);
  // how documented a film is: imported films carry sitelink counts
  const popMax = Math.max(1, ...movies.map((m) => (Number.isFinite(m.popularity) ? m.popularity : 0)));
  return { N, gf, kfmax: 0, gIdf, kIdf, popMax };
})();

const gW = (g) => catStats.gIdf[g] || 1.1; // web-added films fall back to a mid weight
const kW = (k) => catStats.kIdf[k] || 1.1;

/** cosine over rarity-weighted genre sets */
function cosGenres(a, b) {
  const A = new Set(a.genres || []);
  const B = new Set(b.genres || []);
  let dot = 0;
  for (const g of A) if (B.has(g)) dot += gW(g) * gW(g);
  if (!dot) return 0;
  let na = 0;
  let nb = 0;
  for (const g of A) na += gW(g) * gW(g);
  for (const g of B) nb += gW(g) * gW(g);
  return dot / Math.sqrt(na * nb);
}

/** cosine over rarity-weighted themes */
function cosKeywords(a, b) {
  const A = new Set(a.keywords || []);
  const B = new Set(b.keywords || []);
  let dot = 0;
  for (const k of A) if (B.has(k)) dot += kW(k) * kW(k);
  if (!dot) return 0;
  let na = 0;
  let nb = 0;
  for (const k of A) na += kW(k) * kW(k);
  for (const k of B) nb += kW(k) * kW(k);
  return dot / Math.sqrt(na * nb);
}

function eraFit(profile, m, ctx) {
  if (!Number.isFinite(m.year)) return 0.5;
  const target = ctx.eraTarget;
  return clamp(1 - Math.abs(m.year - target) / 26, 0, 1);
}

function qualityOf(m) {
  // Web-added films have no rating: neutral, never NaN, never a fake 0.
  return Number.isFinite(m.rating) ? clamp((m.rating - 5.8) / 3.4, 0, 1) : 0.5;
}

function popularityOf(m) {
  const p = Number.isFinite(m.popularity) ? m.popularity : 0;
  if (!p) return Number.isFinite(m.rating) ? clamp((m.rating - 6) / 4, 0, 1) * 0.55 : 0.45;
  return clamp(Math.log10(1 + p) / Math.log10(1 + catStats.popMax), 0, 1);
}

/** how much a film looks like the films the user said they loved */
function likeFit(profile, m, ctx) {
  if (!profile.liked.length) return 0.55; // no seeds yet: stay neutral, genre carries it
  let best = 0;
  let sum = 0;
  let n = 0;
  for (const id of profile.liked) {
    const l = byId.get(id);
    if (!l || l.id === m.id) continue;
    n++;
    const s =
      0.52 * cosGenres(m, l) +
      0.34 * cosKeywords(m, l) +
      0.09 * eraFit(profile, m, { eraTarget: l.year || ctx.eraTarget }) +
      0.05 * (l.director && l.director === m.director ? 1 : 0);
    sum += s;
    if (s > best) best = s;
  }
  if (!n) return 0.55;
  // max rewards "more like my favourite"; mean keeps a broad taste broad
  return clamp(0.6 * best + 0.4 * (sum / n), 0, 1);
}

function genreFitOf(profile, m) {
  let num = 0;
  let den = 0;
  (m.genres || []).forEach((g, i) => {
    const weight = i === 0 ? 1 : 0.74;
    const rarity = gW(g);
    num += weight * rarity * (profile.genres[g] || 0);
    den += weight * rarity * 3.4;
  });
  if (!den) return 0.45;
  return sigmoid(2.0 * (num / den));
}

function keywordFitOf(profile, m) {
  let num = 0;
  let mag = 0;
  for (const k of m.keywords || []) {
    const rarity = kW(k);
    num += rarity * (profile.keywords[k] || 0);
    mag += rarity * rarity;
  }
  if (!mag) return 0.45;
  return sigmoid(1.5 * (num / Math.sqrt(mag * 2.2)));
}

function industryFitOf(profile, m) {
  const w = profile.industries[m.industry] || 0;
  // Neutral (0.5) when the user has expressed no opinion about this industry.
  return clamp(0.5 + Math.tanh(w / 1.8) * 0.5, 0, 1);
}

const WEIGHTS = {
  genre: 0.26,
  like: 0.24,
  keyword: 0.12,
  quality: 0.14,
  popularity: 0.05,
  industry: 0.08,
  era: 0.06,
  director: 0.06,
};

function scoreMovie(profile, m, ctx) {
  const g = genreFitOf(profile, m);
  const l = likeFit(profile, m, ctx);
  const k = keywordFitOf(profile, m);
  const q = qualityOf(m);
  const p = popularityOf(m);
  const ind = industryFitOf(profile, m);
  const era = eraFit(profile, m, ctx);
  const dir = m.director && ctx.lovedDirectors.has(m.director) ? 1 : 0;

  const raw =
    WEIGHTS.genre * g +
    WEIGHTS.like * l +
    WEIGHTS.keyword * k +
    WEIGHTS.quality * q +
    WEIGHTS.popularity * p +
    WEIGHTS.industry * ind +
    WEIGHTS.era * era +
    WEIGHTS.director * dir;

  // things the user actively rejected pull the score down
  let penalty = 0;
  // A 6.2-rated sequel is not a recommendation, however well its genres fit.
  if (Number.isFinite(m.rating) && m.rating < 6.9) penalty += (6.9 - m.rating) * 0.045;
  for (const g2 of m.genres || []) if ((profile.genres[g2] || 0) <= -2.5) penalty += 0.06;
  for (const k2 of m.keywords || []) if ((profile.keywords[k2] || 0) <= -1.5) penalty += 0.05;
  if (m.director && ctx.dislikedDirectors.has(m.director)) penalty += 0.1;

  return clamp(raw - penalty, 0, 1);
}

/** Absolute match% — 90+ is a bullseye, 60s is a stretch, below the floor is hidden. */
const matchOf = (score) => Math.round(clamp(28 + 72 * score, 45, 97));

function reasonFor(profile, m, score, ctx) {
  const out = [];
  // 1. the most specific explanation available: a film they loved
  let closest = null;
  let bestSim = 0;
  for (const id of profile.liked) {
    const l = byId.get(id);
    if (!l || l.id === m.id) continue;
    const sim = 0.6 * cosGenres(m, l) + 0.4 * cosKeywords(m, l);
    if (sim > bestSim) {
      bestSim = sim;
      closest = l;
    }
  }
  if (m.director && ctx.lovedDirectors.has(m.director)) {
    out.push(`Same director as a film you loved — ${m.director}`);
  } else if (closest && bestSim > 0.3) {
    const templates = [
      `In the same vein as ${closest.title}`,
      `Because you loved ${closest.title}`,
      `If ${closest.title} worked for you`,
      `Close to ${closest.title}`,
    ];
    // stable per film, so the same card always explains itself the same way
    let h = 0;
    for (const ch of String(m.id)) h = (h * 31 + ch.charCodeAt(0)) % 9973;
    out.push(templates[h % templates.length]);
  }

  // 2. the genre story, using the film's *most distinctive* matching genre
  const matched = (m.genres || [])
    .map((g) => ({ g, w: (profile.genres[g] || 0) * gW(g) }))
    .filter((x) => x.w > 0.9)
    .sort((a, b) => b.w - a.w);
  if (matched.length && out.length < 2) {
    const names = matched.slice(0, 2).map((x) => x.g);
    out.push(names.length > 1 ? `Your ${names.join(" + ")} taste` : `Your strongest genre: ${names[0]}`);
  }

  // 3. evidence from the questioning, when it exists
  if (out.length < 2 && profile.liked.length + Object.keys(profile.answers).length >= 3) {
    const similarAnswers = (m.genres || []).filter((g) => (profile.genres[g] || 0) > 1.5);
    if (similarAnswers.length && (profile.industries[m.industry] || 0) > 1.2) {
      out.push(`${m.industryName} — the territory you keep picking`);
    }
  }

  // 4. fallbacks that still say something true
  if (out.length < 2 && Number.isFinite(m.rating) && m.rating >= 8.2) out.push(`Rated ${m.rating.toFixed(1)}`);
  if (out.length < 2 && m.runtime && m.runtime <= 105) out.push("Short and sharp — under 1h 45m");
  if (!out.length) out.push(`A ${(m.genres || ["film"])[0].toLowerCase()} film the catalogue rates highly`);
  return out.slice(0, 2);
}

/** Everything the ranker needs that does not depend on the candidate. */
function buildCtx(profile) {
  const loved = profile.liked.map((id) => byId.get(id)).filter(Boolean);
  const lovedDirectors = new Set(loved.map((m) => m.director).filter(Boolean));
  const dislikedDirectors = new Set(
    profile.disliked.map((id) => byId.get(id)).filter(Boolean).map((m) => m.director).filter(Boolean)
  );
  const years = loved.map((m) => m.year).filter(Number.isFinite).sort((a, b) => a - b);
  const eraTarget = years.length ? years[Math.floor(years.length / 2)] : 2008;
  return { lovedDirectors, dislikedDirectors, eraTarget, loved };
}

/** Films already loved / rejected / seen / saved are not "new picks". */
function candidates(profile) {
  const exclude = new Set([
    ...profile.disliked,
    ...profile.watched,
    ...profile.watchlist,
    ...profile.liked,
  ]);
  return movies.filter((m) => !exclude.has(m.id));
}

/**
 * MMR: pick the best film, then repeatedly the film that is good *and* not a
 * rerun of something already picked. Without this, six Nolan films and four
 * Marvel films fill the grid and the list feels machine-made.
 */
function diversify(pool, target, lambda = 0.36) {
  const picked = [];
  const leadCount = new Map();
  const rest = pool.slice();
  while (rest.length && picked.length < target) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    const scan = Math.min(rest.length, 80); // scan a window: plenty, and fast
    for (let i = 0; i < scan; i++) {
      const item = rest[i];
      let clash = 0;
      for (const p of picked) {
        const sim = 0.55 * cosGenres(item.movie, p.movie) + 0.45 * cosKeywords(item.movie, p.movie);
        if (sim > clash) clash = sim;
      }
      // ...and a soft cap on how many picks can share a lead genre, so a strongly
      // Sci-Fi profile still gets Sci-Fi, just not 20 of them in a row.
      const lead = (item.movie.genres || ["Drama"])[0];
      const over = (leadCount.get(lead) || 0);
      const val = item.score - lambda * clash - 0.04 * over;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    const chosen = rest[bestIdx];
    const lead = (chosen.movie.genres || ["Drama"])[0];
    leadCount.set(lead, (leadCount.get(lead) || 0) + 1);
    picked.push(chosen);
    rest.splice(bestIdx, 1);
  }
  return picked;
}

function rank(profile, { limit = 60, offset = 0 } = {}) {
  const ctx = buildCtx(profile);
  const target = Math.max(1, limit + offset);
  const pool = candidates(profile).map((m) => {
    const score = scoreMovie(profile, m, ctx);
    return { movie: m, score, reasons: reasonFor(profile, m, score, ctx) };
  });

  // A floor keeps junk out: below this a card would be padding, not a suggestion.
  const FLOOR = 0.40;
  let strong = pool.filter((x) => x.score >= FLOOR);
  if (strong.length < Math.min(target, 24)) strong = pool; // tiny catalogue safety valve
  strong.sort((a, b) => b.score - a.score);

  const chosen = diversify(strong, target)
    .slice()
    .sort((a, b) => b.score - a.score); // best first: a list that reads as ranked
  return chosen.slice(offset, offset + limit).map((item) => ({
    ...item.movie,
    score: Number(item.score.toFixed(4)),
    match: matchOf(item.score),
    reasons: item.reasons,
  }));
}

/**
 * Probe questions: "would you watch this?".
 *
 * The old version rotated blindly through genres. A question is only worth
 * asking when the answer is genuinely uncertain — a film the engine is sure
 * about teaches it nothing. So each candidate is scored on how *close to the
 * decision boundary* it sits (uncertainty), tempered by whether the user is
 * likely to have heard of it, and spread across genres so a run of eight
 * questions probes eight different parts of the taste space.
 */
function nextQuestions(profile, count = 8) {
  const ctx = buildCtx(profile);
  const skip = new Set([
    ...profile.liked,
    ...profile.disliked,
    ...profile.watched,
    ...profile.watchlist,
    ...profile.asked,
  ]);

  const pool = movies
    .filter((m) => !skip.has(m.id))
    .map((m) => {
      const score = scoreMovie(profile, m, ctx);
      const uncertainty = 1 - Math.abs(score - 0.5) * 2; // peaks at a coin-flip
      const value =
        0.52 * uncertainty +
        0.20 * qualityOf(m) +
        0.16 * popularityOf(m) +
        0.12 * clamp((gW((m.genres || ["Drama"])[0]) - 0.8) / 2, 0, 1);
      return { movie: m, score, value };
    })
    .sort((a, b) => b.value - a.value);

  // bucket by lead genre and rotate: strong genres first, unexplored ones after
  const buckets = new Map();
  for (const item of pool) {
    const g = (item.movie.genres || ["Drama"])[0];
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g).push(item);
  }
  const order = [...buckets.keys()].sort((a, b) => {
    const wa = profile.genres[a] || 0;
    const wb = profile.genres[b] || 0;
    return wb - wa;
  });

  const out = [];
  const cursors = new Map(order.map((g) => [g, 0]));
  let guard = 0;
  while (out.length < count && guard < count * 12) {
    guard++;
    for (const g of order) {
      if (out.length >= count) break;
      const b = buckets.get(g);
      const i = cursors.get(g);
      if (!b || i >= b.length) continue;
      cursors.set(g, i + 1);
      const item = b[i];
      if (out.some((o) => o.id === item.movie.id)) continue;
      out.push({
        ...item.movie,
        score: item.score,
        match: matchOf(item.score),
        reasons: reasonFor(profile, item.movie, item.score, ctx),
      });
    }
  }
  return out.slice(0, count);
}

function summarize(profile) {
  const top = (map, n = 6) =>
    Object.entries(map)
      .filter(([, v]) => v > 0.3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, weight]) => ({ name, weight: Number(weight.toFixed(2)) }));

  const bottom = Object.entries(profile.genres)
    .filter(([, v]) => v < -0.5)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 5)
    .map(([name, weight]) => ({ name, weight: Number(weight.toFixed(2)) }));

  return {
    genres: top(profile.genres, 8),
    keywords: top(profile.keywords, 10),
    industries: top(profile.industries, 5).map((x) => ({
      name: INDUSTRIES[x.name] || x.name,
      code: x.name,
      weight: x.weight,
    })),
    avoided: bottom,
    counts: {
      liked: profile.liked.length,
      disliked: profile.disliked.length,
      watched: profile.watched.length,
      watchlist: profile.watchlist.length,
      answers: Object.keys(profile.answers).length,
    },
  };
}

module.exports = {
  search,
  resolveOne,
  resolveMany,
  resolve: resolveOne,
  newProfile,
  setGenres,
  setIndustries,
  addLiked,
  feedback,
  answerQuestion,
  rank,
  candidates,
  nextQuestions,
  summarize,
  learn,
  byId,
  movies,
  ALL_GENRES,
};
