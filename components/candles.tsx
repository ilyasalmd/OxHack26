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

/** Candlestick chart with a volume strip: scrub to inspect, same range pills as PriceChart. */
export function CandleChart({
  candles,
  now: clockNow,
  format,
  height = 180,
  onHover,
  defaultRange = "ALL",
}: {
  candles: Candle[];
  now: number;
  format: (v: number) => string;
  height?: number;
  onHover?: (c: Candle | null) => void;
  defaultRange?: (typeof RANGES)[number]["k"];
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
          className={`flex-1 rounded-full py-1.5 text-xs font-semibold ${range === r.k ? "bg-white/10 text-white" : "text-mute"}`}
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
  const upColor = "var(--color-up)";
  const downColor = "var(--color-down)";

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
          <line x1="0" x2={W} y1={y(lastClose)} y2={y(lastClose)} stroke="#666" strokeDasharray="1 3" vectorEffect="non-scaling-stroke" />
          {view.map((c, i) => {
            const color = c.c >= c.o ? upColor : downColor;
            const yTop = y(Math.max(c.o, c.c));
            const yBot = y(Math.min(c.o, c.c));
            const bh = Math.max(1, yBot - yTop);
            const vh = maxV > 0 ? (c.v / maxV) * (volH - 2) : 0;
            return (
              <g key={c.t}>
                {vh > 0 && <rect x={cx(i) - bodyW / 2} y={H - vh} width={bodyW} height={vh} fill={color} fillOpacity="0.35" />}
                <line x1={cx(i)} x2={cx(i)} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <rect x={cx(i) - bodyW / 2} y={yTop} width={bodyW} height={bh} fill={color} />
              </g>
            );
          })}
          {hover != null && hp && <line x1={cx(hover)} x2={cx(hover)} y1="0" y2={H} stroke="#666" vectorEffect="non-scaling-stroke" />}
        </svg>
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
