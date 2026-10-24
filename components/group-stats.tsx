"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Avatar, Button, fmt, pct } from "./ui";

type Data = {
  leaderboard: { id: number; username: string; display_name: string; color: string; balance: number; netWorth: number; groupPnl: number; resolvedTrades: number; hitRate: number | null; brier: number | null; skill: number | null }[];
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

export function Board({ groupId, ticker, meId }: { groupId: number; ticker: string; meId: number }) {
  const { d } = useInsights(groupId);
  if (!d) return <p className="p-10 text-center text-mute">Loading…</p>;
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="p-3">
      {d.leaderboard.map((u, i) => (
        <div key={u.id} className={`mb-2 flex items-center gap-3 rounded-2xl p-3 ${u.id === meId ? "bg-white/10" : "bg-panel"}`}>
          <div className="w-6 text-center text-lg">{medals[i] ?? i + 1}</div>
          <Avatar name={u.display_name} color={u.color} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{u.display_name}</div>
            <div className="text-xs text-mute">
              {u.skill == null ? "no settled trades" : `skill ${u.skill >= 0 ? "+" : ""}${(u.skill * 100).toFixed(0)} · hit ${pct(u.hitRate ?? 0)} · ${u.resolvedTrades} trades`}
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold tabular">{fmt(u.netWorth, 0)} <span className="text-xs font-normal text-mute">{ticker}</span></div>
            <div className={`text-xs tabular ${u.groupPnl >= 0 ? "text-up" : "text-down"}`}>{u.groupPnl >= 0 ? "+" : "−"}{fmt(Math.abs(u.groupPnl), 0)} here</div>
          </div>
        </div>
      ))}
      <p className="px-2 pt-2 text-xs text-mute">
        Ranked by net worth (cash + open positions at market price, one wallet across all your groups). Green/red is profit or loss from this group's situations only. Skill is a Brier skill score: +100 is perfect foresight, 0 is no better than saying 50% every time.
      </p>
    </div>
  );
}

export function Insights({ groupId, moods, stockSnippets, aiReadsChat, onRepriced }: { groupId: number; moods: () => Record<string, number>; stockSnippets: () => Record<string, { who: string; text: string; age: string }[]> | null; aiReadsChat: boolean; onRepriced: () => void }) {
  const { d, load } = useInsights(groupId);
  const [shareMood, setShareMood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!d) return <p className="p-10 text-center text-mute">Loading…</p>;
  const { insights: s } = d;

  async function reprice() {
    setBusy(true);
    try {
      const r = await api<{ applied: { title: string; from: number; to: number; reason: string }[]; source: string }>(`/api/groups/${groupId}/reprice`, { body: { moods: shareMood ? moods() : null, chat: stockSnippets() } });
      setNote(r.applied.length ? `Re-marked ${r.applied.length} stock(s) (${r.source}).` : "No stock needed re-marking.");
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
      <section className="rounded-3xl bg-panel p-4">
        <h3 className="font-semibold">Who forecasts best?</h3>
        <p className="mb-3 text-xs text-mute">Brier score over {s.n} settled situations. Lower is better.</p>
        {s.n === 0 && <p className="text-sm text-mute">Settle a few situations to see this.</p>}
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
        <section className="rounded-3xl bg-panel p-4">
          <h3 className="font-semibold">Calibration</h3>
          <p className="mb-3 text-xs text-mute">When the market says 70%, does it happen 70% of the time? Dots on the diagonal = well calibrated.</p>
          <svg viewBox={`-14 -14 ${W + 28} ${W + 28}`} className="mx-auto w-full max-w-[280px]">
            <rect x="0" y="0" width={W} height={W} fill="none" stroke="#232327" />
            <line x1="0" y1={W} x2={W} y2="0" stroke="#444" strokeDasharray="4 4" />
            {s.calibration.map((c) => (
              <g key={c.bin}>
                {c.crowdRate != null && <circle cx={c.mid * W} cy={W - c.crowdRate * W} r={4 + Math.sqrt(c.crowdN) * 2} fill="var(--color-brand)" fillOpacity="0.75" />}
                {c.aiRate != null && <circle cx={c.mid * W} cy={W - c.aiRate * W} r={4 + Math.sqrt(c.aiN) * 2} fill="none" stroke="#4f8cff" strokeWidth="2" />}
              </g>
            ))}
            <text x="6" y="14" fill="#8a8a93" fontSize="10">happened</text>
            <text x={W - 6} y={W - 6} fill="#8a8a93" fontSize="10" textAnchor="end">predicted →</text>
          </svg>
          <div className="mt-2 flex justify-center gap-4 text-xs text-mute">
            <span><span className="text-brand">●</span> crowd</span>
            <span><span className="text-[#4f8cff]">○</span> AI</span>
          </div>
        </section>
      )}

      <section className="rounded-3xl bg-panel p-4">
        <h3 className="font-semibold">AI re-mark long-term stocks</h3>
        <p className="mb-3 text-xs text-mute">
          Gemini re-prices open stocks from time left, your group&apos;s AI context (term dates, fixtures) and, if you allow it, mood scores computed on this phone.
          {aiReadsChat && " This group also lets it see up to 8 relevant, anonymised messages per stock."}
        </p>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={shareMood} onChange={(e) => setShareMood(e.target.checked)} />
          Share on-device mood scores (numbers only)
        </label>
        <Button className="w-full" onClick={reprice} disabled={busy}>{busy ? "Re-marking…" : "Re-mark stocks"}</Button>
        {note && <p className="mt-2 text-sm text-mute">{note}</p>}
      </section>

      <section className="rounded-3xl bg-panel p-4">
        <h3 className="mb-2 font-semibold">📚 Group memory</h3>
        <p className="mb-3 text-xs text-mute">Settled situations summarised by the AI. Similar new questions pull these up automatically.</p>
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
