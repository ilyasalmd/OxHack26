"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { Button } from "@/components/ui";
import { AiChatNotice } from "@/components/ai-notice";

/** An invite link. The AI notice is shown before joining, so nobody shares a message without having seen it. */
export default function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { me, loading } = useSession();
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!loading && !me) router.replace(`/?next=/join/${code}`);
  }, [loading, me, code, router]);
  if (loading || !me) return <main className="p-10 text-center text-mute">{err || "One moment…"}</main>;
  const join = async () => {
    setBusy(true);
    setErr("");
    try {
      const { id } = await api<{ id: number }>("/api/groups/join", { body: { code } });
      router.replace(`/g/${id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">You&apos;ve been invited to a chat</h1>
      <p className="text-sm text-mute">Messages are end-to-end encrypted between members. Before you join, here is the one thing the AI does with them.</p>
      <AiChatNotice open />
      {err && <p className="text-sm text-down">{err}</p>}
      <Button className="w-full !py-3.5 text-[17px]" onClick={join} disabled={busy}>{busy ? "Joining…" : "Join chat"}</Button>
      <button type="button" onClick={() => router.replace("/chats")} className="text-sm text-mute hover:text-white">Not now</button>
    </main>
  );
}
