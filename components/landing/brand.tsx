import s from "./landing.module.css";

/** The app mark at hero size: pops in, draws its arrow, then bobs. Size comes from --s. */
export function BrandMark({ size = 96, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`${s.markPop} h-[var(--s)] w-[var(--s)] ${className}`} style={{ "--s": `${size}px` } as React.CSSProperties}>
      <div className={`${s.bob} flex h-full w-full items-center justify-center rounded-[calc(var(--s)*0.3)] bg-black text-brand shadow-[0_22px_44px_-16px_rgba(0,0,0,.55)]`}>
        <svg width="56%" height="56%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path className={s.drawLine} pathLength={1} d="M3 17l6-6 4 4 8-8" />
          <path className={s.drawHead} pathLength={1} d="M15 7h6v6" />
        </svg>
      </div>
    </div>
  );
}

export function Wordmark({ className = "", delay = 0.15 }: { className?: string; delay?: number }) {
  return (
    <h1 className={`${s.rise} font-black lowercase leading-none tracking-[-0.055em] ${className}`} style={{ animationDelay: `${delay}s` }}>
      friendstocks
    </h1>
  );
}

/** A floating odds token: where it sits (in %), its tilt, and whether it is solid. */
export type Chip = { t: string; x: number; y: number; r: number; f: number; solid?: boolean; d: number };

/** Odds, sides and handles drifting behind the brand. Decoration only. */
export function Floaters({ chips }: { chips: Chip[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {chips.map((c, i) => (
        <span key={c.t} className={`absolute ${s.chipIn}`} style={{ left: `${c.x}%`, top: `${c.y}%`, animationDelay: `${0.3 + i * 0.08}s` }}>
          <span
            className={`${s.float} block whitespace-nowrap rounded-full px-[0.9em] py-[0.4em] font-bold tracking-tight tabular ${
              c.solid ? "bg-black text-brand" : "border-2 border-black/15 text-black/40"
            }`}
            style={{ fontSize: c.f, "--r": `${c.r}deg`, "--d": `${c.d}s` } as React.CSSProperties}
          >
            {c.t}
          </span>
        </span>
      ))}
    </div>
  );
}
