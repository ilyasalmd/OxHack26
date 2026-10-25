"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { Avatar } from "@/components/ui";
import { Board, skillPts } from "@/components/group-stats";
import { HowSkillWorks } from "@/components/skill-sheet";
import { chatName } from "@/components/chat/mark";

type Rank = { id: number; username: string; display_name: string; color: string; shared: number; skill: number | null; stakes: number; early: boolean; tier: string | null; quiet: boolean; weeksSinceCall: number | null };

/** Ranks: who reads things best, across all your chats or in one of them. Ranked by forecasting skill, never by coins. */
export default function RanksPage() {
  const { me, loading } = useSession();
  const router = useRouter();
  const [chat, setChat] = useState<number | null>(null);
  const [ranks, setRanks] = useState<Rank[] | null>(null);

  useEffect(() => {
    if (!loading && !me) router.replace("/?next=/ranks");
  }, [loading, me, router]);
  const userId = me?.user.id;
  useEffect(() => {
    if (!userId) return;
    const load = () => api<{ ranks: Rank[] }>("/api/ranks").then((r) => setRanks(r.ranks)).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [userId]);
  if (!me) return null;

  const chats = me.groups.filter((g) => !g.is_dm);
  return (
    <main className="min-h-dvh lg:min-h-full">
      <div className="mx-auto max-w-3xl px-5 pt-[calc(env(safe-area-inset-top)+16px)] lg:px-10 lg:pt-10">
        <h1 className="text-[28px] font-bold tracking-tight lg:text-3xl">Ranks</h1>
        <p className="mt-1.5 text-sm text-mute">Who calls it best. Skill only: coins never decide the order.</p>
        {chats.length > 0 && (
          <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:px-0">
            <Chip on={chat == null} onClick={() => setChat(null)}>All chats</Chip>
            {chats.map((g) => <Chip key={g.id} on={chat === g.id} onClick={() => setChat(g.id)}>{chatName(g)}</Chip>)}
          </div>
        )}
      </div>
      <div className="mx-auto max-w-3xl pb-8 lg:px-7">
        {chat != null ? <Board key={chat} groupId={chat} ticker={me.config.currency.ticker} meId={me.user.id} /> : <AllChats ranks={ranks} meId={me.user.id} />}
      </div>
    </main>
  );
}

function AllChats({ ranks, meId }: { ranks: Rank[] | null; meId: number }) {
  if (!ranks) return <p className="p-10 text-center text-mute">Loading…</p>;
  const ranked = ranks.filter((u) => u.skill != null);
  const waiting = ranks.filter((u) => u.skill == null);
  const row = (u: Rank, rank: number | null) => (
    <div key={u.id} className={`mb-2 flex items-center gap-3 rounded-xl border p-3 ${u.id === meId ? "border-white/15 bg-white/[.06]" : "border-line bg-panel"} ${u.quiet ? "opacity-55" : ""}`}>
      <div className={`w-6 text-center text-sm font-semibold tabular ${rank === 1 ? "text-brand" : "text-mute"}`}>{rank ?? ""}</div>
      <Avatar id={u.id} name={u.display_name} color={u.color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold">{u.display_name}{u.id === meId ? " (you)" : ""}</span>
          {u.skill != null && u.early && <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-semibold text-brand">early</span>}
        </div>
        <div className="truncate text-xs text-mute">
          {u.skill == null ? "No settled stakes yet" : `${u.tier} · ${u.stakes} ${u.stakes === 1 ? "stake" : "stakes"}`}
          {u.id !== meId && ` · ${u.shared} ${u.shared === 1 ? "chat" : "chats"} together`}
        </div>
      </div>
      {u.skill != null && <div className="font-bold tabular">{skillPts(u.skill)}</div>}
    </div>
  );
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between px-1 text-xs">
        <HowSkillWorks />
        <span className="text-mute">skill</span>
      </div>
      {ranked.map((u, i) => row(u, i + 1))}
      {waiting.length > 0 && (
        <>
          <div className="mx-1 mb-2 mt-4 border-t border-dashed border-line pt-3 text-xs font-semibold text-mute">No settled stakes yet</div>
          {waiting.map((u) => row(u, null))}
        </>
      )}
      {!ranks.length && <p className="px-2 py-10 text-center text-mute">Join or start a chat to see ranks.</p>}
      <p className="px-2 pt-2 text-xs text-mute">
        Ranked by skill over settled stakes in the chats you&apos;re in: 0 is as good as the market, and early means fewer than five. Friends&apos; calls in chats you aren&apos;t in don&apos;t count here.
      </p>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${on ? "bg-white text-black" : "bg-white/[.05] text-mute hover:bg-white/[.08] hover:text-white"}`}>
      {children}
    </button>
  );
}
