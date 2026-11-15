// AI-læreren. Kaller Anthropic API på serversiden, så API-nøkkelen aldri når nettleseren.
const SYLLABUS = require("./_syllabus.js");

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const DAILY_LIMIT = parseInt(process.env.TUTOR_DAILY_LIMIT || "40", 10);

const SYSTEM = `Du er en tålmodig og dyktig lærer i emnet TGB4100 Geologi, innføring, ved NTNU. Studentene øver til skriftlig eksamen (flervalg og sant/usant, ingen hjelpemidler).

Slik jobber du:
- Svar på norsk bokmål. Ta med engelske fagord i parentes når det hjelper, fordi eksamen er tospråklig.
- Vær kort og konkret: vanligvis 3–8 setninger. Bruk korte punktlister når du forklarer rekkefølger eller sammenligninger.
- Forklar HVORFOR, ikke bare hva, og gi gjerne et huskeknep.
- Hvis studenten svarte feil, pek på misforståelsen før du forklarer riktig svar.
- Hvis studenten ber om å bli forhørt, still ett spørsmål om gangen og vent på svaret.
- Hold deg til pensum (Marshak: Earth – Portrait of a Planet, forelesningene). Si fra ærlig hvis noe ligger utenfor pensum eller du er usikker.
- Ikke skriv hele eksamensbesvarelser for andre emner; hold deg til geologi.

Pensum dekker: Jorda og universet, mineraler, bergarter og bergartssyklus, magmatiske bergarter, sedimentære bergarter, metamorfe bergarter og metamorfosetyper, platetektonikk og fjellkjededannelse, strukturer (forkastninger og folder), vulkaner, geologiske kart og strøk/fall, geologisk tid og datering, fossiler og jordhistorie, landskap, elver, grunnvann og skred.

Viktige fakta og rekkefølger fra kurset (bruk disse som fasit):
${SYLLABUS}

Karakterskala som brukes i appen (NTNU, prosent riktig): A ≥ 89, B ≥ 77, C ≥ 65, D ≥ 53, E ≥ 41, F < 41.`;

async function readBody(req) {
  if (req.body) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  let raw = ""; for await (const c of req) raw += c; return JSON.parse(raw || "{}");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Bare POST." });
  const { SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY } = process.env;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: "Læreren er ikke satt opp ennå (ANTHROPIC_API_KEY mangler i Vercel)." });

  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "Du må være logget inn." });
  const sbHeaders = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" };

  // 1) Sjekk at brukeren er logget inn
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: sbHeaders });
  if (!u.ok) return res.status(401).json({ error: "Innloggingen har gått ut. Logg inn på nytt." });

  // 2) Dagsgrense (teller brukerens egne meldinger siden midnatt UTC)
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const c = await fetch(`${SUPABASE_URL}/rest/v1/tutor_messages?select=id&created_at=gte.${since.toISOString()}`,
    { headers: { ...sbHeaders, Prefer: "count=exact", Range: "0-0" } });
  const used = parseInt((c.headers.get("content-range") || "*/0").split("/")[1] || "0", 10);
  if (used >= DAILY_LIMIT) return res.status(429).json({ error: `Du har brukt opp dagens ${DAILY_LIMIT} spørsmål til læreren. Prøv igjen i morgen.` });

  let body;
  try { body = await readBody(req); } catch { return res.status(400).json({ error: "Ugyldig forespørsel." }); }
  let messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))
    .slice(-12);
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return res.status(400).json({ error: "Ingen melding." });

  let system = SYSTEM;
  const ctx = body.context, prog = body.progress;
  if (ctx && ctx.question) {
    const strip = s => String(s || "").replace(/<[^>]+>/g, "");
    system += `\n\nStudenten spør om dette øvingsspørsmålet:\nTema: ${strip(ctx.topic)}\nSpørsmål: ${strip(ctx.question)}\nAlternativer: ${(ctx.options || []).map(strip).join(" | ")}\nRiktig svar: ${strip(ctx.correct)}\n${ctx.chosen ? "Studenten svarte: " + strip(ctx.chosen) + "\n" : ""}Forklaring i appen: ${strip(ctx.explanation)}`;
  }
  if (prog && prog.estimate != null) {
    system += `\n\nStudentens fremgang: estimert ${prog.estimate} % (${prog.grade}), mål ${prog.target}. Svakeste temaer: ${(prog.weakest || []).join(", ") || "ukjent"}. Bruk dette bare når det er relevant, f.eks. hvis studenten spør hva hen bør øve på.`;
  }

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 900, system, messages })
  });
  const j = await r.json();
  if (!r.ok) { console.error(j); return res.status(502).json({ error: "Læreren svarte ikke. Prøv igjen om litt." }); }
  const reply = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();

  // 3) Registrer bruken (brukerens egen rad, via RLS)
  await fetch(`${SUPABASE_URL}/rest/v1/tutor_messages`, { method: "POST", headers: sbHeaders, body: JSON.stringify({}) });

  res.status(200).json({ reply, remaining: DAILY_LIMIT - used - 1 });
};
