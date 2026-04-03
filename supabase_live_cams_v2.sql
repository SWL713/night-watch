-- Step 1: Add camera_type column
ALTER TABLE live_cams ADD COLUMN IF NOT EXISTS camera_type text DEFAULT 'camera';

-- Step 2: Update existing cameras with their type
UPDATE live_cams SET camera_type = 'allsky' WHERE name ILIKE '%averted vision%';
-- All others default to 'camera' which is already set

-- Step 3: Insert new cameras
INSERT INTO live_cams (name, lat, lon, embed_url, image_url, type, camera_type, is_active) VALUES

-- New standard cameras
('South Brunswick, NJ', 40.387, -74.532, 'https://skycam.aaronvivo.com/', NULL, 'iframe', 'allsky', true),
('North Shore Webcam, Isle Royale', 47.990, -88.770, 'https://www.nps.gov/media/webcam/view.htm?id=A3720AFA-E940-6127-6902E95ED431184B', NULL, 'iframe', 'camera', true),
('St. Mary Visitor Center All-Sky, MT', 48.745, -113.436, 'https://www.nps.gov/media/webcam/view.htm?id=FEBE3539-D0B5-B95A-B341B5A5C777FB9E', NULL, 'iframe', 'allsky', true),
('Aspen Snowmass, CO', 39.209, -106.950, 'https://aspen.roundshot.com/highlands/#/', NULL, 'iframe', 'camera', true),
('Imperial, CA', 32.847, -115.569, 'https://iid.roundshot.com/salton-south/#/', NULL, 'iframe', 'camera', true),
('Skunk Bay Weather, WA', 47.924, -122.580, 'https://www.skunkbayweather.com/SkunkBayWebcam.html', NULL, 'iframe', 'camera', true),
('ABN Aurora Cam, North Pole AK', 64.752, -147.349, 'https://auroranotify.com/cam/', NULL, 'iframe', 'allsky', true),
('Levi''s Cam, Fairbanks AK', 64.837, -147.716, 'https://www.youtube.com/embed/FqOM0IqUcYw?autoplay=1&mute=1', 'https://img.youtube.com/vi/FqOM0IqUcYw/maxresdefault_live.jpg', 'youtube', 'camera', true),
('Homer Alaska Northern Lights', 59.643, -151.544, 'https://hdontap.com/stream/490086/homer-alaska-northern-lights-live-cam/', NULL, 'iframe', 'camera', true),

-- Airport cameras
('Wiscasset Airport, ME', 44.012, -69.712, 'https://weathercams.faa.gov/map/-73.92505,39.40073,-65.49853,45.4125/cameraSite/622/details/camera/12280', NULL, 'iframe', 'airport', true),
('Rutland/Southern Vermont Rgnl, VT', 43.529, -72.950, 'https://weathercams.faa.gov/map/-77.15937,38.93366,-68.73285,44.988/cameraSite/1004/details/camera', NULL, 'iframe', 'airport', true),
('Berlin Regional Airport, NH', 44.575, -71.176, 'https://weathercams.faa.gov/map/-75.39141,40.05816,-66.96489,46.00941/cameraSite/734/details/camera/12593', NULL, 'iframe', 'airport', true),
('Toronto Billy Bishop City Airport', 43.628, -79.396, 'https://weathercams.faa.gov/map/-83.61243,39.04283,-75.18591,45.08726/cameraSite/507/details/camera/11742', NULL, 'iframe', 'airport', true),
('Churchill Airport, MB', 58.739, -94.065, 'https://weathercams.faa.gov/map/-102.50087,51.807,-85.64785,60.80079/cameraSite/461/details/camera/11431', NULL, 'iframe', 'airport', true),
('Cornwall Regional Airport, ON', 45.093, -74.563, 'https://weathercams.faa.gov/map/-82.99484,35.81289,-66.14182,47.89754/cameraSite/351/details/camera', NULL, 'iframe', 'airport', true),
('Houston County Airport, MN', 43.665, -91.507, 'https://weathercams.faa.gov/map/-99.93478,34.10056,-83.08176,46.47769/cameraSite/718/details/camera/12480', NULL, 'iframe', 'airport', true),
('Mary''s Harbour Airport, NL', 52.302, -55.847, 'https://weathercams.faa.gov/map/-64.26823,44.18522,-47.41521,54.72705/cameraSite/472/details/camera/11464', NULL, 'iframe', 'airport', true),

-- All-sky
('Geophysical Institute All-Sky, AK', 68.627, -149.604, 'https://allsky.gi.alaska.edu/toolik-lake', NULL, 'iframe', 'allsky', true)

;
