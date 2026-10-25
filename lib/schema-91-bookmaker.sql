-- The AI bookmaker: a short pause on a chat's trading while the AI re-marks its stocks.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS repricing_until timestamptz;
