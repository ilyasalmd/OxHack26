-- A line about yourself, shown on your profile and in chat member lists. Plain text, like the
-- display name, and only shown to signed-in people.
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '';
