"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, type Me } from "./session";
import { api } from "./api";
import { createGroup, groupKey } from "./groupkeys";
import { warmChat } from "./chat/cache";
import { clearCache } from "./chat/store";
import { TimeMachine } from "./timemachine";
import { Avatar, Button, Coins, Input, Sheet, ago } from "./ui";
import { Blocks, Chat, LogOut, Plus, Settings, TrendUp, User as UserIcon, Wallet, Users } from "./icons";
import { decryptPayload, forgetIdentities, type Payload } from "@/lib/e2ee";
import { ChatMark, chatName } from "./chat/mark";

/** The phone's four tabs. Each screen does one job; everything else is a page you go into and back out of. */
const TABS = [
  { href: "/chats", label: "Chats", icon: Chat },
  { href: "/markets", label: "Markets", icon: TrendUp },
  { href: "/portfolio", label: "Wallet", icon: Wallet },
  { href: "/settings", label: "You", icon: UserIcon },
];
const hasTabs = (path: string) => TABS.some((t) => t.href === path);

/**
 * Laptop: a three-part workspace (sidebar with account + chats, then the page).
 * Phone: one screen at a time, with a tab bar on the four top-level screens, like any iPhone app.
 */
export function Frame({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  const path = usePathname();
  // Sign-in screens own the whole window (and must not re-mount when a session appears mid-flow).
  if (path === "/" || path === "/recover" || path === "/welcome") return <>{children}</>;
  if (!me) return <div className="mx-auto min-h-dvh max-w-xl">{children}</div>;
  const tabs = hasTabs(path);
  return (
    <div className="lg:flex lg:h-dvh lg:overflow-hidden">
      <Sidebar me={me} path={path} />
      <div className={`mx-auto min-h-dvh w-full max-w-xl sm:border-x sm:border-line lg:mx-0 lg:h-dvh lg:min-h-0 lg:max-w-none lg:flex-1 lg:overflow-y-auto lg:border-0 thin-scroll ${tabs ? (me.config.demo && me.account?.isAdmin ? "pb-[calc(100px+env(safe-area-inset-bottom))]" : "pb-[calc(64px+env(safe-area-inset-bottom))]") + " lg:pb-0" : ""}`}>
        {children}
      </div>
      {tabs && (
        <>
          {me.config.demo && me.account?.isAdmin && <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl bg-ink lg:hidden"><TimeMachine /></div>}
          <TabBar path={path} me={me} />
        </>
      )}
    </div>
  );
}

function TabBar({ path, me }: { path: string; me: Me }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/92 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Main">
      <div className="mx-auto flex h-16 max-w-xl items-stretch">
        {TABS.map(({ href, label, icon: Icon }) => {
          const on = path === href;
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined} className={`relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${on ? "text-white" : "text-mute"}`}>
              <Icon size={23} className={on ? "" : "opacity-80"} />
              {label}
              {href === "/settings" && !me.account?.hasRecovery && <span className="absolute right-[calc(50%-16px)] top-3 h-1.5 w-1.5 rounded-full bg-brand" />}
            </Link>
          );
        })}
      </div>
    </nav>
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

/** The chat list's preview line. Chat text is decrypted here, on the device, like the chat itself. */
export function LastLine({ g }: { g: Me["groups"][number] }) {
  const { me, identity } = useSession();
  const [p, setP] = useState<Payload | null>(null);
  const last = g.last;
  const ct = last?.ciphertext ?? null;
  const iv = last?.iv ?? null;
  const wrapped = g.my_key?.wrapped_key ?? null;
  useEffect(() => {
    if (!last || last.kind !== "chat" || !ct || !iv || !identity || !g.my_key) return setP(null);
    let alive = true;
    groupKey(g.id, identity, g.my_key)
      .then((k) => (k ? decryptPayload(k.key, iv, ct) : null))
      .catch(() => null)
      .then((x) => alive && setP(x));
    return () => {
      alive = false;
    };
    // The key and the message are identified by their contents; the row objects are new on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.id, wrapped, identity, ct, iv, last?.kind]);
  if (!last) return <>{g.members} members</>;
  if (last.kind !== "chat") return <>{last.author ? `${last.author} ` : ""}{last.body ?? ""}</>;
  const who = last.user_id === me?.user.id ? "You" : last.author;
  return (
    <>
      {who && <span className="text-white/70">{who}: </span>}
      {p ? (p.a ? `${p.a.kind === "voice" ? `Voice note (${Math.max(1, Math.round(p.a.dur ?? 0))}s)` : "Photo"}${p.t ? `: ${p.t}` : ""}` : p.t) : "Encrypted message"}
    </>
  );
}

function Sidebar({ me, path }: { me: Me; path: string }) {
  const actions = useChatActions();
  const c = me.config.currency;
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    await Promise.all([forgetIdentities(), clearCache()]);
    location.href = "/";
  }
  // The chats are the home screen, like a messaging app; everything else is a small row at the bottom.
  const nav = [
    { href: "/markets", label: "Markets", icon: TrendUp },
    { href: "/portfolio", label: "Wallet", icon: Wallet },
    ...(me.account?.isAdmin ? [{ href: "/chain", label: "Chain", icon: Blocks }] : []),
    { href: "/settings", label: "Settings", icon: Settings, dot: !me.account?.hasRecovery },
  ];
  const sorted = [...me.groups].sort((a, b) => (b.last ? Date.parse(b.last.created_at) : 0) - (a.last ? Date.parse(a.last.created_at) : 0));
  return (
    <aside className="hidden w-[320px] shrink-0 flex-col border-r border-line bg-panel lg:flex">
      <div className="flex items-center gap-2.5 px-5 pb-2 pt-5">
        <Logo />
        <span className="font-semibold tracking-tight">FriendStakes</span>
        <Link href="/portfolio" title="Wallet" className="ml-auto rounded-full bg-white/[.06] px-2.5 py-1 text-xs font-medium tabular text-mute hover:text-white">
          <Coins value={me.netWorth.total} ticker={c.ticker} />
        </Link>
      </div>

      <div className="mt-3 flex items-center justify-between px-5 pb-2">
        <h2 className="text-[22px] font-bold tracking-tight">Chats</h2>
        <div className="flex gap-1">
          <button onClick={actions.join} title="Join with a code" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[.06] text-mute hover:text-white"><Users size={15} /></button>
          <button onClick={actions.create} title="New chat" className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black hover:bg-white/90"><Plus size={15} /></button>
        </div>
      </div>
      <ul className="thin-scroll min-h-0 flex-1 overflow-y-auto px-2">
        {sorted.map((g) => {
          const active = path === `/g/${g.id}` || path.startsWith(`/g/${g.id}/`);
          return (
            <li key={g.id}>
              <Link href={`/g/${g.id}`} prefetch={true} className={`flex min-h-[64px] items-center gap-3 rounded-xl px-3 py-2 ${active ? "bg-white/[.08]" : "hover:bg-white/[.04]"}`}>
                <ChatMark g={g} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`truncate text-[15px] ${g.unread > 0 && !active ? "font-semibold text-white" : "font-medium text-white/85"}`}>{chatName(g)}</span>
                    {g.last && <span className="ml-auto text-[11px] text-mute">{ago(g.last.created_at, me.clock.now)}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate text-[13px] text-mute"><LastLine g={g} /></div>
                    {g.unread > 0 && !active && <span className={`flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular ${g.muted ? "bg-white/15 text-white/70" : "bg-brand text-black"}`} aria-label={`${g.unread} unread`}>{g.unread > 99 ? "99+" : g.unread}</span>}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
        {!me.groups.length && <li className="px-3 py-6 text-sm text-mute">No chats yet. Start one or join with a code.</li>}
      </ul>

      <nav className="flex items-center justify-between border-t border-line px-3 py-2">
        {nav.map(({ href, label, icon: Icon, dot }) => (
          <Link key={href} href={href} className={`relative flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] ${path === href ? "text-white" : "text-mute hover:text-white"}`}>
            <Icon size={17} /> {label}
            {dot && <span className="absolute right-2 top-1 h-1.5 w-1.5 rounded-full bg-brand" title="Make a recovery code" />}
          </Link>
        ))}
      </nav>
      <div className="border-t border-line">
        <TimeMachine />
        <div className="flex items-center justify-between px-5 py-2.5">
          <Link href="/settings" className="flex min-w-0 items-center gap-2 text-xs text-mute hover:text-white"><Avatar id={me.user.id} name={me.user.display_name} color={me.user.color} size={20} /> <span className="truncate">@{me.user.username}</span></Link>
          <button onClick={logout} className="flex items-center gap-1.5 text-xs text-mute hover:text-white"><LogOut size={13} /> Log out</button>
        </div>
      </div>
      {actions.sheets}
    </aside>
  );
}

/** Names of chats made a moment ago, so the new chat's header shows before the list refreshes. */
export const pendingChatNames = new Map<number, string>();

/** "New chat" and "Join" flows, shared by the phone chat list and the laptop sidebar. */
export function useChatActions() {
  const { me, identity, refresh } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState<"create" | "join" | null>(null);
  const [name, setName] = useState("");
  const [members, setMembers] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<number>, label?: string) {
    setBusy(true);
    setErr("");
    try {
      const id = await fn();
      if (label) pendingChatNames.set(id, label);
      // Load the new chat before leaving the sheet, so it slides in already drawn instead of empty.
      router.prefetch(`/g/${id}`);
      if (me) await warmChat(me.user.id, id, identity);
      setOpen(null);
      router.push(`/g/${id}`);
      // The chat list catches up in the background; the chat itself is already on screen.
      void refresh();
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
    }, name.trim() || "New group");
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
          <Button className="w-full" disabled={busy}>{busy ? "Joining…" : "Join"}</Button>
        </form>
      </Sheet>
    </>
  );
  return { create: () => setOpen("create"), join: () => setOpen("join"), sheets };
}
