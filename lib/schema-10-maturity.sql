-- The day a stake's deadline arrives, the chat is told once so somebody calls the result.
ALTER TABLE markets ADD COLUMN IF NOT EXISTS matured_notified_at timestamptz;
