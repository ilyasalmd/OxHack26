"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { PriceChart } from "@/components/chart";
import { Badge, TopBar, fmt, pct } from "@/components/ui";
import { ArrowUpRight, Check, Clock, Coin, Copy, Hourglass, Sparkle, Timer, TrendUp, Trophy, Wallet } from "@/components/icons";

type P = {
  netWorth: { balance: number; positions: number; total: number };
  series: { ts: string; balance: number; net_worth: number }[];
  positions: { market_id: number; title: string; kind: string; status: string; group: string; yes: number; no: number; spent: number; price: number; value: number }[];
  ledger: { ts: string; delta: number; balance_after: number; reason: string }[];
  wallet: { address: string; url: string; mint: string | null; onChain: number | null; enabled: boolean; network: string | null } | null;
  chain: { id: number; kind: string; amount: number; status: string; url: string | null; error: string | null }[];
};

/**
 * The wallet: one card with your net worth, the curve underneath, then what that money is doing.
 * Cash and in-play money are drawn as one bar on the card, like a bank app, instead of two tiles.
 */
export default function Portfolio() {
  const { me } = useSession();
  const [p, setP] = useState<P | null>(null);
  const [hover, setHover] = useState<{ t: number; v: number } | null>(null);
  const load = () => api<P>("/api/portfolio").then(setP);
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);
  if (!p || !me) return <main className="p-10 text-center text-mute">Loading…</main>;
  const c = me.config.currency;
  const points = p.series.map((s) => ({ t: Date.parse(s.ts), v: s.net_worth }));
  const first = points[0]?.v ?? p.netWorth.total;
  const open = p.positions.filter((x) => x.status === "open");
  const gain = p.netWorth.total - first;
  const gainPct = first > 0 ? gain / first : 0;
  const inPlayPnl = open.reduce((a, x) => a + (x.value - x.spent), 0);
  const cashShare = p.netWorth.total > 0 ? p.netWorth.balance / p.netWorth.total : 1;
  const nextAllowance = new Date(me.nextAllowanceAt);

  const heroCard = (
    <section className="relative overflow-hidden rounded-[28px] bg-brand p-5 text-black shadow-[0_24px_60px_-28px_rgba(0,0,0,.7)]" style={{ backgroundImage: "radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,.5), transparent 60%), radial-gradient(90% 80% at 0% 100%, rgba(0,0,0,.16), transparent 60%)" }}>
      <div className="flex items-center justify-between text-[13px] font-medium text-black/60">
        <span className="flex items-center gap-1.5"><Wallet size={14} /> {hover ? new Date(hover.t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Net worth"}</span>
        <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide">{c.ticker}</span>
      </div>
      <div className="mt-5 text-[42px] font-semibold leading-none tracking-tight tabular lg:text-[52px]">{fmt(hover?.v ?? p.netWorth.total)}</div>
      <div className="mt-2.5 flex items-center gap-2 text-[13px]">
        <span className={`rounded-full px-2 py-0.5 font-semibold tabular ${gain >= 0 ? "bg-black/12 text-black/80" : "bg-[#7a1f23]/15 text-[#7a1f23]"}`}>
          {gain >= 0 ? "▲" : "▼"} {fmt(Math.abs(gain))} · {Math.abs(gainPct * 100).toFixed(1)}%
        </span>
        <span className="text-black/55">all time</span>
        <span className="ml-auto text-black/55">@{me.user.username}</span>
      </div>

      {/* Where the money is: cash you can stake now, and chips sitting in open positions. */}
      <div className="mt-5">
        <div className="flex h-2 overflow-hidden rounded-full bg-black/12">
          <div className="h-full rounded-full bg-black/70 transition-[width] duration-500" style={{ width: `${Math.max(2, cashShare * 100)}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <div className="flex items-center gap-1.5 text-black/55"><span className="h-2 w-2 rounded-full bg-black/70" /> Cash</div>
            <div className="mt-0.5 text-[17px] font-semibold tabular">{fmt(p.netWorth.balance)}</div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5 text-black/55">In play <span className="h-2 w-2 rounded-full bg-black/15 ring-1 ring-black/20" /></div>
            <div className="mt-0.5 text-[17px] font-semibold tabular">{fmt(p.netWorth.positions)}</div>
          </div>
        </div>
      </div>
    </section>
  );

  const facts = (
    <div className="grid grid-cols-3 gap-2">
      <Fact icon={<Hourglass size={14} />} label="In play" value={open.length === 1 ? "1 stake" : `${open.length} stakes`} sub={open.length ? <span className={inPlayPnl >= 0 ? "text-up" : "text-down"}>{inPlayPnl >= 0 ? "+" : "−"}{fmt(Math.abs(inPlayPnl))} unrealised</span> : "nothing yet"} />
      <Fact icon={<Coin size={14} />} label="Allowance" value={`+${me.config.economy.weeklyAllowance}`} sub={`${nextAllowance.toLocaleDateString("en-GB", { weekday: "short" })} ${nextAllowance.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`} />
      <Fact icon={<Sparkle size={14} />} label="Max stake" value={fmt(me.maxStake, 0)} sub={`${Math.round(me.config.economy.maxStakeFraction * 100)}% of cash`} />
    </div>
  );

  const walletCard = p.wallet && <ChainCard wallet={p.wallet} chain={p.chain} ticker={c.ticker} admin={me.account.isAdmin} />;

  return (
    <main className="flex min-h-dvh flex-col lg:min-h-full">
      <TopBar title="Wallet" />
      <div className="flex-1 px-4 pb-8 lg:mx-auto lg:grid lg:w-full lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10 lg:px-8 lg:pt-4">
        <div className="min-w-0">
          <div className="mt-4">{heroCard}</div>
          <div className="mt-3 rounded-2xl bg-panel px-2 pb-1 pt-3">
            <PriceChart points={points} now={Date.now() + me.clock.offsetMs} format={(v) => `${fmt(v)} ${c.ticker}`} onHover={setHover} />
          </div>

          <div className="mt-3 lg:hidden">{facts}</div>

          <SectionHead title="In play" right={open.length ? <span className="tabular text-mute">{fmt(p.netWorth.positions)} {c.ticker}</span> : null} />
          {open.length ? (
            <ul className="space-y-2">
              {open.map((x) => <Position key={x.market_id} x={x} />)}
            </ul>
          ) : (
            <Empty icon={<TrendUp size={18} />} text="Nothing in play." sub="Back something in a chat and it shows up here." />
          )}

          <div className="lg:hidden">{walletCard}</div>

          <SectionHead title="History" />
          <History ledger={p.ledger} now={me.clock.now} />
        </div>
        <aside className="sticky top-20 mt-6 hidden space-y-3 lg:block">
          {facts}
          {walletCard}
        </aside>
      </div>
    </main>
  );
}

function SectionHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-7 flex items-baseline justify-between px-1">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {right && <div className="text-xs">{right}</div>}
    </div>
  );
}

function Fact({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-panel p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-mute">{icon} {label}</div>
      <div className="mt-1.5 text-[17px] font-semibold tracking-tight tabular">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-mute">{sub}</div>
    </div>
  );
}

function Empty({ icon, text, sub }: { icon: React.ReactNode; text: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-4 text-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[.05] text-mute">{icon}</div>
      <div>
        <div className="font-medium">{text}</div>
        <div className="text-xs text-mute">{sub}</div>
      </div>
    </div>
  );
}

/** One open position: which way you went, what it's worth now, and how that compares with what you put in. */
function Position({ x }: { x: P["positions"][number] }) {
  const pnl = x.value - x.spent;
  const up = pnl >= 0;
  const sides = [x.yes > 0.001 ? { side: "yes", n: x.yes } : null, x.no > 0.001 ? { side: "no", n: x.no } : null].filter(Boolean) as { side: "yes" | "no"; n: number }[];
  const stock = x.kind === "stock";
  return (
    <li>
      <Link href={`/m/${x.market_id}`} className="flex items-center gap-3 rounded-2xl bg-panel px-3.5 py-3 transition hover:bg-raised">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${stock ? "bg-brand/12 text-brand" : "bg-white/[.06] text-white/80"}`}>
          {stock ? <TrendUp size={17} /> : <Timer size={17} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium leading-snug">{x.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-mute">
            {sides.map((s) => (
              <span key={s.side} className={`rounded-md px-1.5 py-px font-semibold uppercase tracking-wide ${s.side === "yes" ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>{stock ? (s.side === "yes" ? "long" : "short") : s.side} {fmt(s.n, 0)}</span>
            ))}
            <span className="truncate">{x.group} · now {stock ? fmt(x.price * 100, 1) : pct(x.price)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[15px] font-semibold tabular">{fmt(x.value)}</div>
          <div className={`mt-0.5 inline-block rounded-md px-1.5 py-px text-[11px] font-semibold tabular ${up ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>{up ? "+" : "−"}{fmt(Math.abs(pnl))}</div>
        </div>
      </Link>
    </li>
  );
}

/** Reads a ledger line like "Payout · Jake is late" into an icon, a label and the stake it was about. */
function describe(reason: string) {
  const [head, ...rest] = reason.split(" · ");
  const about = rest.join(" · ");
  const r = head.toLowerCase();
  if (r.startsWith("payout") || r.startsWith("won")) return { icon: <Trophy size={15} />, tone: "up", label: head, about };
  if (r.startsWith("weekly allowance") || r.startsWith("welcome")) return { icon: <Coin size={15} />, tone: "brand", label: head.replace(/ ×1$/, ""), about };
  if (r.startsWith("refund") || r.startsWith("bet called off") || r.startsWith("bet cancelled") || r.startsWith("nobody took")) return { icon: <Clock size={15} />, tone: "mute", label: head, about };
  if (r.startsWith("buy") || r.startsWith("sell")) {
    const m = /^(buy|sell)\s+(long|short)/i.exec(head);
    return { icon: <TrendUp size={15} />, tone: "mute", label: m ? `${m[1] === "buy" ? "Backed" : "Sold"} ${m[2]}` : head, about };
  }
  if (r.includes("fee")) return { icon: <Coin size={15} />, tone: "mute", label: head, about };
  return { icon: <Coin size={15} />, tone: "mute", label: head, about };
}

const dayLabel = (t: string, now: string) => {
  const d = new Date(t);
  const n = new Date(now);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, n)) return "Today";
  if (sameDay(d, new Date(n.getTime() - 864e5))) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};

/** Every chip in and out, grouped by day, with the balance after each line. */
function History({ ledger, now }: { ledger: P["ledger"]; now: string }) {
  const days = useMemo(() => {
    const out: { label: string; rows: P["ledger"] }[] = [];
    for (const l of ledger) {
      const label = dayLabel(l.ts, now);
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(l);
      else out.push({ label, rows: [l] });
    }
    return out;
  }, [ledger, now]);
  if (!ledger.length) return <Empty icon={<Clock size={18} />} text="No history yet." sub="Your welcome bonus and every stake land here." />;
  return (
    <div className="space-y-4">
      {days.map((d) => (
        <div key={d.label}>
          <div className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-mute">{d.label}</div>
          <div className="rounded-2xl bg-panel px-3.5">
            {d.rows.map((l, i) => {
              const info = describe(l.reason);
              const tone = { up: "bg-up/15 text-up", brand: "bg-brand/15 text-brand", mute: "bg-white/[.06] text-white/70" }[info.tone]!;
              return (
                <div key={i} className={`flex items-center gap-3 py-2.5 ${i ? "border-t border-white/[.05]" : ""}`}>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}>{info.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px]">{info.about || info.label}</div>
                    <div className="truncate text-[12px] text-mute">{info.about ? `${info.label} · ` : ""}{new Date(l.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-[14px] font-semibold tabular ${l.delta >= 0 ? "text-up" : "text-white/85"}`}>{l.delta >= 0 ? "+" : "−"}{fmt(Math.abs(l.delta))}</div>
                    <div className="text-[11px] tabular text-mute">{fmt(l.balance_after)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The Solana side, for the admin: the wallet address, what the chain says you hold, and the latest mirrored moves. */
function ChainCard({ wallet, chain, ticker, admin }: { wallet: NonNullable<P["wallet"]>; chain: P["chain"]; ticker: string; admin: boolean }) {
  const [copied, setCopied] = useState(false);
  const short = `${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <section className="mt-6 overflow-hidden rounded-2xl bg-panel text-sm lg:mt-0">
      <div className="flex items-center justify-between border-b border-white/[.05] px-4 py-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mute"><Wallet size={13} /> On Solana</h3>
        {wallet.network && <Badge tone={wallet.enabled ? "up" : "mute"}>{wallet.network}</Badge>}
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <a href={wallet.url} target="_blank" rel="noreferrer" className="font-mono text-[13px] hover:text-brand" title={wallet.address}>{short}</a>
          <button type="button" onClick={copy} className="rounded-md p-1 text-mute hover:bg-white/5 hover:text-white" aria-label="Copy address">{copied ? <Check size={13} /> : <Copy size={13} />}</button>
          <span className="flex-1" />
          {wallet.enabled && <span className="tabular"><span className="text-mute">on-chain </span>{wallet.onChain == null ? "–" : fmt(wallet.onChain)} <span className="text-mute">{ticker}</span></span>}
        </div>
        {!wallet.enabled && <p className="mt-2 text-xs text-mute">Chain sync is off: set SOLANA_PAYER_SECRET and SOLANA_MINT to mirror every buy-in (burn) and payout (mint) on devnet.</p>}
        {chain.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {chain.slice(0, 6).map((op) => (
              <div key={op.id} className="flex items-center gap-2 text-xs">
                <Badge tone={op.kind === "mint" ? "up" : "down"}>{op.kind}</Badge>
                <span className="tabular">{fmt(op.amount)}</span>
                <span className="flex-1" />
                {op.url ? <a href={op.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand">confirmed <ArrowUpRight size={11} /></a> : <span className="text-mute" title={op.error ?? ""}>{op.status}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {wallet.enabled && admin && <Link href="/chain" className="flex items-center justify-between border-t border-white/[.05] px-4 py-2.5 text-xs hover:bg-white/[.04]"><span>See every transaction on the chain</span><ArrowUpRight size={12} /></Link>}
    </section>
  );
}
