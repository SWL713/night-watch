-- Camera profiles table for Night Watch camera settings feature
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS camera_profiles (
  id              bigserial primary key,
  device_type     text not null,        -- 'iphone' | 'android' | 'dslr'
  make            text not null,        -- 'Apple' | 'Samsung' | 'Google' | 'Canon' etc
  model           text not null,        -- 'iPhone 15 Pro' | 'Galaxy S23 Ultra' etc
  sensor_size     text,                 -- '1/1.28"' | 'Full Frame' | 'APS-C' etc
  crop_factor     numeric,              -- 1.0 FF, 1.5/1.6 APS-C, 2.0 MFT, ~7 phone
  aperture        numeric not null,     -- widest f-stop number e.g. 1.78
  pixel_pitch_um  numeric,              -- microns, for NPF calc
  max_iso         integer,              -- max recommended ISO
  has_proraw      boolean default false,
  has_night_mode  boolean default false,
  focal_length_equiv integer,           -- 35mm equivalent main lens
  notes           text,
  created_at      timestamptz default now()
);

-- Open read access
ALTER TABLE camera_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read camera profiles"
  ON camera_profiles FOR SELECT USING (true);

-- ── iPhone profiles ───────────────────────────────────────────────────────────
INSERT INTO camera_profiles (device_type, make, model, sensor_size, crop_factor, aperture, max_iso, has_proraw, has_night_mode, focal_length_equiv, notes) VALUES
('iphone', 'Apple', 'iPhone 11',      '1/2.55"', 7.0, 1.8,  4032, false, true,  26, 'Night mode introduced'),
('iphone', 'Apple', 'iPhone 12',      '1/2.55"', 7.0, 1.6,  4032, false, true,  26, ''),
('iphone', 'Apple', 'iPhone 12 Pro',  '1/2.55"', 7.0, 1.6,  4032, true,  true,  26, 'ProRAW introduced'),
('iphone', 'Apple', 'iPhone 13',      '1/1.9"',  6.5, 1.5,  4032, false, true,  26, 'Sensor size increase'),
('iphone', 'Apple', 'iPhone 13 Pro',  '1/1.9"',  6.5, 1.5,  4032, true,  true,  26, ''),
('iphone', 'Apple', 'iPhone 14',      '1/1.9"',  6.5, 1.5,  4032, false, true,  26, ''),
('iphone', 'Apple', 'iPhone 14 Pro',  '1/1.76"', 6.0, 1.78, 4032, true,  true,  24, '48MP main sensor'),
('iphone', 'Apple', 'iPhone 15',      '1/1.56"', 5.5, 1.6,  4032, false, true,  26, ''),
('iphone', 'Apple', 'iPhone 15 Pro',  '1/1.28"', 4.8, 1.78, 4032, true,  true,  24, 'Largest iPhone sensor to date'),
('iphone', 'Apple', 'iPhone 15 Pro Max','1/1.28"',4.8, 1.78, 4032, true,  true,  24, ''),
('iphone', 'Apple', 'iPhone 16',      '1/1.56"', 5.5, 1.6,  4032, false, true,  26, ''),
('iphone', 'Apple', 'iPhone 16 Pro',  '1/1.28"', 4.8, 1.78, 4032, true,  true,  24, ''),
('iphone', 'Apple', 'iPhone 16 Pro Max','1/1.28"',4.8, 1.78, 4032, true,  true,  24, '');

-- ── Samsung profiles ──────────────────────────────────────────────────────────
INSERT INTO camera_profiles (device_type, make, model, sensor_size, crop_factor, aperture, pixel_pitch_um, max_iso, has_night_mode, focal_length_equiv, notes) VALUES
('android', 'Samsung', 'Galaxy S21',        '1/1.76"', 6.0, 1.8,  0.8, 3200, true, 26, ''),
('android', 'Samsung', 'Galaxy S21 Ultra',  '1/1.33"', 5.0, 1.8,  0.8, 3200, true, 24, '108MP'),
('android', 'Samsung', 'Galaxy S22',        '1/1.76"', 6.0, 1.8,  0.8, 3200, true, 26, ''),
('android', 'Samsung', 'Galaxy S22 Ultra',  '1/1.33"', 5.0, 1.8,  0.9, 3200, true, 24, '108MP'),
('android', 'Samsung', 'Galaxy S23',        '1/1.76"', 6.0, 1.8,  0.8, 3200, true, 26, ''),
('android', 'Samsung', 'Galaxy S23 Ultra',  '1/1.3"',  4.9, 1.7,  1.0, 3200, true, 23, '200MP, best low light in S23 lineup'),
('android', 'Samsung', 'Galaxy S24',        '1/1.76"', 6.0, 1.8,  0.8, 3200, true, 26, ''),
('android', 'Samsung', 'Galaxy S24 Ultra',  '1/1.3"',  4.9, 1.7,  1.0, 3200, true, 23, '200MP'),
('android', 'Samsung', 'Galaxy S25',        '1/1.76"', 6.0, 1.8,  0.8, 3200, true, 26, ''),
('android', 'Samsung', 'Galaxy S25 Ultra',  '1/1.3"',  4.9, 1.7,  1.0, 3200, true, 23, '200MP');

-- ── Google Pixel profiles ─────────────────────────────────────────────────────
INSERT INTO camera_profiles (device_type, make, model, sensor_size, crop_factor, aperture, max_iso, has_night_mode, focal_length_equiv, notes) VALUES
('android', 'Google', 'Pixel 6',      '1/1.31"', 5.0, 1.85, 3200, true, 24, ''),
('android', 'Google', 'Pixel 6 Pro',  '1/1.31"', 5.0, 1.85, 3200, true, 24, ''),
('android', 'Google', 'Pixel 7',      '1/1.31"', 5.0, 1.85, 3200, true, 24, ''),
('android', 'Google', 'Pixel 7 Pro',  '1/1.31"', 5.0, 1.85, 3200, true, 24, ''),
('android', 'Google', 'Pixel 8',      '1/1.31"', 5.0, 1.68, 3200, true, 24, 'Improved NR'),
('android', 'Google', 'Pixel 8 Pro',  '1/1.31"', 5.0, 1.68, 3200, true, 24, ''),
('android', 'Google', 'Pixel 9',      '1/1.31"', 5.0, 1.68, 3200, true, 24, ''),
('android', 'Google', 'Pixel 9 Pro',  '1/1.31"', 5.0, 1.68, 3200, true, 24, ''),
('android', 'Google', 'Pixel 9 Pro XL','1/1.31"',5.0, 1.68, 3200, true, 24, '');
