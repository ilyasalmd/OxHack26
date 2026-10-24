"use client";
import { useState } from "react";
import { api } from "./api";
import { useSession } from "./session";

/** Demo-only: skip time forward to show allowances, deadlines and stock decay. */
export function TimeMachine({ onJump }: { onJump?: () => void }) {
  const { me, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  if (!me?.config.demo) return null;
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
    <div className="flex items-center gap-2 border-t border-line bg-panel/60 px-4 py-2 text-xs text-mute">
      <span>⏱ {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} {d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
      <span className="flex-1" />
      {[
        ["+1h", 1],
        ["+1d", 24],
        ["+1w", 168],
      ].map(([l, h]) => (
        <button key={l} disabled={busy} onClick={() => jump(h as number)} className="rounded-full bg-white/5 px-2.5 py-1 font-semibold text-white hover:bg-white/10 disabled:opacity-40">
          {l}
        </button>
      ))}
    </div>
  );
}
