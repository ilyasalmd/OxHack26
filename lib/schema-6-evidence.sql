-- "It already happened" before the deadline: anyone in the chat can say so with evidence (a note,
-- and a photo encrypted like any other), and it settles only when another member confirms it.
ALTER TABLE markets ADD COLUMN IF NOT EXISTS proposed_early boolean NOT NULL DEFAULT false;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS proposed_evidence bigint;
