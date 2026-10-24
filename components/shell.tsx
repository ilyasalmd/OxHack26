"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, type Me } from "./session";
import { api } from "./api";
import { createGroup } from "./groupkeys";
import { TimeMachine } from "./timemachine";
import { Avatar, Button, Coins, Input, Sheet, ago } from "./ui";
import { Chart, Home, LogOut, Plus, TrendUp, Users } from "./icons";
import { forgetIdentities } from "@/lib/e2ee";

/**
 * Laptop: a three-part workspace (sidebar with account + chats, then the page).
 * Phone: the page on its own, full width, as before.
 */
export function Frame({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  const path = usePathname();
  if (path === "/") return <>{children}</>;
  if (!me) return <div className="mx-auto min-h-dvh max-w-xl">{children}</div>;
  return (
    <div className="lg:flex lg:h-dvh lg:overflow-hidden">
      <Sidebar me={me} path={path} />
      <div className="mx-auto min-h-dvh w-full max-w-xl sm:border-x sm:border-line lg:mx-0 lg:h-dvh lg:min-h-0 lg:max-w-none lg:flex-1 lg:overflow-y-auto lg:border-0 thin-scroll">
        {children}
      </div>
    </div>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center rounded-lg bg-brand text-black" style={{ width: size, height: size }}>
      <TrendUp size={size * 0.6} />
    </div>
  );
}

const TINTS = ["#4f8cff", "#2fd27a", "#ffb020", "#ff7a9c", "#a78bfa", "#22c7d6", "#f97316"];
/** A group's mark: its initials on a quiet tint picked from the name. */
export function GroupMark({ name, size = 40 }: { name: string; size?: number }) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
  const tint = TINTS[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TINTS.length];
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl font-semibold tracking-tight"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `${tint}22`, color: tint, boxShadow: `inset 0 0 0 1px ${tint}33` }}
    >
      {initials}
    </div>
  );
}

export function lastLine(g: Me["groups"][number]) {
  if (!g.last) return `${g.members} members`;
  return g.last.kind === "chat" ? "Encrypted message" : g.last.body ?? "";
}

function Sidebar({ me, path }: { me: Me; path: string }) {
  const actions = useChatActions();
  const c = me.config.currency;
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    await forgetIdentities();
    location.href = "/";
  }
  const nav = [
    { href: "/chats", label: "Overview", icon: Home },
    { href: "/portfolio", label: "Portfolio", icon: Chart },
  ];
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-r border-line bg-panel lg:flex">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <Logo />
        <span className="font-semibold tracking-tight">Friend Stocks</span>
      </div>

      <Link href="/portfolio" className="mx-3 rounded-2xl border border-line bg-ink p-4 transition hover:border-white/15">
        <div className="flex items-center gap-2.5">
          <Avatar name={me.user.display_name} color={me.user.color} size={28} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium">{me.user.display_name}</div>
            <div className="text-xs text-mute">@{me.user.username}</div>
          </div>
        </div>
        <div className="mt-4 text-xs text-mute">Net worth</div>
        <div className="text-2xl font-semibold tracking-tight">
          <Coins value={me.netWorth.total} ticker={c.ticker} />
        </div>
        <div className="mt-1 flex justify-between text-xs text-mute tabular">
          <span>Cash {me.netWorth.balance.toFixed(0)}</span>
          <span>Invested {me.netWorth.positions.toFixed(0)}</span>
        </div>
      </Link>

      <nav className="mt-3 px-3">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${path === href ? "bg-white/[.06] text-white" : "text-mute hover:text-white"}`}>
            <Icon size={16} /> {label}
          </Link>
        ))}
      </nav>

      <div className="mt-4 flex items-center justify-between px-5 pb-1">
        <span className="text-xs font-medium uppercase tracking-wider text-mute">Chats</span>
        <div className="flex gap-1">
          <button onClick={actions.join} title="Join with a code" className="rounded-md p-1.5 text-mute hover:bg-white/5 hover:text-white"><Users size={15} /></button>
          <button onClick={actions.create} title="New chat" className="rounded-md p-1.5 text-mute hover:bg-white/5 hover:text-white"><Plus size={15} /></button>
        </div>
      </div>
      <ul className="thin-scroll min-h-0 flex-1 overflow-y-auto px-2">
        {me.groups.map((g) => {
          const active = path === `/g/${g.id}` || path.startsWith(`/g/${g.id}/`);
          return (
            <li key={g.id}>
              <Link href={`/g/${g.id}`} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${active ? "bg-white/[.07]" : "hover:bg-white/[.04]"}`}>
                <GroupMark name={g.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{g.name}</span>
                    {g.open_markets > 0 && <span className="rounded bg-brand/10 px-1.5 text-[10px] font-semibold text-brand tabular">{g.open_markets}</span>}
                    {g.last && <span className="ml-auto text-[11px] text-mute">{ago(g.last.created_at, me.clock.now)}</span>}
                  </div>
                  <div className="truncate text-xs text-mute">{lastLine(g)}</div>
                </div>
              </Link>
            </li>
          );
        })}
        {!me.groups.length && <li className="px-3 py-6 text-sm text-mute">No chats yet.</li>}
      </ul>

      <div className="border-t border-line">
        <TimeMachine />
        <button onClick={logout} className="flex w-full items-center gap-2 px-5 py-3 text-xs text-mute hover:text-white">
          <LogOut size={14} /> Log out
        </button>
      </div>
      {actions.sheets}
    </aside>
  );
}

/** "New chat" and "Join" flows, shared by the phone chat list and the laptop sidebar. */
export function useChatActions() {
  const { me, identity } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState<"create" | "join" | null>(null);
  const [name, setName] = useState("");
  const [members, setMembers] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<number>) {
    setBusy(true);
    setErr("");
    try {
      const id = await fn();
      setOpen(null);
      router.push(`/g/${id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identity || !me) return;
    run(() => {
      const names = [me.user.username, ...members.split(/[\s,]+/).map((s) => s.replace(/^@/, "").toLowerCase()).filter(Boolean)];
      return createGroup(identity, name.trim() || "New group", "", [...new Set(names)]);
    });
  };
  const join = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => (await api<{ id: number }>("/api/groups/join", { body: { code: code.trim().split("/").pop()! } })).id);
  };

  const sheets = (
    <>
      <Sheet open={open === "create"} onClose={() => setOpen(null)} title="New group chat">
        <form onSubmit={create} className="space-y-3">
          <Input placeholder="Group name, e.g. Flat 4B" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Input placeholder="Friends' usernames: @jake @priya" value={members} onChange={(e) => setMembers(e.target.value)} autoCapitalize="none" />
          <p className="text-xs text-mute">A fresh encryption key is made on this device and locked separately for each friend. The server never sees it.</p>
          {!identity && <p className="text-sm text-down">Unlock your chats first.</p>}
          {err && <p className="text-sm text-down">{err}</p>}
          <Button className="w-full" disabled={busy || !identity}>{busy ? "Creating…" : "Create chat"}</Button>
        </form>
      </Sheet>
      <Sheet open={open === "join"} onClose={() => setOpen(null)} title="Join with an invite">
        <form onSubmit={join} className="space-y-3">
          <Input placeholder="Invite code or link" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" autoFocus />
          {err && <p className="text-sm text-down">{err}</p>}
          <Button className="w-full" disabled={busy}>Join</Button>
        </form>
      </Sheet>
    </>
  );
  return { create: () => setOpen("create"), join: () => setOpen("join"), sheets };
}
