"use client";
import { useEffect, useState } from "react";

// Bookmaker odds for a probability. Decimal is what the app shows by default (stake 1 returns
// this); fractional and American are offered for people used to them. The format is a device
// preference kept in localStorage, so it needs no account and no server.

export type OddsFormat = "decimal" | "fractional" | "american";
export const ODDS_FORMATS: { k: OddsFormat; label: string; example: string }[] = [
  { k: "decimal", label: "Decimal", example: "1.86" },
  { k: "fractional", label: "Fractional", example: "6/7" },
  { k: "american", label: "American", example: "-116" },
];
const KEY = "odds.format";
const EVENT = "odds-format";

const clamp = (p: number) => Math.min(0.995, Math.max(0.005, p));

export function decimalOdds(p: number) {
  return (1 / clamp(p)).toFixed(2);
}

/** Nearest bookmaker-style fraction (denominator up to 20), e.g. 0.54 → 6/7, 0.25 → 3/1. */
export function fractionalOdds(p: number) {
  const target = 1 / clamp(p) - 1;
  let best = { n: 1, d: 1, err: Infinity };
  for (let d = 1; d <= 20; d++) {
    const n = Math.max(1, Math.round(target * d));
    const err = Math.abs(n / d - target);
    if (err < best.err - 1e-9) best = { n, d, err };
  }
  const g = gcd(best.n, best.d);
  return `${best.n / g}/${best.d / g}`;
}

/** Moneyline: +150 means stake 100 wins 150; -200 means stake 200 wins 100. */
export function americanOdds(p: number) {
  const q = clamp(p);
  if (q >= 0.5) return `-${Math.round((q / (1 - q)) * 100)}`;
  return `+${Math.round(((1 - q) / q) * 100)}`;
}

export function formatOdds(p: number, f: OddsFormat = "decimal") {
  return f === "fractional" ? fractionalOdds(p) : f === "american" ? americanOdds(p) : decimalOdds(p);
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

export function readOddsFormat(): OddsFormat {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "fractional" || v === "american") return v;
  } catch {}
  return "decimal";
}

export function writeOddsFormat(f: OddsFormat) {
  try {
    localStorage.setItem(KEY, f);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** The person's odds format, live across every component on the page. */
export function useOddsFormat(): [OddsFormat, (f: OddsFormat) => void] {
  const [f, setF] = useState<OddsFormat>("decimal");
  useEffect(() => {
    const sync = () => setF(readOddsFormat());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [f, writeOddsFormat];
}
