-- Per person, per chat: the chat's background and whether it's muted. Only that person sees them.
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS wallpaper text;
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS muted boolean NOT NULL DEFAULT false;

-- How much the AI had to go on when a market opened (below 1 = general knowledge only).
ALTER TABLE markets ADD COLUMN IF NOT EXISTS evidence real;
