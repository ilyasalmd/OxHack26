-- Chat features: media, private chats, group profile, receipts. Idempotent; runs after schema-2.

-- Voice notes, photos, group pictures and profile photos. The browser encrypts every file before
-- upload, so `data` is a 12-byte IV followed by AES-GCM ciphertext and the server can't open it.
CREATE TABLE IF NOT EXISTS attachments (
  id bigserial PRIMARY KEY,
  owner_id int NOT NULL REFERENCES users(id),
  group_id int REFERENCES groups(id),   -- null for a profile photo
  kind text NOT NULL,                   -- 'voice' | 'image' | 'group_photo' | 'avatar'
  data bytea NOT NULL,
  size int NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS attachments_group_idx ON attachments (group_id);

-- A private chat is a two-person group, at most one per pair ("lowId:highId").
ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_dm boolean NOT NULL DEFAULT false;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS dm_pair text UNIQUE;
-- The group description is encrypted with the group key like a message; the photo is an attachment.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS description_ct text;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS description_iv text;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS photo_id bigint;

-- Profile photos are encrypted with a per-person profile key. The owner's app wraps that key for
-- everyone they share a chat with (and for themselves), the way group keys are shared.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_id bigint;
CREATE TABLE IF NOT EXISTS profile_keys (
  owner_id int NOT NULL REFERENCES users(id),
  viewer_id int NOT NULL REFERENCES users(id),
  wrapped text NOT NULL,
  PRIMARY KEY (owner_id, viewer_id)
);

-- Ticks: the newest message id each member's app has fetched (delivered) and shown (read).
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS delivered_upto bigint NOT NULL DEFAULT 0;
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS read_upto bigint NOT NULL DEFAULT 0;
-- History from before receipts existed counts as read, once.
UPDATE group_members gm SET delivered_upto = x.m, read_upto = x.m
  FROM (SELECT group_id, max(id) AS m FROM messages GROUP BY group_id) x
  WHERE x.group_id = gm.group_id AND NOT EXISTS (SELECT 1 FROM app_flags WHERE name = 'receipts_backfill');
INSERT INTO app_flags (name) VALUES ('receipts_backfill') ON CONFLICT DO NOTHING;
