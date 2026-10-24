CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY, value text NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  username text UNIQUE NOT NULL,
  display_name text NOT NULL,
  auth_hash text NOT NULL,
  color text NOT NULL,
  balance double precision NOT NULL,
  last_allowance_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  -- E2EE: the public key is shared, the private key is only ever stored
  -- encrypted with a key derived from the password in the browser.
  public_key text NOT NULL,
  enc_private_key text NOT NULL,
  key_salt text NOT NULL,
  -- Custodial Solana devnet wallet (secret encrypted with APP_SECRET).
  wallet_pubkey text,
  wallet_secret_enc text
);

CREATE TABLE IF NOT EXISTS groups (
  id serial PRIMARY KEY,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '💬',
  invite_code text UNIQUE NOT NULL,
  -- Shared with the AI on purpose: term dates, fixtures, deadlines.
  ai_context text NOT NULL DEFAULT '',
  created_by int NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id int NOT NULL REFERENCES groups(id),
  user_id int NOT NULL REFERENCES users(id),
  joined_at timestamptz NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

-- Each member's copy of the group chat key, wrapped with ECDH(wrapper, member).
CREATE TABLE IF NOT EXISTS group_keys (
  group_id int NOT NULL REFERENCES groups(id),
  user_id int NOT NULL REFERENCES users(id),
  wrapped_key text NOT NULL,
  wrapped_by int NOT NULL REFERENCES users(id),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id bigserial PRIMARY KEY,
  group_id int NOT NULL REFERENCES groups(id),
  user_id int REFERENCES users(id),
  kind text NOT NULL,            -- 'chat' (ciphertext) | 'system' | 'market' | 'trade' | 'resolution'
  ciphertext text,               -- chat only: base64 AES-GCM, server can't read it
  iv text,
  body text,                     -- system events only
  market_id int,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_group_idx ON messages (group_id, id);

CREATE TABLE IF NOT EXISTS markets (
  id serial PRIMARY KEY,
  group_id int NOT NULL REFERENCES groups(id),
  creator_id int NOT NULL REFERENCES users(id),
  subject_id int REFERENCES users(id),
  kind text NOT NULL,            -- 'bet' (short-term yes/no) | 'stock' (long-term maturing contract)
  decay text NOT NULL,           -- 'none' | 'hazard' (price drifts down as time runs out)
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  resolution_rule text NOT NULL,
  ai_prob double precision NOT NULL,
  base_rate double precision,
  base_rate_n double precision NOT NULL DEFAULT 0,
  open_prob double precision NOT NULL,
  ai_rationale text NOT NULL,
  ai_source text NOT NULL,       -- 'gemini' | 'heuristic'
  b double precision NOT NULL,
  q_yes double precision NOT NULL,
  q_no double precision NOT NULL,
  status text NOT NULL DEFAULT 'open',
  outcome boolean,
  created_at timestamptz NOT NULL,
  resolves_at timestamptz NOT NULL,
  resolved_at timestamptz,
  last_decay_at timestamptz NOT NULL,
  volume double precision NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS markets_group_idx ON markets (group_id, status);

CREATE TABLE IF NOT EXISTS positions (
  market_id int NOT NULL REFERENCES markets(id),
  user_id int NOT NULL REFERENCES users(id),
  yes_shares double precision NOT NULL DEFAULT 0,
  no_shares double precision NOT NULL DEFAULT 0,
  spent double precision NOT NULL DEFAULT 0,
  PRIMARY KEY (market_id, user_id)
);

CREATE TABLE IF NOT EXISTS trades (
  id serial PRIMARY KEY,
  market_id int NOT NULL REFERENCES markets(id),
  user_id int NOT NULL REFERENCES users(id),
  side text NOT NULL,
  action text NOT NULL,
  shares double precision NOT NULL,
  coins double precision NOT NULL,
  price_before double precision NOT NULL,
  price_after double precision NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS trades_market_idx ON trades (market_id, created_at);

-- Time series (hypertables on Timescale / Tiger Cloud).
CREATE TABLE IF NOT EXISTS price_ticks (
  market_id int NOT NULL,
  ts timestamptz NOT NULL,
  price double precision NOT NULL,
  source text NOT NULL           -- 'open' | 'trade' | 'ai' | 'decay' | 'resolve'
);
CREATE INDEX IF NOT EXISTS price_ticks_idx ON price_ticks (market_id, ts DESC);

CREATE TABLE IF NOT EXISTS balance_ticks (
  user_id int NOT NULL,
  ts timestamptz NOT NULL,
  balance double precision NOT NULL,
  net_worth double precision NOT NULL
);
CREATE INDEX IF NOT EXISTS balance_ticks_idx ON balance_ticks (user_id, ts DESC);

CREATE TABLE IF NOT EXISTS ledger (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id),
  ts timestamptz NOT NULL,
  delta double precision NOT NULL,
  balance_after double precision NOT NULL,
  reason text NOT NULL,
  market_id int
);

-- Resolved situations, summarised, so similar future questions surface them.
CREATE TABLE IF NOT EXISTS memories (
  id serial PRIMARY KEY,
  group_id int NOT NULL,
  market_id int,
  subject_id int,
  category text NOT NULL,
  title text NOT NULL,
  outcome boolean NOT NULL,
  ai_prob double precision,
  crowd_prob double precision,
  summary text NOT NULL,
  embedding jsonb,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS memories_group_idx ON memories (group_id);

-- Outbox for Solana devnet: every balance change is mirrored as a mint or burn.
CREATE TABLE IF NOT EXISTS chain_ops (
  id serial PRIMARY KEY,
  kind text NOT NULL,            -- 'mint' | 'burn' | 'memo'
  user_id int,
  market_id int,
  amount double precision,
  memo text,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  signature text,
  error text,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS chain_ops_status_idx ON chain_ops (status, id);

-- Opt-in per group: members' apps may send a few filtered, redacted chat snippets to the AI.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS ai_reads_chat boolean NOT NULL DEFAULT false;
-- The snippets the AI judged relevant when pricing a market, kept so everyone can see what was used.
ALTER TABLE markets ADD COLUMN IF NOT EXISTS chat_context jsonb;
-- When the group last asked the AI to re-mark its stocks (rate limit).
ALTER TABLE groups ADD COLUMN IF NOT EXISTS last_reprice_at timestamptz;
