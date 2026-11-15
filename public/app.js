// TGB4100 Geologi-øving – frontend
const Q = window.QUESTIONS;
const TOPICS = [...new Set(Q.map(q => q.t))];
const QBYID = Object.fromEntries(Q.map(q => [q.id, q]));
const TF = ["Sant / True", "Usant / False"];
const GRADES = [["A", 89], ["B", 77], ["C", 65], ["D", 53], ["E", 41], ["F", 0]];
const RECENT = 15;        // antall siste svar per tema som teller i estimatet
const MIN_PER_TOPIC = 8;  // minst så mange svar per tema før estimatet regnes som sikkert
const MARGIN = 5;         // prosentpoeng sikkerhetsmargin over grensen før «klar»
const EXAM_LEN = 50;

let sb, user, profile = { target_grade: "C" }, answers = [], exams = [], view = "oversikt";
let tutorMsgs = [], tutorCtx = null;

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const opts = q => q.o === "TF" ? TF : q.o;
const gradeOf = p => GRADES.find(([, t]) => p >= t)[0];
const threshold = g => (GRADES.find(([x]) => x === g) || ["F", 0])[1];

// ---------- oppstart og innlogging ----------
(async function init() {
  let cfg;
  try { cfg = await (await fetch("/api/config")).json(); } catch (e) { cfg = {}; }
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    document.body.insertAdjacentHTML("beforeend", `<div class="wrap"><div class="card"><h1>Mangler oppsett</h1><p>Miljøvariablene <code>SUPABASE_URL</code> og <code>SUPABASE_ANON_KEY</code> er ikke satt i Vercel.</p></div></div>`);
    return;
  }
  sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  sb.auth.onAuthStateChange((_e, session) => setUser(session?.user || null));
  const { data } = await sb.auth.getSession();
  setUser(data.session?.user || null);
})();

async function setUser(u) {
  if (u && user && u.id === user.id) return;
  user = u;
  if (!user) {
    $("#auth").classList.remove("hidden");
    ["#nav", "#main", "#tutorFab", "#tutorPanel"].forEach(s => $(s).classList.add("hidden"));
    $("#who").innerHTML = "";
    return;
  }
  $("#auth").classList.add("hidden");
  ["#nav", "#main", "#tutorFab"].forEach(s => $(s).classList.remove("hidden"));
  $("#who").innerHTML = `<span>${esc(user.email)}</span><button id="logout">Logg ut</button>`;
  $("#logout").onclick = () => sb.auth.signOut();
  await loadData();
  renderTabs();
  show(view);
}

$("#authForm").onsubmit = async e => {
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $("#email").value, password: $("#password").value });
  $("#authMsg").textContent = error ? "Kunne ikke logge inn: " + error.message : "";
};
$("#signupBtn").onclick = async () => {
  const email = $("#email").value, password = $("#password").value;
  if (!email || password.length < 6) { $("#authMsg").textContent = "Skriv inn e-post og et passord på minst 6 tegn."; return; }
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
  if (error) $("#authMsg").textContent = "Kunne ikke lage konto: " + error.message;
  else if (!data.session) $("#authMsg").textContent = "Konto laget. Sjekk e-posten din og trykk på bekreftelseslenken, så kan du logge inn.";
};

async function loadData() {
  const [a, ex, p] = await Promise.all([
    sb.from("answers").select("question_id,topic,correct,created_at").order("created_at", { ascending: false }).limit(10000),
    sb.from("exams").select("score,total,created_at").order("created_at", { ascending: false }).limit(50),
    sb.from("profiles").select("target_grade").maybeSingle()
  ]);
  answers = a.data || [];
  exams = ex.data || [];
  if (p.data) profile = p.data;
  else await sb.from("profiles").upsert({ user_id: user.id, target_grade: "C" });
}

async function logAnswers(rows) {
  const now = new Date().toISOString();
  rows.forEach(r => answers.unshift({ ...r, created_at: now }));
  const { error } = await sb.from("answers").insert(rows.map(r => ({ ...r, user_id: user.id })));
  if (error) console.error(error);
}

// ---------- estimat ----------
function estimate() {
  const by = Object.fromEntries(TOPICS.map(t => [t, []]));
  for (const a of answers) if (by[a.topic] && by[a.topic].length < RECENT) by[a.topic].push(a.correct);
  const topics = TOPICS.map(t => {
    const r = by[t], n = r.length, ok = r.filter(Boolean).length;
    return { t, n, ok, pct: n ? Math.round(100 * ok / n) : null, total: answers.filter(a => a.topic === t).length };
  });
  const answered = topics.filter(x => x.n);
  const pct = answered.length ? Math.round(answered.reduce((s, x) => s + x.pct, 0) / answered.length) : null;
  const missing = topics.filter(x => x.n < MIN_PER_TOPIC);
  return { topics, pct, grade: pct == null ? null : gradeOf(pct), missing, covered: missing.length === 0 };
}

function readiness(est) {
  const target = profile.target_grade, th = threshold(target), lastExam = exams[0];
  const lastPct = lastExam ? Math.round(100 * lastExam.score / lastExam.total) : null;
  const checks = [
    { ok: est.covered, text: est.covered ? `Du har øvd nok på alle ${TOPICS.length} temaene` : `Øv mer på ${est.missing.length} tema${est.missing.length > 1 ? "er" : ""} (minst ${MIN_PER_TOPIC} svar hver): ${est.missing.map(x => x.t).join(", ")}` },
    { ok: est.pct != null && est.pct >= th + MARGIN, text: est.pct == null ? `Estimatet ditt må ligge på minst ${th + MARGIN} % (grensen for ${target} er ${th} %, pluss ${MARGIN} poeng margin)` : `Estimatet ditt er ${est.pct} %, og må være minst ${th + MARGIN} % (grensen for ${target} er ${th} %, pluss ${MARGIN} poeng margin)` },
    { ok: lastPct != null && lastPct >= th, text: lastPct == null ? `Ta en full prøveeksamen og få minst ${th} %` : `Siste prøveeksamen: ${lastPct} % (må være minst ${th} %)` }
  ];
  return { target, th, ready: checks.every(c => c.ok), checks };
}

// ---------- navigasjon ----------
const VIEWS = [["oversikt", "Min fremgang"], ["eksamen", "Prøveeksamen"], ["tema", "Øv på tema"], ["svake", "Øv på svake punkter"], ["huskeliste", "Huskeliste"]];
function renderTabs() {
  $("#tabs").innerHTML = VIEWS.map(([k, n]) => `<button data-v="${k}" class="${k === view ? "on" : ""}">${n}</button>`).join("");
  $("#tabs").querySelectorAll("button").forEach(b => b.onclick = () => show(b.dataset.v));
}
function show(v) {
  view = v; renderTabs(); window.scrollTo(0, 0);
  ({ oversikt: viewOverview, eksamen: viewExamIntro, tema: viewTopics, svake: viewWeak, huskeliste: () => $("#main").innerHTML = `<div class="cheat">${window.CHEAT}</div>` })[v]();
}

// ---------- oversikt ----------
function viewOverview() {
  const est = estimate(), r = readiness(est);
  const statusCls = r.ready ? "ready" : "notyet";
  const head = r.ready
    ? `<h2 style="margin-top:0">Du er klar for ${r.target}!</h2><p>Du oppfyller alle kravene. Fortsett å ta en prøveeksamen nå og da, så du holder nivået.</p>`
    : `<h2 style="margin-top:0">Ikke helt klar for ${r.target} ennå</h2><p class="mut">Dette gjenstår:</p>`;
  const rows = [...est.topics].sort((a, b) => (a.pct ?? -1) - (b.pct ?? -1)).map(x => `
    <tr><td>${esc(x.t)}</td>
    <td style="width:38%">${x.pct == null ? '<span class="mut">ikke øvd</span>' : `<div class="bar"><i style="width:${x.pct}%"></i></div>`}</td>
    <td>${x.pct == null ? "–" : x.pct + " %"}</td><td>${x.pct == null ? "–" : gradeOf(x.pct)}</td>
    <td class="mut">${x.total} svar</td>
    <td><button class="btn sec small" data-topic="${esc(x.t)}">Øv</button></td></tr>`).join("");
  $("#main").innerHTML = `
  <div class="grid">
    <div class="card"><div class="mut">Estimert karakter nå</div>
      <div class="row" style="margin:6px 0 0">${est.grade ? `<span class="grade">${est.grade}</span><span class="big">${est.pct} %</span>` : `<span class="mut">Svar på noen spørsmål først</span>`}</div>
      ${est.grade && !est.covered ? `<p class="note">Usikkert estimat: ${est.missing.length} temaer har for få svar.</p>` : ""}</div>
    <div class="card"><div class="mut">Karakteren du sikter mot</div>
      <select id="target" style="max-width:180px">${GRADES.slice(0, 5).map(([g, t]) => `<option value="${g}" ${g === r.target ? "selected" : ""}>${g} (minst ${t} %)</option>`).join("")}</select>
      <p class="note">Prøveeksamener tatt: ${exams.length}${exams[0] ? ` · siste: ${exams[0].score}/${exams[0].total}` : ""}</p></div>
  </div>
  <div class="card status ${statusCls}">${head}
    ${r.ready ? "" : `<ul>${r.checks.map(c => `<li>${c.ok ? "✅" : "⬜"} ${esc(c.text)}</li>`).join("")}</ul>`}
  </div>
  <h2>Per tema (siste ${RECENT} svar)</h2>
  <div class="card" style="overflow-x:auto"><table>${rows}</table></div>
  <p class="note">Hvordan det regnes ut: Hvert tema teller likt, slik at alle deler av pensum blir dekket. For hvert tema brukes de siste ${RECENT} svarene, så estimatet viser nivået ditt nå og ikke hvordan du lå an i starten. Gjennomsnittet gjøres om til karakter med NTNUs anbefalte prosentskala: A ≥ 89, B ≥ 77, C ≥ 65, D ≥ 53, E ≥ 41. Du er «klar» når alle temaene er godt nok øvd, estimatet ligger minst ${MARGIN} prosentpoeng over grensen og siste prøveeksamen også holder.</p>
  <div class="row"><button class="btn sec small" id="resetBtn">Nullstill all fremgang</button><span id="resetMsg" class="note"></span></div>`;
  $("#target").onchange = async e => {
    profile.target_grade = e.target.value;
    await sb.from("profiles").upsert({ user_id: user.id, target_grade: profile.target_grade, updated_at: new Date().toISOString() });
    viewOverview();
  };
  $("#main").querySelectorAll("[data-topic]").forEach(b => b.onclick = () => { show("tema"); runTopic(b.dataset.topic); });
  let armed = false;
  $("#resetBtn").onclick = async () => {
    if (!armed) { armed = true; $("#resetMsg").textContent = "Trykk én gang til for å slette alle svar og prøveeksamener."; return; }
    await sb.from("answers").delete().eq("user_id", user.id);
    await sb.from("exams").delete().eq("user_id", user.id);
    answers = []; exams = []; viewOverview();
  };
}

// ---------- spørsmål ----------
function qHTML(q, k) {
  const o = opts(q), order = q.o === "TF" ? [0, 1] : shuffle([...o.keys()]);
  return `<div class="card q" id="q${k}"><div class="qh"><span>Spørsmål ${k + 1}</span><span class="tag">${esc(q.t)}</span></div>
  <div class="qt">${q.q}</div>
  ${order.map(i => `<label class="o" data-o="${i}"><input type="radio" name="r${k}" value="${i}"><span>${o[i]}</span></label>`).join("")}
  <div class="ex"><b>Fasit:</b> ${o[q.a]}<br>${q.e}<div class="row" style="margin:8px 0 0"><button class="btn sec small" data-ask="${k}">Spør læreren om dette</button></div></div></div>`;
}
function mark(d, q, v) {
  d.classList.add("done");
  d.querySelectorAll("label.o").forEach(l => { const i = +l.dataset.o; l.classList.toggle("ok", i === q.a); l.classList.toggle("bad", i === v && i !== q.a); });
  d.querySelectorAll("input").forEach(x => x.disabled = true);
}
function bindAsk(qs, chosen) {
  $("#main").querySelectorAll("[data-ask]").forEach(b => b.onclick = () => {
    const k = +b.dataset.ask, q = qs[k];
    openTutor({ question: q.q, options: opts(q), correct: opts(q)[q.a], chosen: chosen[k] != null ? opts(q)[chosen[k]] : null, explanation: q.e, topic: q.t },
      chosen[k] != null && chosen[k] !== q.a ? "Jeg svarte feil på dette. Kan du forklare hvorfor riktig svar er riktig, og hvordan jeg kan huske det?" : "Kan du forklare dette spørsmålet grundigere?");
  });
}

// Øving med fasit med én gang (tema og svake punkter)
function runPractice(qs, mode, title, again) {
  const host = $("#practice");
  const chosen = {};
  let ok = 0, done = 0;
  host.innerHTML = `<div class="card sticky" id="score"></div>${qs.map(qHTML).join("")}
    <div class="row"><button class="btn sec" id="again">Nytt sett</button><button class="btn sec" id="toOverview">Se fremgangen min</button></div>`;
  const sc = () => $("#score").innerHTML = `<b>${esc(title)}</b> · ${done} av ${qs.length} besvart · <b>${ok} riktige</b>${done ? ` (${Math.round(100 * ok / done)} %)` : ""}`;
  sc();
  qs.forEach((q, k) => {
    const d = $("#q" + k);
    d.addEventListener("change", e => {
      const v = +e.target.value; chosen[k] = v; mark(d, q, v); done++; if (v === q.a) ok++; sc();
      logAnswers([{ question_id: q.id, topic: q.t, correct: v === q.a, mode }]);
    });
  });
  bindAsk(qs, chosen);
  $("#again").onclick = again;
  $("#toOverview").onclick = () => show("oversikt");
  host.scrollIntoView({ behavior: "smooth" });
}

function viewTopics() {
  const est = estimate();
  $("#main").innerHTML = `<p class="mut">Velg et tema. Du får 15 spørsmål om gangen, med fasit med én gang. Spørsmål du har svart feil på, eller ikke har sett før, kommer først.</p>
  <div class="row">${est.topics.map(x => `<button class="btn sec" data-t="${esc(x.t)}">${esc(x.t)} <span class="mut">${x.pct == null ? "" : "· " + x.pct + " %"}</span></button>`).join("")}</div><div id="practice"></div>`;
  $("#main").querySelectorAll("[data-t]").forEach(b => b.onclick = () => runTopic(b.dataset.t));
}
function runTopic(t) {
  $("#main").querySelectorAll("[data-t]").forEach(b => b.classList.toggle("on", b.dataset.t === t));
  const qs = pickPrioritized(Q.filter(q => q.t === t), 15);
  runPractice(qs, "topic", t, () => runTopic(t));
}

// Prioritering: feil sist → aldri sett → riktig sist (eldst først)
function lastResult() {
  const m = {};
  for (const a of answers) if (!(a.question_id in m)) m[a.question_id] = a;
  return m;
}
function pickPrioritized(pool, n, topicPct = {}) {
  const last = lastResult();
  const score = q => {
    const l = last[q.id];
    const base = !l ? 2 : (l.correct ? 0 : 3);
    const weak = topicPct[q.t] == null ? 0.5 : 1 - topicPct[q.t] / 100;
    return base + weak + Math.random() * 0.9;
  };
  return pool.map(q => [score(q), q]).sort((a, b) => b[0] - a[0]).slice(0, n).map(x => x[1]);
}

function viewWeak() {
  const est = estimate();
  const pctMap = Object.fromEntries(est.topics.map(x => [x.t, x.pct]));
  const weakest = est.topics.filter(x => x.pct != null).sort((a, b) => a.pct - b.pct).slice(0, 3).map(x => x.t);
  $("#main").innerHTML = `<p class="mut">Her får du 20 spørsmål som er valgt ut fra hva du sliter mest med: først spørsmål du har svart feil på, deretter spørsmål fra de svakeste temaene dine${weakest.length ? ` (nå: ${weakest.map(esc).join(", ")})` : ""}.</p><div id="practice"></div>`;
  const run = () => runPractice(pickPrioritized(Q, 20, pctMap), "weak", "Svake punkter", run);
  run();
}

// ---------- prøveeksamen ----------
function viewExamIntro() {
  $("#main").innerHTML = `<div class="card"><h1>Prøveeksamen</h1>
  <p>${EXAM_LEN} spørsmål trekkes fra alle ${TOPICS.length} temaene (ca. 4 per tema), i samme format som eksempelspørsmålene fra 2024: flervalg og sant/usant. Du får fasit først når du leverer. Resultatet teller i vurderingen av om du er klar.</p>
  <p class="mut">Sett av ca. 60 minutter. Ingen hjelpemidler.</p>
  <button class="btn" id="startExam">Start prøveeksamen</button></div>`;
  $("#startExam").onclick = startExam;
}
function startExam() {
  const per = Math.floor(EXAM_LEN / TOPICS.length);
  let picked = [];
  TOPICS.forEach(t => picked.push(...shuffle(Q.filter(q => q.t === t)).slice(0, per)));
  const rest = shuffle(Q.filter(q => !picked.includes(q))).slice(0, EXAM_LEN - picked.length);
  const qs = shuffle(picked.concat(rest));
  const chosen = {};
  $("#main").innerHTML = `<div id="examBox"><div class="card sticky" id="score">0 av ${qs.length} besvart</div>${qs.map(qHTML).join("")}
  <div class="row"><button class="btn" id="submit">Lever og se resultat</button><span id="warn" class="note"></span></div><div id="result"></div></div>`;
  $("#examBox").addEventListener("change", e => {
    const m = e.target.name?.match(/^r(\d+)$/); if (!m) return;
    chosen[+m[1]] = +e.target.value;
    $("#score").textContent = `${Object.keys(chosen).length} av ${qs.length} besvart`;
  });
  let armed = false;
  $("#submit").onclick = async () => {
    const missing = qs.length - Object.keys(chosen).length;
    if (missing && !armed) { armed = true; $("#warn").textContent = `Du har ${missing} ubesvarte. Trykk igjen for å levere likevel (ubesvart teller som feil).`; return; }
    $("#submit").disabled = true;
    let ok = 0; const topic = {}, rows = [];
    qs.forEach((q, k) => {
      const v = chosen[k], right = v === q.a;
      mark($("#q" + k), q, v); if (right) ok++;
      topic[q.t] = topic[q.t] || [0, 0]; topic[q.t][1]++; if (right) topic[q.t][0]++;
      rows.push({ question_id: q.id, topic: q.t, correct: right, mode: "exam" });
    });
    bindAsk(qs, chosen);
    await logAnswers(rows);
    const { error } = await sb.from("exams").insert({ user_id: user.id, score: ok, total: qs.length });
    if (!error) exams.unshift({ score: ok, total: qs.length, created_at: new Date().toISOString() });
    const pct = Math.round(100 * ok / qs.length), g = gradeOf(pct), th = threshold(profile.target_grade);
    const trows = Object.entries(topic).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]).map(([t, [a, n]]) => `<tr><td>${esc(t)}</td><td>${a}/${n}</td></tr>`).join("");
    $("#result").innerHTML = `<div class="card"><div class="row" style="margin:0"><span class="grade">${g}</span><span class="big">${ok}/${qs.length} · ${pct} %</span></div>
      <p>${pct >= th ? `Over grensen for målet ditt (${profile.target_grade}, ${th} %).` : `Under grensen for målet ditt (${profile.target_grade}, ${th} %), så du mangler ${th - pct} prosentpoeng.`} Fasit og forklaringer står ved hvert spørsmål ovenfor.</p>
      <table>${trows}</table>
      <div class="row"><button class="btn" id="toOv">Se fremgangen min</button><button class="btn sec" id="newExam">Ny prøveeksamen</button></div></div>`;
    $("#toOv").onclick = () => show("oversikt");
    $("#newExam").onclick = startExam;
    $("#result").scrollIntoView({ behavior: "smooth" });
  };
}

// ---------- læreren ----------
$("#tutorFab").onclick = () => openTutor(null, "");
$("#tutorClose").onclick = () => { $("#tutorPanel").classList.add("hidden"); $("#tutorFab").classList.remove("hidden"); };
function openTutor(ctx, prefill) {
  if (ctx) { tutorCtx = ctx; tutorMsgs = []; }
  $("#tutorPanel").classList.remove("hidden"); $("#tutorFab").classList.add("hidden");
  if (!tutorMsgs.length) renderTutor(ctx ? `Spørsmål: «${ctx.question.replace(/<[^>]+>/g, "")}»\nSpør meg om hva du vil rundt dette.` : "Hei! Jeg er læreren din i TGB4100. Spør meg om hva som helst i pensum, eller be meg forhøre deg om et tema.");
  else renderTutor();
  $("#tutorInput").value = prefill || "";
  $("#tutorInput").focus();
}
function renderTutor(intro) {
  const log = $("#tutorLog");
  log.innerHTML = (intro ? `<div class="msg a">${esc(intro)}</div>` : (log.dataset.intro || "")) +
    tutorMsgs.map(m => `<div class="msg ${m.role === "user" ? "u" : "a"}">${esc(m.content)}</div>`).join("");
  if (intro) log.dataset.intro = `<div class="msg a">${esc(intro)}</div>`;
  log.scrollTop = log.scrollHeight;
}
$("#tutorInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#tutorForm").requestSubmit(); } });
$("#tutorForm").onsubmit = async e => {
  e.preventDefault();
  const text = $("#tutorInput").value.trim(); if (!text) return;
  $("#tutorInput").value = "";
  tutorMsgs.push({ role: "user", content: text }); renderTutor();
  const log = $("#tutorLog"); log.insertAdjacentHTML("beforeend", `<div class="msg a" id="typing">Tenker …</div>`); log.scrollTop = log.scrollHeight;
  const est = estimate();
  const weak = est.topics.filter(x => x.pct != null).sort((a, b) => a.pct - b.pct).slice(0, 3).map(x => `${x.t} (${x.pct} %)`);
  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch("/api/tutor", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
      body: JSON.stringify({ messages: tutorMsgs.slice(-12), context: tutorCtx, progress: { estimate: est.pct, grade: est.grade, target: profile.target_grade, weakest: weak } })
    });
    const j = await res.json();
    $("#typing")?.remove();
    tutorMsgs.push({ role: "assistant", content: res.ok ? j.reply + (j.remaining != null && j.remaining <= 5 ? `\n\n(${j.remaining} spørsmål igjen til læreren i dag)` : "") : (j.error || "Noe gikk galt.") });
  } catch (err) {
    $("#typing")?.remove();
    tutorMsgs.push({ role: "assistant", content: "Fikk ikke kontakt med læreren. Prøv igjen om litt." });
  }
  renderTutor();
};
