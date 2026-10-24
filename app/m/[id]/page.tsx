"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { PriceChart } from "@/components/chart";
import { BetSlip, odds } from "@/components/bet-slip";
import { Avatar, Badge, Button, Change, Input, LiveNumber, Sheet, TopBar, ago, fmt, pct, timeLeft } from "@/components/ui";
import { TimeMachine } from "@/components/timemachine";
import { proceedsForShares, type Side } from "@/lib/lmsr";
import { fmtLine, priceMeaning, sides, typeLabel } from "@/lib/labels";
import { formatOdds, useOddsFormat } from "@/lib/odds";
import { Book, Chat, ChevronRight, Flag, Hourglass, More, Volume } from "@/components/icons";
import { ReportSheet } from "@/components/report";
import { SETTLE_WINDOW_HOURS } from "@/lib/safety";

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const q = matchMedia("(min-width: 1024px)");
    const on = () => setWide(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return wide;
}

type Person = { id: number; display_name: string; username: string; color: string };
type Detail = {
  market: {
    id: number; group_id: number; kind: "bet" | "stock"; answer: "yesno" | "number"; line: number | null; unit: string; actual: number | null; decay: string; title: string; description: string; category: string; resolution_rule: string;
    ai_prob: number; base_rate: number | null; base_rate_n: number; open_prob: number; ai_rationale: string; ai_source: string;
    chat_context: { shared: number; used: { who: string; text: string; age: string; why: string }[] } | null;
    b: number; q_yes: number; q_no: number; status: string; outcome: boolean | null; void_reason: "veto" | "dispute" | "reports" | null; created_at: string; resolves_at: string; volume: number; price: number; closed: boolean; fees_held: number;
  };
  creator: Person;
  subject: Person | null;
  proposal: { outcome: boolean; note: string; by: Person | null; at: string; settlesAt: string } | null;
  ticks: { ts: string; price: number; source: string }[];
  trades: { id: number; side: string; action: string; shares: number; coins: number; price_after: number; created_at: string; display_name: string; color: string }[];
  position: { yes_shares: number; no_shares: number; spent: number } | null;
  similar: { id: number; title: string; outcome: boolean; summary: string; similarity: number }[];
  me: { balance: number; maxStake: number; canTrade: boolean; canShort: boolean; canSell: boolean; fee: number; canResolve: boolean; canResolveYes: boolean; canResolveNo: boolean; canConfirm: boolean; canVeto: boolean; canReport: boolean; reported: boolean; isSubject: boolean };
};

export default function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const { me, refresh } = useSession();
  const [d, setD] = useState<Detail | null>(null);
  const [hover, setHover] = useState<{ t: number; v: number } | null>(null);
  // The slip's side; on a phone it opens as a sheet, on a laptop it sits beside the chart.
  const [side, setSide] = useState<Side>("yes");
  const [oddsFmt] = useOddsFormat();
  const [slipOpen, setSlipOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [note, setNote] = useState("");
  const [actual, setActual] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // Calling a situation off and disputing a result both void it and refund everyone, so they ask first.
  const [confirming, setConfirming] = useState<"veto" | "dispute" | null>(null);
  const wide = useWide();

  // The overview's Long and Short buttons land here with ?side= so the ticket opens ready.
  useEffect(() => {
    const s = new URLSearchParams(location.search).get("side");
    if (s !== "yes" && s !== "no") return;
    setSide(s);
    if (!matchMedia("(min-width: 1024px)").matches) setSlipOpen(true);
  }, []);

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
  const voided = m.status === "void";
  const proposal = d.proposal;
  const book = { b: m.b, qYes: m.q_yes, qNo: m.q_no };
  const lbl = sides(m);
  const isNumber = m.answer === "number" && m.line != null;
  // Live app clock (real time + demo offset), so a brand-new market still draws a line.
  const now = Date.now() + me.clock.offsetMs;
  const points = d.ticks.map((t) => ({ t: Date.parse(t.ts), v: t.price }));

  async function doTrade(action: "buy" | "sell", s: "yes" | "no", amt: number) {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/markets/${id}/trade`, { body: { side: s, action, amount: amt } });
      setSlipOpen(false);
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
      // A number question is settled by the number; the server works out which side that is.
      const value = Number(actual.replace(",", "."));
      if (isNumber && !Number.isFinite(value)) throw new Error(`Enter the actual number${m.unit ? ` in ${m.unit}` : ""}`);
      await api(`/api/markets/${id}/resolve`, { body: isNumber ? { value, note } : { outcome, note } });
      setResolveOpen(false);
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  /** Confirm a proposed result, dispute it, or (if it's about you) call the situation off. */
  async function act(what: "confirm" | "dispute" | "veto") {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/markets/${id}/${what}`, { method: "POST", body: {} });
      setConfirming(null);
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setErr((e as Error).message);
      setConfirming(null);
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

  const pos = d.position;
  const hasPos = !!pos && (pos.yes_shares > 0.001 || pos.no_shares > 0.001);
  const posValue = pos ? pos.yes_shares * m.price + pos.no_shares * (1 - m.price) : 0;

  const positionCard = hasPos && pos && (
    <section className="rounded-2xl border border-line bg-panel p-4">
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
        <div className="mt-2 flex items-center justify-between gap-2 text-sm">
          <span className="text-up">{isStock && !isNumber ? "Holding" : lbl.yes} {fmt(pos.yes_shares)} shares</span>
          {!resolved && !m.closed && d.me.canSell && <button className="shrink-0 rounded-lg bg-white/[.07] px-3 py-1.5 text-sm font-medium hover:bg-white/10" disabled={busy} onClick={() => doTrade("sell", "yes", pos.yes_shares)}>Sell for {fmt(proceedsForShares(book, "yes", pos.yes_shares))}</button>}
        </div>
      )}
      {pos.no_shares > 0.001 && (
        <div className="mt-1 flex items-center justify-between gap-2 text-sm">
          <span className="text-down">{lbl.no} {fmt(pos.no_shares)} shares</span>
          {!resolved && !m.closed && d.me.canSell && <button className="shrink-0 rounded-lg bg-white/[.07] px-3 py-1.5 text-sm font-medium hover:bg-white/10" disabled={busy} onClick={() => doTrade("sell", "no", pos.no_shares)}>Close for {fmt(proceedsForShares(book, "no", pos.no_shares))}</button>}
        </div>
      )}
      {!resolved && !m.closed && !d.me.canSell && <p className="mt-2 text-xs text-mute">Locked in. A bet rides to the result and pays out when it settles.</p>}
    </section>
  );

  return (
    <main className="flex min-h-dvh flex-col lg:min-h-full">
      <TopBar
        back={`/g/${m.group_id}`}
        backOnDesktop
        title={<span className="text-sm text-mute">{typeLabel(m)} · {m.category}</span>}
        right={
          <>
            <button onClick={recap} disabled={speaking} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50" title="Hear a recap">
              <Volume size={15} /> {speaking ? "Playing…" : "Recap"}
            </button>
            <div className="relative">
              <button onClick={() => setMenu((v) => !v)} className="rounded-lg p-1.5 text-mute hover:bg-white/5 hover:text-white" aria-label="More" aria-expanded={menu}>
                <More size={18} />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                  <div className="pop absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-line bg-raised py-1 text-sm shadow-xl">
                    {d.me.canVeto && (
                      <button className="block w-full px-3.5 py-2 text-left hover:bg-white/5" onClick={() => { setMenu(false); setConfirming("veto"); }}>Call this one off</button>
                    )}
                    {d.me.canReport && (
                      <button
                        disabled={d.me.reported}
                        className="flex w-full items-center gap-2 px-3.5 py-2 text-left hover:bg-white/5 disabled:text-mute disabled:hover:bg-transparent"
                        onClick={() => { setMenu(false); setReportOpen(true); }}
                      >
                        <Flag size={14} /> {d.me.reported ? "You reported this" : "Report this situation"}
                      </button>
                    )}
                    {!d.me.canVeto && !d.me.canReport && <div className="px-3.5 py-2 text-mute">Nothing to do here</div>}
                  </div>
                </>
              )}
            </div>
          </>
        }
      />
      <div className="flex-1 px-4 pb-6 lg:mx-auto lg:grid lg:w-full lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-10 lg:px-8 lg:pt-4">
       <div className="min-w-0">
        <div className="mt-4 flex items-center gap-2">
          {d.subject && <Avatar name={d.subject.display_name} color={d.subject.color} size={24} />}
          <span className="text-sm text-mute">{d.subject ? `About ${d.subject.display_name}` : "Open question"} · by {d.creator.display_name}</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight lg:text-3xl">{m.title}</h1>
        {m.description && <p className="mt-1 text-sm text-mute">{m.description}</p>}

        <div className="mt-4">
          <div className="text-4xl font-semibold tracking-tight tabular lg:text-5xl">
            {voided ? <span className="text-mute">Called off</span> : resolved ? <span className={m.outcome ? "text-up" : "text-down"}>{isNumber && m.actual != null ? `Settled: ${fmtLine(m.actual, m.unit)}` : m.outcome ? `Resolved ${lbl.yes.toUpperCase()}` : `Resolved ${lbl.no.toUpperCase()}`}</span> : <LiveNumber value={m.price}>{show(hover?.v ?? m.price)}</LiveNumber>}
          </div>
          {!resolved && !voided && (
            <div className="mt-1 flex items-center gap-2 text-sm text-mute">
              <Change from={m.open_prob} to={hover?.v ?? m.price} />
              <span>{isNumber ? `${priceMeaning(m)} · ` : ""}since listing · {isStock ? `matures ${new Date(m.resolves_at).toLocaleDateString("en-GB")}` : timeLeft(m.resolves_at, me.clock.now)}</span>
            </div>
          )}
        </div>

        <div className="mt-4">
          <PriceChart points={points} now={resolved || voided ? Math.max(...points.map((p) => p.t)) : now} format={show} onHover={setHover} height={wide ? 300 : 180} />
        </div>

        {voided && (
          <section className="mt-4 rounded-2xl border border-line bg-panel p-4 text-sm">
            <div className="font-semibold">This situation was called off</div>
            <p className="mt-1 text-mute">
              {m.void_reason === "veto" && `${d.subject?.display_name ?? "The person it was about"} called it off.`}
              {m.void_reason === "dispute" && "The proposed result was disputed."}
              {m.void_reason === "reports" && "Members reported it."}
              {!m.void_reason && "It was voided."} Everyone was refunded what they spent, so nobody wins or loses.
            </p>
          </section>
        )}
        {proposal && (
          <section className="mt-4 rounded-2xl border border-brand/30 bg-brand/5 p-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge tone="brand">Result proposed</Badge>
              <span className={`font-semibold ${proposal.outcome ? "text-up" : "text-down"}`}>{isNumber ? (proposal.outcome ? `${lbl.yes}` : `${lbl.no}`) : proposal.outcome ? "YES, it happened" : "NO, it didn't"}</span>
            </div>
            <p className="mt-2 text-mute">
              {proposal.by?.display_name ?? "Someone"} says so{proposal.note ? `: “${proposal.note}”` : ""}. Trading is closed.
              {d.me.canConfirm
                ? " Does that match what happened?"
                : d.me.isSubject
                  ? " It's about you, so you can't confirm or dispute it, but you can call it off."
                  : " Another member has to confirm or dispute it."}
            </p>
            <p className="mt-1 text-xs text-mute">
              {new Date(proposal.settlesAt).getTime() > now
                ? `If nobody replies, it settles as proposed in ${timeLeft(proposal.settlesAt, new Date(now)).replace(" left", "")}.`
                : "Nobody replied in time, so it is about to settle as proposed."}
            </p>
            {d.me.canConfirm && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="up" disabled={busy || !(proposal.outcome ? d.me.canResolveYes : d.me.canResolveNo)} onClick={() => act("confirm")}>Confirm</Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirming("dispute")}>Dispute</Button>
                {!(proposal.outcome ? d.me.canResolveYes : d.me.canResolveNo) && (
                  <p className="col-span-2 text-xs text-mute">You&apos;d gain from this result, so someone without that stake has to confirm it. You can still dispute it.</p>
                )}
              </div>
            )}
          </section>
        )}
        {!resolved && !voided && d.me.canTrade && !m.closed && (
          <div className="mt-5 grid grid-cols-2 gap-2 lg:hidden">
            <button onClick={() => { setSide("yes"); setSlipOpen(true); }} className="rounded-2xl bg-up px-4 py-3 text-left text-black transition active:scale-[.98]">
              <div className="text-sm font-semibold">{lbl.yes}</div>
              <div className="text-2xl font-semibold tracking-tight tabular">{isStock && !isNumber ? show(m.price) : formatOdds(m.price, oddsFmt)}</div>
              {!(isStock && !isNumber) && <div className="text-[11px] text-black/60">{pct(m.price)} chance</div>}
            </button>
            <button onClick={() => { setSide("no"); setSlipOpen(true); }} disabled={!d.me.canShort} className="rounded-2xl bg-down px-4 py-3 text-left text-white transition active:scale-[.98] disabled:opacity-40">
              <div className="text-sm font-semibold">{lbl.no}</div>
              <div className="text-2xl font-semibold tracking-tight tabular">{isStock && !isNumber ? show(1 - m.price) : formatOdds(1 - m.price, oddsFmt)}</div>
              {!(isStock && !isNumber) && <div className="text-[11px] text-white/60">{pct(1 - m.price)} chance</div>}
            </button>
          </div>
        )}
        {!resolved && !voided && d.me.isSubject && (
          <div className="mt-3 rounded-xl bg-brand/10 p-3 text-sm text-brand">
            <p>{m.kind === "stock" ? "This one's about you: you can only go long. Invest in yourself." : "This bet is about you, so you can't trade it."}</p>
            {d.me.canVeto && (
              <button className="mt-2 text-white underline underline-offset-2 hover:text-white/80" onClick={() => setConfirming("veto")}>Not comfortable with this? Call it off</button>
            )}
          </div>
        )}
        {!resolved && !voided && !proposal && m.closed && <p className="mt-3 rounded-xl border border-line bg-panel p-3 text-sm text-mute">Trading closed. Waiting for the result.</p>}
        {err && <p className="mt-2 text-sm text-down">{err}</p>}

        {positionCard && <div className="mt-5 lg:hidden">{positionCard}</div>}

        <Fold title="Why this price" summary={<><Badge tone="brand">{m.ai_source === "ollama" ? "Local AI" : m.ai_source === "gemini" ? "Gemini" : "Stats model"}</Badge>{m.decay === "hazard" && <Badge tone="down"><span className="inline-flex items-center gap-1"><Hourglass size={11} /> decays</span></Badge>}</>}>
          <p className="text-mute">{m.ai_rationale}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-ink p-2"><div className="text-xs text-mute">AI</div><div className="font-semibold tabular">{pct(m.ai_prob)}</div></div>
            <div className="rounded-xl bg-ink p-2"><div className="text-xs text-mute">History</div><div className="font-semibold tabular">{m.base_rate == null ? "–" : pct(m.base_rate)}</div></div>
            <div className="rounded-xl bg-ink p-2"><div className="text-xs text-mute">Opened</div><div className="font-semibold tabular">{pct(m.open_prob)}</div></div>
          </div>
          {m.chat_context && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-mute">
                <Chat size={12} /> Chat used ({m.chat_context.used.length} of {m.chat_context.shared} shared, anonymised)
              </div>
              {m.chat_context.used.map((s, i) => (
                <div key={i} className="mt-1.5 rounded-lg bg-ink p-2">
                  <div className="text-xs text-mute">{s.who} · {s.age} · {s.why}</div>
                  <div>{s.text}</div>
                </div>
              ))}
              {!m.chat_context.used.length && <p className="mt-1 text-mute">None of the shared messages were relevant.</p>}
            </div>
          )}
          <div className="mt-3 border-t border-line pt-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-mute">Resolution rule</div>
            <p className="mt-1">{m.resolution_rule}</p>
          </div>
          {isStock && (
            <p className="mt-3 text-xs text-mute">
              Stocks trade like a maturing bond: each long share pays 1 {c.ticker} (shown as 100) if it happens by {new Date(m.resolves_at).toLocaleDateString("en-GB")}.
              {m.decay === "hazard" ? " With no news, the price drifts down as maturity gets closer." : " The outcome is only known at maturity."}
              {" "}Your first trade here is free; after that each trade pays {me.config.economy.stockFee} {c.ticker} to {d.creator.display_name}, who listed it, paid out at maturity{m.fees_held > 0 ? ` (${fmt(m.fees_held)} ${c.ticker} held so far)` : ""}.
            </p>
          )}
        </Fold>

        {d.similar.length > 0 && (
          <Fold title="Past data" summary={<span className="flex items-center gap-1.5 text-xs text-mute"><Book size={12} /> {d.similar.length} similar</span>}>
            {d.similar.map((s) => (
              <div key={s.id} className="mb-2 rounded-xl border border-line bg-panel p-3 text-sm">
                <div className="flex gap-2">
                  <span className={s.outcome ? "text-up" : "text-down"}>{s.outcome ? "YES" : "NO"}</span>
                  <span className="flex-1 font-medium">{s.title}</span>
                </div>
                <div className="mt-1 text-mute">{s.summary}</div>
              </div>
            ))}
          </Fold>
        )}

        <Fold title="Activity" summary={<span className="text-xs text-mute tabular">{d.trades.length} trades</span>}>
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
        </Fold>

        {d.me.canResolve && (
          <Button variant="ghost" className="mt-6 w-full lg:hidden" onClick={() => setResolveOpen(true)}>Propose the result</Button>
        )}
       </div>

       {/* Laptop: trade ticket beside the chart */}
       <aside className="sticky top-20 mt-6 hidden space-y-4 lg:block">
        {!resolved && !voided && d.me.canTrade && !m.closed && (
          <section className="rounded-2xl border border-line bg-panel p-4">
            <BetSlip market={m} book={book} side={side} onSide={setSide} canShort={d.me.canShort} balance={d.me.balance} maxStake={d.me.maxStake} floor={me.config.economy.balanceFloor} ticker={c.ticker} fee={d.me.fee} lister={d.creator.display_name} busy={busy} err={err} onPlace={(s, amt) => doTrade("buy", s, amt)} />
          </section>
        )}
        {positionCard}
        {d.me.canResolve && <Button variant="ghost" className="w-full" onClick={() => setResolveOpen(true)}>Propose the result</Button>}
       </aside>
      </div>
      <div className="lg:hidden"><TimeMachine onJump={load} /></div>

      <Sheet open={slipOpen && !wide} onClose={() => setSlipOpen(false)} title={isStock ? "Trade" : "Bet slip"}>
        <BetSlip market={m} book={book} side={side} onSide={setSide} canShort={d.me.canShort} balance={d.me.balance} maxStake={d.me.maxStake} floor={me.config.economy.balanceFloor} ticker={c.ticker} fee={d.me.fee} lister={d.creator.display_name} busy={busy} err={err} onPlace={(s, amt) => doTrade("buy", s, amt)} />
      </Sheet>

      <Sheet open={resolveOpen} onClose={() => setResolveOpen(false)} title="Propose the result">
        <div className="space-y-3">
          <p className="text-sm text-mute">{m.resolution_rule}</p>
          <p className="text-xs text-mute">Trading closes now. Another member (not the person it&apos;s about) confirms or disputes your call. If nobody does, it settles as you proposed after {SETTLE_WINDOW_HOURS} hours. A dispute calls the situation off and refunds everyone.</p>
          {isNumber ? (
            <>
              <label className="block rounded-2xl border border-line bg-ink p-4">
                <span className="text-xs text-mute">What was the actual number?</span>
                <div className="mt-1 flex items-baseline gap-2">
                  <input inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value.replace(/[^0-9.,-]/g, ""))} placeholder={String(m.line)} aria-label="Actual value" className="w-full min-w-0 bg-transparent !text-[32px] font-semibold leading-none tracking-tight tabular outline-none placeholder:text-white/20" />
                  {m.unit && <span className="text-lg text-mute">{m.unit}</span>}
                </div>
                <p className="mt-2 text-xs text-mute">The line is {fmtLine(m.line!, m.unit)}. Over it pays {lbl.yes}, {fmtLine(m.line!, m.unit)} or under pays {lbl.no}.</p>
              </label>
              <Input placeholder="Anything to add? (optional, saved to group memory)" value={note} onChange={(e) => setNote(e.target.value)} />
              {(() => {
                const v = Number(actual.replace(",", "."));
                const over = Number.isFinite(v) && actual !== "" ? v > m.line! : null;
                const allowed = over == null ? false : over ? d.me.canResolveYes : d.me.canResolveNo;
                return (
                  <>
                    <Button variant={over === false ? "down" : "up"} className="w-full" disabled={busy || over == null || !allowed} onClick={() => resolve(over!)}>
                      {over == null ? "Enter the number" : `Settle as ${over ? lbl.yes : lbl.no}`}
                    </Button>
                    {over != null && !allowed && <p className="text-xs text-mute">You&apos;d gain from that result, so a friend without a stake in it has to enter it.</p>}
                  </>
                );
              })()}
            </>
          ) : (
            <>
              <Input placeholder="What happened? (optional, saved to group memory)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="up" disabled={busy || !d.me.canResolveYes} onClick={() => resolve(true)}>YES, it happened</Button>
                <Button variant="down" disabled={busy || !d.me.canResolveNo} onClick={() => resolve(false)}>NO</Button>
              </div>
              {!(d.me.canResolveYes && d.me.canResolveNo) && (
                <p className="text-xs text-mute">You have a stake in this, so a friend without one has to call it your way.</p>
              )}
            </>
          )}
          {err && <p className="text-sm text-down">{err}</p>}
          <Link href={`/g/${m.group_id}`} className="block text-center text-sm text-mute">Back to chat</Link>
        </div>
      </Sheet>

      <Sheet open={!!confirming} onClose={() => setConfirming(null)} title={confirming === "veto" ? "Call this one off?" : "Dispute this result?"}>
        <div className="space-y-4">
          <p className="text-sm text-mute">
            {confirming === "veto"
              ? "The situation is voided for everyone. Every trade is refunded in full, it leaves the live list, and the chat is told you called it off. You can't undo this."
              : "The situation is voided for everyone instead of settling. Every trade is refunded in full. You can't undo this."}
          </p>
          {err && <p className="text-sm text-down">{err}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirming(null)}>Cancel</Button>
            <Button variant="down" className="flex-[2]" disabled={busy} onClick={() => act(confirming === "veto" ? "veto" : "dispute")}>
              {busy ? "Working…" : confirming === "veto" ? "Call it off" : "Dispute and refund"}
            </Button>
          </div>
        </div>
      </Sheet>

      <ReportSheet open={reportOpen} onClose={() => { setReportOpen(false); load(); }} kind="situation" url={`/api/markets/${id}/report`} onDone={() => load()} />
    </main>
  );
}

/** A quiet, closed-by-default section, so the page leads with the price and the slip. */
function Fold({ title, summary, children }: { title: string; summary?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="group mt-3 rounded-2xl border border-line bg-panel text-sm open:pb-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold">{title}</span>
        <span className="ml-auto flex items-center gap-2">{summary}</span>
        <ChevronRight size={16} className="text-mute transition group-open:rotate-90" />
      </summary>
      <div className="px-4">{children}</div>
    </details>
  );
}
