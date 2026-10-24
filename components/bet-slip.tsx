"use client";
import { useEffect, useState } from "react";
import { applyShares, priceYes, sharesForAmount, type Book, type Side } from "@/lib/lmsr";
import { sides, type Sided } from "@/lib/labels";
import { decimalOdds, formatOdds, useOddsFormat } from "@/lib/odds";
import { Button, fmt, pct } from "./ui";

/** Decimal odds, the way a bookmaker shows them: stake 1 returns this. */
export const odds = (p: number) => (p > 0.005 ? (1 / p).toFixed(2) : "–");

type Props = {
  market: Sided;
  book: Book;
  side: Side;
  onSide: (s: Side) => void;
  canShort: boolean;
  balance: number;
  maxStake: number;
  floor: number;
  ticker: string;
  /** Fee this trade pays to the lister (0 when free), and who that is. */
  fee?: number;
  lister?: string;
  busy: boolean;
  err: string;
  onPlace: (side: Side, amount: number) => void;
};

/**
 * One slip for every trade. A bet reads like a bookmaker's: pick Yes or No, type a stake, see what
 * it returns, one tap. A stock reads like a broker's: Buy or Short, the price, what the shares pay.
 */
export function BetSlip({ market, book, side, onSide, canShort, balance, maxStake, floor, ticker, fee = 0, lister, busy, err, onPlace }: Props) {
  const [f] = useOddsFormat();
  const [amount, setAmount] = useState(Math.min(10, Math.max(1, Math.floor(maxStake))));
  const [raw, setRaw] = useState(String(Math.min(10, Math.max(1, Math.floor(maxStake)))));
  useEffect(() => setRaw(String(amount)), [amount]);
  const max = Math.max(0, Math.floor(maxStake));
  const kind = market.kind;
  const stock = kind === "stock";
  const lbl = sides(market);
  const number = market.answer === "number" && market.line != null;
  const pYes = priceYes(book);
  const price = side === "yes" ? pYes : 1 - pYes;
  const ok = amount >= 1 && amount <= max;
  const shares = ok ? sharesForAmount(book, side, amount) : 0;
  const after = ok ? priceYes(applyShares(book, side, shares)) : pYes;
  const profit = shares - amount - fee;
  const show = (p: number) => (stock ? fmt(p * 100, 1) : pct(p));

  function type(v: string) {
    setRaw(v);
    const n = Math.floor(Number(v));
    if (Number.isFinite(n)) setAmount(n);
  }
  const bump = (d: number) => setAmount((a) => Math.min(max, Math.max(1, a + d)));

  const yesLabel = lbl.yes;
  const noLabel = lbl.no;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Pick on={side === "yes"} tone="up" onClick={() => onSide("yes")} label={yesLabel} value={stock && !number ? show(pYes) : formatOdds(pYes, f)} sub={stock && !number ? "share price" : `${pct(pYes)} chance`} />
        <Pick on={side === "no"} tone="down" disabled={!canShort} onClick={() => canShort && onSide("no")} label={noLabel} value={stock && !number ? show(1 - pYes) : formatOdds(1 - pYes, f)} sub={!canShort ? "not for you" : stock && !number ? "if it doesn't happen" : `${pct(1 - pYes)} chance`} />
      </div>

      <div className="rounded-2xl border border-line bg-ink p-4">
        <div className="flex items-baseline justify-between text-xs text-mute">
          <span>Stake</span>
          <span className="tabular">Balance {fmt(balance, 0)} {ticker}</span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={raw}
            onChange={(e) => type(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => setRaw(String(amount))}
            aria-label="Stake"
            className="w-full min-w-0 bg-transparent !text-[40px] font-semibold leading-none tracking-tight tabular outline-none"
          />
          <span className="text-lg text-mute">{ticker}</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[5, 10, 25].map((d) => (
            <button key={d} type="button" onClick={() => bump(d)} className="rounded-xl bg-white/[.06] py-2 text-sm font-medium tabular hover:bg-white/10">+{d}</button>
          ))}
          <button type="button" onClick={() => setAmount(Math.max(1, max))} className="rounded-xl bg-white/[.06] py-2 text-sm font-medium hover:bg-white/10">Max</button>
        </div>
      </div>

      <div className="flex items-end justify-between px-1">
        <div>
          <div className="text-xs text-mute">{number ? `Returns if it's ${side === "yes" ? lbl.yes.toLowerCase() : lbl.no.toLowerCase()}` : stock ? (side === "yes" ? "Pays if it happens" : "Pays if it doesn't") : "Returns if right"}</div>
          <div className="text-2xl font-semibold tracking-tight tabular">
            {ok ? fmt(shares) : "–"} <span className="text-base text-mute">{ticker}</span>
          </div>
        </div>
        <div className="text-right text-sm">
          <div className={`tabular ${profit >= 0 ? "text-up" : "text-down"}`}>{ok ? `${profit >= 0 ? "+" : "−"}${fmt(Math.abs(profit))} profit` : ""}</div>
          <div className="text-xs text-mute tabular">{ok ? `moves ${show(pYes)} to ${show(after)}` : `1 to ${max} ${ticker}`}</div>
        </div>
      </div>

      {stock && !number && (
        <p className="px-1 text-xs text-mute">
          {fee > 0 ? `Includes a ${fee} ${ticker} fee to ${lister ?? "the lister"} (your first trade here was free).` : `Your first trade here is free; later trades pay 0.5 ${ticker} to ${lister ?? "the lister"}.`}
        </p>
      )}
      {max < 1 && <p className="text-sm text-down">You&apos;re at the safety floor ({floor} {ticker} stays untouched). Your weekly allowance tops you up.</p>}
      {err && <p className="text-sm text-down">{err}</p>}
      <Button variant={side === "yes" ? "up" : "down"} className="w-full !py-3.5 text-[17px]" disabled={busy || !ok} onClick={() => onPlace(side, amount)}>
        {busy ? "Placing…" : stock && !number ? `${side === "yes" ? "Buy" : "Short"} for ${fmt(amount + fee, fee ? 1 : 0)} ${ticker}` : `Place bet · ${fmt(amount, 0)} ${ticker}`}
      </Button>
      <p className="text-center text-[11px] text-mute">{stock && !number ? `Each share pays 1 ${ticker} if it happens, nothing if not. Price ${show(price)} now.` : `Odds ${formatOdds(price, f)}: stake 1 returns ${decimalOdds(price)} if you're right.`}</p>
    </div>
  );
}

function Pick({ on, tone, label, value, sub, disabled, onClick }: { on: boolean; tone: "up" | "down"; label: string; value: string; sub: string; disabled?: boolean; onClick: () => void }) {
  const ring = tone === "up" ? "border-up bg-up/15" : "border-down bg-down/15";
  const text = tone === "up" ? "text-up" : "text-down";
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on} className={`rounded-2xl border px-4 py-3 text-left transition disabled:opacity-40 ${on ? ring : "border-line bg-panel hover:border-white/20"}`}>
      <div className={`text-sm font-semibold ${on ? text : ""}`}>{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular">{value}</div>
      <div className="text-[11px] text-mute">{sub}</div>
    </button>
  );
}
