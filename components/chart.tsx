"use client";
import { useMemo, useState } from "react";

type Pt = { t: number; v: number };
const RANGES = [
  { k: "1D", ms: 864e5 },
  { k: "1W", ms: 7 * 864e5 },
  { k: "1M", ms: 30 * 864e5 },
  { k: "ALL", ms: Infinity },
] as const;

/** Trade Republic-style step chart: one line, colour by direction, scrub to inspect. */
export function PriceChart({
  points,
  now: clockNow,
  format,
  height = 180,
  onHover,
  defaultRange = "ALL",
}: {
  points: Pt[];
  now: number;
  format: (v: number) => string;
  height?: number;
  onHover?: (p: Pt | null) => void;
  defaultRange?: (typeof RANGES)[number]["k"];
}) {
  const [range, setRange] = useState<string>(defaultRange);
  // The client clock refreshes every few seconds; never draw "now" before the newest tick.
  const now = Math.max(clockNow, points[points.length - 1]?.t ?? clockNow);
  const [hover, setHover] = useState<number | null>(null);
  const W = 400;
  const H = height;

  const view = useMemo(() => {
    const r = RANGES.find((x) => x.k === range)!;
    const from = r.ms === Infinity ? (points[0]?.t ?? now) : now - r.ms;
    const inRange = points.filter((p) => p.t >= from);
    const before = [...points].reverse().find((p) => p.t < from);
    const pts = [...(before ? [{ t: from, v: before.v }] : []), ...inRange];
    if (pts.length) pts.push({ t: now, v: pts[pts.length - 1].v });
    return { pts, from };
  }, [points, range, now]);

  const { pts, from } = view;
  if (pts.length < 2) return <div className="flex items-center justify-center text-sm text-mute" style={{ height }}>No history yet</div>;
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  if (hi - lo < 1e-6) {
    lo -= 0.05 * Math.abs(lo || 1);
    hi += 0.05 * Math.abs(hi || 1);
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const t0 = Math.min(from, pts[0].t);
  const x = (t: number) => ((t - t0) / Math.max(1, now - t0)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  let d = `M ${x(pts[0].t)} ${y(pts[0].v)}`;
  for (let i = 1; i < pts.length; i++) d += ` H ${x(pts[i].t)} V ${y(pts[i].v)}`;
  const up = pts[pts.length - 1].v >= pts[0].v;
  const color = up ? "var(--color-up)" : "var(--color-down)";
  const hp = hover != null ? pts[hover] : null;

  function move(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - rect.left) / rect.width) * (now - t0);
    let i = 0;
    while (i < pts.length - 1 && pts[i + 1].t <= t) i++;
    setHover(i);
    onHover?.(pts[i]);
  }

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full touch-none"
          style={{ height }}
          onPointerMove={move}
          onPointerLeave={() => {
            setHover(null);
            onHover?.(null);
          }}
        >
          <defs>
            <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" x2={W} y1={y(pts[0].v)} y2={y(pts[0].v)} stroke="#333" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          <path d={`${d} V ${H} H ${x(pts[0].t)} Z`} fill="url(#fill)" />
          <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {hp && <line x1={x(hp.t)} x2={x(hp.t)} y1="0" y2={H} stroke="#666" vectorEffect="non-scaling-stroke" />}
        </svg>
        {hp && (
          <div className="pointer-events-none absolute -top-1 rounded-md bg-black/80 px-2 py-0.5 text-xs tabular" style={{ left: `min(calc(${(x(hp.t) / W) * 100}% ), calc(100% - 90px))` }}>
            {format(hp.v)} · {new Date(hp.t).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-1">
        {RANGES.map((r) => (
          <button key={r.k} onClick={() => setRange(r.k)} className={`flex-1 rounded-full py-1.5 text-xs font-semibold ${range === r.k ? "bg-white/10 text-white" : "text-mute"}`}>
            {r.k}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ values, up, w = 64, h = 24 }: { values: number[]; up?: boolean; w?: number; h?: number }) {
  if (values.length < 2) return <svg width={w} height={h} />;
  const lo = Math.min(...values);
  const hi = Math.max(...values) || 1;
  const span = hi - lo || 1;
  const d = values.map((v, i) => `${i ? "L" : "M"} ${(i / (values.length - 1)) * w} ${h - ((v - lo) / span) * h}`).join(" ");
  const isUp = up ?? values[values.length - 1] >= values[0];
  return (
    <svg width={w} height={h}>
      <path d={d} fill="none" stroke={isUp ? "var(--color-up)" : "var(--color-down)"} strokeWidth="1.5" />
    </svg>
  );
}
