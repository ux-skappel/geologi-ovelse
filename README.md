# Geologi-øving – TGB4100

Øvingsapp for TGB4100 Geologi, innføring (NTNU), med:

- **416 spørsmål** fordelt på 12 temaer (minst 31 per tema), med fasit og forklaring
- **Prøveeksamen**: 50 spørsmål trukket fra alle temaene, med fasit først når du leverer
- **Øv på tema** (30 spørsmål per runde) og **Øv på svake punkter**: fasit med én gang. Spørsmål du har svart feil på kommer først, og utvalget varierer fra gang til gang
- **Bildequiz**: 97 bilder av fossiler, magmatiske, sedimentære og metamorfe bergarter og mineraler (fra forelesningene, eksamen 2025 og fossiltegningene fra eksamen 2021). Quiz med fasit med én gang, og et galleri for pugging
- **Ekte eksamener 2024 og 2025** med bildeoppgavene (steinprøver, figurer, strøk/fall)
- **Min fremgang**: karakterestimat etter NTNUs prosentskala (A ≥ 89, B ≥ 77, C ≥ 65, D ≥ 53, E ≥ 41) og beskjed når du er klar for karakteren du sikter mot
- **Lærerens vurdering**: en automatisk lærer (regelbasert, ingen AI-kostnad) som forteller hvordan du ligger an, hva som er svakest, om du er i fremgang og hva du bør gjøre nå
- Innlogging med **bare brukernavn** (ingen passord eller e-post). Lagring i **Supabase**, hosting på **Vercel**

## Oppsett

### 1. Supabase
1. Gå til supabase.com og velg et prosjekt (eller lag et nytt).
2. Åpne **SQL Editor → New query**, lim inn hele `supabase/schema.sql` og trykk **Run**.
3. Gå til **Project Settings → API** og noter **Project URL** og **anon public key**.

### 2. Vercel
1. Gå til vercel.com → **Add New → Project** og importer GitHub-repoet `geologi-ovelse`.
2. Framework Preset: **Other**. Ikke endre noe annet.
3. Under **Environment Variables**, legg inn:

| Navn | Verdi |
|---|---|
| `SUPABASE_URL` | Project URL fra Supabase |
| `SUPABASE_ANON_KEY` | anon public key fra Supabase |

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
supabase/      databaseskjema med RLS (hver bruker ser bare sine egne data)
bank/          kildefilene til spørsmålene (07_bilder.json = bildequizen). Kjør `node bank/build.js` for å bygge public/questions.js
public/img/    bilder: b/ = bildequiz, e/ = bilder til eksamensoppgaver
```

Spørsmålene er laget fra forelesningene (2025/26) og tidligere eksamener (2018–2023) i TGB4100. Spørsmål om platetektonikk og geofysikk bygger på gamle eksamener og læreboka, fordi de forelesningene ikke var med i materialet.
