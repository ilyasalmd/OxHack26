"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session";
import { InviteFriends } from "@/components/invite-friends";
import { api } from "@/components/api";
import { Avatar, Badge, TopBar, fmt, pct } from "@/components/ui";
import { skillPts } from "@/components/group-stats";
import { HowSkillWorks } from "@/components/skill-sheet";
import { ArrowUpRight, Check, ChevronRight, Clock, Coin, Copy, Lock, Timer, TrendUp, Trophy, Wallet } from "@/components/icons";

type P = {
  netWorth: { balance: number; positions: number; total: number };
  series: { ts: string; balance: number; net_worth: number }[];
  positions: { market_id: number; title: string; kind: string; status: string; group: string; yes: number; no: number; spent: number; price: number; value: number }[];
  ledger: { ts: string; delta: number; balance_after: number; reason: string }[];
  wallet: { address: string; url: string; mint: string | null; onChain: number | null; enabled: boolean; network: string | null } | null;
  chain: { id: number; kind: string; amount: number; status: string; url: string | null; error: string | null }[];
  friendBets: number;
  skill: Skill;
};
type Read = { id: number; username: string; display_name: string; color: string; stakes: number; score: number };
type GroupSkill = { id: number; name: string; emoji: string; skill: number; stakes: number; early: boolean };
type Skill = {
  me: { skill: number; stakes: number; early: boolean; tier: string | null; low: number; high: number } | null;
  vsMarket: number | null;
  earlyUntil: number;
  friendsScored: number;
  beat: number;
  friendsAvg: number | null;
  field: number[];
  groups: GroupSkill[];
  reads: Read[];
  readsMin: number;
  readsPending: number;
};

/** Skill in points (lib/skill.ts): 0 is level with the market, +10 means buying 10 points cheaper than things turn out to be worth. */
const pts = (s: number) => skillPts(s);

/**
 * The wallet, in the order people ask about it: how much have I got, how much is free, am I any good at
 * this, who do I read best, and what happened lately. Everything wears the theme; nothing is fixed green.
 */
export default function Portfolio() {
  const { me } = useSession();
  const [p, setP] = useState<P | null>(null);
  const [allActivity, setAllActivity] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const load = () => api<P>("/api/portfolio").then(setP);
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);
  if (!p || !me) return <main className="p-10 text-center text-mute">Loading…</main>;
  const c = me.config.currency;
  const first = p.series[0]?.net_worth ?? p.netWorth.total;
  const gain = p.netWorth.total - first;
  const open = p.positions.filter((x) => x.status === "open");
  const nextAllowance = new Date(me.nextAllowanceAt);

  const hero = (
    <section className="pt-6 text-center lg:pt-2 lg:text-left">
      <div className="text-[13px] font-medium text-mute">Total balance</div>
      <div className="mt-1 flex items-baseline justify-center gap-2 lg:justify-start">
        <span className="text-[52px] font-bold leading-none tracking-tight tabular lg:text-[60px]">{fmt(p.netWorth.total, 0)}</span>
        <span className="text-[22px] font-bold tracking-tight text-brand">{c.ticker}</span>
      </div>
      <div className="mt-2 flex items-center justify-center gap-2 text-[13px] text-mute lg:justify-start">
        <span>Play credits</span>
        <span className="h-0.5 w-0.5 rounded-full bg-mute" />
        <span className={gain >= 0 ? "text-brand" : "text-down"}>{gain >= 0 ? "+" : "−"}{fmt(Math.abs(gain), 0)} since you joined</span>
      </div>
    </section>
  );

  const split = (
    <div className="grid grid-cols-2 gap-2">
      <Box icon={<Wallet size={18} />} label="Available" value={fmt(p.netWorth.balance, 0)} sub={`Up to ${fmt(me.maxStake, 0)} a stake`} />
      <Box icon={<Lock size={18} />} label="Committed" value={fmt(p.netWorth.positions, 0)} sub={`${open.length} stake${open.length === 1 ? "" : "s"}${p.friendBets > 0 ? ` + ${fmt(p.friendBets, 0)} in bets` : ""}`} />
    </div>
  );

  const shownOpen = allOpen ? open : open.slice(0, 3);
  const inPlay = (
    <>
      <SectionHead title="In play" right={open.length > 3 ? <SeeAll on={allOpen} toggle={() => setAllOpen(!allOpen)} /> : null} />
      {open.length ? (
        <ul className="space-y-2">{shownOpen.map((x) => <Position key={x.market_id} x={x} />)}</ul>
      ) : (
        <Empty icon={<TrendUp size={18} />} text="Nothing in play." sub="Back something in a chat and it shows up here." />
      )}
    </>
  );

  const activity = (
    <>
      <SectionHead title="Recent activity" right={p.ledger.length > 5 ? <SeeAll on={allActivity} toggle={() => setAllActivity(!allActivity)} /> : null} />
      <History ledger={allActivity ? p.ledger : p.ledger.slice(0, 5)} now={me.clock.now} grouped={allActivity} />
      <p className="mt-3 px-1 text-xs text-mute">
        +{me.config.economy.weeklyAllowance} {c.ticker} lands {nextAllowance.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}. Play credits only, no cash value.
      </p>
    </>
  );

  const walletCard = p.wallet && <ChainCard wallet={p.wallet} chain={p.chain} ticker={c.ticker} admin={me.account.isAdmin} />;

  return (
    <main className="flex min-h-dvh flex-col lg:min-h-full">
      <TopBar title="Wallet" />
      <div className="flex-1 px-4 pb-10 lg:mx-auto lg:grid lg:w-full lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10 lg:px-8 lg:pt-6">
        <div className="min-w-0">
          {hero}
          <div className="mt-6">{split}</div>
          <div className="mt-3 lg:hidden"><SkillCard s={p.skill} /></div>
          <div className="lg:hidden"><Reads s={p.skill} /></div>
          <InviteFriends className="mt-3 lg:hidden" />
          {inPlay}
          {activity}
          <div className="lg:hidden">{walletCard}</div>
        </div>
        <aside className="sticky top-20 hidden space-y-3 lg:block">
          <SkillCard s={p.skill} />
          <Reads s={p.skill} />
          <InviteFriends />
          {walletCard}
        </aside>
      </div>
    </main>
  );
}

function Box({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-panel p-3.5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/12 text-brand">{icon}</div>
      <div className="min-w-0">
        <div className="text-[12px] text-mute">{label}</div>
        <div className="text-[22px] font-semibold leading-tight tracking-tight tabular">{value}</div>
        <div className="truncate text-[11px] text-mute">{sub}</div>
      </div>
    </div>
  );
}

function SeeAll({ on, toggle }: { on: boolean; toggle: () => void }) {
  return (
    <button type="button" onClick={toggle} className="flex items-center gap-0.5 text-mute hover:text-white">
      {on ? "Show less" : "See all"} <ChevronRight size={13} className={on ? "-rotate-90" : ""} />
    </button>
  );
}

/**
 * "How well do you know your friends?": forecasting skill across every chat you're in (lib/skill.ts),
 * where you sit among friends, and the same number per chat (the one each chat's leaderboard uses).
 */
function SkillCard({ s }: { s: Skill }) {
  const m = s.me;
  return (
    <section className="rounded-2xl bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold">How well do you know your friends?</h3>
        <HowSkillWorks className="shrink-0 pt-0.5 text-xs" />
      </div>
      {m ? (
        <>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="text-[44px] font-bold leading-none tracking-tight tabular text-brand">{pts(m.skill)}</span>
            {m.tier && <span className="rounded-full bg-brand/15 px-2.5 py-1 text-[13px] font-semibold text-brand">{m.tier}</span>}
            {m.early && <span className="rounded-full bg-white/[.06] px-2 py-0.5 text-[11px] font-semibold text-mute">early</span>}
          </div>
          <p className="mt-1.5 text-[12px] text-mute">
            {m.stakes} settled {m.stakes === 1 ? "stake" : "stakes"} · likely between {pts(m.low)} and {pts(m.high)}
          </p>
          <p className="mt-2 text-sm">
            {s.friendsScored > 0 ? <>Sharper than <span className="font-semibold tabular">{s.beat}</span> of your <span className="tabular">{s.friendsScored}</span> friends</> : <>No friends with a settled stake yet</>}
            {s.vsMarket != null && <span className="text-mute"> · beat the market on {Math.round(s.vsMarket * 100)}% of stakes</span>}
          </p>
          {s.friendsScored > 0 && <Field field={s.field} me={m.skill} avg={s.friendsAvg} />}
          {s.groups.length > 0 && (
            <div className="mt-4 border-t border-white/[.05] pt-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-mute">By chat</div>
              {s.groups.map((g) => (
                <Link key={g.id} href={`/g/${g.id}/stats`} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{g.emoji} {g.name}</span>
                  {g.early && <span className="text-[11px] text-mute">early</span>}
                  <span className="font-semibold tabular">{pts(g.skill)}</span>
                </Link>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-mute">0 is as good as the market. Coins and voting don&apos;t count; calls made early count most.</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-mute">Your skill appears as soon as one of your stakes settles. Until then you&apos;re level with the market at 0.</p>
      )}
    </section>
  );
}

/** Each friend with a score is a tick on one line; you're the accent dot. The scale runs worst to best. */
function Field({ field, me, avg }: { field: number[]; me: number; avg: number | null }) {
  const all = [...field, me, 0];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const x = (v: number) => `${((v - lo) / Math.max(1e-6, hi - lo)) * 100}%`;
  return (
    <div className="mt-4">
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-mute/60" style={{ left: x(0) }} title="Level with the market" />
        {field.map((v, i) => <span key={i} className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" style={{ left: x(v) }} />)}
        {avg != null && <span className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60" style={{ left: x(avg) }} title="Friends' average" />}
        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-4 ring-panel" style={{ left: x(me) }} title="You" />
      </div>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-mute">
        <span>Still learning</span>
        <span>Friends avg {avg != null ? pts(avg) : "–"}</span>
        <span>Sharp</span>
      </div>
    </div>
  );
}

/** The friends you call best, once enough stakes about them have settled to mean something. */
function Reads({ s }: { s: Skill }) {
  const [all, setAll] = useState(false);
  const shown = all ? s.reads : s.reads.slice(0, 3);
  return (
    <section className="mt-3 rounded-2xl bg-panel px-4 pb-2 pt-4 lg:mt-0">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold">Your strongest reads</h3>
        {s.reads.length > 3 && <span className="text-xs"><SeeAll on={all} toggle={() => setAll(!all)} /></span>}
      </div>
      {shown.length ? (
        <ul className="mt-1">
          {shown.map((r, i) => (
            <li key={r.id}>
              <Link href={`/u/${r.username}`} className={`flex items-center gap-3 py-2.5 ${i ? "border-t border-white/[.05]" : ""}`}>
                <Avatar id={r.id} name={r.display_name} color={r.color} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">{r.display_name}</div>
                  <div className="text-[12px] text-mute">{r.stakes} stakes about them settled</div>
                </div>
                <span className="text-[17px] font-semibold tabular text-brand">{pts(r.score)}</span>
                <ChevronRight size={15} className="text-mute" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-3 text-sm text-mute">A friend shows up here once {s.readsMin} stakes about them have settled with you in them. Only you see this.</p>
      )}
      {shown.length > 0 && s.readsPending > 0 && <p className="border-t border-white/[.05] py-2.5 text-[11px] text-mute">{s.readsPending} more friends need {s.readsMin} settled stakes before they count.</p>}
    </section>
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
              <span key={s.side} className={`rounded-md px-1.5 py-px font-semibold uppercase tracking-wide ${s.side === "yes" ? "bg-brand/15 text-brand" : "bg-down/15 text-down"}`}>{stock ? (s.side === "yes" ? "long" : "short") : s.side} {fmt(s.n, 0)}</span>
            ))}
            <span className="truncate">{x.group} · now {stock ? fmt(x.price * 100, 1) : pct(x.price)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[15px] font-semibold tabular">{fmt(x.value)}</div>
          <div className={`mt-0.5 inline-block rounded-md px-1.5 py-px text-[11px] font-semibold tabular ${up ? "bg-brand/15 text-brand" : "bg-down/15 text-down"}`}>{up ? "+" : "−"}{fmt(Math.abs(pnl))}</div>
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
function History({ ledger, now, grouped = true }: { ledger: P["ledger"]; now: string; grouped?: boolean }) {
  const days = useMemo(() => {
    const out: { label: string; rows: P["ledger"] }[] = [];
    for (const l of ledger) {
      const label = grouped ? dayLabel(l.ts, now) : "";
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
          {d.label && <div className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-mute">{d.label}</div>}
          <div className="rounded-2xl bg-panel px-3.5">
            {d.rows.map((l, i) => {
              const info = describe(l.reason);
              const tone = { up: "bg-brand/15 text-brand", brand: "bg-brand/15 text-brand", mute: "bg-white/[.06] text-white/70" }[info.tone]!;
              return (
                <div key={i} className={`flex items-center gap-3 py-2.5 ${i ? "border-t border-white/[.05]" : ""}`}>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}>{info.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px]">{info.about || info.label}</div>
                    <div className="truncate text-[12px] text-mute">{info.about ? `${info.label} · ` : ""}{grouped ? new Date(l.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : `${dayLabel(l.ts, now)}, ${new Date(l.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-[14px] font-semibold tabular ${l.delta >= 0 ? "text-brand" : "text-white/85"}`}>{l.delta >= 0 ? "+" : "−"}{fmt(Math.abs(l.delta))}</div>
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
        {!wallet.enabled && <p className="mt-2 text-xs text-mute">Chain sync is off: set SOLANA_PAYER_SECRET and SOLANA_MINT to put every buy-in and payout on the chain.</p>}
        {chain.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {chain.slice(0, 6).map((op) => (
              <div key={op.id} className="flex items-center gap-2 text-xs">
                <Badge tone={op.kind === "mint" || op.kind === "payout" ? "up" : "down"}>{op.kind}</Badge>
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
