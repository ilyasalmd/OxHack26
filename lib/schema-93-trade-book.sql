-- The trade book: a copy of each market's LMSR book that only real trades move. Time decay and AI
-- re-marks move the quote (q_yes) so new buyers pay a fair price, but they're the house's own
-- moves, so cashing out pays the lower of the two books: nobody can cash out a move the app made.
-- NULL means "same as the quote"; the first decay or re-mark fills it in before moving the quote.
ALTER TABLE markets ADD COLUMN IF NOT EXISTS t_yes double precision;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS t_no double precision;
