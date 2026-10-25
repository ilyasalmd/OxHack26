"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Change, LiveNumber, Sheet, fmt, pct, timeLeft } from "./ui";
import { Alert, Timer, TrendUp, Users } from "./icons";
import { FriendBetCard, type FriendBetLite } from "./friend-bet";
import { formatOdds, useOddsFormat } from "@/lib/odds";
import { fmtLine, sides } from "@/lib/labels";
import { SECTIONS, byAttention, closingSoon, isPast, type Attention, type Placed } from "@/lib/stakes";

// One chat's stakes, inside the chat: invest, bets and friend bets together, what needs you
// first. A finished stake stays near the top until two newer ones are posted, then lives under
// Settled. Used full screen on a phone (/g/[id]/stakes) and in the side panel on a laptop.

type Person = { id: number; display_name: string; color: string };
type StakeMarket = {
  id: number;
  title: string;
  kind: "bet" | "stock";
  answer: "yesno" | "number";
  line: number | null;
  unit: string;
  subject_id: number | null;
  status: "open" | "resolved" | "void";
  outcome: boolean | null;
  proposed_outcome: boolean | null;
  void_reason: string | null;
  closed: boolean;
  price: number;
  change: number;
  volume: number;
  traders: number;
  created_at: string;
  resolves_at: string;
  resolved_at: string | null;
  votes: { needed: number; confirms: number; canVote: boolean; mine: boolean | null } | null;
  holding: boolean;
  pnl: number | null;
};
type Data = { now: string; members: Person[]; markets: StakeMarket[]; friendBets: FriendBetLite[] };

export type StakeFilter = "all" | "invest" | "bets" | "friend" | "settled";
export const STAKE_FILTERS: { k: StakeFilter; label: string; blurb: string }[] = [
  { k: "all", label: "All", blurb: "Everything in this chat, what needs you first." },
  { k: "invest", label: "Invest", blurb: "Long term. The price moves as news arrives; back the people you believe in." },
  { k: "bets", label: "Bets", blurb: "Short term. Yes or no, settled soon." },
  { k: "friend", label: "Friend bets", blurb: "One on one. Two friends, one bet, the winner takes both stakes." },
  { k: "settled", label: "Settled", blurb: "Every stake this chat has finished, newest first." },
];

type Row = Placed & { key: string } & ({ type: "market"; m: StakeMarket } | { type: "friend"; b: FriendBetLite });

const DONE_BETS = new Set(["settled", "cancelled", "refunded"]);

function placeMarket(m: StakeMarket, now: number): Row {
  const ends = Date.parse(m.resolves_at);
  const base = { key: `m${m.id}`, type: "market" as const, m, kind: m.kind, created: Date.parse(m.created_at), ends };
  if (m.status !== "open") return { ...base, attention: "done", finished: Date.parse(m.resolved_at ?? m.resolves_at) };
  const attention: Attention =
    m.proposed_outcome != null ? (m.votes?.canVote && m.votes.mine == null ? "you" : "result")
    : m.closed ? "result"
    : closingSoon(m.kind, ends, now) ? "soon" : "live";
  return { ...base, attention, finished: null };
}

function placeFriend(b: FriendBetLite, now: number, meId: number): Row {
  const ends = Date.parse(b.resolves_at);
  const base = { key: `f${b.id}`, type: "friend" as const, b, kind: "friend" as const, created: Date.parse(b.created_at ?? b.resolves_at), ends };
  const ended = ends <= now;
  // Nobody took it and the deadline passed: it's over, the stake is on its way back.
  if (DONE_BETS.has(b.status) || (b.status === "open" && ended)) return { ...base, attention: "done", finished: b.settled_at ? Date.parse(b.settled_at) : ends };
  const inBet = b.creator_id === meId || b.taker_id === meId;
  const attention: Attention =
    b.status === "claimed" ? (inBet && b.claim_by !== meId ? "you" : "result")
    : b.status === "live" && ended ? (inBet ? "you" : "result")
    : closingSoon("bet", ends, now) ? "soon" : "live";
  return { ...base, attention, finished: null };
}

export function GroupStakes({ groupId, meId, ticker, filter, onFilter, refreshKey, panel = false }: {
  groupId: number;
  meId: number;
  ticker: string;
  filter: StakeFilter;
  onFilter: (f: StakeFilter) => void;
  /** Changes whenever the chat's feed does, so the side panel refreshes with it. */
  refreshKey?: string;
  /** In the laptop's side panel: tighter spacing, one column. */
  panel?: boolean;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [opened, setOpened] = useState<number | null>(null);
  const load = useCallback(() => api<Data>(`/api/groups/${groupId}/stakes`).then(setData).catch(() => {}), [groupId]);
  useEffect(() => {
    load();
    const t = setInterval(load, panel ? 15000 : 5000);
    return () => clearInterval(t);
  }, [load, panel, refreshKey]);

  const members = useMemo(() => new Map((data?.members ?? []).map((p) => [p.id, p])), [data]);
  const rows = useMemo(() => {
    if (!data) return [];
    const now = Date.parse(data.now);
    return [...data.markets.map((m) => placeMarket(m, now)), ...data.friendBets.map((b) => placeFriend(b, now, meId))];
  }, [data, meId]);

  const past = useMemo(() => new Set(rows.filter((r) => isPast(r, rows)).map((r) => r.key)), [rows]);
  const ofKind = (f: StakeFilter, r: Row) => f === "all" || (f === "invest" ? r.kind === "stock" : f === "bets" ? r.kind === "bet" : r.kind === "friend");
  const shown = (f: StakeFilter) =>
    f === "settled" ? rows.filter((r) => r.finished != null).sort(byAttention) : rows.filter((r) => ofKind(f, r) && !past.has(r.key)).sort(byAttention);
  const counts = Object.fromEntries(STAKE_FILTERS.map((x) => [x.k, x.k === "settled" ? shown("settled").length : shown(x.k).filter((r) => r.attention !== "done").length])) as Record<StakeFilter, number>;
  const items = shown(filter);
  const tucked = filter === "settled" ? 0 : rows.filter((r) => past.has(r.key) && ofKind(filter, r)).length;
  const current = STAKE_FILTERS.find((x) => x.k === filter)!;
  const bet = opened != null ? data?.friendBets.find((b) => b.id === opened) : undefined;

  const sections: { a: Attention | "past"; rows: Row[] }[] = [];
  for (const r of items) {
    const a = filter === "settled" ? "past" : r.attention;
    if (sections[sections.length - 1]?.a !== a) sections.push({ a, rows: [] });
    sections[sections.length - 1].rows.push(r);
  }

  return (
    <div className={panel ? "pb-4" : ""}>
      <div className={`no-scrollbar flex gap-1.5 overflow-x-auto ${panel ? "px-3 pt-3" : "-mx-4 px-4 lg:mx-0 lg:px-0"}`} role="tablist">
        {STAKE_FILTERS.map((x) => {
          const on = filter === x.k;
          return (
            <button key={x.k} role="tab" aria-selected={on} onClick={() => onFilter(x.k)} className={`flex shrink-0 items-center gap-1.5 rounded-full font-semibold transition ${panel ? "px-3 py-1.5 text-[13px]" : "px-3.5 py-2 text-[14px]"} ${on ? "bg-brand text-black" : "bg-panel text-mute hover:text-white"}`}>
              {x.label}
              {counts[x.k] > 0 && <span className={`rounded-full px-1.5 text-[11px] tabular ${on ? "bg-black/10 text-black/70" : "bg-white/[.06]"}`}>{counts[x.k]}</span>}
            </button>
          );
        })}
      </div>
      <p className={`mt-2.5 text-sm text-mute ${panel ? "px-4" : "px-1"}`}>{current.blurb}</p>

      {!data && <p className="px-5 py-16 text-center text-mute">Loading…</p>}
      {data && !items.length && (
        <div className={`mt-4 ${panel ? "mx-3" : ""} rounded-2xl border border-dashed border-line px-5 py-12 text-center text-mute`}>
          {filter === "settled" ? "Nothing has finished in this chat yet." : "Nothing here right now."}
          {filter !== "settled" && <> Post one with <b className="text-white/80">+ Stake</b> in the chat.</>}
        </div>
      )}

      {sections.map((s) => (
        <section key={s.a}>
          {s.a !== "past" && (
            <h3 className={`flex items-center gap-1.5 pb-1.5 pt-5 text-xs font-semibold uppercase tracking-wider ${s.a === "you" ? "text-brand" : "text-mute"} ${panel ? "px-4" : "px-1"}`}>
              {s.a === "you" && <Alert size={13} />} {SECTIONS[s.a]}
            </h3>
          )}
          <ul className={`grid gap-2 ${s.a === "past" ? "mt-4" : ""} ${panel ? "px-3" : "lg:grid-cols-2"}`}>
            {s.rows.map((r) => (
              <li key={r.key}>
                {r.type === "market"
                  ? <MarketRow r={r} m={r.m} now={data!.now} members={members} />
                  : <FriendRow r={r} b={r.b} now={data!.now} meId={meId} members={members} onOpen={() => setOpened(r.b.id)} />}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {tucked > 0 && (
        <button onClick={() => onFilter("settled")} className={`mt-4 block w-full text-center text-sm text-mute hover:text-white ${panel ? "px-3" : ""}`}>
          {tucked} older {tucked === 1 ? "result is" : "results are"} under <span className="font-semibold text-brand">Settled</span>
        </button>
      )}

      <Sheet open={!!bet} onClose={() => setOpened(null)} title="Bet a friend">
        {bet && data && (
          <div className="-mx-2 [&>div]:my-0 [&>div>div]:max-w-none">
            <FriendBetCard bet={bet} members={members} meId={meId} now={data.now} ticker={ticker} onChange={load} />
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Shell({ icon, tone, when, badge, children, href, onClick }: { icon: React.ReactNode; tone: string; when: React.ReactNode; badge?: React.ReactNode; children: React.ReactNode; href?: string; onClick?: () => void }) {
  const cls = "flex h-full w-full flex-col rounded-2xl bg-panel p-4 text-left transition hover:bg-raised active:scale-[.995]";
  const body = (
    <>
      <div className="flex items-center gap-2 text-[12px] text-mute">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tone}`}>{icon}</span>
        <span className="min-w-0 truncate">{when}</span>
        {badge && <span className="ml-auto shrink-0">{badge}</span>}
      </div>
      {children}
    </>
  );
  return href ? <Link href={href} prefetch={false} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

const Pill = ({ tone, children }: { tone: string; children: React.ReactNode }) => <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{children}</span>;
const day = (t: string | number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** A market (invest or bet): when, the question, then the live number or how it ended. Opens its stake page. */
function MarketRow({ r, m, now, members }: { r: Row; m: StakeMarket; now: string; members: Map<number, Person> }) {
  const [f] = useOddsFormat();
  const stock = m.kind === "stock" && m.answer !== "number";
  const lbl = sides(m);
  const done = m.status !== "open";
  const subject = m.subject_id ? members.get(m.subject_id) : null;
  const when =
    m.status === "void" ? `called off ${day(r.finished!)}`
    : m.status === "resolved" ? `settled ${day(r.finished!)}`
    : m.proposed_outcome != null ? `result proposed · ${m.votes ? `${m.votes.confirms} of ${m.votes.needed} confirmed` : "voting"}`
    : m.closed ? "deadline passed · nobody has called it"
    : stock ? `matures ${day(m.resolves_at)}${r.attention === "soon" ? ` · ${timeLeft(m.resolves_at, now)}` : ""}`
    : timeLeft(m.resolves_at, now);
  const badge =
    r.attention === "you" ? <Pill tone="bg-brand text-black">Vote</Pill>
    : m.status === "void" ? <Pill tone="bg-white/[.06] text-mute">Called off</Pill>
    : m.status === "resolved" ? <Pill tone={m.outcome ? "bg-up/15 text-up" : "bg-down/15 text-down"}>{m.outcome ? lbl.yes : lbl.no}</Pill>
    : m.proposed_outcome != null ? <Pill tone="bg-white/[.08] text-white">Proposed {(m.proposed_outcome ? lbl.yesShort : lbl.noShort).toUpperCase()}</Pill>
    : m.closed ? <Pill tone="bg-white/[.08] text-white">Due</Pill>
    : m.holding ? <Pill tone="bg-brand/15 text-brand">You&apos;re in</Pill>
    : null;
  const move = Math.round(m.change * 1000) / 10;
  return (
    <Shell
      href={`/m/${m.id}`}
      icon={stock ? <TrendUp size={13} /> : <Timer size={13} />}
      tone={stock ? "bg-brand/15 text-brand" : "bg-white/[.07] text-white/80"}
      when={<span className={r.attention === "soon" ? "text-brand" : ""}>{subject ? <><b className="font-medium text-white/80">{subject.display_name}</b> · </> : null}{when}</span>}
      badge={badge}
    >
      <div className={`mt-2 line-clamp-2 text-[16px] font-medium leading-snug ${m.status === "void" ? "text-mute line-through decoration-white/30" : ""}`}>{m.title}</div>
      {m.answer === "number" && m.line != null && <div className="mt-1 text-[12px] text-mute">over/under {fmtLine(m.line, m.unit)}</div>}
      <div className="mt-auto flex items-end justify-between gap-3 pt-3 text-[13px]">
        {done ? (
          <>
            <span className="text-mute tabular">{fmt(m.volume, 0)} staked</span>
            {m.pnl != null && (m.status === "void" ? <span className="text-mute">Refunded</span> : (
              <span className={`rounded-md px-1.5 py-0.5 font-semibold tabular ${m.pnl >= 0 ? "bg-brand/15 text-brand" : "bg-down/15 text-down"}`}>You {m.pnl >= 0 ? "+" : "−"}{fmt(Math.abs(m.pnl))}</span>
            ))}
          </>
        ) : stock ? (
          <>
            <div>
              <div className="text-[20px] font-semibold leading-none tracking-tight tabular"><LiveNumber value={m.price}>{fmt(m.price * 100, 1)}</LiveNumber></div>
              <div className="mt-1 text-[11px] text-mute">share price</div>
            </div>
            <div className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold tabular ${move > 0 ? "bg-up/15 text-up" : move < 0 ? "bg-down/15 text-down" : "bg-white/[.06] text-mute"}`}>
              {move !== 0 ? <Change from={m.price - m.change} to={m.price} /> : "flat today"}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[20px] font-semibold leading-none tracking-tight tabular"><LiveNumber value={m.price}>{pct(m.price)}</LiveNumber></span>
              <span className="text-[12px] text-mute">{lbl.yesShort.toLowerCase()}</span>
              {move !== 0 && <span className="text-[11px]"><Change from={m.price - m.change} to={m.price} /></span>}
            </div>
            <span className="rounded-md bg-white/[.06] px-1.5 py-0.5 text-[12px] font-semibold tabular">{formatOdds(m.price, f)}</span>
          </>
        )}
      </div>
    </Shell>
  );
}

/** A one-on-one bet: who's on each side and where it stands. Opens the full bet card, with its buttons. */
function FriendRow({ r, b, now, meId, members, onOpen }: { r: Row; b: FriendBetLite; now: string; meId: number; members: Map<number, Person>; onOpen: () => void }) {
  const name = (id: number | null) => (id == null ? "Anyone" : id === meId ? "You" : (members.get(id)?.display_name ?? "Someone"));
  const yes = b.side === "yes" ? b.creator_id : b.taker_id;
  const no = b.side === "yes" ? b.taker_id : b.creator_id;
  const yesStake = b.side === "yes" ? b.stake : b.taker_stake;
  const noStake = b.side === "yes" ? b.taker_stake : b.stake;
  const ended = Date.parse(b.resolves_at) <= Date.parse(now);
  const when =
    b.status === "settled" ? `settled ${day(r.finished!)}`
    : b.status === "cancelled" || (b.status === "open" && ended) ? "nobody took it · money back"
    : b.status === "refunded" ? "called off · money back"
    : b.status === "claimed" ? `${name(b.claim_by)} say${b.claim_by === meId ? "" : "s"} they won`
    : ended ? "ended · waiting for a result"
    : timeLeft(b.resolves_at, now);
  const badge =
    r.attention === "you" ? <Pill tone="bg-brand text-black">{b.status === "claimed" ? "Confirm" : "Call it"}</Pill>
    : b.status === "settled" ? <Pill tone="bg-white/[.06] text-mute">{b.winner_id === meId ? "You won" : `${name(b.winner_id)} won`}</Pill>
    : b.status === "open" && !ended ? <Pill tone="bg-brand/15 text-brand">Waiting for a taker</Pill>
    : b.status === "live" ? <Pill tone="bg-white/[.08] text-white">Live</Pill>
    : null;
  const won = (id: number | null) => b.status === "settled" && id != null && id === b.winner_id;
  return (
    <Shell onClick={onOpen} icon={<Users size={13} />} tone="bg-white/[.07] text-white/80" when={<span className={r.attention === "soon" ? "text-brand" : ""}>{when}</span>} badge={badge}>
      <div className={`mt-2 line-clamp-2 text-[16px] font-medium leading-snug ${b.status === "cancelled" || b.status === "refunded" ? "text-mute line-through decoration-white/30" : ""}`}>{b.title}</div>
      <div className="mt-auto grid grid-cols-2 gap-2 pt-3 text-[13px]">
        {[{ id: yes, says: "says yes", stake: yesStake }, { id: no, says: "says no", stake: noStake }].map((x) => (
          <div key={x.says} className={`rounded-xl px-3 py-2 ${won(x.id) ? "bg-brand/15 ring-1 ring-inset ring-brand/40" : "bg-white/[.04]"}`}>
            <div className="truncate font-medium">{name(x.id)} <span className="font-normal text-mute">{x.says}</span></div>
            <div className="mt-0.5 font-semibold tabular">{fmt(x.stake, 0)}</div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
