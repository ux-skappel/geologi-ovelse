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
    ["#nav", "#main"].forEach(s => $(s).classList.add("hidden"));
    $("#who").innerHTML = "";
    return;
  }
  $("#auth").classList.add("hidden");
  ["#nav", "#main"].forEach(s => $(s).classList.remove("hidden"));
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


// ---------- automatisk lærer (regelbasert, ingen AI) ----------
function trend() {
  const a = answers.slice(0, 20), b = answers.slice(20, 40);
  if (a.length < 20 || b.length < 20) return null;
  const pa = 100 * a.filter(x => x.correct).length / 20, pb = 100 * b.filter(x => x.correct).length / 20;
  return Math.round(pa - pb);
}
function coach() {
  const est = estimate(), r = readiness(est), th = r.th, target = r.target;
  const tried = est.topics.filter(x => x.pct != null);
  const weak = [...tried].sort((a, b) => a.pct - b.pct).slice(0, 3);
  const strong = [...tried].sort((a, b) => b.pct - a.pct)[0];
  const lines = []; let action = null;
  if (!answers.length) {
    return { head: "Velkommen! La oss finne ut hvor du står.", lines: ["Start med en prøveeksamen. Den dekker alle temaene, og etterpå vet jeg hvor du bør begynne.", "Ingen stress hvis det går dårlig første gang. Poenget er å finne hullene."], action: { label: "Start prøveeksamen", view: "eksamen" } };
  }
  let head;
  if (r.ready) head = `Du er klar for ${target}. Godt jobbet!`;
  else if (est.pct >= th) head = `Du ligger rundt ${est.grade} nå, og er ${est.pct - th} poeng over grensen for ${target}, men ikke helt trygg ennå.`;
  else head = `Du ligger rundt ${est.grade} nå (${est.pct} %). Det mangler ${th - est.pct} prosentpoeng til ${target}.`;
  const t = trend();
  if (t != null && t >= 5) lines.push(`Du er i fremgang: de siste 20 svarene dine er ${t} prosentpoeng bedre enn de 20 før.`);
  else if (t != null && t <= -5) lines.push(`De siste 20 svarene dine er ${-t} prosentpoeng svakere enn de 20 før. Kanskje på tide med en pause, eller å lese forklaringene grundigere?`);
  const missing = est.missing.filter(x => x.n === 0);
  if (missing.length) {
    lines.push(`Du har ikke øvd på ${missing.length === 1 ? "temaet" : "disse temaene"} ennå: ${missing.map(x => x.t).join(", ")}. Det er gratispoeng du ikke har hentet.`);
    action = { label: `Øv på ${missing[0].t}`, topic: missing[0].t };
  }
  if (weak.length && weak[0].pct < th) {
    lines.push(`Svakest nå: ${weak.filter(x => x.pct < th).map(x => `${x.t} (${x.pct} %)`).join(", ")}. Her er det mest å hente.`);
    if (!action) action = { label: `Øv på ${weak[0].t}`, topic: weak[0].t };
  }
  if (strong && strong.pct >= 80) lines.push(`Sterkest: ${strong.t} (${strong.pct} %). Det sitter, så bruk tiden på resten.`);
  const sinceExam = exams[0] ? answers.filter(a => a.created_at > exams[0].created_at).length : answers.length;
  if (!exams.length && answers.length >= 30) {
    lines.push("Du har ikke tatt en prøveeksamen ennå. Den viser om nivået holder når temaene blandes, slik som på eksamen.");
    if (!action) action = { label: "Ta prøveeksamen", view: "eksamen" };
  } else if (exams.length && sinceExam >= 60) {
    lines.push(`Du har svart på ${sinceExam} spørsmål siden forrige prøveeksamen. Ta en ny og se om øvingen har gitt uttelling.`);
    if (!action) action = { label: "Ta ny prøveeksamen", view: "eksamen" };
  }
  if (r.ready) lines.push("Hold nivået ved: ta en prøveeksamen om dagen og øv litt på det svakeste temaet. Eller sett målet ett hakk høyere?");
  if (!action) action = weak.length ? { label: `Øv på svake punkter`, view: "svake" } : { label: "Ta prøveeksamen", view: "eksamen" };
  return { head, lines, action };
}
function roundFeedback(title, ok, n, prevPct) {
  const pct = Math.round(100 * ok / n), g = gradeOf(pct), th = threshold(profile.target_grade);
  let msg = `${ok}/${n} riktige (${pct} %), som tilsvarer ${g}.`;
  if (prevPct != null) msg += pct > prevPct ? ` Det er bedre enn snittet ditt på temaet før denne runden (${prevPct} %).` : pct < prevPct ? ` Det er litt under snittet ditt på temaet før denne runden (${prevPct} %).` : "";
  msg += pct >= th ? ` Det holder for målet ditt (${profile.target_grade}).` : ` Under grensen for ${profile.target_grade} (${th} %). Les forklaringene på de du bommet på, og ta en runde til. Spørsmålene du svarte feil på kommer først neste gang.`;
  return msg;
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
  const c = coach();
  $("#main").innerHTML = `
  <div class="card status ${r.ready ? "ready" : "notyet"}"><div class="mut">Lærerens vurdering</div>
    <h2 style="margin:4px 0 8px">${esc(c.head)}</h2>
    ${c.lines.length ? `<ul>${c.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
    <button class="btn" id="coachGo">${esc(c.action.label)}</button></div>
  <div class="grid">
    <div class="card"><div class="mut">Estimert karakter nå</div>
      <div class="row" style="margin:6px 0 0">${est.grade ? `<span class="grade">${est.grade}</span><span class="big">${est.pct} %</span>` : `<span class="mut">Svar på noen spørsmål først</span>`}</div>
      ${est.grade && !est.covered ? `<p class="note">Usikkert estimat: ${est.missing.length} temaer har for få svar.</p>` : ""}</div>
    <div class="card"><div class="mut">Karakteren du sikter mot</div>
      <select id="target" style="max-width:180px">${GRADES.slice(0, 5).map(([g, t]) => `<option value="${g}" ${g === r.target ? "selected" : ""}>${g} (minst ${t} %)</option>`).join("")}</select>
      <p class="note">Prøveeksamener tatt: ${exams.length}${exams[0] ? ` · siste: ${exams[0].score}/${exams[0].total}` : ""}</p></div>
  </div>
  <div class="card">${head}
    ${r.ready ? "" : `<ul>${r.checks.map(c => `<li>${c.ok ? "✅" : "⬜"} ${esc(c.text)}</li>`).join("")}</ul>`}
  </div>
  <h2>Per tema (siste ${RECENT} svar)</h2>
  <div class="card" style="overflow-x:auto"><table>${rows}</table></div>
  <p class="note">Hvordan det regnes ut: Hvert tema teller likt, slik at alle deler av pensum blir dekket. For hvert tema brukes de siste ${RECENT} svarene, så estimatet viser nivået ditt nå og ikke hvordan du lå an i starten. Gjennomsnittet gjøres om til karakter med NTNUs anbefalte prosentskala: A ≥ 89, B ≥ 77, C ≥ 65, D ≥ 53, E ≥ 41. Du er «klar» når alle temaene er godt nok øvd, estimatet ligger minst ${MARGIN} prosentpoeng over grensen og siste prøveeksamen også holder.</p>
  <div class="row"><button class="btn sec small" id="resetBtn">Nullstill all fremgang</button><span id="resetMsg" class="note"></span></div>`;
  $("#coachGo").onclick = () => { if (c.action.topic) { show("tema"); runTopic(c.action.topic); } else show(c.action.view); };
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
  <div class="ex"><b>Fasit:</b> ${o[q.a]}<br>${q.e}</div></div>`;
}
function mark(d, q, v) {
  d.classList.add("done");
  d.querySelectorAll("label.o").forEach(l => { const i = +l.dataset.o; l.classList.toggle("ok", i === q.a); l.classList.toggle("bad", i === v && i !== q.a); });
  d.querySelectorAll("input").forEach(x => x.disabled = true);
}

// Øving med fasit med én gang (tema og svake punkter)
function runPractice(qs, mode, title, again) {
  const host = $("#practice");
  const chosen = {};
  let ok = 0, done = 0;
  host.innerHTML = `<div class="card sticky" id="score"></div>${qs.map(qHTML).join("")}
    <div class="row"><button class="btn sec" id="again">Nytt sett</button><button class="btn sec" id="toOverview">Se fremgangen min</button></div>`;
  const prev = estimate().topics.find(x => x.t === title)?.pct ?? null;
  const sc = () => $("#score").innerHTML = `<b>${esc(title)}</b> · ${done} av ${qs.length} besvart · <b>${ok} riktige</b>${done ? ` (${Math.round(100 * ok / done)} %)` : ""}${done === qs.length ? `<div style="margin-top:6px"><b>Læreren:</b> ${esc(roundFeedback(title, ok, qs.length, prev))}</div>` : ""}`;
  sc();
  qs.forEach((q, k) => {
    const d = $("#q" + k);
    d.addEventListener("change", e => {
      const v = +e.target.value; chosen[k] = v; mark(d, q, v); done++; if (v === q.a) ok++; sc();
      logAnswers([{ question_id: q.id, topic: q.t, correct: v === q.a, mode }]);
    });
  });
  $("#again").onclick = again;
  $("#toOverview").onclick = () => show("oversikt");
  host.scrollIntoView({ behavior: "smooth" });
}

function viewTopics() {
  const est = estimate();
  $("#main").innerHTML = `<p class="mut">Velg et tema. Du får 30 spørsmål om gangen, med fasit med én gang. Spørsmål du har svart feil på, eller ikke har sett før, kommer først.</p>
  <div class="row">${est.topics.map(x => `<button class="btn sec" data-t="${esc(x.t)}">${esc(x.t)} <span class="mut">${x.pct == null ? "" : "· " + x.pct + " %"}</span></button>`).join("")}</div><div id="practice"></div>`;
  $("#main").querySelectorAll("[data-t]").forEach(b => b.onclick = () => runTopic(b.dataset.t));
}
function runTopic(t) {
  $("#main").querySelectorAll("[data-t]").forEach(b => b.classList.toggle("on", b.dataset.t === t));
  const qs = pickPrioritized(Q.filter(q => q.t === t), 30);
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
      await logAnswers(rows);
    const { error } = await sb.from("exams").insert({ user_id: user.id, score: ok, total: qs.length });
    if (!error) exams.unshift({ score: ok, total: qs.length, created_at: new Date().toISOString() });
    const pct = Math.round(100 * ok / qs.length), g = gradeOf(pct), th = threshold(profile.target_grade);
    const trows = Object.entries(topic).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]).map(([t, [a, n]]) => `<tr><td>${esc(t)}</td><td>${a}/${n}</td></tr>`).join("");
    $("#result").innerHTML = `<div class="card"><div class="row" style="margin:0"><span class="grade">${g}</span><span class="big">${ok}/${qs.length} · ${pct} %</span></div>
      <p>${pct >= th ? `Over grensen for målet ditt (${profile.target_grade}, ${th} %).` : `Under grensen for målet ditt (${profile.target_grade}, ${th} %), så du mangler ${th - pct} prosentpoeng.`} Fasit og forklaringer står ved hvert spørsmål ovenfor.</p>
      <p><b>Læreren:</b> ${esc(coach().head)} ${esc(coach().lines[0] || "")}</p>
      <table>${trows}</table>
      <div class="row"><button class="btn" id="toOv">Se fremgangen min</button><button class="btn sec" id="newExam">Ny prøveeksamen</button></div></div>`;
    $("#toOv").onclick = () => show("oversikt");
    $("#newExam").onclick = startExam;
    $("#result").scrollIntoView({ behavior: "smooth" });
  };
}

