"use client";
import { useEffect, useState } from "react";
import { Avatar, Badge, Change, LiveNumber } from "@/components/ui";
import { GroupMark } from "@/components/shell";
import { Lock, Plus } from "@/components/icons";
import s from "./landing.module.css";

/**
 * A looping mock of a group chat: messages arrive, a situation gets listed,
 * friends trade it and the odds move. Decorative only (aria-hidden), so it never
 * competes with the sign-in form for focus or the screen reader.
 */

const PEOPLE: Record<string, string> = { Maya: "#ff7ac6", Sam: "#4f8cff", Priya: "#ffb020", Leo: "#00c2d1", Jake: "#9be15d" };
const OPEN = 74;
const HISTORY = [51, 57, 54, 62, 60, 67, OPEN];

type Ev =
  | { k: "msg"; who: string; text: string; time: string; wait: number }
  | { k: "typing"; who: string; wait: number }
  | { k: "card"; wait: number }
  | { k: "trade"; who: string; side: "long" | "short"; amt: number; odds: number; wait: number };

const SCRIPT: Ev[] = [
  { k: "msg", who: "Maya", text: "Jake said 5 mins. That was 20 mins ago.", time: "20:41", wait: 0 },
  { k: "typing", who: "Sam", wait: 1100 },
  { k: "msg", who: "Sam", text: "His location says he hasn't left the flat", time: "20:41", wait: 1300 },
  { k: "card", wait: 1200 },
  { k: "trade", who: "Priya", side: "long", amt: 12, odds: 79, wait: 1900 },
  { k: "typing", who: "Leo", wait: 1300 },
  { k: "msg", who: "Leo", text: "Going short. He always turns up with dessert", time: "20:42", wait: 1300 },
  { k: "trade", who: "Leo", side: "short", amt: 5, odds: 76, wait: 900 },
  { k: "typing", who: "Jake", wait: 1500 },
  { k: "msg", who: "Jake", text: "Two stops away, order me the risotto", time: "20:43", wait: 1300 },
  { k: "trade", who: "Sam", side: "long", amt: 20, odds: 85, wait: 1000 },
];
const HOLD = 4200;
const FADE = 450;

function spark(values: number[], w = 92, h = 30) {
  const lo = Math.min(...values) - 4;
  const hi = Math.max(...values) + 4;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - ((v - lo) / (hi - lo)) * h] as const);
  return { d: pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" "), end: pts[pts.length - 1] };
}

export function ChatPreview({ className = "" }: { className?: string }) {
  const [n, setN] = useState(1);
  const [cycle, setCycle] = useState(0);
  const [fading, setFading] = useState(false);
  const [still, setStill] = useState(false);
  const [toast, setToast] = useState<{ i: number; ev: Extract<Ev, { k: "trade" }> } | null>(null);

  // Reduced motion: show the finished conversation as a still frame.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setStill(mq.matches);
      if (mq.matches) {
        setN(SCRIPT.length);
        setToast(null);
        setFading(false);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (still) return;
    if (n < SCRIPT.length) {
      const ev = SCRIPT[n];
      const t = setTimeout(() => {
        setN(n + 1);
        if (ev.k === "trade") setToast({ i: n, ev });
      }, ev.wait);
      return () => clearTimeout(t);
    }
    const a = setTimeout(() => setFading(true), HOLD);
    const b = setTimeout(() => {
      setCycle((c) => c + 1);
      setToast(null);
      setN(1);
      setFading(false);
    }, HOLD + FADE);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [n, still]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const applied = SCRIPT.slice(0, n);
  const trades = applied.filter((e): e is Extract<Ev, { k: "trade" }> => e.k === "trade");
  const odds = trades.length ? trades[trades.length - 1].odds : OPEN;
  const volume = 21 + trades.reduce((a, t) => a + t.amt, 0);
  const line = spark([...HISTORY, ...trades.map((t) => t.odds)]);

  const rows = applied.flatMap((ev, i) => {
    if (ev.k === "typing") return i === n - 1 ? [{ key: i + 1, node: <Typing who={ev.who} />, cls: s.enter }] : [];
    if (ev.k === "msg") {
      const prevTyping = SCRIPT[i - 1]?.k === "typing";
      return [{ key: i, node: <Bubble ev={ev} />, cls: prevTyping ? "" : s.enter }];
    }
    if (ev.k === "card") return [{ key: i, node: <Situation odds={odds} volume={volume} line={line} />, cls: `${s.enter} ${s.drop}` }];
    return [];
  });

  return (
    <div aria-hidden className={`relative overflow-hidden rounded-2xl border border-line bg-panel/70 shadow-[0_24px_60px_-30px_rgba(0,0,0,.8)] ${className}`}>
      <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
        <GroupMark name="Friday dinner" size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight">Friday dinner</div>
          <div className="truncate text-[11px] text-mute">Maya, Sam, Priya, Leo, Jake</div>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-mute"><Lock size={11} /> Encrypted</span>
      </div>

      <div
        className={`${s.fade} flex h-[196px] flex-col [@media(max-height:760px)]:h-[160px] justify-end overflow-hidden px-3 pb-2 [contain:layout_paint] [mask-image:linear-gradient(to_bottom,transparent,#000_36px)] [@media(min-height:850px)]:h-[232px] [@media(min-height:960px)]:h-[288px]`}
        style={{ opacity: fading ? 0 : 1 }}
      >
        {rows.map((r) => (
          <div key={`${cycle}-${r.key}`} className={r.cls}>
            <div>
              <div className="pt-2">{r.node}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-3 py-2 [@media(max-height:820px)]:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-black"><Plus size={15} /></div>
        <div className="h-8 flex-1 rounded-lg border border-line bg-ink px-3 text-[13px] leading-8 text-mute">Message</div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-[58px] flex justify-center">
        {toast && (
          <div key={`${cycle}-${toast.i}`} className={`${s.toast} flex items-center gap-2 rounded-full border border-line bg-raised/95 py-1 pl-1 pr-3 text-xs shadow-lg backdrop-blur`}>
            <Avatar name={toast.ev.who} color={PEOPLE[toast.ev.who]} size={18} />
            <span>
              <b className="font-semibold">{toast.ev.who}</b> went{" "}
              <span className={toast.ev.side === "long" ? "text-up" : "text-down"}>{toast.ev.side}</span> {toast.ev.amt}
            </span>
            <span className="tabular text-mute">at {toast.ev.odds}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Bubble({ ev }: { ev: Extract<Ev, { k: "msg" }> }) {
  return (
    <div className="flex items-end gap-2">
      <Avatar name={ev.who} color={PEOPLE[ev.who]} size={22} />
      <div className="max-w-[82%] rounded-2xl rounded-bl-md bg-raised px-3 py-1.5">
        <div className="text-[11px] font-semibold" style={{ color: PEOPLE[ev.who] }}>{ev.who}</div>
        <div className="text-[13px] leading-snug">
          {ev.text} <span className="ml-1 align-[-1px] text-[10px] text-mute">{ev.time}</span>
        </div>
      </div>
    </div>
  );
}

function Typing({ who }: { who: string }) {
  return (
    <div className="flex items-end gap-2">
      <Avatar name={who} color={PEOPLE[who]} size={22} />
      <div className="flex h-[30px] items-center gap-1 rounded-2xl rounded-bl-md bg-raised px-3 text-mute">
        <span className={s.dot} />
        <span className={s.dot} />
        <span className={s.dot} />
      </div>
    </div>
  );
}

function Situation({ odds, volume, line }: { odds: number; volume: number; line: ReturnType<typeof spark> }) {
  return (
    <div className="mx-auto my-1 w-[92%] rounded-2xl border border-line bg-ink/80 p-3">
      <div className="mb-1.5 flex items-center gap-2 text-[11px] text-mute">
        <Badge>Bet</Badge>
        <span>Maya listed</span>
        <span className="ml-auto">closes 21:00</span>
      </div>
      <div className="text-[15px] font-semibold leading-snug">Jake is late to Friday dinner</div>
      <div className="mt-2 flex items-end gap-3">
        <div className="shrink-0">
          <div className="text-2xl font-bold leading-none tabular">
            <LiveNumber value={odds}>{odds}%</LiveNumber>
          </div>
          <div className="mt-1 text-[11px] leading-none"><Change from={OPEN / 100} to={odds / 100} /></div>
        </div>
        <svg viewBox="-2 -4 96 38" className="h-9 min-w-0 flex-1 overflow-visible" fill="none">
          <path d={line.d} pathLength={1} className={s.draw} stroke="var(--color-up)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={line.end[0]} cy={line.end[1]} r={2.4} fill="var(--color-up)" />
          <circle cx={line.end[0]} cy={line.end[1]} r={2.4} fill="var(--color-up)" className={s.pulse} />
        </svg>
        <div className="flex shrink-0 gap-1.5">
          <span className="rounded-lg bg-up/15 px-2.5 py-1 text-xs font-semibold text-up">Long</span>
          <span className="rounded-lg bg-down/15 px-2.5 py-1 text-xs font-semibold text-down">Short</span>
        </div>
      </div>
      <div className="mt-2 text-[11px] text-mute tabular">{volume} coins traded</div>
    </div>
  );
}
