/**
 * CineMatch — browser-side API shim (for static hosting: Vercel / GitHub Pages / Netlify).
 *
 * On the Node server the same endpoints are real HTTP routes backed by data/store.json.
 * Here we intercept window.fetch("/api/…") and answer from the identical engine,
 * persisting to localStorage instead of a file. The UI code is untouched.
 *
 * Load order: engine.bundle.js → local-api.js → app.js
 */
(function () {
  "use strict";

  const E = window.CineEngine;
  const D = window.CineData;
  const L = window.CineLookup;
  const { byId, movies, ALL_GENRES, ALL_INDUSTRIES, INDUSTRIES } = D;

  const STORE_KEY = "cinematch.store.v2";
  const TOKEN_KEY = "cinematch.token";
  const DISCOVERED_KEY = "cinematch.discovered.v1";

  // films found online live alongside the bundled catalogue, exactly like the server edition
  if (L) L.init({ movies, byId, genres: ALL_GENRES, industries: INDUSTRIES });

  function loadDiscovered() {
    try {
      const raw = JSON.parse(localStorage.getItem(DISCOVERED_KEY) || "[]");
      for (const m of raw) if (L) L.register(m);
    } catch (_) {}
  }
  function saveDiscovered(movie) {
    try {
      const raw = JSON.parse(localStorage.getItem(DISCOVERED_KEY) || "[]");
      if (!raw.some((m) => m.id === movie.id)) raw.push(movie);
      localStorage.setItem(DISCOVERED_KEY, JSON.stringify(raw.slice(-200)));
    } catch (_) {}
  }
  loadDiscovered();

  /* ---------------- storage (with in-memory fallback) ---------------- */
  let memory = null;
  function readStore() {
    if (memory) return memory;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      memory = raw ? JSON.parse(raw) : { users: {} };
    } catch (_) {
      memory = { users: {} };
    }
    if (!memory.users) memory.users = {};
    return memory;
  }
  function writeStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(memory));
    } catch (_) {
      /* private mode / quota: keep it in memory for this session */
    }
  }

  const uid = (n) => {
    let s = "";
    const chars = "abcdef0123456789";
    for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };

  /* ---------------- serialisation (mirrors server.js) ---------------- */
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
      summary: E.summarize(p),
      liked: movieList(p.liked),
      likedRaw: p.seedTitles,
      watched: movieList(p.watched),
      watchlist: movieList(p.watchlist),
      disliked: movieList(p.disliked),
      askedCount: p.asked.length,
      catalogueSize: movies.length,
    };
  }

  /* ---------------- tiny helpers ---------------- */
  const jsonResponse = (status, payload) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json" },
    json: async () => JSON.parse(JSON.stringify(payload)),
    text: async () => JSON.stringify(payload),
  });

  function readAuth(headers) {
    if (!headers) return "";
    const h = headers.Authorization || headers.authorization || "";
    return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  }

  function safeParse(s) {
    try {
      return s ? JSON.parse(s) : {};
    } catch (_) {
      return {};
    }
  }

  /* ---------------- router ---------------- */
  function handle(pathname, search, method, body, token) {
    const store = readStore();
    const rec = token ? store.users[token] : null;

    /* ---------- public ---------- */
    if (pathname === "/api/health") return jsonResponse(200, { ok: true, movies: movies.length });

    if (pathname === "/api/catalogue")
      return jsonResponse(200, {
        genres: ALL_GENRES,
        industries: ALL_INDUSTRIES,
        count: movies.length,
      });

    if (pathname === "/api/search") {
      const q = search.get("q") || "";
      const results = E.search(q, 6).map((r) => ({
        ...r.movie,
        score: Number(r.score.toFixed(3)),
        exact: r.score >= 0.995,
      }));
      return jsonResponse(200, { query: q, results });
    }

    if (pathname === "/api/lookup") {
      const q = search.get("q") || "";
      if (!L) return jsonResponse(503, { error: "Lookup unavailable.", candidates: [] });
      // handle() may return a promise; the fetch shim awaits it
      return L.lookup(q, { limit: 5 }).then((candidates) => jsonResponse(200, { query: q, candidates }));
    }

    if (pathname === "/api/resolve") {
      const results = E.resolveMany(body.text || body.titles || "");
      return jsonResponse(200, {
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

    if (pathname === "/api/signup") {
      const name = String(body.name || "").trim().slice(0, 40);
      if (!name) return jsonResponse(400, { error: "Please tell us your name." });
      const newToken = uid(40);
      const newRec = {
        user: {
          id: uid(12),
          name,
          email: String(body.email || "").trim().slice(0, 120),
          createdAt: new Date().toISOString(),
          stage: "genres",
          onboarded: false,
        },
        profile: E.newProfile(),
      };
      store.users[newToken] = newRec;
      writeStore();
      try {
        localStorage.setItem(TOKEN_KEY, newToken);
      } catch (_) {}
      return jsonResponse(200, { token: newToken, state: buildState(newRec) });
    }

    /* ---------- authenticated ---------- */
    if (!rec) return jsonResponse(401, { error: "Session expired. Please sign up again." });
    const p = rec.profile;

    if (pathname === "/api/state") return jsonResponse(200, { state: buildState(rec) });

    if (pathname === "/api/genres") {
      E.setGenres(p, body.genres || []);
      E.setIndustries(p, body.industries || []);
      rec.user.stage = "movies";
      writeStore();
      return jsonResponse(200, { state: buildState(rec) });
    }

    if (pathname === "/api/likes") {
      if (Array.isArray(body.movies) && L) {
        for (const raw of body.movies.slice(0, 30)) {
          if (L.register(raw)) saveDiscovered(L.sanitize(raw) || raw);
        }
      }
      const ids = (body.movieIds || []).filter((id) => byId.has(id));
      if (Array.isArray(body.titles)) p.seedTitles = body.titles.slice(0, 80);
      E.addLiked(p, ids);
      rec.user.stage = "questions";
      writeStore();
      return jsonResponse(200, { state: buildState(rec), added: ids.length });
    }

    if (pathname === "/api/likes/remove") {
      const m = byId.get(body.movieId);
      if (m) {
        p.liked = p.liked.filter((id) => id !== m.id);
        for (const g of m.genres) if (p.genres[g]) p.genres[g] = Math.max(0, p.genres[g] - 1.9);
        for (const k of m.keywords) if (p.keywords[k]) p.keywords[k] = Math.max(0, p.keywords[k] - 0.6);
      }
      writeStore();
      return jsonResponse(200, { state: buildState(rec) });
    }

    if (pathname === "/api/quickpicks")
      return jsonResponse(200, { picks: E.rank(p, { limit: 16 }).slice(0, 10) });

    if (pathname === "/api/questions") {
      const n = Math.min(Number(search.get("n") || 8), 12);
      return jsonResponse(200, { questions: E.nextQuestions(p, n) });
    }

    if (pathname === "/api/answers") {
      for (const a of body.answers || []) {
        E.answerQuestion(p, a.id, a.yes === null || a.yes === undefined ? null : !!a.yes);
      }
      rec.user.onboarded = true;
      rec.user.stage = "results";
      writeStore();
      return jsonResponse(200, { state: buildState(rec) });
    }

    if (pathname === "/api/recommendations") {
      const limit = Math.min(Number(search.get("limit") || 60), 120);
      const offset = Math.max(0, Math.min(Number(search.get("offset") || 0), 80));
      return jsonResponse(200, {
        recommendations: E.rank(p, { limit, offset }),
        offset,
        total: movies.length,
      });
    }

    if (pathname === "/api/feedback") {
      if (!byId.has(body.movieId)) return jsonResponse(400, { error: "Unknown movie." });
      E.feedback(p, body.movieId, body.action);
      writeStore();
      return jsonResponse(200, { state: buildState(rec) });
    }

    if (pathname === "/api/reset") {
      const keepGenres = !!body.keepGenres;
      const oldGenres = keepGenres ? { ...p.genres } : {};
      const oldInd = keepGenres ? { ...p.industries } : {};
      rec.profile = E.newProfile();
      if (keepGenres) {
        rec.profile.genres = oldGenres;
        rec.profile.industries = oldInd;
      }
      rec.user.stage = "movies";
      rec.user.onboarded = false;
      writeStore();
      return jsonResponse(200, { state: buildState(rec) });
    }

    return jsonResponse(404, { error: "Unknown endpoint." });
  }

  /* ---------------- install fetch shim ---------------- */
  const realFetch = window.fetch ? window.fetch.bind(window) : null;

  window.fetch = function (input, init = {}) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (!url.startsWith("/api")) {
      return realFetch ? realFetch(input, init) : Promise.reject(new Error("offline"));
    }
    const [rawPath, rawQuery = ""] = url.split("?");
    const search = new URLSearchParams(rawQuery);
    const method = (init.method || "GET").toUpperCase();
    const token = readAuth(init.headers) || (() => {
      try {
        return localStorage.getItem(TOKEN_KEY) || "";
      } catch (_) {
        return "";
      }
    })();

    return new Promise((resolve) => {
      setTimeout(() => {
        let payload = {};
        try {
          payload = init.body ? safeParse(init.body) : {};
        } catch (_) {}
        try {
          Promise.resolve(handle(rawPath, search, method, payload, token))
            .then(resolve)
            .catch((err) => {
              console.error("[local-api]", err);
              resolve(jsonResponse(500, { error: "Something went wrong on our side." }));
            });
        } catch (err) {
          console.error("[local-api]", err);
          resolve(jsonResponse(500, { error: "Something went wrong on our side." }));
        }
      }, 40); // keeps the loading states honest
    });
  };

  /* expose a couple of helpers for debugging in the console */
  window.CineMatchLocal = {
    resetAll() {
      memory = { users: {} };
      try {
        localStorage.removeItem(STORE_KEY);
        localStorage.removeItem(TOKEN_KEY);
      } catch (_) {}
      location.reload();
    },
    get store() {
      return readStore();
    },
    get industries() {
      return INDUSTRIES;
    },
  };
})();
