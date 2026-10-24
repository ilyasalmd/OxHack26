"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { PriceChart } from "@/components/chart";
import { Badge, Coins, TopBar, fmt, pct } from "@/components/ui";
import { ArrowUpRight, Wallet } from "@/components/icons";

type P = {
  netWorth: { balance: number; positions: number; total: number };
  series: { ts: string; balance: number; net_worth: number }[];
  positions: { market_id: number; title: string; kind: string; status: string; group: string; yes: number; no: number; spent: number; price: number; value: number }[];
  ledger: { ts: string; delta: number; balance_after: number; reason: string }[];
  wallet: { address: string; url: string; mint: string | null; onChain: number | null; enabled: boolean; network: string | null } | null;
  chain: { id: number; kind: string; amount: number; status: string; url: string | null; error: string | null }[];
};

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
  const cashCards = (
    <>
      <div className="rounded-xl border border-line bg-panel p-3"><div className="text-xs text-mute">Cash</div><div className="font-semibold tabular">{fmt(p.netWorth.balance)}</div></div>
      <div className="rounded-xl border border-line bg-panel p-3"><div className="text-xs text-mute">Invested</div><div className="font-semibold tabular">{fmt(p.netWorth.positions)}</div></div>
    </>
  );
  const walletCard = p.wallet && (
    <section className="mt-6 rounded-xl border border-line bg-panel p-4 text-sm lg:mt-0">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mute"><Wallet size={13} /> Solana wallet{p.wallet.network ? ` · ${p.wallet.network}` : ""}</h3>
      <a href={p.wallet.url} target="_blank" rel="noreferrer" className="block truncate font-mono text-xs text-mute hover:text-white">{p.wallet.address}</a>
      {p.wallet.enabled ? (
        <div className="mt-2 flex justify-between">
          <span className="text-mute">On-chain {c.ticker}</span>
          <span className="tabular">{p.wallet.onChain == null ? "–" : fmt(p.wallet.onChain)}</span>
        </div>
      ) : (
        <p className="mt-2 text-mute">Chain sync is off: set SOLANA_PAYER_SECRET and SOLANA_MINT to mirror every stake (burn) and payout (mint) on devnet.</p>
      )}
      <div className="mt-3 space-y-1.5">
        {p.chain.slice(0, 8).map((op) => (
          <div key={op.id} className="flex items-center gap-2 text-xs">
            <Badge tone={op.kind === "mint" ? "up" : "down"}>{op.kind}</Badge>
            <span className="tabular">{fmt(op.amount)}</span>
            <span className="flex-1" />
            {op.url ? <a href={op.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand">confirmed <ArrowUpRight size={11} /></a> : <span className="text-mute" title={op.error ?? ""}>{op.status}</span>}
          </div>
        ))}
      </div>
      {p.wallet.enabled && <Link href="/chain" className="mt-3 flex items-center justify-between rounded-lg bg-white/[.04] px-3 py-2 text-xs hover:bg-white/[.07]"><span>See every transaction on the chain</span><ArrowUpRight size={12} /></Link>}
    </section>
  );

  return (
    <main className="flex min-h-dvh flex-col lg:min-h-full">
      <TopBar title="Wallet" />
      <div className="flex-1 px-4 pb-6 lg:mx-auto lg:grid lg:w-full lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10 lg:px-8 lg:pt-4">
       <div className="min-w-0">
        <div className="mt-5 text-sm text-mute">Net worth</div>
        <div className="text-4xl font-semibold tracking-tight lg:text-5xl">
          <Coins value={hover?.v ?? p.netWorth.total} ticker={c.ticker} />
        </div>
        <div className={`text-sm ${p.netWorth.total >= first ? "text-up" : "text-down"}`}>
          {p.netWorth.total >= first ? "▲" : "▼"} {fmt(Math.abs(p.netWorth.total - first))} all time
        </div>
        <div className="mt-4">
          <PriceChart points={points} now={Date.now() + me.clock.offsetMs} format={(v) => `${fmt(v)} ${c.ticker}`} onHover={setHover} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 lg:hidden">{cashCards}</div>

        <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-mute">Open positions</h3>
        {open.map((x) => (
          <Link key={x.market_id} href={`/m/${x.market_id}`} className="flex items-center gap-3 border-b border-line py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{x.title}</div>
              <div className="text-xs text-mute">{x.group} · {x.yes > 0.001 ? `long ${fmt(x.yes)}` : ""}{x.no > 0.001 ? ` short ${fmt(x.no)}` : ""} · now {pct(x.price)}</div>
            </div>
            <div className="text-right">
              <div className="tabular">{fmt(x.value)}</div>
              <div className={`text-xs tabular ${x.value >= x.spent ? "text-up" : "text-down"}`}>{x.value >= x.spent ? "+" : ""}{fmt(x.value - x.spent)}</div>
            </div>
          </Link>
        ))}
        {!open.length && <p className="text-sm text-mute">No open positions.</p>}

        <div className="lg:hidden">{walletCard}</div>

        <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-mute">History</h3>
        {p.ledger.map((l, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line py-2 text-sm">
            <div className="min-w-0 flex-1 truncate">{l.reason}</div>
            <div className={`tabular ${l.delta >= 0 ? "text-up" : "text-down"}`}>{l.delta >= 0 ? "+" : ""}{fmt(l.delta)}</div>
          </div>
        ))}
       </div>
       <aside className="sticky top-20 mt-6 hidden space-y-3 lg:block">
        <div className="grid grid-cols-2 gap-2">{cashCards}</div>
        {walletCard}
       </aside>
      </div>
      
    </main>
  );
}

