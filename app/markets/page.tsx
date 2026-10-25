"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { formatOdds, useOddsFormat } from "@/lib/odds";
import { Change, LiveNumber, fmt, pct, timeLeft } from "@/components/ui";
import { Timer, TrendUp, Users } from "@/components/icons";
import { fmtLine } from "@/lib/labels";

type Situation = { id: number; title: string; kind: "bet" | "stock"; answer: "yesno" | "number"; line: number | null; unit: string; category: string; group: string; group_id: number; creator: string; resolves_at: string; volume: number; traders: number; price: number; change: number };
type FriendBet = { id: number; title: string; side: "yes" | "no"; stake: number; theirStake: number; status: "open" | "live" | "claimed" | "settled" | "cancelled" | "refunded"; resolves_at: string; created_at: string; settled_at: string | null; group: string; group_id: number; creator: string; creator_id: number; taker: string | null; taker_id: number | null; winner: string | null; winner_id: number | null };
type Settled = { id: number; title: string; kind: "bet" | "stock"; status: "resolved" | "void"; outcome: boolean | null; at: string; volume: number; group: string; group_id: number; mine: number | null };
type Feed = { markets: Situation[]; friendBets: FriendBet[]; settled: Settled[] };

type Filter = "all" | "invest" | "bets" | "friend" | "settled";
const FILTERS: { k: Filter; label: string; blurb: string }[] = [
  { k: "all", label: "All", blurb: "Everything live across your chats." },
  { k: "invest", label: "Invest", blurb: "Long term. The price moves as news arrives; back the people you believe in." },
  { k: "bets", label: "Bets", blurb: "Short term. Yes or no, settled soon." },
  { k: "friend", label: "Friend bets", blurb: "One on one. Two friends, one bet, the winner takes both stakes." },
  { k: "settled", label: "Settled", blurb: "What already happened, and how you did." },
];
const LIVE = new Set(["open", "live", "claimed"]);

/** Stakes: every stake across your chats in one feed, filtered by kind. Tap one to back it. */
export default function MarketsPage() {
  return (
    <Suspense fallback={null}>
      <Markets />
    </Suspense>
  );
}

function Markets() {
  const { me, loading } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [feed, setFeed] = useState<Feed | null>(null);
  const initial = params.get("kind") === "stock" ? "invest" : params.get("kind") === "bet" ? "bets" : ((params.get("f") as Filter) ?? "all");
  const [filter, setFilter] = useState<Filter>(FILTERS.some((f) => f.k === initial) ? initial : "all");
  const [group, setGroup] = useState<number | null>(params.get("g") ? Number(params.get("g")) : null);

  useEffect(() => {
    if (!loading && !me) router.replace("/?next=/markets");
  }, [loading, me, router]);
  const userId = me?.user.id;
  useEffect(() => {
    if (!userId) return;
    const load = () => api<Feed>("/api/feed").then(setFeed).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [userId]);

  const groups = useMemo(() => {
    const seen = new Map<number, string>();
    for (const m of [...(feed?.markets ?? []), ...(feed?.friendBets ?? []), ...(feed?.settled ?? [])]) seen.set(m.group_id, m.group);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [feed]);
  if (!me) return null;
  const inGroup = <T extends { group_id: number }>(xs: T[] | undefined) => (xs ?? []).filter((x) => group == null || x.group_id === group);
  const markets = inGroup(feed?.markets);
  const friendBets = inGroup(feed?.friendBets);
  const settled = inGroup(feed?.settled);
  const liveFriend = friendBets.filter((b) => LIVE.has(b.status));
  const doneFriend = friendBets.filter((b) => !LIVE.has(b.status));
  const stocks = markets.filter((m) => m.kind === "stock");
  const bets = markets.filter((m) => m.kind !== "stock");
  const counts: Record<Filter, number> = { all: markets.length + liveFriend.length, invest: stocks.length, bets: bets.length, friend: liveFriend.length, settled: settled.length + doneFriend.length };
  const current = FILTERS.find((x) => x.k === filter)!;

  type Item = { key: string; at: number; node: React.ReactNode };
  const now = me.clock.now;
  const showGroup = group == null;
  const mk = (s: Situation): Item => ({ key: `m${s.id}`, at: Date.parse(s.resolves_at), node: <Card s={s} now={now} showGroup={showGroup} /> });
  const fb = (b: FriendBet): Item => ({ key: `f${b.id}`, at: Date.parse(b.resolves_at), node: <FriendCard b={b} now={now} meId={me.user.id} showGroup={showGroup} /> });
  const st = (x: Settled): Item => ({ key: `s${x.id}`, at: -Date.parse(x.at), node: <SettledCard x={x} showGroup={showGroup} /> });
  const items: Item[] =
    filter === "invest" ? stocks.map(mk)
    : filter === "bets" ? bets.map(mk)
    : filter === "friend" ? [...liveFriend.map(fb), ...doneFriend.slice(0, 10).map((b) => ({ ...fb(b), at: Infinity }))]
    : filter === "settled" ? [...settled.map(st), ...doneFriend.map((b) => ({ ...fb(b), at: -Date.parse(b.settled_at ?? b.resolves_at) }))].sort((a, b) => a.at - b.at)
    : [...markets.map(mk), ...liveFriend.map(fb)].sort((a, b) => a.at - b.at);
  const empty = { all: "Nothing live right now.", invest: "No stocks right now.", bets: "No live bets right now.", friend: "No friend bets yet.", settled: "Nothing has settled yet." }[filter];

  return (
    <main className="min-h-dvh lg:min-h-full">
      <div className="mx-auto max-w-3xl px-5 pt-[calc(env(safe-area-inset-top)+16px)] lg:px-10 lg:pt-10">
        <h1 className="text-[28px] font-bold tracking-tight lg:text-3xl">Stakes</h1>

        <div className="no-scrollbar -mx-5 mt-4 flex gap-1.5 overflow-x-auto px-5 lg:mx-0 lg:px-0" role="tablist">
          {FILTERS.map((x) => {
            const on = filter === x.k;
            return (
              <button key={x.k} role="tab" aria-selected={on} onClick={() => setFilter(x.k)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-semibold transition ${on ? "bg-brand text-black" : "bg-panel text-mute hover:text-white"}`}>
                {x.label}
                {counts[x.k] > 0 && <span className={`rounded-full px-1.5 text-[11px] tabular ${on ? "bg-black/10 text-black/70" : "bg-white/[.06]"}`}>{counts[x.k]}</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 px-1 text-sm text-mute">{current.blurb}</p>

        {groups.length > 1 && (
          <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:px-0">
            <Chip on={group == null} onClick={() => setGroup(null)}>All chats</Chip>
            {groups.map((g) => (
              <Chip key={g.id} on={group === g.id} onClick={() => setGroup(g.id)}>{g.name}</Chip>
            ))}
          </div>
        )}
      </div>

      <ul className="mx-auto mt-4 grid max-w-3xl gap-2 px-4 pb-8 lg:grid-cols-2 lg:px-10">
        {items.map((it) => <li key={it.key}>{it.node}</li>)}
        {feed && !items.length && (
          <li className="col-span-full rounded-2xl border border-dashed border-line px-5 py-14 text-center text-mute">
            {empty} Open a chat and post one.
          </li>
        )}
        {!feed && <li className="col-span-full px-5 py-16 text-center text-mute">Loading…</li>}
      </ul>
    </main>
  );
}

/** A one-on-one bet: who is on each side, what each put in, and where it stands. Opens the chat it lives in. */
function FriendCard({ b, now, meId, showGroup }: { b: FriendBet; now: string; meId: number; showGroup: boolean }) {
  const status = {
    open: { label: "Waiting for a taker", tone: "bg-brand/15 text-brand" },
    live: { label: "Live", tone: "bg-brand text-black" },
    claimed: { label: "Result claimed", tone: "bg-white/[.08] text-white" },
    settled: { label: b.winner ? `${b.winner_id === meId ? "You" : b.winner} won` : "Settled", tone: "bg-white/[.06] text-mute" },
    cancelled: { label: "Nobody took it", tone: "bg-white/[.06] text-mute" },
    refunded: { label: "Called off", tone: "bg-white/[.06] text-mute" },
  }[b.status];
  const yesName = b.side === "yes" ? b.creator : (b.taker ?? "Anyone");
  const noName = b.side === "yes" ? (b.taker ?? "Anyone") : b.creator;
  const yesStake = b.side === "yes" ? b.stake : b.theirStake;
  const noStake = b.side === "yes" ? b.theirStake : b.stake;
  const live = LIVE.has(b.status);
  return (
    <Link href={`/g/${b.group_id}`} className={`flex h-full flex-col rounded-2xl bg-panel p-4 transition hover:bg-raised ${live ? "" : "opacity-75"}`}>
      <div className="flex items-center gap-2 text-[12px] text-mute">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[.07] text-white/80"><Users size={13} /></span>
        {showGroup && <span className="truncate font-medium text-white/80">{b.group}</span>}
        {showGroup && <span className="h-0.5 w-0.5 rounded-full bg-mute" />}
        <span className="truncate">{live ? timeLeft(b.resolves_at, now) : new Date(b.settled_at ?? b.resolves_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
        <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}>{status.label}</span>
      </div>
      <div className="mt-2 line-clamp-2 text-[16px] font-medium leading-snug">{b.title}</div>
      <div className="mt-auto grid grid-cols-2 gap-2 pt-3 text-[13px]">
        <Side who={yesName} says="says yes" stake={yesStake} won={b.status === "settled" && b.winner != null && b.winner === yesName} />
        <Side who={noName} says="says no" stake={noStake} won={b.status === "settled" && b.winner != null && b.winner === noName} />
      </div>
    </Link>
  );
}

function Side({ who, says, stake, won }: { who: string; says: string; stake: number; won: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${won ? "bg-brand/15 ring-1 ring-inset ring-brand/40" : "bg-white/[.04]"}`}>
      <div className="truncate font-medium">{who} <span className="font-normal text-mute">{says}</span></div>
      <div className="mt-0.5 font-semibold tabular">{fmt(stake, 0)}</div>
    </div>
  );
}

/** A finished stake: what happened, and what it did to your balance. */
function SettledCard({ x, showGroup }: { x: Settled; showGroup: boolean }) {
  const voided = x.status === "void";
  const result = voided ? "Called off" : x.kind === "stock" ? (x.outcome ? "Paid out" : "Expired") : x.outcome ? "Happened" : "Didn't happen";
  return (
    <Link href={`/m/${x.id}`} className="flex h-full flex-col rounded-2xl bg-panel p-4 transition hover:bg-raised">
      <div className="flex items-center gap-2 text-[12px] text-mute">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[.07] text-white/80">{x.kind === "stock" ? <TrendUp size={13} /> : <Timer size={13} />}</span>
        {showGroup && <span className="truncate font-medium text-white/80">{x.group}</span>}
        {showGroup && <span className="h-0.5 w-0.5 rounded-full bg-mute" />}
        <span className="truncate">{new Date(x.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
        <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${voided ? "bg-white/[.06] text-mute" : x.outcome ? "bg-brand/15 text-brand" : "bg-down/15 text-down"}`}>{result}</span>
      </div>
      <div className="mt-2 line-clamp-2 text-[16px] font-medium leading-snug">{x.title}</div>
      <div className="mt-auto flex items-end justify-between pt-3 text-[13px]">
        <span className="text-mute tabular">{fmt(x.volume, 0)} staked</span>
        {x.mine != null && (voided ? <span className="text-mute">Refunded</span> : (
          <span className={`rounded-md px-1.5 py-0.5 font-semibold tabular ${x.mine >= 0 ? "bg-brand/15 text-brand" : "bg-down/15 text-down"}`}>You {x.mine >= 0 ? "+" : "−"}{fmt(Math.abs(x.mine))}</span>
        ))}
      </div>
    </Link>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${on ? "bg-white text-black" : "bg-white/[.05] text-mute hover:bg-white/[.08] hover:text-white"}`}>
      {children}
    </button>
  );
}

/**
 * One card per situation. Top line says where and when, then the question, then the number that matters:
 * for a bet a yes/no bar with the chance and the odds, for a stock the share price and today's move.
 */
function Card({ s, now, showGroup }: { s: Situation; now: string; showGroup: boolean }) {
  const [f] = useOddsFormat();
  const stock = s.kind === "stock" && s.answer !== "number";
  const move = Math.round(s.change * 1000) / 10;
  const left = timeLeft(s.resolves_at, now);
  const soon = !stock && left !== "closed" && new Date(s.resolves_at).getTime() - new Date(now).getTime() < 2 * 864e5;
  return (
    <Link href={`/m/${s.id}`} className="flex h-full flex-col rounded-2xl bg-panel p-4 transition hover:bg-raised active:scale-[.995]">
      <div className="flex items-center gap-2 text-[12px] text-mute">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full ${stock ? "bg-brand/15 text-brand" : "bg-white/[.07] text-white/80"}`}>
          {stock ? <TrendUp size={13} /> : <Timer size={13} />}
        </span>
        {showGroup && <span className="truncate font-medium text-white/80">{s.group}</span>}
        {showGroup && <span className="h-0.5 w-0.5 rounded-full bg-mute" />}
        <span className={`truncate ${soon ? "text-brand" : ""}`}>{stock ? `matures ${new Date(s.resolves_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : left}</span>
        {s.volume > 0 && <span className="ml-auto shrink-0 tabular">{fmt(s.volume, 0)} staked</span>}
      </div>
      <div className="mt-2 line-clamp-2 text-[16px] font-medium leading-snug">{s.title}</div>
      {s.answer === "number" && s.line != null && <div className="mt-1 text-[12px] text-mute">over/under {fmtLine(s.line, s.unit)}</div>}
      <div className="mt-auto pt-3">
        {stock ? (
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[22px] font-semibold leading-none tracking-tight tabular"><LiveNumber value={s.price}>{fmt(s.price * 100, 1)}</LiveNumber></div>
              <div className="mt-1 text-[11px] text-mute">share price</div>
            </div>
            <div className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold tabular ${move > 0 ? "bg-up/15 text-up" : move < 0 ? "bg-down/15 text-down" : "bg-white/[.06] text-mute"}`}>
              {move !== 0 ? <Change from={s.price - s.change} to={s.price} /> : "flat today"}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[22px] font-semibold leading-none tracking-tight tabular"><LiveNumber value={s.price}>{pct(s.price)}</LiveNumber></span>
                <span className="text-[12px] text-mute">yes</span>
                {move !== 0 && <span className="text-[11px]"><Change from={s.price - s.change} to={s.price} /></span>}
              </div>
              <div className="rounded-md bg-white/[.06] px-1.5 py-0.5 text-[12px] font-semibold tabular">{formatOdds(s.price, f)}</div>
            </div>
            <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
              <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${s.price * 100}%` }} />
              <div className="h-full flex-1 rounded-full bg-white/[.12]" />
            </div>
          </>
        )}
      </div>
    </Link>
  );
}
