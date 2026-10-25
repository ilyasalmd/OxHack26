-- The one-line reason everyone sees under a stake's odds (the AI's full rationale stays admin-only),
-- and the one dispute each stake allows: who asked the AI to think again, when, and what it said.
ALTER TABLE markets ADD COLUMN IF NOT EXISTS ai_summary text NOT NULL DEFAULT '';
ALTER TABLE markets ADD COLUMN IF NOT EXISTS odds_disputed_by int;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS odds_disputed_at timestamptz;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS odds_dispute jsonb;
