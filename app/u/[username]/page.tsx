"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { createGroup } from "@/components/groupkeys";
import { UnlockPrompt } from "@/components/unlock";
import { Avatar, Button, TopBar } from "@/components/ui";

// Shareable profile link: open it and start a chat with that person.
export default function Profile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { me, loading, identity } = useSession();
  const router = useRouter();
  const [u, setU] = useState<{ username: string; display_name: string; color: string } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!loading && !me) router.replace(`/?next=/u/${username}`);
    if (me) api(`/api/users/${username}`).then(setU).catch((e) => setErr(e.message));
  }, [loading, me, username, router]);

  async function start() {
    if (!identity || !me || !u) return;
    const id = await createGroup(identity, `${me.user.display_name} & ${u.display_name}`, "", [me.user.username, u.username]);
    router.push(`/g/${id}`);
  }

  return (
    <main>
      <TopBar title="Profile" back="/chats" />
      {!identity && me && <UnlockPrompt />}
      {err && <p className="p-6 text-down">{err}</p>}
      {u && (
        <div className="flex flex-col items-center gap-3 p-10">
          <Avatar name={u.display_name} color={u.color} size={88} />
          <div className="text-2xl font-bold">{u.display_name}</div>
          <div className="text-mute">@{u.username}</div>
          {me?.user.username !== u.username && (
            <Button className="mt-4 w-full" onClick={start} disabled={!identity}>Start a chat</Button>
          )}
        </div>
      )}
    </main>
  );
}
