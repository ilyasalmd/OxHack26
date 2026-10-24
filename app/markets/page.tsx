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
          {KINDS.map((x) => (
            <button key={x.k} onClick={() => setKind(x.k)} className={`rounded-xl py-2.5 text-[15px] font-semibold transition ${kind === x.k ? "bg-white text-black" : "text-mute hover:text-white"}`}>
              {x.label} <span className={`tabular ${kind === x.k ? "text-black/50" : ""}`}>{count(x.k)}</span>
            </button>
          ))}
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

      <ul className="mx-auto mt-3 max-w-3xl lg:px-10">
        {shown.map((s) => (
          <li key={s.id}>
            <Row s={s} now={me.clock.now} showGroup={group == null} />
          </li>
        ))}
        {feed && !shown.length && (
          <li className="px-5 py-16 text-center text-mute">
            {kind === "bet" ? "No live bets right now." : "No stocks right now."} Open a chat and post one.
          </li>
        )}
        {!feed && <li className="px-5 py-16 text-center text-mute">Loading…</li>}
      </ul>
    </main>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${on ? "bg-white/[.12] text-white" : "bg-white/[.04] text-mute hover:text-white"}`}>
      {children}
    </button>
  );
}

/** One line per situation: what it is, when it settles, and the number that matters. */
function Row({ s, now, showGroup }: { s: Situation; now: string; showGroup: boolean }) {
  const [f] = useOddsFormat();
  const stock = s.kind === "stock" && s.answer !== "number";
  const move = Math.round(s.change * 1000) / 10;
  return (
    <Link href={`/m/${s.id}`} className="flex items-center gap-3.5 px-5 py-3 active:bg-white/5 lg:rounded-2xl lg:hover:bg-white/[.04]">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${stock ? "bg-brand/10 text-brand" : "bg-white/[.06] text-white/80"}`}>
        {stock ? <TrendUp size={19} /> : <Timer size={19} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-medium leading-snug">{s.title}</div>
        <div className="mt-0.5 truncate text-[13px] text-mute">
          {showGroup && <>{s.group} · </>}
          {s.answer === "number" && s.line != null && <>over/under {fmtLine(s.line, s.unit)} · </>}
          {stock ? `matures ${new Date(s.resolves_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : timeLeft(s.resolves_at, now)}
          {s.volume > 0 && <> · {fmt(s.volume, 0)} staked</>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[17px] font-semibold tabular"><LiveNumber value={s.price}>{stock ? fmt(s.price * 100, 1) : formatOdds(s.price, f)}</LiveNumber></div>
        <div className="text-[12px] tabular text-mute">
          {stock ? (move !== 0 ? <Change from={s.price - s.change} to={s.price} /> : "flat today") : <>{pct(s.price)} chance{move !== 0 && <> · <Change from={s.price - s.change} to={s.price} /></>}</>}
        </div>
      </div>
    </Link>
  );
}
