-- Invite friends: each account has its own invite link, and 3 friends who sign up with it and
-- start using the app (join a chat or make a stake) pay the inviter a one-off reward.
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_paid_at timestamptz;
-- A random id kept in a long-lived cookie, stored hashed, so a link's owner can't sign up their own "friends".
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_hash text;
CREATE INDEX IF NOT EXISTS sessions_device_idx ON sessions (device_hash);
-- One row per account that signed up with someone's link. An account can only ever be invited once, at sign-up.
CREATE TABLE IF NOT EXISTS referrals (
  invitee_id int PRIMARY KEY REFERENCES users(id),
  inviter_id int NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL,
  device_hash text,
  -- Why this sign-up can never count ('same_device' | 'device_reused' | 'too_many'), or null.
  blocked text,
  -- When the friend first joined a chat with someone or made a stake.
  active_at timestamptz
);
CREATE INDEX IF NOT EXISTS referrals_inviter_idx ON referrals (inviter_id);
