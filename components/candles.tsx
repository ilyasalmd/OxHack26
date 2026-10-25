"use client";
import { useMemo, useState } from "react";

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

const HOUR = 36e5;
const DAY = 864e5;
const RANGES = [
  { k: "1D", ms: DAY },
  { k: "1W", ms: 7 * DAY },
  { k: "1M", ms: 30 * DAY },
  { k: "ALL", ms: Infinity },
] as const;

/** Merge candles into fixed-size buckets: first open, max high, min low, last close, summed volume. */
function aggregate(candles: Candle[], size: number): Candle[] {
  if (size <= HOUR) return candles;
  const out: Candle[] = [];
  for (const c of candles) {
    const key = Math.floor(c.t / size) * size;
    const last = out[out.length - 1];
    if (last && last.t === key) {
      last.h = Math.max(last.h, c.h);
      last.l = Math.min(last.l, c.l);
      last.c = c.c;
      last.v += c.v;
    } else {
      out.push({ t: key, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v });
    }
  }
  return out;
}

/** Small, fast, deterministic random numbers (mulberry32), so a simulated chart looks the same on every visit. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Candles for a stock that has barely traded. The closes follow the real price path (the listing price and
 * every trade since), so nothing is invented about where the price was; only the wiggle inside each bucket is
 * simulated, and the last candle closes exactly on the live price. Prices stay inside 0–1.
 */
export function simulateCandles(points: { t: number; v: number }[], now: number, seed: number): Candle[] {
  if (!points.length) return [];
  const start = points[0].t;
  const span = Math.max(now - start, 2 * DAY);
  const buckets = 48;
  const size = Math.max(HOUR, Math.ceil(span / buckets / HOUR) * HOUR);
  const from = Math.floor((now - span) / size) * size;
  const real = (t: number) => {
    let v = points[0].v;
    for (const p of points) if (p.t <= t) v = p.v;
    return v;
  };
  const rand = rng(seed * 7919 + 17);
  const out: Candle[] = [];
  let drift = 0;
  let prevClose = real(from);
  for (let t = from; t < now; t += size) {
    const end = Math.min(t + size, now);
    const last = end >= now;
    const base = real(end);
    const amp = Math.min(0.03, Math.max(0.004, base * (1 - base) * 0.08));
    drift = last ? 0 : drift * 0.55 + (rand() - 0.5) * amp;
    const clamp = (v: number) => Math.min(0.995, Math.max(0.005, v));
    const c = clamp(base + drift);
    const o = prevClose;
    const wick = amp * (0.3 + rand());
    const h = clamp(Math.max(o, c) + wick * rand());
    const l = clamp(Math.min(o, c) - wick * rand());
    out.push({ t, o, h, l, c, v: 0 });
    prevClose = c;
  }
  return out;
}

/**
 * Candlestick chart with a volume strip: scrub to inspect, same range pills as PriceChart.
 * Up candles are solid in the theme's accent; down candles are hollow, so the chart reads in any theme
 * and never turns green.
 */
export function CandleChart({
  candles,
  now: clockNow,
  format,
  height = 180,
  onHover,
  defaultRange = "ALL",
  note,
}: {
  candles: Candle[];
  now: number;
  format: (v: number) => string;
  height?: number;
  onHover?: (c: Candle | null) => void;
  defaultRange?: (typeof RANGES)[number]["k"];
  /** A small caption inside the chart, e.g. that the candles are illustrative. */
  note?: string;
}) {
  const [range, setRange] = useState<string>(defaultRange);
  const [hover, setHover] = useState<number | null>(null);
  const now = Math.max(clockNow, candles[candles.length - 1]?.t ?? clockNow);
  const W = 400;
  const H = height;

  const { view, size } = useMemo(() => {
    const r = RANGES.find((x) => x.k === range)!;
    const from = r.ms === Infinity ? -Infinity : now - r.ms;
    const inRange = candles.filter((c) => c.t >= from);
    let bucket = HOUR;
    if (range === "1W") bucket = 6 * HOUR;
    else if (range === "1M") bucket = DAY;
    else if (range === "ALL" && inRange.length > 1) {
      const span = inRange[inRange.length - 1].t - inRange[0].t + HOUR;
      bucket = Math.max(HOUR, Math.ceil(span / 60 / HOUR) * HOUR);
    }
    return { view: aggregate(inRange, bucket), size: bucket };
  }, [candles, range, now]);

  const pills = (
    <div className="mt-3 flex gap-1">
      {RANGES.map((r) => (
        <button
          key={r.k}
          onClick={() => {
            setRange(r.k);
            setHover(null);
            onHover?.(null);
          }}
          className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition ${range === r.k ? "bg-brand/15 text-brand" : "text-mute hover:text-white"}`}
        >
          {r.k}
        </button>
      ))}
    </div>
  );

  if (candles.length < 2 || view.length < 1) {
    return (
      <div>
        <div className="flex items-center justify-center text-sm text-mute" style={{ height }}>
          Not enough trading yet for candles
        </div>
        {pills}
      </div>
    );
  }

  const n = view.length;
  const slots = Math.max(n, 12);
  const offset = slots - n; // newest candle sits at the right edge
  const slotW = W / slots;
  const bodyW = slotW * 0.6;
  const volH = H * 0.22;
  const top = 4;
  const bottom = H - volH - 4;

  let lo = Math.min(...view.map((c) => c.l));
  let hi = Math.max(...view.map((c) => c.h));
  if (hi - lo < 1e-6) {
    lo -= 0.05 * Math.abs(lo || 1);
    hi += 0.05 * Math.abs(hi || 1);
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const cx = (i: number) => (offset + i + 0.5) * slotW;
  const maxV = Math.max(...view.map((c) => c.v), 0);
  const lastClose = view[n - 1].c;
  const hp = hover != null ? (view[hover] ?? null) : null;
  const upColor = "var(--color-brand)";
  const downColor = "var(--color-mute)";

  function move(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const slot = Math.floor(((e.clientX - rect.left) / rect.width) * slots);
    const i = Math.min(n - 1, Math.max(0, slot - offset));
    setHover(i);
    onHover?.(view[i]);
  }

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full touch-none"
          style={{ height }}
          role="img"
          aria-label="Candlestick price chart with volume"
          onPointerMove={move}
          onPointerLeave={() => {
            setHover(null);
            onHover?.(null);
          }}
        >
          <line x1="0" x2={W} y1={y(lastClose)} y2={y(lastClose)} stroke="var(--color-mute)" strokeDasharray="1 3" vectorEffect="non-scaling-stroke" />
          {view.map((c, i) => {
            const up = c.c >= c.o;
            const color = up ? upColor : downColor;
            const yTop = y(Math.max(c.o, c.c));
            const yBot = y(Math.min(c.o, c.c));
            const bh = Math.max(1.5, yBot - yTop);
            const vh = maxV > 0 ? (c.v / maxV) * (volH - 2) : 0;
            return (
              <g key={c.t}>
                {vh > 0 && <rect x={cx(i) - bodyW / 2} y={H - vh} width={bodyW} height={vh} fill={color} fillOpacity={up ? 0.3 : 0.2} />}
                <line x1={cx(i)} x2={cx(i)} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <rect x={cx(i) - bodyW / 2} y={yTop} width={bodyW} height={bh} rx="0.6" fill={up ? color : "var(--color-panel)"} stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
          {hover != null && hp && <line x1={cx(hover)} x2={cx(hover)} y1="0" y2={H} stroke="var(--color-mute)" vectorEffect="non-scaling-stroke" />}
        </svg>
        {note && !hp && <div className="pointer-events-none absolute left-1 top-0 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-mute backdrop-blur-sm">{note}</div>}
        {hp && hover != null && (
          <div className="pointer-events-none absolute -top-1 rounded-md bg-black/80 px-2 py-0.5 text-xs tabular" style={{ left: `min(calc(${(cx(hover) / W) * 100}% ), calc(100% - 90px))` }}>
            {format(hp.c)} · {new Date(hp.t).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            {size < DAY && ` ${new Date(hp.t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}
          </div>
        )}
      </div>
      {pills}
    </div>
  );
}
