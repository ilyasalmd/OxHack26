-- Editing and deleting your own chat messages. An edit replaces the ciphertext (re-encrypted in the
-- browser) and stamps edited_at; a delete clears the ciphertext for good and stamps deleted_at, so
-- every member's app shows "Message deleted" and nothing can read the old text again.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS messages_changed_idx ON messages (group_id, id) WHERE edited_at IS NOT NULL OR deleted_at IS NOT NULL;
