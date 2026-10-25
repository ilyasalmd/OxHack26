"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { formatOdds, useOddsFormat } from "@/lib/odds";
import { Change, LiveNumber, fmt, pct, timeLeft } from "@/components/ui";
import { Timer, TrendUp } from "@/components/icons";
import { fmtLine } from "@/lib/labels";

type Situation = { id: number; title: string; kind: "bet" | "stock"; answer: "yesno" | "number"; line: number | null; unit: string; category: string; group: string; group_id: number; creator: string; resolves_at: string; volume: number; traders: number; price: number; change: number };
type Feed = { markets: Situation[] };

const KINDS = [
  { k: "bet", label: "Bets", blurb: "Short term. Yes or no, settled soon." },
  { k: "stock", label: "Stocks", blurb: "Long term. The price moves as news arrives." },
] as const;

/** Everything live across your chats, bets and stocks kept apart. Tap one to bet on it. */
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
  const [kind, setKind] = useState<"bet" | "stock">(params.get("kind") === "stock" ? "stock" : "bet");
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
    for (const m of feed?.markets ?? []) seen.set(m.group_id, m.group);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [feed]);
  if (!me) return null;
  const all = (feed?.markets ?? []).filter((m) => group == null || m.group_id === group);
  const shown = all.filter((m) => m.kind === kind);
  const count = (k: string) => all.filter((m) => m.kind === k).length;
  const current = KINDS.find((x) => x.k === kind)!;

  return (
    <main className="min-h-dvh lg:min-h-full">
      <div className="mx-auto max-w-3xl px-5 pt-[calc(env(safe-area-inset-top)+16px)] lg:px-10 lg:pt-10">
        <h1 className="text-[28px] font-bold tracking-tight lg:text-3xl">Markets</h1>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-panel p-1">
          {KINDS.map((x) => {
            const on = kind === x.k;
            const Icon = x.k === "stock" ? TrendUp : Timer;
            return (
              <button key={x.k} onClick={() => setKind(x.k)} aria-pressed={on} className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-[15px] font-semibold transition ${on ? "bg-brand text-black shadow-sm" : "text-mute hover:text-white"}`}>
                <Icon size={16} className={on ? "" : "opacity-70"} /> {x.label} <span className={`rounded-full px-1.5 text-[12px] tabular ${on ? "bg-black/10 text-black/70" : "bg-white/[.06]"}`}>{count(x.k)}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 px-1 text-sm text-mute">{current.blurb}</p>

        {groups.length > 1 && (
          <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:px-0">
            <Chip on={group == null} onClick={() => setGroup(null)}>All chats</Chip>
            {groups.map((g) => (
              <Chip key={g.id} on={group === g.id} onClick={() => setGroup(g.id)}>{g.name}</Chip>
            ))}
          </div>
        )}
      </div>

      <ul className="mx-auto mt-4 grid max-w-3xl gap-2 px-4 pb-8 lg:grid-cols-2 lg:px-10">
        {shown.map((s) => (
          <li key={s.id}>
            <Card s={s} now={me.clock.now} showGroup={group == null} />
          </li>
        ))}
        {feed && !shown.length && (
          <li className="col-span-full rounded-2xl border border-dashed border-line px-5 py-14 text-center text-mute">
            {kind === "bet" ? "No live bets right now." : "No stocks right now."} Open a chat and post one.
          </li>
        )}
        {!feed && <li className="col-span-full px-5 py-16 text-center text-mute">Loading…</li>}
      </ul>
    </main>
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
