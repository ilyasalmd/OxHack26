"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { Board, Insights } from "@/components/group-stats";
import { TopBar } from "@/components/ui";

const TABS = ["Leaderboard", "Insights"] as const;

/** Phone only: the group's leaderboard and forecasting stats, out of the chat's way. */
export default function GroupStats({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const { me, loading } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Leaderboard");
  useEffect(() => {
    if (!loading && !me) router.replace(`/?next=/g/${id}/stats`);
  }, [loading, me, router, id]);
  if (!me) return null;
  const g = me.groups.find((x) => x.id === id);
  return (
    <main className="min-h-dvh lg:min-h-full">
      <TopBar back={`/g/${id}`} backOnDesktop title={g?.name ?? "Chat"} />
      <div className="mx-auto max-w-3xl">
        <div className="mx-4 mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-panel p-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-xl py-2.5 text-[15px] font-semibold transition ${tab === t ? "bg-white text-black" : "text-mute hover:text-white"}`}>{t}</button>
          ))}
        </div>
        {tab === "Leaderboard" && <Board groupId={id} ticker={me.config.currency.ticker} meId={me.user.id} />}
        {/* Mood scores and chat snippets come from the open chat; here the AI re-marks from time and context only. */}
        {tab === "Insights" && <Insights groupId={id} moods={() => ({})} stockSnippets={() => null} aiReadsChat={false} onRepriced={() => {}} />}
      </div>
    </main>
  );
}
