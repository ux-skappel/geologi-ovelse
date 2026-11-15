-- Kjør hele denne filen i Supabase: SQL Editor → New query → lim inn → Run.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_grade text not null default 'C' check (target_grade in ('A','B','C','D','E')),
  updated_at timestamptz not null default now()
);

create table if not exists public.answers (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id text not null,
  topic text not null,
  correct boolean not null,
  mode text not null check (mode in ('exam','topic','weak')),
  created_at timestamptz not null default now()
);
create index if not exists answers_user_idx on public.answers(user_id, created_at desc);

create table if not exists public.exams (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  score int not null,
  total int not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tutor_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists tutor_user_idx on public.tutor_messages(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.answers enable row level security;
alter table public.exams enable row level security;
alter table public.tutor_messages enable row level security;

-- Hver bruker ser og skriver bare sine egne rader.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read own answers" on public.answers;
drop policy if exists "insert own answers" on public.answers;
drop policy if exists "delete own answers" on public.answers;
create policy "read own answers" on public.answers for select using (auth.uid() = user_id);
create policy "insert own answers" on public.answers for insert with check (auth.uid() = user_id);
create policy "delete own answers" on public.answers for delete using (auth.uid() = user_id);

drop policy if exists "read own exams" on public.exams;
drop policy if exists "insert own exams" on public.exams;
drop policy if exists "delete own exams" on public.exams;
create policy "read own exams" on public.exams for select using (auth.uid() = user_id);
create policy "insert own exams" on public.exams for insert with check (auth.uid() = user_id);
create policy "delete own exams" on public.exams for delete using (auth.uid() = user_id);

-- Lærer-meldinger: kun lese og legge til (ikke slette), så dagsgrensen ikke kan omgås.
drop policy if exists "read own tutor" on public.tutor_messages;
drop policy if exists "insert own tutor" on public.tutor_messages;
create policy "read own tutor" on public.tutor_messages for select using (auth.uid() = user_id);
create policy "insert own tutor" on public.tutor_messages for insert with check (auth.uid() = user_id);
