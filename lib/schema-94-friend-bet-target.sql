-- A friend bet can be aimed at one person in the chat: only they can take it, counter it or turn
-- it down. NULL leaves it open to anyone.
ALTER TABLE friend_bets ADD COLUMN IF NOT EXISTS target_id int REFERENCES users(id);
