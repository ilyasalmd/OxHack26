"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { PriceChart } from "@/components/chart";
import { Avatar, Badge, Button, Change, Input, LiveNumber, Sheet, TopBar, ago, fmt, pct, timeLeft } from "@/components/ui";
import { TimeMachine } from "@/components/timemachine";
import { applyShares, priceYes, proceedsForShares, sharesForAmount } from "@/lib/lmsr";

type Person = { id: number; display_name: string; username: string; color: string };
type Detail = {
  market: {
    id: number; group_id: number; kind: "bet" | "stock"; decay: string; title: string; description: string; category: string; resolution_rule: string;
    ai_prob: number; base_rate: number | null; base_rate_n: number; open_prob: number; ai_rationale: string; ai_source: string;
    b: number; q_yes: number; q_no: number; status: string; outcome: boolean | null; created_at: string; resolves_at: string; volume: number; price: number; closed: boolean;
  };
  creator: Person;
  subject: Person | null;
  ticks: { ts: string; price: number; source: string }[];
  trades: { id: number; side: string; action: string; shares: number; coins: number; price_after: number; created_at: string; display_name: string; color: string }[];
  position: { yes_shares: number; no_shares: number; spent: number } | null;
  similar: { id: number; title: string; outcome: boolean; summary: string; similarity: number }[];
  me: { balance: number; maxStake: number; canTrade: boolean; canShort: boolean; canResolve: boolean; isSubject: boolean };
};

export default function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const { me, refresh } = useSession();
  const [d, setD] = useState<Detail | null>(null);
  const [hover, setHover] = useState<{ t: number; v: number } | null>(null);
  const [side, setSide] = useState<"yes" | "no" | null>(null);
  const [amount, setAmount] = useState(10);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const load = useCallback(() => api<Detail>(`/api/markets/${id}`).then(setD).catch((e) => setErr(e.message)), [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  if (!d || !me) return <main className="p-10 text-center text-mute">{err || "Loading…"}</main>;
  const m = d.market;
  const c = me.config.currency;
  const isStock = m.kind === "stock";
  // Stocks are quoted like a share price (0–100), bets as a chance.
  const show = (p: number) => (isStock ? fmt(p * 100) : pct(p));
  const resolved = m.status === "resolved";
  const book = { b: m.b, qYes: m.q_yes, qNo: m.q_no };
  const now = Date.parse(me.clock.now);
  const points = d.ticks.map((t) => ({ t: Date.parse(t.ts), v: t.price }));

  async function doTrade(action: "buy" | "sell", s: "yes" | "no", amt: number) {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/markets/${id}/trade`, { body: { side: s, action, amount: amt } });
      setSide(null);
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resolve(outcome: boolean) {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/markets/${id}/resolve`, { body: { outcome, note } });
      setResolveOpen(false);
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function recap() {
    setSpeaking(true);
    try {
      const r = await fetch(`/api/markets/${id}/voice`);
      if (r.headers.get("content-type")?.includes("audio")) {
        const audio = new Audio(URL.createObjectURL(await r.blob()));
        audio.onended = () => setSpeaking(false);
        await audio.play();
      } else {
        const { text } = await r.json();
        const u = new SpeechSynthesisUtterance(text);
        u.onend = () => setSpeaking(false);
        speechSynthesis.speak(u);
      }
    } catch {
      setSpeaking(false);
    }
  }

  const est = side && amount > 0 ? (() => {
    const shares = sharesForAmount(book, side, amount);
    return { shares, after: priceYes(applyShares(book, side, shares)) };
  })() : null;
  const pos = d.position;
  const posValue = pos ? pos.yes_shares * m.price + pos.no_shares * (1 - m.price) : 0;

  return (
    <main className="flex min-h-dvh flex-col">
      <TopBar
        back={`/g/${m.group_id}`}
        title={<span className="text-sm text-mute">{isStock ? "Stock" : "Bet"} · {m.category}</span>}
        right={
          <button onClick={recap} disabled={speaking} className="rounded-full bg-white/5 px-3 py-1 text-sm disabled:opacity-50" title="Hear a recap">
            {speaking ? "🔊 …" : "🔊 Recap"}
          </button>
        }
      />
      <div className="flex-1 px-4 pb-6">
        <div className="mt-4 flex items-center gap-2">
          {d.subject && <Avatar name={d.subject.display_name} color={d.subject.color} size={24} />}
          <span className="text-sm text-mute">{d.subject ? `About ${d.subject.display_name}` : "Open question"} · by {d.creator.display_name}</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold leading-tight">{m.title}</h1>
        {m.description && <p className="mt-1 text-sm text-mute">{m.description}</p>}

        <div className="mt-4">
          <div className="text-4xl font-bold tracking-tight tabular">
            {resolved ? (m.outcome ? "Resolved YES ✅" : "Resolved NO ❌") : <LiveNumber value={m.price}>{show(hover?.v ?? m.price)}</LiveNumber>}
          </div>
          {!resolved && (
            <div className="mt-1 flex items-center gap-2 text-sm text-mute">
              <Change from={m.open_prob} to={hover?.v ?? m.price} />
              <span>since listing · {isStock ? `matures ${new Date(m.resolves_at).toLocaleDateString("en-GB")}` : timeLeft(m.resolves_at, me.clock.now)}</span>
            </div>
          )}
        </div>

        <div className="mt-4">
          <PriceChart points={points} now={resolved ? Math.max(...points.map((p) => p.t)) : now} format={show} onHover={setHover} />
        </div>

        {!resolved && d.me.canTrade && (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="up" onClick={() => { setSide("yes"); setAmount(Math.min(10, d.me.maxStake)); }}>Long · {show(m.price)}</Button>
            <Button variant="down" onClick={() => { setSide("no"); setAmount(Math.min(10, d.me.maxStake)); }} disabled={!d.me.canShort}>Short · {show(1 - m.price)}</Button>
          </div>
        )}
        {!resolved && d.me.isSubject && (
          <p className="mt-3 rounded-2xl bg-brand/10 p-3 text-sm text-brand">
            {m.kind === "stock" ? "This one's about you: you can only go long. Invest in yourself 💪" : "This bet is about you, so you can't trade it."}
          </p>
        )}
        {!resolved && m.closed && <p className="mt-3 rounded-2xl bg-panel p-3 text-sm text-mute">Trading closed. Waiting for the result.</p>}
        {err && <p className="mt-2 text-sm text-down">{err}</p>}

        {pos && (pos.yes_shares > 0.001 || pos.no_shares > 0.001) && (
          <section className="mt-5 rounded-3xl bg-panel p-4">
            <div className="mb-2 text-sm font-semibold">Your position</div>
            <div className="flex justify-between text-sm">
              <span className="text-mute">Value</span>
              <span className="tabular">{fmt(resolved ? (m.outcome ? pos.yes_shares : pos.no_shares) : posValue)} {c.ticker}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-mute">Cost</span>
              <span className="tabular">{fmt(pos.spent)} {c.ticker}</span>
            </div>
            {pos.yes_shares > 0.001 && (
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-up">Long {fmt(pos.yes_shares)} sh · pays {fmt(pos.yes_shares)} if YES</span>
                {!resolved && !m.closed && <button className="text-mute hover:text-white" disabled={busy} onClick={() => doTrade("sell", "yes", pos.yes_shares)}>Sell for {fmt(proceedsForShares(book, "yes", pos.yes_shares))}</button>}
              </div>
            )}
            {pos.no_shares > 0.001 && (
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-down">Short {fmt(pos.no_shares)} sh · pays {fmt(pos.no_shares)} if NO</span>
                {!resolved && !m.closed && <button className="text-mute hover:text-white" disabled={busy} onClick={() => doTrade("sell", "no", pos.no_shares)}>Sell for {fmt(proceedsForShares(book, "no", pos.no_shares))}</button>}
              </div>
            )}
          </section>
        )}

        <section className="mt-5 rounded-3xl bg-panel p-4 text-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-semibold">How it was priced</span>
            <Badge tone="brand">{m.ai_source === "gemini" ? "Gemini" : "Stats model"}</Badge>
            {m.decay === "hazard" && <Badge tone="down">⏳ decays</Badge>}
          </div>
          <p className="text-mute">{m.ai_rationale}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-black/40 p-2"><div className="text-xs text-mute">AI</div><div className="font-semibold tabular">{pct(m.ai_prob)}</div></div>
            <div className="rounded-2xl bg-black/40 p-2"><div className="text-xs text-mute">History</div><div className="font-semibold tabular">{m.base_rate == null ? "–" : pct(m.base_rate)}</div></div>
            <div className="rounded-2xl bg-black/40 p-2"><div className="text-xs text-mute">Opened</div><div className="font-semibold tabular">{pct(m.open_prob)}</div></div>
          </div>
          <div className="mt-3 border-t border-line pt-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-mute">Resolution rule</div>
            <p className="mt-1">{m.resolution_rule}</p>
          </div>
          {isStock && (
            <p className="mt-3 text-xs text-mute">
              Stocks trade like a maturing bond: each long share pays 1 {c.ticker} (shown as 100) if it happens by {new Date(m.resolves_at).toLocaleDateString("en-GB")}.
              {m.decay === "hazard" ? " With no news, the price drifts down as maturity gets closer." : " The outcome is only known at maturity."}
            </p>
          )}
        </section>

        {d.similar.length > 0 && (
          <section className="mt-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">📚 Past data</h3>
            {d.similar.map((s) => (
              <div key={s.id} className="mb-2 rounded-2xl bg-panel p-3 text-sm">
                <div className="flex gap-2">
                  <span className={s.outcome ? "text-up" : "text-down"}>{s.outcome ? "YES" : "NO"}</span>
                  <span className="flex-1 font-medium">{s.title}</span>
                </div>
                <div className="mt-1 text-mute">{s.summary}</div>
              </div>
            ))}
          </section>
        )}

        <section className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">Activity</h3>
          {d.trades.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2 text-sm">
              <Avatar name={t.display_name} color={t.color} size={26} />
              <div className="flex-1">
                <b>{t.display_name}</b> {t.action === "buy" ? (t.side === "yes" ? "went long" : "went short") : `sold ${t.side === "yes" ? "long" : "short"}`}
              </div>
              <span className="tabular">{fmt(t.coins, 0)}</span>
              <span className="w-16 whitespace-nowrap text-right text-mute tabular">→ {show(t.price_after)}</span>
              <span className="w-8 text-right text-xs text-mute">{ago(t.created_at, me.clock.now)}</span>
            </div>
          ))}
          {!d.trades.length && <p className="text-sm text-mute">No trades yet. Be first.</p>}
        </section>

        {d.me.canResolve && (
          <Button variant="ghost" className="mt-6 w-full" onClick={() => setResolveOpen(true)}>Resolve this situation</Button>
        )}
      </div>
      <TimeMachine onJump={load} />

      <Sheet open={!!side} onClose={() => setSide(null)} title={side === "yes" ? "Go long" : "Go short"}>
        <div className="space-y-4">
          <p className="text-sm text-mute">{side === "yes" ? `You win if "${m.title}" happens.` : `You win if "${m.title}" doesn't happen.`}</p>
          <div className="text-center text-5xl font-bold tabular">{fmt(amount, 0)} <span className="text-xl text-mute">{c.ticker}</span></div>
          <input type="range" min={1} max={Math.max(1, Math.floor(d.me.maxStake))} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full accent-white" />
          <div className="flex justify-between text-xs text-mute">
            <span>Balance {fmt(d.me.balance, 0)}</span>
            <span>Max stake {fmt(d.me.maxStake, 0)} (keeps {me.config.economy.balanceFloor} safe)</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[0.1, 0.25, 0.5, 1].map((f) => (
              <button key={f} onClick={() => setAmount(Math.max(1, Math.floor(d.me.maxStake * f)))} className="rounded-full bg-white/5 py-1.5 text-sm">{f === 1 ? "Max" : `${f * 100}%`}</button>
            ))}
          </div>
          {est && (
            <div className="space-y-1 rounded-2xl bg-black/40 p-3 text-sm">
              <div className="flex justify-between"><span className="text-mute">Shares</span><span className="tabular">{fmt(est.shares)}</span></div>
              <div className="flex justify-between"><span className="text-mute">Pays if right</span><span className="tabular text-up">{fmt(est.shares)} {c.ticker} (+{fmt(est.shares - amount)})</span></div>
              <div className="flex justify-between"><span className="text-mute">Price moves</span><span className="tabular">{show(m.price)} → {show(est.after)}</span></div>
            </div>
          )}
          {d.me.maxStake < 1 && <p className="text-sm text-down">You&apos;re at the safety floor. Your weekly +{me.config.economy.weeklyAllowance} will top you up.</p>}
          {err && <p className="text-sm text-down">{err}</p>}
          <Button variant={side === "yes" ? "up" : "down"} className="w-full" disabled={busy || d.me.maxStake < 1} onClick={() => side && doTrade("buy", side, amount)}>
            {busy ? "Placing…" : `Confirm ${side === "yes" ? "long" : "short"}`}
          </Button>
        </div>
      </Sheet>

      <Sheet open={resolveOpen} onClose={() => setResolveOpen(false)} title="Resolve">
        <div className="space-y-3">
          <p className="text-sm text-mute">{m.resolution_rule}</p>
          <Input placeholder="What happened? (optional, saved to group memory)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="up" disabled={busy} onClick={() => resolve(true)}>YES, it happened</Button>
            <Button variant="down" disabled={busy} onClick={() => resolve(false)}>NO</Button>
          </div>
          {err && <p className="text-sm text-down">{err}</p>}
          <Link href={`/g/${m.group_id}`} className="block text-center text-sm text-mute">Back to chat</Link>
        </div>
      </Sheet>
    </main>
  );
}
