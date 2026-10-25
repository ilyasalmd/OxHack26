-- Synthetic history added for demos (scripts/seed-rich.ts). Only the admin is told; it never
-- touches balances, trades or the chain.
ALTER TABLE markets ADD COLUMN IF NOT EXISTS sample boolean NOT NULL DEFAULT false;
