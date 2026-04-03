-- Live cams table for Night Watch
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS live_cams (
  id          bigserial primary key,
  name        text not null,
  lat         double precision not null,
  lon         double precision not null,
  embed_url   text not null,
  type        text not null default 'youtube',  -- 'youtube' | 'iframe'
  is_active   boolean default true,
  notes       text,
  created_at  timestamptz default now()
);

ALTER TABLE live_cams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read live cams"
  ON live_cams FOR SELECT USING (true);

-- Seed initial cameras
INSERT INTO live_cams (name, lat, lon, embed_url, type, is_active) VALUES
('Aurore Abitibi',                          48.996398, -79.168944, 'https://www.youtube.com/embed/RJdVq5_rftM?autoplay=1&mute=1', 'youtube', true),
('Maine — CAM 2',                           45.727610, -68.819132, 'https://www.youtube.com/embed/MfLGYf3XRy8?autoplay=1&mute=1',  'youtube', true),
('Bay Port, MI — Michigan Storm Chasers',   43.854617, -83.374465, 'https://www.youtube.com/embed/il2U4EHbdG0?autoplay=1&mute=1',  'youtube', true),
('Averted Vision Observatory',              43.160223, -73.680991, 'https://www.avobs.com/allsky/',                                 'iframe',   true),
('Hope, NJ',                                40.906000, -74.978000, 'https://www.allskycam.com/u.php?u=627',                         'iframe',   true);
