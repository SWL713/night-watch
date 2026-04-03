-- Run this in your Supabase SQL Editor
-- Adds photographer_name, flagged, flagged_at, deleted columns to photos table

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS photographer_name text,
  ADD COLUMN IF NOT EXISTS flagged boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted boolean DEFAULT false;

-- Index for fast flagged/deleted queries
CREATE INDEX IF NOT EXISTS photos_flagged_idx ON photos(flagged) WHERE flagged = true;
CREATE INDEX IF NOT EXISTS photos_deleted_idx ON photos(deleted) WHERE deleted = false;
