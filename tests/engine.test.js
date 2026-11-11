/**
 * Engine + lookup regression tests.  node tests/engine.test.js
 *
 * These lock in the behaviour that matters for "the app guessed the wrong film":
 *  · junk suggestions are never offered
 *  · real typos still resolve
 *  · web-added films carry no rating and never poison the ranker with NaN
 */
const assert = require("assert");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const engine = require(path.join(ROOT, "src/engine"));
const lookup = require(path.join(ROOT, "src/lookup"));
const { movies, byId, ALL_GENRES, INDUSTRIES } = require(path.join(ROOT, "data/movies"));

let pass = 0;
const it = (name, fn) => {
  try {
    fn();
    pass++;
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + "\n    " + err.message);
    process.exitCode = 1;
  }
};

console.log("\nengine: suggestion honesty");
it("'rockstar' finds Rockstar (2011) and never Rocky (1976)", () => {
  const hits = engine.search("rockstar", 6);
  const titles = hits.map((r) => r.movie.title);
  assert.ok(titles.includes("Rockstar"), "expected Rockstar, got " + titles.join(","));
  assert.ok(!titles.includes("Rocky"), "Rocky leaked back into suggestions");
  assert.strictEqual(hits[0].movie.year, 2011);
});

it("'animal' finds Animal (2023) and never Arrival", () => {
  const titles = engine.search("animal", 6).map((r) => r.movie.title);
  assert.ok(titles.includes("Animal"), "expected Animal, got " + titles.join(","));
  assert.ok(!titles.includes("Arrival"), "Arrival leaked back into suggestions");
});

it("a film we do not have still offers nothing (no confident wrong match)", () => {
  for (const q of ["xvzqw", "kaanekkaane", "zzz qqq"]) {
    assert.strictEqual(engine.search(q, 6).length, 0, "invented a match for " + q);
  }
});

it("real typos still resolve", () => {
  const cases = {
    incepton: "Inception",
    Intersteller: "Interstellar",
    "the dark night": "The Dark Knight",
    shawshenk: "The Shawshank Redemption",
    "3 idots": "3 Idiots",
    parasyte: "Parasite",
    "rrr": "RRR",
  };
  for (const [typo, expected] of Object.entries(cases)) {
    const top = engine.search(typo, 3)[0];
    assert.ok(top, `no suggestion for ${typo}`);
    assert.strictEqual(top.movie.title, expected, `${typo} → ${top.movie.title}`);
    assert.ok(top.score >= 0.68);
  }
});

it("partial typing still suggests", () => {
  for (const [q, expected] of [["incept", "Inception"], ["shawsh", "The Shawshank Redemption"], ["dark kni", "The Dark Knight"]]) {
    assert.strictEqual(engine.search(q, 3)[0].movie.title, expected);
  }
});

console.log("\nengine: resolution bands");
it("resolveOne bands are exact / corrected / weak / none", () => {
  assert.strictEqual(engine.resolveOne("Inception").confidence, "exact");
  assert.strictEqual(engine.resolveOne("incepton").confidence, "corrected");
  assert.strictEqual(engine.resolveOne("rockstar").confidence, "exact");
  assert.strictEqual(engine.resolveOne("rockstar").movie.year, 2011);
  assert.strictEqual(engine.resolveOne("kaanekkaane").confidence, "none");
  assert.strictEqual(engine.resolveOne("kaanekkaane").movie, null);
});

console.log("\nengine: unrated (web-added) films");
const webFilm = {
  id: "w-q3438002",
  title: "Kaanekkaane",
  year: 2011,
  industry: "BW",
  industryName: "Bollywood",
  rating: null,
  runtime: 159,
  director: "Imtiaz Ali",
  genres: ["Drama", "Romance", "Musical"],
  keywords: ["music", "india"],
  synopsis: "A father confronts the man who killed his son in a hit-and-run.",
  source: "wikipedia",
};

it("a null rating never produces NaN scores", () => {
  const profile = engine.newProfile();
  engine.setGenres(profile, ["Drama", "Romance"]);
  lookup.init({ movies, byId, genres: ALL_GENRES, industries: INDUSTRIES });
  assert.ok(lookup.register(webFilm), "registration failed");
  const ranked = engine.rank(profile, { limit: 40 });
  assert.ok(ranked.length >= 20);
  for (const r of ranked) {
    assert.ok(Number.isFinite(r.score), "score is NaN for " + r.title);
    assert.ok(r.match >= 56 && r.match <= 98, "match out of range: " + r.match);
  }
  assert.ok(byId.has("w-q3438002"), "registered film missing from byId");
});

it("registered films become searchable and rankable candidates", () => {
  const hit = engine.search("kaanekkaane", 3)[0];
  assert.ok(hit, "registered film not searchable");
  assert.strictEqual(hit.movie.title, "Kaanekkaane");
  const profile = engine.newProfile();
  engine.setGenres(profile, ["Drama"]);
  assert.ok(engine.candidates(profile).some((m) => m.id === "w-q3438002"));
});

console.log("\nlookup: normalisation helpers");
it("genres are read out of the film's own description", () => {
  assert.deepStrictEqual(
    lookup.genresFromExtract("Oppenheimer is a 2023 epic biographical thriller film directed by Christopher Nolan."),
    ["Biography", "Thriller"]
  );
  assert.deepStrictEqual(
    lookup.genresFromExtract("Kantara is a 2022 Indian Kannada-language action drama film written and directed by Rishab Shetty."),
    ["Action", "Drama"]
  );
  assert.deepStrictEqual(
    lookup.genresFromExtract("Parasite is a 2019 South Korean black comedy thriller film directed by Bong Joon-ho."),
    ["Comedy", "Thriller"]
  );
});

it("only real genres come back (no invented ones)", () => {
  for (const g of lookup.genresFromExtract("A 2011 Indian Hindi-language epic musical drama film.")) {
    assert.ok(ALL_GENRES.includes(g), "unknown genre " + g);
  }
});

it("a person's page is not mistaken for a film", () => {
  assert.strictEqual(lookup.looksLikeFilm("Joshua Oppenheimer is an American and British film director based in Copenhagen."), false);
  assert.strictEqual(lookup.looksLikeFilm("Red Dead Redemption is a 2010 action-adventure game developed by Rockstar San Diego."), false);
  assert.strictEqual(lookup.looksLikeFilm("Sairat is a 2016 Indian Marathi-language social romantic tragedy film."), true);
});

it("lookup refuses to register a malformed film", () => {
  assert.strictEqual(lookup.sanitize({ id: "bad-id", title: "X" }), null);
  assert.strictEqual(lookup.sanitize({ id: "w-q1", title: "" }), null);
  assert.ok(lookup.sanitize({ id: "w-q1", title: "Ok", genres: ["NotAGenre"], industry: "NOPE" }));
});

console.log(`\n${pass} assertions passed${process.exitCode ? " — WITH FAILURES" : ", all green"}\n`);
