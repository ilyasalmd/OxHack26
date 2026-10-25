"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Avatar, Button, fmt } from "./ui";
import { Book } from "./icons";
import { HowSkillWorks } from "./skill-sheet";
import { STOCK_SNIPPETS } from "@/lib/ai-disclosure";

type Data = {
  leaderboard: { id: number; username: string; display_name: string; color: string; balance: number; netWorth: number; groupPnl: number; skill: number | null; stakes: number; early: boolean; tier: string | null; quiet: boolean; weeksSinceCall: number | null }[];
  insights: {
    n: number;
    brier: { ai: number | null; crowd: number | null; opening: number | null; baseline: number | null };
    calibration: { bin: string; mid: number; aiN: number; aiRate: number | null; crowdN: number; crowdRate: number | null }[];
    byCategory: Record<string, { n: number; yes: number }>;
  };
  memories: { id: number; title: string; outcome: boolean; summary: string; category: string; ai_prob: number | null; crowd_prob: number | null; created_at: string }[];
};

function useInsights(groupId: number) {
  const [d, setD] = useState<Data | null>(null);
  const load = () => api<Data>(`/api/groups/${groupId}/insights`).then(setD);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);
  return { d, load };
}

/** Skill in points, signed: +11, −6. */
export const skillPts = (v: number) => `${v >= 0.5 ? "+" : v <= -0.5 ? "−" : ""}${Math.abs(Math.round(v))}`;

const quietFor = (weeks: number | null) => (weeks == null ? "quiet" : weeks >= 9 ? `quiet for ${Math.floor(weeks / 4.3)} months` : `quiet for ${Math.max(4, weeks)} weeks`);

/** One board per group, ranked by forecasting skill alone. Coins show on each row but never decide the order. */
export function Board({ groupId, ticker, meId }: { groupId: number; ticker: string; meId: number }) {
  const { d } = useInsights(groupId);
  if (!d) return <p className="p-10 text-center text-mute">Loading…</p>;
  const ranked = d.leaderboard.filter((u) => u.skill != null);
  const waiting = d.leaderboard.filter((u) => u.skill == null);
  const row = (u: Data["leaderboard"][number], rank: number | null) => (
    <div key={u.id} className={`mb-2 flex items-center gap-3 rounded-xl border p-3 ${u.id === meId ? "border-white/15 bg-white/[.06]" : "border-line bg-panel"} ${u.quiet ? "opacity-55" : ""}`}>
      <div className={`w-6 text-center text-sm font-semibold tabular ${rank === 1 ? "text-brand" : "text-mute"}`}>{rank ?? ""}</div>
      <Avatar id={u.id} name={u.display_name} color={u.color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold">{u.display_name}{u.id === meId ? " (you)" : ""}</span>
          {u.skill != null && u.early && <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-semibold text-brand">early</span>}
        </div>
        <div className="truncate text-xs text-mute">
          {u.skill == null ? "No settled stakes yet" : u.quiet ? `${u.tier} · ${quietFor(u.weeksSinceCall)}` : `${u.tier} · ${u.stakes} ${u.stakes === 1 ? "stake" : "stakes"}`}
        </div>
      </div>
      <div className="text-right">
        {u.skill != null && <div className="font-bold tabular">{skillPts(u.skill)}</div>}
        <div className="text-xs tabular text-mute">{fmt(u.netWorth, 0)} {ticker}</div>
      </div>
    </div>
  );
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between px-1 text-xs">
        <HowSkillWorks />
        <span className="text-mute">skill · coins</span>
      </div>
      {ranked.map((u, i) => row(u, i + 1))}
      {waiting.length > 0 && (
        <>
          <div className="mx-1 mb-2 mt-4 border-t border-dashed border-line pt-3 text-xs font-semibold text-mute">No settled stakes yet</div>
          {waiting.map((u) => row(u, null))}
        </>
      )}
      <p className="px-2 pt-2 text-xs text-mute">
        Ranked by skill in this chat&apos;s settled stakes: 0 is as good as the market, and early means fewer than five. Coins are your whole wallet across every chat, shown for interest; they don&apos;t affect the order.
      </p>
    </div>
  );
}

/** withChat: this view has the decrypted chat, so relevant anonymised snippets go with the re-mark (the stats page does not). */
export function Insights({ groupId, moods, stockSnippets, withChat, onRepriced }: { groupId: number; moods: () => Record<string, number>; stockSnippets: () => Record<string, { who: string; text: string; age: string }[]> | null; withChat: boolean; onRepriced: () => void }) {
  const { d, load } = useInsights(groupId);
  const [shareMood, setShareMood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!d) return <p className="p-10 text-center text-mute">Loading…</p>;
  const { insights: s } = d;

  async function reprice() {
    setBusy(true);
    try {
      const r = await api<{ applied: { title: string; from: number; to: number; reason: string }[]; skipped?: { title: string }[]; source: string }>(`/api/groups/${groupId}/reprice`, { body: { moods: shareMood ? moods() : null, chat: stockSnippets() } });
      const held = r.skipped?.length ? ` ${r.skipped.length} left alone because someone traded while the AI was thinking.` : "";
      setNote(r.applied.length ? `Re-marked ${r.applied.length} stock(s) (${r.source === "heuristic" ? "stats model" : r.source === "google" ? "Gemma via Google" : "Gemma"}).${held}` : `No stock needed re-marking.${held}`);
      onRepriced();
      load();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const bars = [
    { k: "AI at listing", v: s.brier.ai },
    { k: "Crowd (final price)", v: s.brier.crowd },
    { k: "Opening price", v: s.brier.opening },
    { k: "Coin flip (50%)", v: s.brier.baseline },
  ];
  const W = 280;
  return (
    <div className="space-y-4 p-4">
      <section className="rounded-2xl border border-line bg-panel p-4">
        <h3 className="font-semibold">Who forecasts best?</h3>
        <p className="mb-3 text-xs text-mute">Brier score over {s.n} settled stakes. Lower is better.</p>
        {s.n === 0 && <p className="text-sm text-mute">Settle a few stakes to see this.</p>}
        {s.n > 0 &&
          bars.map((b) => (
            <div key={b.k} className="mb-2">
              <div className="flex justify-between text-sm">
                <span>{b.k}</span>
                <span className="tabular">{b.v == null ? "–" : b.v.toFixed(3)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-black/40">
                <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.min(100, ((b.v ?? 0) / 0.35) * 100)}%` }} />
              </div>
            </div>
          ))}
      </section>

      {s.n > 0 && (
        <section className="rounded-2xl border border-line bg-panel p-4">
          <h3 className="font-semibold">Calibration</h3>
          <p className="mb-3 text-xs text-mute">When the market says 70%, does it happen 70% of the time? Dots on the diagonal = well calibrated.</p>
          <svg viewBox={`-14 -14 ${W + 28} ${W + 28}`} className="mx-auto w-full max-w-[280px]">
            <rect x="0" y="0" width={W} height={W} fill="none" stroke="var(--color-line)" />
            <line x1="0" y1={W} x2={W} y2="0" stroke="#444" strokeDasharray="4 4" />
            {s.calibration.map((c) => (
              <g key={c.bin}>
                {c.crowdRate != null && <circle cx={c.mid * W} cy={W - c.crowdRate * W} r={4 + Math.sqrt(c.crowdN) * 2} fill="var(--color-brand)" fillOpacity="0.75" />}
                {c.aiRate != null && <circle cx={c.mid * W} cy={W - c.aiRate * W} r={4 + Math.sqrt(c.aiN) * 2} fill="none" stroke="#4f8cff" strokeWidth="2" />}
              </g>
            ))}
            <text x="6" y="14" fill="var(--color-mute)" fontSize="10">happened</text>
            <text x={W - 6} y={W - 6} fill="var(--color-mute)" fontSize="10" textAnchor="end">predicted →</text>
          </svg>
          <div className="mt-2 flex justify-center gap-4 text-xs text-mute">
            <span><span className="text-brand">●</span> crowd</span>
            <span><span className="text-[#4f8cff]">○</span> AI</span>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-panel p-4">
        <h3 className="font-semibold">AI re-mark long-term stocks</h3>
        <p className="mb-3 text-xs text-mute">
          The AI re-prices open stocks from time left, your group&apos;s AI context (term dates, fixtures) and, if you allow it, mood scores computed on this phone.
          {withChat ? ` It also gets up to ${STOCK_SNIPPETS} relevant, anonymised messages per stock, picked on this phone.` : " From this page it gets no chat messages; re-mark from inside the chat for that."}
        </p>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={shareMood} onChange={(e) => setShareMood(e.target.checked)} />
          Share on-device mood scores (numbers only)
        </label>
        <Button className="w-full" onClick={reprice} disabled={busy}>{busy ? "Re-marking…" : "Re-mark stocks"}</Button>
        {note && <p className="mt-2 text-sm text-mute">{note}</p>}
      </section>

      <section className="rounded-2xl border border-line bg-panel p-4">
        <h3 className="mb-2 flex items-center gap-2 font-semibold"><Book size={15} /> Group memory</h3>
        <p className="mb-3 text-xs text-mute">Settled stakes summarised by the AI. Similar new questions pull these up automatically.</p>
        {d.memories.map((m) => (
          <div key={m.id} className="border-t border-line py-2 text-sm">
            <div className="flex gap-2">
              <span className={m.outcome ? "text-up" : "text-down"}>{m.outcome ? "YES" : "NO"}</span>
              <span className="flex-1 font-medium">{m.title}</span>
              <span className="text-xs text-mute">{m.category}</span>
            </div>
            <div className="text-mute">{m.summary}</div>
          </div>
        ))}
        {!d.memories.length && <p className="text-sm text-mute">Nothing settled yet.</p>}
      </section>
    </div>
  );
}
