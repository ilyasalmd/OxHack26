// Logarithmic Market Scoring Rule (Hanson). One YES share pays 1 coin if the
// situation happens, one NO share pays 1 coin if it doesn't. "Long" buys YES,
// "short" buys NO, so a short can never lose more than its stake.

export type Book = { b: number; qYes: number; qNo: number };

function logSumExp(a: number, c: number) {
  const m = Math.max(a, c);
  return m + Math.log(Math.exp(a - m) + Math.exp(c - m));
}

export function cost({ b, qYes, qNo }: Book) {
  return b * logSumExp(qYes / b, qNo / b);
}

export function priceYes({ b, qYes, qNo }: Book) {
  return 1 / (1 + Math.exp((qNo - qYes) / b));
}

const logit = (p: number) => Math.log(p / (1 - p));

/** A fresh book whose YES price equals p. */
export function bookAt(b: number, p: number): Book {
  return { b, qYes: b * logit(p), qNo: 0 };
}

/** Move the market maker's quote to p without touching anyone's shares (AI repricing). */
export function recenter(book: Book, p: number): Book {
  return { ...book, qYes: book.qNo + book.b * logit(p) };
}

export type Side = "yes" | "no";

/** Shares received for spending `amount` coins on `side`. */
export function sharesForAmount(book: Book, side: Side, amount: number) {
  const { b } = book;
  const own = side === "yes" ? book.qYes : book.qNo;
  const other = side === "yes" ? book.qNo : book.qYes;
  const a = (cost(book) + amount) / b;
  const c = other / b;
  // Solve b*ln(e^((own+x)/b) + e^(other/b)) = C0 + amount for x.
  return b * (a + Math.log1p(-Math.exp(c - a))) - own;
}

export function applyShares(book: Book, side: Side, shares: number): Book {
  return side === "yes" ? { ...book, qYes: book.qYes + shares } : { ...book, qNo: book.qNo + shares };
}

/** Coins returned for selling `shares` of `side` back to the market maker. */
export function proceedsForShares(book: Book, side: Side, shares: number) {
  return cost(book) - cost(applyShares(book, side, -shares));
}

/** Probability a long-dated "by date X" event still happens, after time passes with no news.
 * Assumes a constant hazard: P(by T | none by t) = 1 - exp(-λ (T - t)). */
export function hazardDecay(p: number, msLeftBefore: number, msLeftAfter: number) {
  if (msLeftBefore <= 0) return p;
  const ratio = Math.max(0, msLeftAfter) / msLeftBefore;
  return 1 - Math.pow(1 - p, ratio);
}
