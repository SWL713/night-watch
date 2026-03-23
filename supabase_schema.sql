-- Night Watch — Supabase Schema
-- Run this in your Supabase project SQL editor (Database → SQL Editor → New query)

-- ── Spots table ──────────────────────────────────────────────────────────────
create table if not exists spots (
  id               bigserial primary key,
  name             text not null,
  lat              double precision not null,
  lon              double precision not null,
  bortle           integer not null default 5 check (bortle between 1 and 9),
  view_direction   text,
  access_notes     text,
  horizon_rating   integer default 3 check (horizon_rating between 1 and 5),
  submitted_by     text default 'community',
  approved         boolean default false,
  created_at       timestamptz default now()
);

-- ── Photos table ─────────────────────────────────────────────────────────────
create table if not exists photos (
  id                  bigserial primary key,
  spot_id             bigint references spots(id) on delete cascade,
  photo_url           text not null,
  caption             text,
  conditions_snapshot jsonb,   -- { intensity, bz, state, timestamp }
  approved            boolean default false,
  created_at          timestamptz default now()
);

-- ── Row-level security ────────────────────────────────────────────────────────
-- Anyone can read approved spots and photos (passphrase handled in app)
alter table spots  enable row level security;
alter table photos enable row level security;

create policy "read approved spots"
  on spots for select using (approved = true);

create policy "insert spots"
  on spots for insert with check (true);

create policy "read approved photos"
  on photos for select using (approved = true);

create policy "insert photos"
  on photos for insert with check (true);

-- Admin can read/update/delete everything (use Supabase dashboard for admin ops)
-- or add a service role policy if you want to query pending from the app

-- ── Seed initial spots from JSON ─────────────────────────────────────────────
-- After running this schema, use the Supabase Table Editor to import
-- the data/spots.json file, OR run the seed script:
--   python pipeline/seed_supabase.py
