-- Brukernavn uten passord. Kjør i Supabase: SQL Editor → New query → lim inn → Run.
create table if not exists public.players (
  username text primary key check (username ~ '^[a-z0-9æøå._-]{2,30}$'),
  target_grade text not null default 'C' check (target_grade in ('A','B','C','D','E')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.answers (
  id bigint generated always as identity primary key,
  username text not null references public.players(username) on delete cascade,
  question_id text not null check (length(question_id) <= 20),
  topic text not null check (length(topic) <= 60),
  correct boolean not null,
  mode text not null check (mode in ('exam','topic','weak')),
  created_at timestamptz not null default now()
);
create index if not exists answers_user_idx on public.answers(username, created_at desc);
create table if not exists public.exams (
  id bigint generated always as identity primary key,
  username text not null references public.players(username) on delete cascade,
  score int not null check (score >= 0 and score <= total),
  total int not null check (total between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists exams_user_idx on public.exams(username, created_at desc);

alter table public.players enable row level security;
alter table public.answers enable row level security;
alter table public.exams enable row level security;

-- Ingen passord: alle kan lese og legge til, men ikke slette eller endre svar direkte.
create policy "players read" on public.players for select to anon using (true);
create policy "players insert" on public.players for insert to anon with check (true);
create policy "players update" on public.players for update to anon using (true) with check (true);
create policy "answers read" on public.answers for select to anon using (true);
create policy "answers insert" on public.answers for insert to anon with check (true);
create policy "exams read" on public.exams for select to anon using (true);
create policy "exams insert" on public.exams for insert to anon with check (true);

create or replace function public.reset_progress(p_username text)
returns void language sql security definer set search_path = public as $$
  delete from public.answers where username = p_username;
  delete from public.exams where username = p_username;
$$;
revoke all on function public.reset_progress(text) from public;
grant execute on function public.reset_progress(text) to anon;
