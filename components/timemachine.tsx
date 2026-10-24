"use client";
import { useState } from "react";
import { api } from "./api";
import { useSession } from "./session";
import { Timer } from "./icons";

/** Admin-only demo clock: skip the admin's time forward to show allowances, deadlines and stock decay. Everyone else stays on real time. */
export function TimeMachine({ onJump }: { onJump?: () => void }) {
  const { me, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  if (!me?.config.demo || !me.account?.isAdmin) return null;
  const ahead = me.clock.offsetMs !== 0;
  async function jump(hours: number) {
    setBusy(true);
    try {
      await api("/api/demo/advance", { body: { hours } });
      await refresh();
      onJump?.();
    } finally {
      setBusy(false);
    }
  }
  const d = new Date(me.clock.now);
  return (
    <div className="flex items-center gap-2 border-t border-line bg-panel/60 px-4 py-2 text-xs text-mute lg:border-0 lg:bg-transparent lg:px-5" title="Your demo clock. Only the admin account can move it; everyone else is on real time.">
      <Timer size={13} />
      <span className="tabular">{d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} {d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
      {ahead && <span className="rounded-md bg-brand/15 px-1.5 py-0.5 font-medium text-brand">demo</span>}
      <span className="flex-1" />
      {ahead && (
        <button disabled={busy} onClick={() => jump(0)} className="rounded-md bg-white/5 px-2 py-1 font-medium text-white hover:bg-white/10 disabled:opacity-40">
          Now
        </button>
      )}
      {[
        ["+1h", 1],
        ["+1d", 24],
        ["+1w", 168],
      ].map(([l, h]) => (
        <button key={l} disabled={busy} onClick={() => jump(h as number)} className="rounded-md bg-white/5 px-2 py-1 font-medium text-white hover:bg-white/10 disabled:opacity-40">
          {l}
        </button>
      ))}
    </div>
  );
}
