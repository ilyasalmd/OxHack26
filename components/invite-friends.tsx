"use client";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { useSession } from "@/components/session";
import { Check, Copy } from "@/components/icons";
import { fmt } from "@/components/ui";

export type InviteStatus = {
  code: string;
  goal: number;
  reward: number;
  done: number;
  paid: boolean;
  friends: { name: string; status: "counted" | "waiting" | "not_counted" }[];
};

const NOTE = { counted: "counts", waiting: "needs to join a chat or make a stake", not_counted: "doesn't count" } as const;

/** "Invite 3 friends, get 200": your invite link and "2 of 3 friends". Unstyled beyond the basics so it can sit anywhere. */
export function InviteFriends({ className = "" }: { className?: string }) {
  const { me } = useSession();
  const [s, setS] = useState<InviteStatus | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const load = () => api<InviteStatus>("/api/invites").then(setS).catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  if (!s || !me) return null;
  const ticker = me.config.currency.ticker;
  const url = `${location.origin}/invite/${s.code}`;

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Join me on FriendStakes", text: "Bet on what your friends will do next.", url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {}
  }

  return (
    <section className={`rounded-2xl bg-panel p-4 text-sm ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold">{s.paid ? `You got ${fmt(s.reward, 0)} ${ticker} for inviting friends` : `Invite ${s.goal} friends, get ${fmt(s.reward, 0)} ${ticker}`}</h3>
        <span className="shrink-0 text-xs text-mute tabular">{s.done} of {s.goal} friends</span>
      </div>
      <div className="mt-3 flex gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={s.goal} aria-valuenow={s.done}>
        {Array.from({ length: s.goal }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < s.done ? "bg-brand" : "bg-white/10"}`} />)}
      </div>
      {!s.paid && <p className="mt-2.5 text-xs text-mute">A friend counts once they sign up with your link and join a chat or make a stake.</p>}
      <button onClick={share} className="mt-3 flex w-full items-center gap-2 rounded-lg bg-white/[.05] px-3 py-2 text-left text-xs hover:bg-white/[.08]">
        <span className="min-w-0 flex-1 truncate font-mono text-mute">{url}</span>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      {!!s.friends.length && (
        <ul className="mt-3 space-y-1 text-xs">
          {s.friends.map((f, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="truncate">{f.name}</span>
              <span className={f.status === "counted" ? "text-brand" : "text-mute"}>{NOTE[f.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
