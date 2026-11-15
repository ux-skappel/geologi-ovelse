# Geologi-øving – TGB4100

Øvingsapp for TGB4100 Geologi, innføring (NTNU), med:

- **416 spørsmål** fordelt på 12 temaer (minst 31 per tema), med fasit og forklaring
- **Prøveeksamen**: 50 spørsmål trukket fra alle temaene, med fasit først når du leverer
- **Øv på tema** og **Øv på svake punkter**: fasit med én gang. Spørsmål du har svart feil på kommer først
- **Min fremgang**: karakterestimat etter NTNUs prosentskala (A ≥ 89, B ≥ 77, C ≥ 65, D ≥ 53, E ≥ 41) og beskjed når du er klar for karakteren du sikter mot
- **Læreren**: en AI-lærer (Claude) som forklarer, forhører og kjenner pensum og fremgangen din
- Innlogging og lagring med **Supabase**, hosting med **Vercel**

## Oppsett

### 1. Supabase
1. Gå til supabase.com og velg et prosjekt (eller lag et nytt).
2. Åpne **SQL Editor → New query**, lim inn hele `supabase/schema.sql` og trykk **Run**.
3. Gå til **Project Settings → API** og noter **Project URL** og **anon public key**.
4. Gå til **Authentication → URL Configuration** og sett **Site URL** til Vercel-adressen din (fra steg 2). Da peker lenken i bekreftelses-e-posten riktig.
   - Vil du slippe e-postbekreftelse? Slå av «Confirm email» under **Authentication → Providers → Email**.

### 2. Vercel
1. Gå til vercel.com → **Add New → Project** og importer GitHub-repoet `geologi-ovelse`.
2. Framework Preset: **Other**. Ikke endre noe annet.
3. Under **Environment Variables**, legg inn:

| Navn | Verdi |
|---|---|
| `SUPABASE_URL` | Project URL fra Supabase |
| `SUPABASE_ANON_KEY` | anon public key fra Supabase |
| `ANTHROPIC_API_KEY` | API-nøkkel fra console.anthropic.com |
| `ANTHROPIC_MODEL` | (valgfritt) standard er `claude-haiku-5-5`, som er billigst. `claude-sonnet-5-5` gir bedre forklaringer |
| `TUTOR_DAILY_LIMIT` | (valgfritt) antall spørsmål til læreren per bruker per døgn, standard 40 |

4. Trykk **Deploy**.

## Hvordan karakterestimatet regnes ut
- For hvert av de 12 temaene brukes de siste 15 svarene.
- Hvert tema teller likt, og gjennomsnittet gjøres om til karakter med NTNU-skalaen.
- Du er **klar** for målkarakteren når:
  1. alle temaene har minst 8 svar,
  2. estimatet ligger minst 5 prosentpoeng over grensen, og
  3. siste prøveeksamen er over grensen.

## Struktur
```
public/        nettsiden (index.html, app.js, style.css, questions.js, cheat.js)
api/config.js  gir nettleseren Supabase-URL og anon-nøkkel
api/tutor.js   læreren (kaller Anthropic API på serveren, sjekker innlogging og dagsgrense)
supabase/      databaseskjema med RLS (hver bruker ser bare sine egne data)
bank/          kildefilene til spørsmålene. Kjør `node bank/build.js` for å bygge public/questions.js
```

Spørsmålene er laget fra forelesningene (2025/26) og tidligere eksamener (2018–2023) i TGB4100. Spørsmål om platetektonikk og geofysikk bygger på gamle eksamener og læreboka, fordi de forelesningene ikke var med i materialet.
