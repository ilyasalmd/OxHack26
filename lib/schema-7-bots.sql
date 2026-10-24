-- Trades and chat messages the demo bots made, so the admin can tell them apart.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS bot boolean NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS bot boolean NOT NULL DEFAULT false;
