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

  const sk = levRatio(skeleton(qa), skeleton(ta));
  if (sk > 0.86) score = Math.max(score, sk * 0.9);

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
        const wsr = levRatio(skeleton(qa), skeleton(win));
        if (wsr > 0.9 && qa.length >= 6) score = Math.max(score, Math.min(wsr * STREAM, 0.99));
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
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const jaccard = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
};

function profileKeywordNorm(profile) {
  let s = 0;
  for (const v of Object.values(profile.keywords)) s += v * v;
  return Math.sqrt(s) || 1;
}

function scoreMovie(profile, m, ctx) {
  // genre affinity
  let gRaw = 0;
  for (const g of m.genres) gRaw += profile.genres[g] || 0;
  const gA = sigmoid(gRaw / 2.1);

  // keyword affinity (cosine-ish against the candidate's keyword vector)
  const norm = ctx.kwNorm;
  let dot = 0;
  for (const k of m.keywords) dot += profile.keywords[k] || 0;
  const kwProfile = clamp(dot / (norm * 1.7), -1, 1) * 0.5 + 0.5;

  // similarity to loved films
  let close = 0;
  for (const id of profile.liked) {
    const l = byId.get(id);
    if (!l) continue;
    const gSim = jaccard(m.genres, l.genres);
    const kSim = jaccard(m.keywords, l.keywords);
    const eraSim = 1 - Math.min(Math.abs(m.year - l.year) / 40, 1);
    const sameDirector = l.director === m.director ? 1 : 0;
    const s = 0.5 * gSim + 0.3 * kSim + 0.08 * eraSim + 0.12 * sameDirector;
    if (s > close) close = s;
  }
  // also reward a broad taste match when the user has not seeded films yet
  if (!profile.liked.length) close = gA * 0.7;

  // Web-added films have no rating: treat as neutral instead of NaN-poisoning the score.
  const quality = Number.isFinite(m.rating) ? clamp((m.rating - 6.2) / 3.0, 0, 1) : 0.55;
  const indW = profile.industries[m.industry] || 0;
  const industry = sigmoid(indW / 1.5);

  // gentle novelty: nudge neighbours of the taste rather than clones
  const novelty = 1 - jaccard(m.genres, profile.liked.flatMap((id) => byId.get(id)?.genres || []));

  let score =
    0.32 * gA + 0.22 * close + 0.18 * kwProfile + 0.14 * quality + 0.07 * industry + 0.07 * novelty;

  // hard penalties for things the user has rejected
  for (const k of m.keywords) if ((profile.keywords[k] || 0) <= -1.5) score -= 0.12;
  if ((profile.genres[m.genres[0]] || 0) <= -2) score -= 0.15;

  return clamp(score, 0, 1);
}

function reasonFor(profile, m, score) {
  const reasons = [];
  const genres = [...m.genres].sort((a, b) => (profile.genres[b] || 0) - (profile.genres[a] || 0));
  const lead = genres.slice(0, 2).filter((g) => (profile.genres[g] || 0) > 0.6);
  if (lead.length) reasons.push(`Strong match for your ${lead.join(" + ")} taste`);

  let best = null;
  let bestSim = 0;
  for (const id of profile.liked) {
    const l = byId.get(id);
    if (!l || l.id === m.id) continue;
    const sim = 0.55 * jaccard(m.genres, l.genres) + 0.45 * jaccard(m.keywords, l.keywords);
    if (sim > bestSim) {
      bestSim = sim;
      best = l;
    }
  }
  if (best && bestSim > 0.18) reasons.push(`Shares its DNA with ${best.title}`);
  if ((profile.industries[m.industry] || 0) > 1.5) reasons.push(`A standout in ${m.industryName}`);
  if (Number.isFinite(m.rating) && m.rating >= 8.3) reasons.push(`Rated ${m.rating.toFixed(1)} — a modern classic`);
  if (m.runtime && m.runtime <= 100) reasons.push("Short and sharp — under 100 minutes");
  if (!reasons.length) reasons.push(`A high-rated ${m.genres[0].toLowerCase()} film worth a shot`);
  return reasons.slice(0, 2);
}

/** Everything the ranker needs that does not depend on the candidate. */
function buildCtx(profile) {
  return { kwNorm: profileKeywordNorm(profile) };
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

/** Stretch raw scores into a friendly, human 56–98% match band. */
function calibrate(items) {
  if (!items.length) return items;
  const scores = items.map((i) => i.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  return items.map((i) => ({
    ...i,
    match: Math.round(56 + ((i.score - min) / span) * 42),
  }));
}

function rank(profile, { limit = 60, offset = 0 } = {}) {
  const ctx = buildCtx(profile);
  const target = Math.max(1, limit + offset);
  const pool = candidates(profile).map((m) => {
    const score = scoreMovie(profile, m, ctx);
    return { movie: m, score, reasons: reasonFor(profile, m, score) };
  });
  pool.sort((a, b) => b.score - a.score || (b.movie.rating || 6.5) - (a.movie.rating || 6.5));

  // ---- diversity: cap how many of one lead-genre can dominate the list ----
  const cap = Math.max(3, Math.ceil(target / 7));
  const perGenre = new Map();
  const picked = [];
  const overflow = [];
  for (const item of pool) {
    const g = item.movie.genres[0];
    const n = perGenre.get(g) || 0;
    if (n < cap) {
      perGenre.set(g, n + 1);
      picked.push(item);
    } else overflow.push(item);
    if (picked.length >= target) break;
  }
  if (picked.length < target) {
    for (const item of overflow) {
      if (picked.length >= target) break;
      picked.push(item);
    }
  }
  return calibrate(picked.slice(offset, offset + limit)).map((item) => ({
    ...item.movie,
    score: Number(item.score.toFixed(4)),
    match: item.match,
    reasons: item.reasons,
  }));
}

/**
 * Probe questions: a spread of "would you watch this?" cards chosen to
 * separate genres fastest, mixing safe bets with exploratory picks.
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
    .map((m) => ({ movie: m, score: scoreMovie(profile, m, ctx) }))
    .sort((a, b) => b.score - a.score);

  if (!pool.length) return [];
  const buckets = new Map();
  for (const item of pool) {
    const g = item.movie.genres[0];
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g).push(item);
  }
  // rotate through genres, taking the best remaining film of each
  const order = [...buckets.keys()].sort(
    (a, b) => (profile.genres[b] || 0) - (profile.genres[a] || 0)
  );
  const out = [];
  let round = 0;
  while (out.length < count && round < 12) {
    for (const g of order) {
      if (out.length >= count) break;
      const b = buckets.get(g);
      // alternate: confident pick, then a deeper cut, to learn faster
      const idx = round === 0 ? 0 : Math.min(b.length - 1, round * 2);
      const item = b[idx];
      if (!item) continue;
      if (out.some((o) => o.id === item.movie.id)) continue;
      out.push({
        ...item.movie,
        score: item.score,
        reasons: reasonFor(profile, item.movie, item.score),
      });
    }
    round++;
  }
  return calibrate(out.slice(0, count)).map((item) => {
    const { score, ...movie } = item;
    return { ...movie, match: item.match };
  });
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
