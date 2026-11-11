/**
 * CineMatch server — zero dependencies (Node core only).
 * Serves the SPA from /public and a small JSON API backed by data/store.json.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const engine = require("./src/engine");
const lookup = require("./src/lookup");
const { ALL_GENRES, ALL_INDUSTRIES, movies, byId } = require("./data/movies");
lookup.init({ movies, byId, genres: ALL_GENRES, industries: require("./data/movies").INDUSTRIES });

const PORT = process.env.PORT || 4173;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
// DATA_DIR lets hosts mount a persistent disk (e.g. Render: /var/data).
// Falls back to ./data for local development.
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
// Films discovered online, shared by every visitor of this server.
const DISCOVERED_PATH = path.join(DATA_DIR, "discovered.json");

/* ------------------------------------------------------------------ */
/* persistence                                                         */
/* ------------------------------------------------------------------ */
let store = { users: {} };
try {
  if (fs.existsSync(STORE_PATH)) {
    store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    if (!store.users) store.users = {};
  }
} catch (err) {
  console.warn("[store] could not read store.json, starting fresh:", err.message);
}

let writeTimer = null;
function persist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    } catch (err) {
      console.warn("[store] write failed:", err.message);
    }
  }, 60);
}

const publicUser = (rec) => ({
  id: rec.user.id,
  name: rec.user.name,
  email: rec.user.email,
  createdAt: rec.user.createdAt,
  stage: rec.user.stage,
  onboarded: !!rec.user.onboarded,
});

const movieList = (ids = []) => ids.map((id) => byId.get(id)).filter(Boolean);

function buildState(rec) {
  const p = rec.profile;
  return {
    user: publicUser(rec),
    genres: p.genres,
    summary: engine.summarize(p),
    liked: movieList(p.liked),
    likedRaw: p.seedTitles,
    watched: movieList(p.watched),
    watchlist: movieList(p.watchlist),
    disliked: movieList(p.disliked),
    askedCount: p.asked.length,
    catalogueSize: movies.length,
  };
}

/* ------------------------------------------------------------------ */
/* tiny http helpers                                                   */
/* ------------------------------------------------------------------ */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 512 * 1024) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      raw += c;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function auth(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return null;
  const rec = store.users[token];
  return rec || null;
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      if (!path.extname(rel)) {
        fs.readFile(path.join(PUBLIC_DIR, "index.html"), (e2, html) => {
          if (e2) {
            res.writeHead(404);
            res.end("Not found");
            return;
          }
          res.writeHead(200, { "Content-Type": MIME[".html"] });
          res.end(html);
        });
        return;
      }
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300",
    });
    res.end(data);
  });
}

/* ------------------------------------------------------------------ */
/* online discovery                                                    */
/* ------------------------------------------------------------------ */
let discoveredDirty = false;

function loadDiscovered() {
  try {
    if (!fs.existsSync(DISCOVERED_PATH)) return 0;
    const list = JSON.parse(fs.readFileSync(DISCOVERED_PATH, "utf8"));
    let n = 0;
    for (const m of Array.isArray(list) ? list : []) if (lookup.register(m)) n++;
    return n;
  } catch (_) {
    return 0;
  }
}

function saveDiscovered() {
  if (!discoveredDirty) return;
  discoveredDirty = false;
  try {
    const web = movies.filter((m) => String(m.id).startsWith("w-"));
    fs.mkdirSync(path.dirname(DISCOVERED_PATH), { recursive: true });
    fs.writeFileSync(DISCOVERED_PATH, JSON.stringify(web, null, 1));
  } catch (_) {
    /* read-only filesystem (serverless): discovery just won't persist */
  }
}

loadDiscovered();

/* ------------------------------------------------------------------ */
/* routes                                                              */
/* ------------------------------------------------------------------ */
async function handleApi(req, res, url) {
  const route = url.pathname.replace(/^\/api/, "");
  const method = req.method.toUpperCase();

  /* ---------- public ---------- */
  if (route === "/health")
    return sendJSON(res, 200, {
      ok: true,
      movies: movies.length,
      discovered: movies.filter((m) => String(m.id).startsWith("w-")).length,
    });

  if (route === "/catalogue" && method === "GET") {
    return sendJSON(res, 200, {
      genres: ALL_GENRES,
      industries: ALL_INDUSTRIES,
      count: movies.length,
    });
  }

  if (route === "/search" && method === "GET") {
    const q = url.searchParams.get("q") || "";
    const results = engine.search(q, 6).map((r) => ({
      ...r.movie,
      score: Number(r.score.toFixed(3)),
      exact: r.score >= 0.995,
    }));
    return sendJSON(res, 200, { query: q, results });
  }

  if (route === "/lookup" && method === "GET") {
    const q = url.searchParams.get("q") || "";
    const candidates = await lookup.lookup(q, { limit: 5 });
    return sendJSON(res, 200, { query: q, candidates });
  }

  if (route === "/resolve" && method === "POST") {
    const body = await readBody(req);
    const results = engine.resolveMany(body.text || body.titles || "");
    return sendJSON(res, 200, {
      results: results.map((r) => ({
        query: r.query,
        confidence: r.confidence,
        duplicate: !!r.duplicate,
        score: r.score,
        movie: r.movie,
        alternatives: r.alternatives,
      })),
    });
  }

  if (route === "/signup" && method === "POST") {
    const body = await readBody(req);
    const name = String(body.name || "").trim().slice(0, 40);
    if (!name) return sendJSON(res, 400, { error: "Please tell us your name." });
    const email = String(body.email || "").trim().slice(0, 120);
    const token = crypto.randomBytes(24).toString("hex");
    const rec = {
      user: {
        id: crypto.randomBytes(8).toString("hex"),
        name,
        email,
        createdAt: new Date().toISOString(),
        stage: "genres",
        onboarded: false,
      },
      profile: engine.newProfile(),
    };
    store.users[token] = rec;
    persist();
    return sendJSON(res, 200, { token, state: buildState(rec) });
  }

  /* ---------- authenticated ---------- */
  const rec = auth(req);
  if (!rec) return sendJSON(res, 401, { error: "Session expired. Please sign up again." });
  const p = rec.profile;

  const touch = (stage) => {
    if (stage) rec.user.stage = stage;
    persist();
  };

  if (route === "/state" && method === "GET") {
    return sendJSON(res, 200, { state: buildState(rec) });
  }

  if (route === "/genres" && method === "POST") {
    const body = await readBody(req);
    engine.setGenres(p, body.genres || []);
    engine.setIndustries(p, body.industries || []);
    touch("movies");
    return sendJSON(res, 200, { state: buildState(rec) });
  }

  if (route === "/likes" && method === "POST") {
    const body = await readBody(req);
    // Films the user confirmed from the web lookup: validate, then register so
    // every engine path (search, questions, rank, feedback) treats them as normal.
    if (Array.isArray(body.movies)) {
      for (const raw of body.movies.slice(0, 30)) {
        if (lookup.register(raw)) discoveredDirty = true;
      }
      if (discoveredDirty) saveDiscovered();
    }
    const ids = (body.movieIds || []).filter((id) => byId.has(id));
    p.seedTitles = Array.isArray(body.titles)
      ? body.titles.slice(0, 80)
      : p.seedTitles;
    engine.addLiked(p, ids);
    touch("questions");
    return sendJSON(res, 200, { state: buildState(rec), added: ids.length });
  }

  if (route === "/likes/remove" && method === "POST") {
    const body = await readBody(req);
    const m = byId.get(body.movieId);
    if (m) {
      p.liked = p.liked.filter((id) => id !== m.id);
      for (const g of m.genres) {
        if (p.genres[g]) p.genres[g] = Math.max(0, p.genres[g] - 1.9);
      }
      for (const k of m.keywords) {
        if (p.keywords[k]) p.keywords[k] = Math.max(0, p.keywords[k] - 0.6);
      }
    }
    touch();
    return sendJSON(res, 200, { state: buildState(rec) });
  }

  if (route === "/quickpicks" && method === "GET") {
    const picks = engine.rank(p, { limit: 16 }).slice(0, 10);
    return sendJSON(res, 200, { picks });
  }

  if (route === "/questions" && method === "GET") {
    const n = Math.min(Number(url.searchParams.get("n") || 8), 12);
    return sendJSON(res, 200, { questions: engine.nextQuestions(p, n) });
  }

  if (route === "/answers" && method === "POST") {
    const body = await readBody(req);
    for (const a of body.answers || []) {
      engine.answerQuestion(p, a.id, a.yes === null || a.yes === undefined ? null : !!a.yes);
    }
    rec.user.onboarded = true;
    touch("results");
    return sendJSON(res, 200, { state: buildState(rec) });
  }

  if (route === "/recommendations" && method === "GET") {
    const limit = Math.min(Number(url.searchParams.get("limit") || 60), 120);
    const offset = Math.max(0, Math.min(Number(url.searchParams.get("offset") || 0), 80));
    return sendJSON(res, 200, {
      recommendations: engine.rank(p, { limit, offset }),
      offset,
      total: movies.length,
    });
  }

  if (route === "/feedback" && method === "POST") {
    const body = await readBody(req);
    if (!byId.has(body.movieId)) return sendJSON(res, 400, { error: "Unknown movie." });
    engine.feedback(p, body.movieId, body.action);
    touch();
    return sendJSON(res, 200, { state: buildState(rec) });
  }

  if (route === "/reset" && method === "POST") {
    const body = await readBody(req);
    const keepGenres = !!body.keepGenres;
    const oldGenres = keepGenres ? { ...p.genres } : {};
    const oldInd = keepGenres ? { ...p.industries } : {};
    rec.profile = engine.newProfile();
    if (keepGenres) {
      rec.profile.genres = oldGenres;
      rec.profile.industries = oldInd;
    }
    touch("movies");
    return sendJSON(res, 200, { state: buildState(rec) });
  }

  return sendJSON(res, 404, { error: "Unknown endpoint." });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((err) => {
      console.error("[api]", err);
      sendJSON(res, 500, { error: "Something went wrong on our side." });
    });
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`CineMatch running on http://${HOST}:${PORT}  (${movies.length} films loaded)`);
});
