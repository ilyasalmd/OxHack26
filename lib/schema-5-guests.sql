-- Real accounts added to the sample chats so they have something to look at are guests there:
-- each sample chat keeps its own cast, and a guest is only listed to themselves.
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS guest boolean NOT NULL DEFAULT false;
