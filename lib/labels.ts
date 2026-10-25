// The words a market shows for its two sides. Every screen (chat card, market page, bet slip, feed)
// reads them from here so a number question says "Over 15 min" everywhere instead of a bare "Yes".

export type Sided = { kind: "bet" | "stock"; answer?: "yesno" | "number" | null; line?: number | null; unit?: string | null };

/** "15 min", "72%", "3" — a line with its unit, trimmed of float noise. */
export function fmtLine(line: number, unit?: string | null) {
  const n = Number.isInteger(line) ? String(line) : String(Math.round(line * 100) / 100);
  const u = (unit ?? "").trim();
  if (!u) return n;
  return u === "%" ? `${n}%` : `${n} ${u}`;
}

/** Short side labels: Yes/No, Over/Under, Buy/Short. */
export function sides(m: Sided) {
  if (m.answer === "number" && m.line != null) {
    const l = fmtLine(m.line, m.unit);
    return { yes: `Over ${l}`, no: `Under ${l}`, yesShort: "Over", noShort: "Under" };
  }
  if (m.kind === "stock") return { yes: "Buy", no: "Short", yesShort: "Buy", noShort: "Short" };
  return { yes: "Yes", no: "No", yesShort: "Yes", noShort: "No" };
}

/** One phrase for the type pill: "Yes or no", "Over/under 15 min", "Stock". */
export function typeLabel(m: Sided) {
  if (m.answer === "number" && m.line != null) return `Over/under ${fmtLine(m.line, m.unit)}`;
  return m.kind === "stock" ? "Stock" : "Yes or no";
}

/** What the headline probability means for this market. */
export function priceMeaning(m: Sided) {
  if (m.answer === "number" && m.line != null) return `chance it's over ${fmtLine(m.line, m.unit)}`;
  return m.kind === "stock" ? "share price" : "chance it happens";
}
