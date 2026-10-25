"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { openDm } from "@/components/groupkeys";
import { warmChat } from "@/components/chat/cache";
import { registerPhotos, type PhotoInfo } from "@/components/media";
import { UnlockPrompt } from "@/components/unlock";
import { Avatar, Button, TopBar } from "@/components/ui";
import { Chat, Lock } from "@/components/icons";

// Shareable profile link: open it to message that person privately.
export default function Profile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { me, loading, identity } = useSession();
  const router = useRouter();
  const [u, setU] = useState<({ username: string; display_name: string; bio?: string; color: string } & PhotoInfo) | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!loading && !me) router.replace(`/?next=/u/${username}`);
    if (me)
      api<{ username: string; display_name: string; bio?: string; color: string } & PhotoInfo>(`/api/users/${username}`)
        .then((x) => {
          // An old username (renamed in the last 30 days) still finds them: move to the new link.
          if (x.username !== decodeURIComponent(username).replace(/^@/, "").toLowerCase()) router.replace(`/u/${x.username}`);
          registerPhotos([x]);
          setU(x);
        })
        .catch((e) => setErr(e.message));
  }, [loading, me, username, router]);

  async function start() {
    if (!identity || !me || !u) return;
    setBusy(true);
    try {
      const dm = await openDm(identity, me.user.username, u.username);
      await warmChat(me.user.id, dm, identity);
      router.push(`/g/${dm}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main>
      <TopBar title="Profile" back="/chats" />
      {!identity && me && <UnlockPrompt />}
      {err && <p className="p-6 text-down">{err}</p>}
      {u && (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3 p-10">
          <Avatar id={u.id} name={u.display_name} color={u.color} size={96} />
          <div className="text-2xl font-bold">{u.display_name}</div>
          <div className="text-mute">@{u.username}</div>
          {u.bio && <p className="text-center text-[15px] leading-snug text-white/80">{u.bio}</p>}
          {me?.user.username !== u.username && (
            <>
              <Button className="mt-4 flex w-full items-center justify-center gap-2" onClick={start} disabled={!identity || busy}><Chat size={16} /> {busy ? "Opening…" : "Message privately"}</Button>
              <p className="flex items-center gap-1.5 text-xs text-mute"><Lock size={12} /> Only the two of you can read it.</p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
