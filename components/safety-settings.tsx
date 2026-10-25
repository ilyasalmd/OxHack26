"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

/** Settings section: whether friends may post situations about you. Self-contained, mount it anywhere signed in. */
export function SafetySettings() {
  const [policy, setPolicy] = useState<"anyone" | "nobody" | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ policy: "anyone" | "nobody" }>("/api/safety/policy").then((r) => setPolicy(r.policy)).catch((e) => setErr(e.message));
  }, []);

  const allowed = policy !== "nobody";
  async function toggle() {
    if (!policy) return;
    const next = allowed ? "nobody" : "anyone";
    setPolicy(next);
    setErr("");
    try {
      await api("/api/safety/policy", { method: "PUT", body: { policy: next } });
    } catch (e) {
      setPolicy(policy);
      setErr((e as Error).message);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Let friends post stakes about me</div>
          <p className="mt-1 text-xs text-mute">
            When this is off, nobody in your groups can start a new stake with you as the subject. You can always post about yourself, and you can call off any stake about you before it settles.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={allowed}
          aria-label="Let friends post stakes about me"
          disabled={!policy}
          onClick={toggle}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${allowed ? "bg-up" : "bg-white/15"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${allowed ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-down">{err}</p>}
    </section>
  );
}
