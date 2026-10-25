-- Votes on a proposed result: it settles when most of the group confirms, and is dropped when most reject.
CREATE TABLE IF NOT EXISTS stake_votes (
  market_id int NOT NULL REFERENCES markets(id),
  user_id int NOT NULL REFERENCES users(id),
  confirm boolean NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (market_id, user_id)
);
