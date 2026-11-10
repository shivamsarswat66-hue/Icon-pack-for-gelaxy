/* =========================================================
   CineMatch — client
   ========================================================= */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const TOKEN_KEY = "cinematch.token";
  let token = localStorage.getItem(TOKEN_KEY) || "";
  let state = null;
  let catalogue = { genres: [], industries: [] };

  /* ---------------- api ---------------- */
  async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      /* ignore */
    }
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      token = "";
      showSignup();
      throw new Error("Session expired");
    }
    if (!res.ok) throw new Error((data && data.error) || "Request failed");
    return data;
  }

  /* ---------------- toast ---------------- */
  function toast(message, kind = "ok") {
    const wrap = $("#toasts");
    const el = document.createElement("div");
    el.className = `toast ${kind === "warn" ? "warn" : ""}`;
    el.innerHTML = `<svg class="ic"><use href="#i-${kind === "warn" ? "spark" : "check"}"/></svg><span></span>`;
    $("span", el).textContent = message;
    wrap.appendChild(el);
    while (wrap.children.length > 2) wrap.firstElementChild.remove();
    setTimeout(() => {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
      setTimeout(() => el.remove(), 320);
    }, 2400);
  }

  /* ---------------- poster art ---------------- */
  const PALETTES = [
    ["#ff4d6d", "#7b1f3a"],
    ["#ffb35c", "#8a4b1f"],
    ["#8b6bff", "#2b1a5e"],
    ["#3ddc97", "#0f4034"],
    ["#4facfe", "#0b2a4a"],
    ["#f76b1c", "#5c1f1f"],
    ["#b24592", "#2b1233"],
    ["#12c2e9", "#151539"],
    ["#e0c341", "#4a3a0f"],
    ["#8d7f9e", "#221d2b"],
  ];

  const SHAPES = [
    `<circle cx="50" cy="62" r="34" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.4"/>
     <circle cx="50" cy="62" r="20" fill="#fff" fill-opacity=".06"/>`,
    `<path d="M-20 130L60 -10M10 160L90 20M40 190L120 50" stroke="#fff" stroke-opacity=".1" stroke-width="9"/>`,
    `<circle cx="50" cy="75" r="14" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.2"/>
     <circle cx="50" cy="75" r="28" fill="none" stroke="#fff" stroke-opacity=".15" stroke-width="1.2"/>
     <circle cx="50" cy="75" r="44" fill="none" stroke="#fff" stroke-opacity=".09" stroke-width="1.2"/>`,
    `<path d="M50 18L92 118H8z" fill="#fff" fill-opacity=".07" stroke="#fff" stroke-opacity=".16" stroke-width="1.2"/>`,
    `<path d="M0 40H100M0 70H100M0 100H100M25 0V150M50 0V150M75 0V150" stroke="#fff" stroke-opacity=".07" stroke-width="1"/>`,
    `<path d="M50 75L-10 -30M50 75L40 -30M50 75L85 -25M50 75L115 10M50 75L120 60M50 75L125 110M50 75L100 150M50 75L55 160M50 75L-10 160M50 75L-25 110M50 75L-25 50" stroke="#fff" stroke-opacity=".11" stroke-width="1.4"/>`,
    `<path d="M-10 150Q50 60 110 150" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>
     <path d="M-10 162Q50 82 110 162" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="2"/>`,
    `<rect x="22" y="34" width="56" height="82" rx="4" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.3" transform="rotate(-8 50 75)"/>
     <rect x="30" y="40" width="56" height="82" rx="4" fill="#fff" fill-opacity=".05" transform="rotate(6 50 75)"/>`,
  ];

  function hashOf(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 100000;
    return h;
  }

  function artFor(movie) {
    const h = hashOf(movie.id);
    const [c1, c2] = PALETTES[h % PALETTES.length];
    const shape = SHAPES[(h >> 3) % SHAPES.length];
    return {
      bg: `linear-gradient(165deg, ${c1} 0%, ${c2} 62%, #08080d 100%)`,
      shape: `<svg class="poster-shape" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">${shape}</svg>`,
    };
  }

  function posterHTML(movie) {
    const art = artFor(movie);
    return `<div class="poster" style="background:${art.bg}">
      ${art.shape}
      <div class="poster-type">${esc(movie.title)}</div>
      <div class="poster-year">${movie.year}</div>
    </div>`;
  }

  function miniPoster(movie, cls = "") {
    const art = artFor(movie);
    return `<div class="${cls} mini" style="background:${art.bg}"><span>${esc(movie.title.charAt(0))}</span></div>`;
  }

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // One or two sentences of synopsis, trimmed so it fits a card neatly.
  function brief(text, max = 118) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(", "));
    return (stop > 60 ? cut.slice(0, stop) : cut).replace(/[\s,;:]+$/, "") + "…";
  }

  const runtime = (m) => (m && m.runtime ? `${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m` : "");

  /* =========================================================
     ONBOARDING
     ========================================================= */
  const onboarding = {
    step: "signup",
    genres: new Set(),
    industries: new Set(),
    chosen: new Map(), // id -> { movie, query, confidence }
    unresolved: [],
    questions: [],
    qIndex: 0,
    answers: [],
    retune: false,
  };

  const ONB_STEPS = ["genres", "movies", "confirm", "questions"];

  function setStep(name) {
    onboarding.step = name;
    const toasts = $("#toasts");
    if (toasts) toasts.innerHTML = "";
    $$(".onb-step").forEach((s) => {
      s.hidden = s.dataset.step !== name;
    });
    const idx = ONB_STEPS.indexOf(name);
    $("#steps").innerHTML = ONB_STEPS.map(
      (_, i) => `<i class="${i <= idx ? "on" : ""}"></i>`
    ).join("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showSignup() {
    $("#app").hidden = true;
    $("#onboarding").hidden = false;
    setStep("signup");
    $("#steps").innerHTML = "";
  }

  function showApp() {
    $("#onboarding").hidden = true;
    $("#app").hidden = false;
    window.scrollTo({ top: 0 });
  }

  /* ---------------- signup ---------------- */
  $("#signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#nameInput").value.trim();
    const email = $("#emailInput").value.trim();
    const err = $("#signupError");
    err.hidden = true;
    if (!name) {
      err.textContent = "We need a name to personalise your list.";
      err.hidden = false;
      $("#nameInput").focus();
      return;
    }
    const btn = $("#signupBtn");
    btn.disabled = true;
    btn.textContent = "Creating your profile…";
    try {
      const { token: t, state: st } = await api("/signup", { method: "POST", body: { name, email } });
      token = t;
      localStorage.setItem(TOKEN_KEY, t);
      state = st;
      $("#avatarLetter").textContent = name.charAt(0).toUpperCase();
      setStep("genres");
      buildChips();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
      btn.innerHTML = `Start matching <svg class="ic"><use href="#i-arrow"/></svg>`;
    }
  });

  /* ---------------- genres ---------------- */
  function buildChips() {
    $("#genreChips").innerHTML = catalogue.genres
      .map(
        (g) =>
          `<button class="chip" type="button" data-genre="${esc(g)}" aria-pressed="false">
             <svg class="ic tick"><use href="#i-check"/></svg>${esc(g)}</button>`
      )
      .join("");
    $("#industryChips").innerHTML = catalogue.industries
      .map(
        (i) =>
          `<button class="chip" type="button" data-industry="${esc(i.code)}" aria-pressed="false">
             <svg class="ic tick"><use href="#i-check"/></svg>${esc(i.name)}</button>`
      )
      .join("");
  }

  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-genre]");
    if (g) {
      const name = g.dataset.genre;
      const on = g.getAttribute("aria-pressed") === "true";
      g.setAttribute("aria-pressed", String(!on));
      on ? onboarding.genres.delete(name) : onboarding.genres.add(name);
      $("#genreCount").textContent = `${onboarding.genres.size} selected`;
      updateGenreCta();
      return;
    }
    const ind = e.target.closest("[data-industry]");
    if (ind) {
      const code = ind.dataset.industry;
      const on = ind.getAttribute("aria-pressed") === "true";
      ind.setAttribute("aria-pressed", String(!on));
      on ? onboarding.industries.delete(code) : onboarding.industries.add(code);
      updateGenreCta();
    }
  });

  function updateGenreCta() {
    const n = onboarding.genres.size;
    const btn = $("#genresNext");
    if (!btn) return;
    btn.innerHTML =
      n > 0
        ? `Continue with ${n} genre${n > 1 ? "s" : ""} <svg class="ic"><use href="#i-arrow"/></svg>`
        : `Continue <svg class="ic"><use href="#i-arrow"/></svg>`;
  }

  async function submitGenres(goNext = true) {
    try {
      const { state: st } = await api("/genres", {
        method: "POST",
        body: { genres: [...onboarding.genres], industries: [...onboarding.industries] },
      });
      state = st;
      if (goNext) {
        setStep("movies");
        renderChosen();
        loadQuickPicks();
        setTimeout(() => $("#movieInput").focus(), 260);
      }
    } catch (err) {
      toast(err.message, "warn");
    }
  }

  $("#genresNext").addEventListener("click", () => submitGenres(true));
  $("#genresSkip").addEventListener("click", () => {
    onboarding.genres.clear();
    onboarding.industries.clear();
    $$(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
    $("#genreCount").textContent = "0 selected";
    updateGenreCta();
    submitGenres(true);
  });

  /* ---------------- movie entry ---------------- */
  const input = $("#movieInput");
  const sugg = $("#suggestions");
  let searchSeq = 0;
  let sugItems = [];
  let sugActive = -1;
  let searchTimer = null;

  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      hideSuggestions();
      return;
    }
    searchTimer = setTimeout(() => runSearch(q), 130);
  });

  async function runSearch(q) {
    if (q !== input.value.trim()) return;
    const seq = ++searchSeq;
    try {
      const { results } = await api(`/search?q=${encodeURIComponent(q)}`);
      if (seq !== searchSeq) return;
      sugItems = results || [];
      sugActive = sugItems.length ? 0 : -1;
      renderSuggestions(q);
    } catch (_) {
      /* offline is fine, Enter still resolves */
    }
  }

  function renderSuggestions(q) {
    if (!sugItems.length) {
      sugg.innerHTML = `<div class="sug-none">No match for “${esc(q)}”. Try another title, or check the spelling.</div>`;
      sugg.hidden = false;
      return;
    }
    sugg.innerHTML = sugItems
      .map((m, i) => {
        const corrected = m.score < 0.995;
        return `<button class="sug" type="button" role="option" data-sug="${i}" aria-selected="${i === sugActive}">
          ${miniPoster(m, "sug-thumb")}
          <span class="sug-body">
            <span class="sug-title">${esc(m.title)}${corrected ? `<em>spelling fixed</em>` : ""}</span>
            <span class="sug-meta">${m.year} · ${esc(m.genres.slice(0, 2).join(" / "))} · ${m.industryName}</span>
          </span>
        </button>`;
      })
      .join("");
    sugg.hidden = false;
  }

  function hideSuggestions() {
    sugg.hidden = true;
    sugg.innerHTML = "";
    sugItems = [];
    sugActive = -1;
  }

  input.addEventListener("keydown", (e) => {
    const text = input.value.trim();
    if (e.key === "Escape") return hideSuggestions();
    if (e.key === "Enter") {
      e.preventDefault();
      if (!text) return;
      clearTimeout(searchTimer);
      searchSeq++;
      if (!sugg.hidden && sugActive >= 0 && sugItems[sugActive]) {
        addMovieObj(sugItems[sugActive], text);
      } else {
        addRaw(text);
      }
      return;
    }
    if (sugg.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!sugItems.length) return;
      sugActive = (sugActive + (e.key === "ArrowDown" ? 1 : -1) + sugItems.length) % sugItems.length;
      $$(".sug", sugg).forEach((el, i) => el.setAttribute("aria-selected", String(i === sugActive)));
    }
  });

  sugg.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-sug]");
    if (!btn) return;
    const m = sugItems[Number(btn.dataset.sug)];
    if (m) addMovieObj(m, input.value.trim());
  });

  $("#addMovieBtn").addEventListener("click", () => {
    if (sugActive >= 0 && sugItems[sugActive] && input.value.trim().length >= 2) {
      addMovieObj(sugItems[sugActive], input.value.trim());
    } else if (input.value.trim()) {
      addRaw(input.value.trim());
    }
  });

  function addMovieObj(movie, typed) {
    clearTimeout(searchTimer);
    searchSeq++;
    if (onboarding.chosen.has(movie.id)) {
      toast(`${movie.title} is already on your list`, "warn");
      input.value = "";
      hideSuggestions();
      return;
    }
    const corrected = typed && typed.toLowerCase().replace(/[^a-z0-9]/g, "") !== movie.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    onboarding.chosen.set(movie.id, {
      movie,
      query: typed || movie.title,
      confidence: corrected ? "corrected" : "exact",
    });
    if (corrected) toast(`Fixed spelling → ${movie.title}`);
    input.value = "";
    hideSuggestions();
    renderChosen();
    loadQuickPicks();
    input.focus();
  }

  async function addRaw(text) {
    if (!text) return;
    clearTimeout(searchTimer);
    searchSeq++;
    hideSuggestions();
    if (text.includes(",")) {
      // paste-multi support
      try {
        const { results } = await api("/resolve", { method: "POST", body: { text } });
        let added = 0;
        for (const r of results) {
          if (r.movie && r.confidence !== "none") {
            if (!onboarding.chosen.has(r.movie.id)) {
              onboarding.chosen.set(r.movie.id, {
                movie: r.movie,
                query: r.query,
                confidence: r.confidence,
              });
              added++;
            }
          } else if (r.query) {
            onboarding.unresolved.push(r.query);
          }
        }
        input.value = "";
        hideSuggestions();
        renderChosen();
        loadQuickPicks();
        toast(added ? `${added} film${added > 1 ? "s" : ""} added` : "We could not place those titles", added ? "ok" : "warn");
      } catch (err) {
        toast(err.message, "warn");
      }
      return;
    }
    // single title
    try {
      const { results } = await api("/resolve", { method: "POST", body: { text } });
      const r = results && results[0];
      if (r && r.movie && (r.confidence === "exact" || r.confidence === "corrected")) {
        addMovieObj(r.movie, text);
        return;
      }
      const { results: near } = await api(`/search?q=${encodeURIComponent(text)}`);
      if (near && near.length && near[0].score >= 0.58) {
        sugItems = near;
        sugActive = 0;
        renderSuggestions(text);
        toast(`Not sure about “${text}” — pick the closest match below`, "warn");
      } else {
        onboarding.unresolved.push(text);
        input.value = "";
        hideSuggestions();
        renderChosen();
        toast(`“${text}” isn't in our catalogue yet — we'll skip it`, "warn");
      }
    } catch (err) {
      toast(err.message, "warn");
    }
  }

  function renderChosen() {
    const list = $("#chosenList");
    const items = [...onboarding.chosen.values()];
    list.innerHTML = items
      .map(
        ({ movie, query, confidence }) => `
        <div class="chosen-chip">
          ${miniPoster(movie, "mini")}
          <div class="chosen-body">
            <div class="chosen-title">${esc(movie.title)}</div>
            ${confidence === "corrected" ? `<div class="chosen-fix">corrected from “${esc(query)}”</div>` : `<div class="chosen-fix" style="color:var(--muted)">${movie.year}</div>`}
          </div>
          <button class="chosen-x" type="button" data-remove-chosen="${esc(movie.id)}" aria-label="Remove ${esc(movie.title)}">
            <svg class="ic"><use href="#i-x"/></svg>
          </button>
        </div>`
      )
      .join("");
    const n = items.length;
    $("#moviesNext").disabled = n === 0;
    $("#moviesNext").innerHTML =
      n > 0
        ? `Continue with ${n} film${n > 1 ? "s" : ""} <svg class="ic"><use href="#i-arrow"/></svg>`
        : `Continue <svg class="ic"><use href="#i-arrow"/></svg>`;
  }

  document.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-remove-chosen]");
    if (rm) {
      onboarding.chosen.delete(rm.dataset.removeChosen);
      renderChosen();
      loadQuickPicks();
    }
  });

  async function loadQuickPicks() {
    try {
      const excluded = new Set(onboarding.chosen.keys());
      const { picks } = await api("/quickpicks");
      const avail = (picks || []).filter((m) => !excluded.has(m.id)).slice(0, 6);
      $("#quickPicks").innerHTML = avail.length
        ? `<h3>Popular with your genres</h3><div class="quickpick-row">${avail
            .map((m) => `<button class="quickpick" type="button" data-quick='${esc(JSON.stringify({ id: m.id, t: m.title }))}'>+ ${esc(m.title)}</button>`)
            .join("")}</div>`
        : "";
    } catch (_) {
      /* ignore */
    }
  }

  document.addEventListener("click", (e) => {
    const q = e.target.closest("[data-quick]");
    if (!q) return;
    try {
      const { t } = JSON.parse(q.dataset.quick);
      addRaw(t);
    } catch (_) {}
  });

  input.addEventListener("blur", () => setTimeout(hideSuggestions, 160));

  $("#moviesNext").addEventListener("click", async () => {
    await saveLikes();
    setStep("confirm");
    renderConfirm();
  });

  $("#moviesSkip").addEventListener("click", async () => {
    await saveLikes();
    startQuestions();
  });

  async function saveLikes() {
    const ids = [...onboarding.chosen.keys()];
    const titles = [
      ...[...onboarding.chosen.values()].map((c) => c.movie.title),
      ...onboarding.unresolved,
    ];
    try {
      const { state: st } = await api("/likes", {
        method: "POST",
        body: { movieIds: ids, titles },
      });
      state = st;
    } catch (err) {
      toast(err.message, "warn");
    }
  }

  /* ---------------- confirm ---------------- */
  function renderConfirm() {
    const liked = state.liked || [];
    const listEl = $("#confirmList");
    listEl.innerHTML = liked
      .map((m) => {
        const c = onboarding.chosen.get(m.id);
        const conf = c ? c.confidence : "exact";
        const tag =
          conf === "corrected"
            ? `<span class="tag tag-fix">spelling corrected</span>`
            : conf === "weak"
            ? `<span class="tag tag-loose">close match</span>`
            : `<span class="tag tag-ok">exact match</span>`;
        return `<div class="confirm-row">
          ${miniPoster(m, "mini")}
          <div class="confirm-body">
            <div class="confirm-title">${esc(m.title)}${tag}</div>
            <div class="confirm-meta">${m.year} · ${esc(m.genres.slice(0, 3).join(" / "))} · ${esc(m.industryName)} · ★ ${m.rating}</div>
          </div>
          <button class="chosen-x" type="button" data-unlike="${esc(m.id)}" aria-label="Remove ${esc(m.title)}">
            <svg class="ic"><use href="#i-x"/></svg>
          </button>
        </div>`;
      })
      .join("");

    if (!liked.length) {
      listEl.innerHTML = `<div class="confirm-missing" style="margin:0">
        <h3>No films matched yet</h3>
        <p class="muted small">That's fine — we'll lean on the genres you picked.</p>
      </div>`;
    }

    const missing = onboarding.unresolved.length
      ? onboarding.unresolved
      : (state.likedRaw || []).filter((t) => !liked.some((m) => m.title === t)).slice(0, 0);
    const missEl = $("#confirmMissing");
    if (missing.length) {
      missEl.hidden = false;
      missEl.innerHTML = `<h3>Not in our catalogue (skipped)</h3>
        <div class="miss-row">${missing.map((t) => `<span class="miss-chip">${esc(t)}</span>`).join("")}</div>`;
    } else missEl.hidden = true;

    $("#confirmYes").innerHTML = liked.length
      ? `Yes, these are the ones <svg class="ic"><use href="#i-check"/></svg>`
      : `Skip to questions <svg class="ic"><use href="#i-arrow"/></svg>`;
  }

  document.addEventListener("click", async (e) => {
    const un = e.target.closest("[data-unlike]");
    if (!un) return;
    try {
      const { state: st } = await api("/likes/remove", { method: "POST", body: { movieId: un.dataset.unlike } });
      state = st;
      onboarding.chosen.delete(un.dataset.unlike);
      renderConfirm();
    } catch (err) {
      toast(err.message, "warn");
    }
  });

  $("#confirmBack").addEventListener("click", () => {
    setStep("movies");
    renderChosen();
    loadQuickPicks();
  });

  $("#confirmYes").addEventListener("click", () => startQuestions());

  /* ---------------- questions ---------------- */
  async function startQuestions(retune = false) {
    onboarding.retune = retune;
    setStep("questions");
    $("#qWrap").innerHTML = `<div class="q-card"><div class="q-poster skeleton"></div><div class="q-info"><div class="skeleton" style="height:18px;width:60%;margin-bottom:10px"></div><div class="skeleton" style="height:12px;width:40%;margin-bottom:14px"></div><div class="skeleton" style="height:60px"></div></div></div>`;
    try {
      const { questions } = await api("/questions?n=8");
      onboarding.questions = questions || [];
      onboarding.qIndex = 0;
      onboarding.answers = [];
      if (!onboarding.questions.length) {
        await finishQuestions();
        return;
      }
      renderQuestion();
    } catch (err) {
      toast(err.message, "warn");
      await finishQuestions();
    }
  }

  function renderQuestion() {
    const q = onboarding.questions[onboarding.qIndex];
    const total = onboarding.questions.length;
    const idx = onboarding.qIndex;
    $("#qProgressBar").style.width = `${(idx / total) * 100}%`;
    $("#qCount").textContent = `${idx + 1} of ${total}`;

    if (!q) return finishQuestions();
    const art = artFor(q);
    $("#qWrap").innerHTML = `
      <article class="q-card" data-qid="${esc(q.id)}">
        <div class="q-poster" style="background:${art.bg}">
          ${art.shape}
          <div class="q-poster-text">${esc(q.title)}</div>
        </div>
        <div class="q-info">
          <div class="q-kicker">Probe ${idx + 1} of ${total} · ${esc(q.genres[0])}</div>
          <h2 class="q-title">${esc(q.title)}</h2>
          <div class="q-meta">
            <span>${q.year}</span>
            <span>${esc(q.genres.slice(0, 2).join(" / "))}</span>
            <span>${runtime(q)}</span>
            <span>★ ${q.rating}</span>
          </div>
          <p class="q-syn">${esc(q.synopsis)}</p>
        </div>
        <div class="q-actions">
          <button class="btn btn-yes" type="button" data-answer="yes"><svg class="ic"><use href="#i-check"/></svg> Yes, I'd watch</button>
          <button class="btn btn-no" type="button" data-answer="no"><svg class="ic"><use href="#i-x"/></svg> No</button>
        </div>
        <div class="q-skip"><button type="button" data-answer="skip">Not sure — skip this one</button></div>
      </article>`;
  }

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-answer]");
    if (!b) return;
    const card = b.closest(".q-card");
    const q = onboarding.questions[onboarding.qIndex];
    if (!q) return;
    const kind = b.dataset.answer;
    if (kind !== "skip") onboarding.answers.push({ id: q.id, yes: kind === "yes" });
    else onboarding.answers.push({ id: q.id, yes: null });

    card.style.transition = "opacity .18s, transform .18s";
    card.style.opacity = "0";
    card.style.transform = kind === "yes" ? "translateX(28px)" : kind === "no" ? "translateX(-28px)" : "translateY(12px)";
    onboarding.qIndex++;
    setTimeout(() => {
      if (onboarding.qIndex >= onboarding.questions.length) finishQuestions();
      else renderQuestion();
    }, 170);
  });

  $("#qSkipAll").addEventListener("click", () => finishQuestions());

  async function finishQuestions() {
    $("#qWrap").innerHTML = "";
    try {
      if (onboarding.answers.length) {
        const { state: st } = await api("/answers", {
          method: "POST",
          body: { answers: onboarding.answers },
        });
        state = st;
      }
    } catch (err) {
      toast(err.message, "warn");
    }
    if (onboarding.retune) {
      onboarding.retune = false;
      showApp();
      setTab("for-you");
      await loadRecommendations(true);
      renderAll();
      toast("Shortlist re-ranked with your new answers");
    } else {
      runBuildAnimation();
    }
  }

  /* ---------------- build ---------------- */
  const BUILD_LINES = [
    ["Reading your taste…", "Weighing genres against the films you love"],
    ["Cross-checking 150 films…", "Matching tone, era and keywords"],
    ["Balancing the shortlist…", "Keeping it varied, not 60 copies of one film"],
    ["Almost there…", "Cutting anything you have already seen"],
  ];

  function runBuildAnimation() {
    setStep("build");
    let i = 0;
    const tick = () => {
      $("#buildTitle").textContent = BUILD_LINES[i][0];
      $("#buildLine").textContent = BUILD_LINES[i][1];
      i++;
      if (i < BUILD_LINES.length) setTimeout(tick, 620);
      else setTimeout(finishBuild, 700);
    };
    tick();
  }

  async function finishBuild() {
    await loadRecommendations(true);
    showApp();
    renderAll();
  }

  /* =========================================================
     APP
     ========================================================= */
  let recPool = [];
  let recOffset = 0;
  let shown = 60;
  let activeFilter = "All";
  let sortMode = "match";
  let activeTab = "for-you";

  async function loadRecommendations(reset = false) {
    try {
      if (reset) recOffset = 0;
      const { recommendations } = await api(`/recommendations?limit=120&offset=${recOffset}`);
      // de-dupe against what we already hold
      const seen = new Set(recPool.map((m) => m.id));
      const fresh = (recommendations || []).filter((m) => reset || !seen.has(m.id));
      recPool = reset ? recommendations || [] : [...recPool, ...fresh];
    } catch (err) {
      toast(err.message, "warn");
    }
  }

  function renderAll() {
    if (!state) return;
    $("#avatarLetter").textContent = (state.user.name || "A").charAt(0).toUpperCase();
    $("#helloTitle").textContent = `${state.user.name.split(" ")[0]}, your shortlist is ready`;
    $("#helloSub").textContent = `${recPool.length} films matched from ${state.catalogueSize} — ranked by how you actually watch.`;

    // taste strip
    const s = state.summary;
    const pills = [];
    if (s.genres.length)
      pills.push(`<span class="taste-pill">${s.genres.slice(0, 3).map((g) => g.name).join(" · ")}</span>`);
    if (s.industries.length)
      pills.push(`<span class="taste-pill alt">${s.industries.slice(0, 2).map((i) => i.name).join(" · ")}</span>`);
    if (s.counts.liked) pills.push(`<span class="taste-pill alt">Seeded from ${s.counts.liked} loved film${s.counts.liked > 1 ? "s" : ""}</span>`);
    if (s.counts.answers) pills.push(`<span class="taste-pill alt">${s.counts.answers} answers learned</span>`);
    $("#tasteStrip").innerHTML = pills.join("");

    renderFilters();
    renderGrid();
    renderBadges();
    renderDrawer();
    renderListTabs();
  }

  function renderBadges() {
    const wl = (state.watchlist || []).length;
    const wt = (state.watched || []).length;
    $("#badgeWatchlist").textContent = wl;
    $("#badgeWatched").textContent = wt;
    $("#dotWatchlist").hidden = wl === 0;
  }

  function renderFilters() {
    const names = state.summary.genres.map((g) => g.name).slice(0, 7);
    const chips = ["All", ...names];
    $("#filterChips").innerHTML = chips
      .map(
        (g) =>
          `<button class="fchip ${g === activeFilter ? "is-active" : ""}" type="button" data-filter="${esc(g)}">${esc(g)}</button>`
      )
      .join("");
  }

  function currentRecs() {
    let list = recPool.filter((m) => activeFilter === "All" || m.genres.includes(activeFilter));
    const cmp = {
      match: (a, b) => b.match - a.match,
      rating: (a, b) => b.rating - a.rating,
      year: (a, b) => b.year - a.year,
      runtime: (a, b) => a.runtime - b.runtime,
    }[sortMode];
    return [...list].sort(cmp);
  }

  function renderGrid() {
    const grid = $("#grid");
    const list = currentRecs().slice(0, shown);
    const empty = $("#emptyState");
    if (!list.length) {
      grid.innerHTML = "";
      empty.hidden = false;
      empty.innerHTML = `<svg class="ic big"><use href="#i-spark"/></svg>
        <h3>No ${esc(activeFilter === "All" ? "" : activeFilter + " ")}films left in this view</h3>
        <p class="muted">Try another filter, or answer a few more questions so we can dig deeper.</p>`;
      $("#loadMoreBtn").hidden = true;
      return;
    }
    empty.hidden = true;
    grid.innerHTML = list.map((m) => cardHTML(m, "foryou")).join("");
    const total = currentRecs().length;
    $("#helloSub").textContent = `${list.length} of ${total} picks · shortlisted from ${state.catalogueSize} films · ranked by how you watch`;
    $("#loadMoreBtn").hidden = shown >= currentRecs().length;
  }

  function cardHTML(m, ctx) {
    const inWatched = ctx === "watched";
    const inWatchlist = ctx === "watchlist";
    const acts = inWatched
      ? `<button class="act is-on" type="button" data-act="watched" data-id="${esc(m.id)}" title="Already watched" aria-label="Watched">
           <svg class="ic"><use href="#i-eye"/></svg></button>
         <button class="act act-wl" type="button" data-act="watchlist" data-id="${esc(m.id)}" title="Add to watchlist" aria-label="Add to watchlist">
           <svg class="ic"><use href="#i-bookmark"/></svg></button>
         <button class="act act-no" type="button" data-act="clear" data-id="${esc(m.id)}" title="Remove" aria-label="Remove">
           <svg class="ic"><use href="#i-x"/></svg></button>`
      : inWatchlist
      ? `<button class="act" type="button" data-act="watched" data-id="${esc(m.id)}" title="Mark as watched" aria-label="Mark as watched">
           <svg class="ic"><use href="#i-check"/></svg></button>
         <button class="act is-on act-wl" type="button" data-act="watchlist" data-id="${esc(m.id)}" title="In watchlist" aria-label="In watchlist">
           <svg class="ic"><use href="#i-bookmark"/></svg></button>
         <button class="act act-no" type="button" data-act="dislike" data-id="${esc(m.id)}" title="Not interested" aria-label="Not interested">
           <svg class="ic"><use href="#i-x"/></svg></button>`
      : `<button class="act" type="button" data-act="watched" data-id="${esc(m.id)}" title="I have watched this" aria-label="I have watched this">
           <svg class="ic"><use href="#i-eye"/></svg></button>
         <button class="act act-wl" type="button" data-act="watchlist" data-id="${esc(m.id)}" title="Add to watchlist" aria-label="Add to watchlist">
           <svg class="ic"><use href="#i-bookmark"/></svg></button>
         <button class="act act-no" type="button" data-act="dislike" data-id="${esc(m.id)}" title="Not for me" aria-label="Not for me">
           <svg class="ic"><use href="#i-x"/></svg></button>`;

    return `<article class="movie-card" data-card="${esc(m.id)}">
      <button class="poster-btn" type="button" data-open="${esc(m.id)}" aria-label="Open details for ${esc(m.title)}">
        ${posterHTML(m)}
        ${m.match ? `<span class="match-pill"><b>${m.match}%</b> match</span>` : ""}
      </button>
      <div class="card-body">
        <h3 class="card-title">${esc(m.title)}</h3>
        <div class="card-meta"><svg class="ic"><use href="#i-star"/></svg><span>${m.rating}</span><span>${m.year}</span><span>${runtime(m)}</span></div>
        <p class="card-desc">${esc(brief(m.synopsis))}</p>
        ${
          m.reasons
            ? `<div class="card-why"><svg class="ic"><use href="#i-spark"/></svg><span>${esc(m.reasons[0])}</span></div>`
            : ""
        }
        <div class="card-actions">${acts}</div>
      </div>
    </article>`;
  }

  function renderListTabs() {
    const wl = state.watchlist || [];
    const w = state.watched || [];
    const wlGrid = $("#watchlistGrid");
    const wGrid = $("#watchedGrid");
    wlGrid.innerHTML = wl.map((m) => cardHTML(m, "watchlist")).join("");
    wGrid.innerHTML = w.map((m) => cardHTML(m, "watched")).join("");
    $("#watchlistEmpty").hidden = wl.length > 0;
    $("#watchedEmpty").hidden = w.length > 0;
  }

  /* ---------------- tabs ---------------- */
  function setTab(tab) {
    activeTab = tab;
    $$(".tab-panel").forEach((p) => (p.hidden = p.dataset.panel !== tab));
    $$(".nav-item, .tab[data-tab]").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-tab]");
    if (nav) setTab(nav.dataset.tab);
  });

  /* ---------------- card actions ---------------- */
  document.addEventListener("click", async (e) => {
    const open = e.target.closest("[data-open]");
    if (open) return openModal(open.dataset.open);

    const act = e.target.closest("[data-act]");
    if (!act) return;
    const id = act.dataset.id;
    const action = act.dataset.act;
    const card = act.closest(".movie-card");
    act.disabled = true;
    try {
      const { state: st } = await api("/feedback", { method: "POST", body: { movieId: id, action } });
      state = st;
      const label = { watched: "Marked as watched", watchlist: "Added to watchlist", dislike: "Noted — fewer like this", clear: "Removed" }[action];

      // pull the card out of "For you" (it is now excluded server-side)
      if (activeTab === "for-you" && action !== "clear") {
        card.style.transition = "opacity .22s, transform .22s";
        card.style.opacity = "0";
        card.style.transform = "scale(.96)";
        setTimeout(async () => {
          card.remove();
          recPool = recPool.filter((m) => m.id !== id);
          await refillOne();
          renderGrid();
        }, 220);
      } else if (activeTab !== "for-you") {
        renderListTabs();
        renderGrid();
      }
      renderBadges();
      renderDrawer();
      toast(label);
    } catch (err) {
      toast(err.message, "warn");
    } finally {
      act.disabled = false;
    }
  });

  async function refillOne() {
    const { recommendations } = await api(`/recommendations?limit=120&offset=0`);
    const have = new Set(recPool.map((m) => m.id));
    const next = (recommendations || []).find((m) => !have.has(m.id));
    if (next) recPool.push(next);
  }

  /* ---------------- filters & sort ---------------- */
  document.addEventListener("click", (e) => {
    const f = e.target.closest("[data-filter]");
    if (!f) return;
    activeFilter = f.dataset.filter;
    shown = 60;
    renderFilters();
    renderGrid();
  });
  $("#sortSelect").addEventListener("change", (e) => {
    sortMode = e.target.value;
    renderGrid();
  });
  $("#loadMoreBtn").addEventListener("click", () => {
    shown += 24;
    renderGrid();
  });

  $("#refreshBtn").addEventListener("click", async () => {
    const btn = $("#refreshBtn");
    btn.disabled = true;
    recOffset = (recOffset + 24) % 96;
    recPool = [];
    await loadRecommendations(false);
    renderAll();
    btn.disabled = false;
    toast("Fresh picks, same taste");
  });

  /* ---------------- modal ---------------- */
  function openModal(id) {
    const m = recPool.find((x) => x.id === id) || (state.watchlist || []).find((x) => x.id === id) || (state.watched || []).find((x) => x.id === id);
    if (!m) return;
    const art = artFor(m);
    const inList = (state.watchlist || []).some((x) => x.id === id);
    const seen = (state.watched || []).some((x) => x.id === id);
    $("#modal").innerHTML = `
      <div class="modal-hero">
        <div class="modal-poster" style="background:${art.bg}">${art.shape}
          <div style="position:relative;z-index:4;display:grid;place-items:center;height:100%;padding:8px;text-align:center;font-weight:800;text-transform:uppercase;font-size:12px;line-height:1.1;color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.8)">${esc(m.title)}</div>
        </div>
        <div>
          <h2 class="modal-title" id="modalTitle">${esc(m.title)}</h2>
          <div class="modal-meta">
            <span class="tag tag-ok" style="margin:0">${m.match ? m.match + "% match" : "in your list"}</span>
            <span>${m.year}</span><span>${runtime(m)}</span><span>★ ${m.rating}</span>
          </div>
          <p class="modal-syn">${esc(m.synopsis)}</p>
          <div class="chip-row">${[...m.genres, m.industryName].map((g) => `<span class="mini-tag">${esc(g)}</span>`).join("")}</div>
        </div>
        <button class="icon-btn modal-close" type="button" data-close-modal aria-label="Close">
          <svg class="ic"><use href="#i-x"/></svg>
        </button>
      </div>
      <div class="modal-body">
        ${m.reasons && m.reasons.length ? `<div class="modal-why"><h4>Why this made your shortlist</h4><ul>${m.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}
        <p class="muted micro" style="margin-top:14px">Directed by ${esc(m.director || "—")} · ${esc(m.industryName)} · ${esc(m.genres.join(", "))}</p>
        <div class="modal-actions">
          <button class="btn ${seen ? "btn-yes" : "btn-soft"}" type="button" data-act="watched" data-id="${esc(m.id)}" data-close-after>
            <svg class="ic"><use href="#i-eye"/></svg> ${seen ? "Watched" : "I've watched this"}
          </button>
          <button class="btn ${inList ? "btn-yes" : "btn-soft"}" type="button" data-act="watchlist" data-id="${esc(m.id)}" data-close-after>
            <svg class="ic"><use href="#i-bookmark"/></svg> ${inList ? "In watchlist" : "Watch later"}
          </button>
          <button class="btn btn-soft" type="button" data-act="dislike" data-id="${esc(m.id)}" data-close-after>
            <svg class="ic"><use href="#i-x"/></svg> Not for me
          </button>
        </div>
      </div>`;
    $("#modalBackdrop").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    $("#modalBackdrop").hidden = true;
    document.body.style.overflow = "";
  }
  $("#modalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "modalBackdrop" || e.target.closest("[data-close-modal]") || e.target.closest("[data-close-after]")) closeModal();
  });

  /* ---------------- taste drawer ---------------- */
  function renderDrawer() {
    if (!state) return;
    const s = state.summary;
    const maxG = Math.max(1, ...s.genres.map((g) => g.weight));
    const bars = s.genres.length
      ? s.genres
          .map(
            (g) => `<div class="bar-row">
              <div class="bar-top"><span>${esc(g.name)}</span><span>${Math.round((g.weight / maxG) * 100)}%</span></div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.max(6, (g.weight / maxG) * 100)}%"></div></div>
            </div>`
          )
          .join("")
      : `<p class="muted small">No genre signal yet.</p>`;

    const kws = s.keywords.length
      ? `<div class="kw-cloud">${s.keywords.map((k) => `<span class="kw">${esc(k.name.replace(/-/g, " "))}</span>`).join("")}</div>`
      : `<p class="muted small">Answer a few questions and themes will appear here.</p>`;

    const avoid = s.avoided.length
      ? `<div class="avoid-row">${s.avoided.map((g) => `<span class="avoid">${esc(g.name)}</span>`).join("")}</div>`
      : `<p class="muted small">Nothing rejected yet.</p>`;

    const inds = s.industries.length
      ? s.industries.map((i) => `<span class="kw">${esc(i.name)}</span>`).join("")
      : `<span class="muted small">—</span>`;

    $("#drawerBody").innerHTML = `
      <div class="d-section">
        <h3>Signal summary</h3>
        <div class="stat-row">
          <div class="stat"><b>${s.counts.liked}</b><span>films you love</span></div>
          <div class="stat"><b>${s.counts.answers}</b><span>questions answered</span></div>
          <div class="stat"><b>${s.counts.watchlist}</b><span>saved to watch</span></div>
          <div class="stat"><b>${s.counts.watched}</b><span>marked watched</span></div>
        </div>
      </div>
      <div class="d-section"><h3>Genre weights</h3>${bars}</div>
      <div class="d-section"><h3>Themes you lean into</h3>${kws}</div>
      <div class="d-section"><h3>Industries</h3><div class="kw-cloud">${inds}</div></div>
      <div class="d-section"><h3>Leaning away from</h3>${avoid}</div>
      <div class="d-section"><h3>Films you seeded</h3>
        <div class="kw-cloud">${(state.liked || []).map((m) => `<span class="kw">${esc(m.title)}</span>`).join("") || '<span class="muted small">—</span>'}</div>
      </div>`;
  }

  function openDrawer() {
    renderDrawer();
    $("#drawerBackdrop").hidden = false;
    const d = $("#tasteDrawer");
    d.classList.add("is-open");
    d.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeDrawer() {
    $("#drawerBackdrop").hidden = true;
    const d = $("#tasteDrawer");
    d.classList.remove("is-open");
    d.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  $("#tasteBtn").addEventListener("click", openDrawer);
  $("#tasteTab").addEventListener("click", openDrawer);
  $("#drawerClose").addEventListener("click", closeDrawer);
  $("#drawerBackdrop").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDrawer();
      closeModal();
      hideSuggestions();
    }
  });

  $("#retuneBtn").addEventListener("click", () => {
    closeDrawer();
    $("#app").hidden = true;
    $("#onboarding").hidden = false;
    startQuestions(true);
  });

  $("#resetBtn").addEventListener("click", async () => {
    if (!confirm("Start over? This clears your liked films, answers and saved lists.")) return;
    try {
      const { state: st } = await api("/reset", { method: "POST", body: {} });
      state = st;
      recPool = [];
      onboarding.chosen.clear();
      onboarding.genres.clear();
      onboarding.industries.clear();
      onboarding.unresolved = [];
      closeDrawer();
      $("#onboarding").hidden = false;
      $("#app").hidden = true;
      buildChips();
      setStep("genres");
    } catch (err) {
      toast(err.message, "warn");
    }
  });

  /* ---------------- boot ---------------- */
  async function boot() {
    try {
      const cat = await api("/catalogue");
      catalogue = { genres: cat.genres, industries: cat.industries };
    } catch (_) {
      catalogue = { genres: [], industries: [] };
    }

    if (!token) return showSignup();

    try {
      const { state: st } = await api("/state");
      state = st;
      $("#avatarLetter").textContent = (st.user.name || "A").charAt(0).toUpperCase();
      const stage = st.user.stage;
      if (stage === "results" || st.user.onboarded) {
        await loadRecommendations(true);
        showApp();
        renderAll();
      } else if (stage === "questions") {
        $("#onboarding").hidden = false;
        startQuestions();
      } else if (stage === "movies") {
        $("#onboarding").hidden = false;
        buildChips();
        (st.liked || []).forEach((m) => onboarding.chosen.set(m.id, { movie: m, query: m.title, confidence: "exact" }));
        setStep("movies");
        renderChosen();
        loadQuickPicks();
      } else {
        $("#onboarding").hidden = false;
        buildChips();
        setStep("genres");
      }
    } catch (_) {
      showSignup();
    }
  }

  boot();
})();
