-- Safety features: consent, fair settling, reports. Idempotent; runs after schema.sql.

-- Who may post situations about this person: 'anyone' (default) or 'nobody'.
ALTER TABLE users ADD COLUMN IF NOT EXISTS subject_policy text NOT NULL DEFAULT 'anyone';

-- Fair settling: the creator (or anyone after the date) PROPOSES a result, another member confirms
-- or disputes it, and with no reaction it finalises after 24 hours of app-clock time.
ALTER TABLE markets ADD COLUMN IF NOT EXISTS proposed_outcome boolean;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS proposed_by int REFERENCES users(id);
ALTER TABLE markets ADD COLUMN IF NOT EXISTS proposed_at timestamptz;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS proposed_note text NOT NULL DEFAULT '';
-- A voided situation (status = 'void') says why: 'veto' | 'dispute' | 'reports'.
ALTER TABLE markets ADD COLUMN IF NOT EXISTS void_reason text;
CREATE INDEX IF NOT EXISTS markets_proposed_idx ON markets (proposed_at) WHERE status = 'open' AND proposed_outcome IS NOT NULL;

-- Reports on a situation or a chat message. message_text is only stored when the reporter
-- ticks "include the message", since chat is end-to-end encrypted and the server can't read it.
CREATE TABLE IF NOT EXISTS reports (
  id serial PRIMARY KEY,
  reporter_id int NOT NULL REFERENCES users(id),
  group_id int NOT NULL REFERENCES groups(id),
  market_id int REFERENCES markets(id),
  message_id bigint REFERENCES messages(id),
  target_user_id int REFERENCES users(id),
  reason text NOT NULL CHECK (reason IN ('mean', 'private', 'unsafe', 'spam', 'other')),
  note text NOT NULL DEFAULT '',
  message_text text,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_market_idx ON reports (market_id) WHERE market_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reports_message_idx ON reports (reporter_id, message_id) WHERE message_id IS NOT NULL;
-- One report per person per situation, one per person per message.
CREATE UNIQUE INDEX IF NOT EXISTS reports_once_market ON reports (reporter_id, market_id) WHERE market_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reports_once_message ON reports (reporter_id, message_id) WHERE message_id IS NOT NULL;
