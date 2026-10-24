-- Bet a friend: a one-on-one bet in a chat, separate from the stake market. Whoever posts it picks
-- a side and says what each person puts in; one friend takes the other side; the winner gets both.
CREATE TABLE IF NOT EXISTS friend_bets (
  id serial PRIMARY KEY,
  group_id int NOT NULL REFERENCES groups(id),
  creator_id int NOT NULL REFERENCES users(id),
  title text NOT NULL,
  resolves_at timestamptz NOT NULL,
  -- The poster's side: 'yes' means they say it happens.
  side text NOT NULL CHECK (side IN ('yes', 'no')),
  stake double precision NOT NULL,
  -- What the friend who takes it puts in (a counter-offer can change it before anyone takes it).
  taker_stake double precision NOT NULL,
  taker_id int REFERENCES users(id),
  -- open: waiting for a friend · live: both in · claimed: someone says they won ·
  -- settled: paid out · cancelled: nobody took it · refunded: called off, both paid back
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'live', 'claimed', 'settled', 'cancelled', 'refunded')),
  claim_by int REFERENCES users(id),
  claimed_at timestamptz,
  winner_id int REFERENCES users(id),
  created_at timestamptz NOT NULL,
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS friend_bets_group ON friend_bets (group_id, status);

-- "I'd put in this much instead": the poster can accept one, which starts the bet with that friend.
CREATE TABLE IF NOT EXISTS friend_bet_counters (
  id serial PRIMARY KEY,
  bet_id int NOT NULL REFERENCES friend_bets(id),
  user_id int NOT NULL REFERENCES users(id),
  taker_stake double precision NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'closed')),
  created_at timestamptz NOT NULL
);

-- The chat card for a bet, and the lines saying what happened to it.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS friend_bet_id int REFERENCES friend_bets(id);
