"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { createGroup } from "@/components/groupkeys";
import { UnlockPrompt } from "@/components/unlock";
import { TimeMachine } from "@/components/timemachine";
import { Avatar, Button, Coins, Input, Sheet, ago } from "@/components/ui";
import { forgetIdentities } from "@/lib/e2ee";

export default function Chats() {
  const { me, loading, identity, refresh } = useSession();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏠");
  const [members, setMembers] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace("/");
  }, [loading, me, router]);
  if (!me) return null;
  const c = me.config.currency;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!identity) return;
    setBusy(true);
    setErr("");
    try {
      const names = [me!.user.username, ...members.split(/[\s,]+/).map((s) => s.replace(/^@/, "").toLowerCase()).filter(Boolean)];
      const id = await createGroup(identity, name.trim() || "New group", emoji, [...new Set(names)]);
      router.push(`/g/${id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const raw = code.trim().split("/").pop()!;
      const { id } = await api<{ id: number }>("/api/groups/join", { body: { code: raw } });
      router.push(`/g/${id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const url = `${location.origin}/u/${me!.user.username}`;
    try {
      if (navigator.share) await navigator.share({ title: "Add me on Friend Stocks", text: `I'm @${me!.user.username} on Friend Stocks`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {}
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    await forgetIdentities();
    location.href = "/";
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <Avatar name={me.user.display_name} color={me.user.color} size={40} />
          <div className="flex-1">
            <div className="font-semibold">{me.user.display_name}</div>
            <button onClick={share} className="text-sm text-mute hover:text-white">
              @{me.user.username} · {copied ? "link copied" : "share"}
            </button>
          </div>
          <button onClick={logout} className="text-xs text-mute hover:text-white">Log out</button>
        </div>
        <Link href="/portfolio" className="mt-5 block rounded-3xl bg-panel p-5 transition hover:bg-white/5">
          <div className="text-sm text-mute">Net worth</div>
          <div className="mt-1 text-4xl font-bold tracking-tight">
            <Coins value={me.netWorth.total} ticker={c.ticker} />
          </div>
          <div className="mt-2 flex gap-4 text-sm text-mute">
            <span>Cash {me.netWorth.balance.toFixed(0)}</span>
            <span>Invested {me.netWorth.positions.toFixed(0)}</span>
            <span className="ml-auto">+{me.config.economy.weeklyAllowance} on {new Date(me.nextAllowanceAt).toLocaleDateString("en-GB", { weekday: "short" })}</span>
          </div>
        </Link>
      </header>

      {!identity && <UnlockPrompt />}

      <div className="flex items-center justify-between px-5 pb-2">
        <h2 className="text-xl font-bold">Chats</h2>
        <div className="flex gap-2">
          <Button variant="ghost" className="!px-3 !py-1.5 text-sm" onClick={() => setJoining(true)}>Join</Button>
          <Button className="!px-3 !py-1.5 text-sm" onClick={() => setCreating(true)} disabled={!identity}>+ New</Button>
        </div>
      </div>

      <ul className="flex-1">
        {me.groups.length === 0 && (
          <li className="px-5 py-10 text-center text-mute">
            No chats yet. Start one with your friends&apos; usernames, or join with an invite code.
          </li>
        )}
        {me.groups.map((g) => (
          <li key={g.id}>
            <Link href={`/g/${g.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-white/5">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-panel text-2xl">{g.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{g.name}</span>
                  {g.open_markets > 0 && <span className="rounded-full bg-brand/15 px-2 text-[11px] font-semibold text-brand">{g.open_markets} live</span>}
                </div>
                <div className="truncate text-sm text-mute">
                  {g.last ? (g.last.kind === "chat" ? "🔒 Encrypted message" : g.last.body) : `${g.members} members`}
                </div>
              </div>
              {g.last && <span className="text-xs text-mute">{ago(g.last.created_at, me.clock.now)}</span>}
            </Link>
          </li>
        ))}
      </ul>

      <div className="sticky bottom-0">
        <TimeMachine />
      </div>

      <Sheet open={creating} onClose={() => setCreating(false)} title="New group chat">
        <form onSubmit={create} className="space-y-3">
          <div className="flex gap-2">
            <Input className="!w-16 text-center" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} />
            <Input placeholder="Group name (e.g. Flat 4B)" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Input placeholder="Friends' usernames: @jake @priya" value={members} onChange={(e) => setMembers(e.target.value)} autoCapitalize="none" />
          <p className="text-xs text-mute">A fresh encryption key is made on this phone and locked separately for each friend. The server never sees it.</p>
          {err && <p className="text-sm text-down">{err}</p>}
          <Button className="w-full" disabled={busy}>{busy ? "Creating…" : "Create chat"}</Button>
        </form>
      </Sheet>

      <Sheet open={joining} onClose={() => setJoining(false)} title="Join with invite code">
        <form onSubmit={join} className="space-y-3">
          <Input placeholder="Invite code or link" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" />
          {err && <p className="text-sm text-down">{err}</p>}
          <Button className="w-full" disabled={busy}>Join</Button>
        </form>
      </Sheet>
    </main>
  );
}
