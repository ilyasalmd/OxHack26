-- The Solana outbox sends each operation exactly once (lib/outbox.ts). A row is 'sent' from the
-- moment its signed transaction is saved here, before it goes to the chain, so a lost answer is
-- checked by signature (and the same bytes resent) instead of paying again.
ALTER TABLE chain_ops ADD COLUMN IF NOT EXISTS tx_raw text;
ALTER TABLE chain_ops ADD COLUMN IF NOT EXISTS last_valid_height bigint;
ALTER TABLE chain_ops ADD COLUMN IF NOT EXISTS sent_at timestamptz;
-- kinds now: 'stake' (wallet -> the stake's vault), 'payout' (vault -> wallet), 'close' (burn what's
-- left, close the vault), plus 'mint', 'burn' and 'memo' for coins outside any stake.
CREATE INDEX IF NOT EXISTS chain_ops_market_idx ON chain_ops (market_id, kind) WHERE market_id IS NOT NULL;
