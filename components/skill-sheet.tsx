"use client";
import { useState } from "react";
import { Sheet } from "./ui";
import { Info } from "./icons";

/** Same words as lib/skill.ts. Shown from the leaderboard header and the wallet's skill card. */
export function HowSkillWorks({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex items-center gap-1 text-brand hover:opacity-80 ${className}`}>
        <Info size={14} /> How skill works
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="How skill works">
        <p className="text-[15px] leading-relaxed">You score the gap between the price you paid and what actually happened.</p>
        <div className="mt-4 rounded-2xl border border-brand/40 bg-brand/10 p-4">
          <div className="font-semibold">You buy YES at 40%</div>
          <div className="mt-2 flex justify-between text-[15px] tabular">
            <span className="text-up">It happens: +60</span>
            <span className="text-down">It doesn&apos;t: −40</span>
          </div>
          <div className="mt-2 text-[12px] text-mute">Buying NO works the other way round.</div>
        </div>
        <ul className="mt-4 space-y-2 text-[15px]">
          <li>• Early calls count fully. Calls in the second half of a stake count less, down to nothing at the deadline.</li>
          <li>• Stakes about you don&apos;t count, and nor do stakes with fewer than three people in them.</li>
          <li>• Not voting on a result never costs you skill. Coins don&apos;t count either.</li>
        </ul>
        <p className="mt-4 text-[13px] leading-relaxed text-mute">
          Your skill is your average over settled stakes, held near 0 while you have only a few, so one lucky call only nudges you.
          0 means as good as the market. You&apos;re ranked from your first settled stake and marked early until you have five.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] text-mute">
          <span>Reads the room · above +15</span>
          <span>Sharp · +6 to +15</span>
          <span>Level · −5 to +5</span>
          <span>Still learning · below −5</span>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="mt-5 w-full rounded-full bg-brand py-3 font-semibold text-black">Got it</button>
      </Sheet>
    </>
  );
}
