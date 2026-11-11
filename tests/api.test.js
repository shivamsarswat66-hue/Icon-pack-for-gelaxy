/**
 * API integration test.  node tests/api.test.js
 *
 * Boots the real server on a throwaway port + data dir, then walks the whole
 * contract — including the new online-discovery path (a film that is not in the
 * bundled catalogue but was confirmed from the web).
 */
const assert = require("assert");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = 4399;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cinematch-test-"));
const BASE = `http://127.0.0.1:${PORT}`;

let server;
let pass = 0;

async function call(pathname, { method = "GET", body, token } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const it = async (name, fn) => {
  try {
    await fn();
    pass++;
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + "\n    " + err.message);
    process.exitCode = 1;
  }
};

async function boot() {
  server = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR, HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start")), 15000);
    server.stdout.on("data", (d) => {
      if (String(d).includes("running on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.stderr.on("data", (d) => process.stderr.write(d));
  });
}

async function main() {
  await boot();
  console.log("\napi: basics");

  let token;

  await it("health reports the catalogue", async () => {
    const { status, json } = await call("/api/health");
    assert.strictEqual(status, 200);
    assert.ok(json.movies >= 214, "expected at least the curated films");
    assert.ok(Number.isInteger(json.discovered));
  });

  await it("catalogue exposes genres + industries", async () => {
    const { json } = await call("/api/catalogue");
    assert.ok(json.genres.includes("Sci-Fi"));
    assert.ok(json.industries.length >= 7);
  });

  await it("signup issues a token and returns state", async () => {
    const { status, json } = await call("/api/signup", { method: "POST", body: { name: "Test User" } });
    assert.strictEqual(status, 200);
    assert.ok(json.token && json.token.length > 20);
    assert.strictEqual(json.state.user.stage, "genres");
    token = json.token;
  });

  await it("auth is enforced", async () => {
    const { status } = await call("/api/state");
    assert.strictEqual(status, 401);
  });

  await it("genres + industries are saved", async () => {
    const { json } = await call("/api/genres", { method: "POST", token, body: { genres: ["Drama", "Romance"], industries: ["BW"] } });
    assert.deepStrictEqual(json.state.genres !== undefined, true);
    assert.strictEqual(json.state.user.stage, "movies");
  });

  console.log("\napi: honesty");
  await it("junk queries return no suggestions", async () => {
    for (const q of ["rockstar", "animal"]) {
      const { json } = await call(`/api/search?q=${q}`);
      assert.deepStrictEqual(json.results, [], `${q} returned ${json.results.map((r) => r.title)}`);
    }
  });

  await it("typos still resolve", async () => {
    const { json } = await call("/api/resolve", { method: "POST", token, body: { text: "incepton" } });
    assert.strictEqual(json.results[0].movie.title, "Inception");
    assert.strictEqual(json.results[0].confidence, "corrected");
  });

  console.log("\napi: web-discovered film");
  const webFilm = {
    id: "w-q3438002",
    title: "Rockstar",
    year: 2011,
    industry: "BW",
    industryName: "Bollywood",
    rating: null,
    runtime: 159,
    director: "Imtiaz Ali",
    genres: ["Drama", "Romance", "Musical"],
    keywords: ["music", "india"],
    synopsis: "A musician chases fame and loses the love that made him.",
    source: "wikipedia",
  };

  await it("likes accepts a film that isn't in the bundled catalogue", async () => {
    const { status, json } = await call("/api/likes", {
      method: "POST",
      token,
      body: { movieIds: [webFilm.id], titles: ["Rockstar"], movies: [webFilm] },
    });
    assert.strictEqual(status, 200);
    assert.ok(json.state.liked.some((m) => m.title === "Rockstar"), "web film not in profile");
  });

  await it("the web film is now searchable for everyone", async () => {
    const { json } = await call("/api/search?q=rockstar");
    assert.ok(json.results.some((r) => r.title === "Rockstar"));
  });

  await it("it is persisted for the next visitor", async () => {
    await new Promise((r) => setTimeout(r, 200));
    const file = path.join(DATA_DIR, "discovered.json");
    assert.ok(fs.existsSync(file), "discovered.json missing");
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.ok(list.some((m) => m.id === webFilm.id));
  });

  await it("recommendations stay healthy with an unrated film in the pool", async () => {
    const { json } = await call("/api/recommendations?limit=60", { token });
    assert.strictEqual(json.recommendations.length, 60);
    for (const r of json.recommendations) {
      assert.ok(Number.isFinite(r.score), "NaN score for " + r.title);
      assert.ok(r.match >= 56 && r.match <= 98, "match out of range for " + r.title);
      assert.ok(r.synopsis && r.synopsis.length > 10, "missing synopsis for " + r.title);
      assert.ok(Array.isArray(r.genres) && r.genres.length, "missing genres for " + r.title);
    }
  });

  await it("feedback on the web film feeds the profile", async () => {
    const { status, json } = await call("/api/feedback", { method: "POST", token, body: { movieId: webFilm.id, action: "watchlist" } });
    assert.strictEqual(status, 200);
    assert.ok(json.state.watchlist.some((m) => m.title === "Rockstar"));
  });

  await it("questions are generated from the profile", async () => {
    const { json } = await call("/api/questions?n=8", { token });
    assert.ok(json.questions.length > 0);
    for (const q of json.questions) assert.ok(q.title && q.genres.length);
  });

  await it("reset clears the profile", async () => {
    const { json } = await call("/api/reset", { method: "POST", token, body: {} });
    assert.strictEqual(json.state.liked.length, 0);
    assert.strictEqual(json.state.user.stage, "movies");
  });

  await it("unknown ids are rejected", async () => {
    const { status } = await call("/api/feedback", { method: "POST", token, body: { movieId: "not-a-film", action: "watched" } });
    assert.strictEqual(status, 400);
  });

  console.log(`\n${pass} API tests passed${process.exitCode ? " — WITH FAILURES" : ", all green"}\n`);
}

main()
  .catch((err) => {
    console.error("\nFATAL:", err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    if (server) server.kill();
  });
