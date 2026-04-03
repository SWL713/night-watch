-- Add removal request fields to sightings table
ALTER TABLE sightings
  ADD COLUMN IF NOT EXISTS removal_requested boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS removal_comment   text,
  ADD COLUMN IF NOT EXISTS removal_requested_at timestamptz;

-- Index for admin queue
CREATE INDEX IF NOT EXISTS sightings_removal_idx ON sightings(removal_requested);
