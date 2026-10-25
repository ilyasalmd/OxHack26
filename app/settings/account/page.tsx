"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { changePassword, changeUsername, deleteAccount } from "@/components/account";
import { RecoveryCodeSetup } from "@/components/recovery-code";
import { Group, RecoveryBanner, Row, SettingsPage, Status } from "@/components/settings";
import { Badge, Button, Input, Sheet, ago } from "@/components/ui";
import { Check, Key, LogOut, Lock, Pencil, Trash, User, Users } from "@/components/icons";
import { forgetIdentities } from "@/lib/e2ee";

type Account = { username: string; displayName: string; bio: string; color: string; createdAt: string; hasRecovery: boolean; usernameChangedAt: string | null; nextUsernameChangeAt: string | null };
type Session = { id: string; device: string; place: string; createdAt: string; lastSeenAt: string; current: boolean };
type SheetName = "name" | "bio" | "username" | "password" | "recovery" | "sessions" | "delete";

const USERNAME = /^[a-z0-9_]{3,20}$/;
const BIO_MAX = 140;
const clean = (v: string) => v.trim().replace(/^@/, "").toLowerCase();
const day = (t: string) => new Date(t).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** Name, username, password, recovery code, devices and deleting the account. Each row opens a sheet. */
export default function AccountPage() {
  const { me, refresh } = useSession();
  const [account, setAccount] = useState<Account | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const loadAccount = useCallback(() => api<Account>("/api/account").then(setAccount).catch(() => {}), []);
  const loadSessions = useCallback(() => api<{ sessions: Session[] }>("/api/account/sessions").then((r) => setSessions(r.sessions)).catch(() => {}), []);
  const userId = me?.user.id;
  useEffect(() => {
    if (!userId) return;
    loadAccount();
    loadSessions();
  }, [userId, loadAccount, loadSessions]);

  const changed = async () => {
    await Promise.all([loadAccount(), refresh()]);
  };
  const close = () => setSheet(null);

  return (
    <SettingsPage title="Account">
      {!account ? (
        <p className="p-10 text-center text-mute">Loading…</p>
      ) : (
        <>
          {!account.hasRecovery && <RecoveryBanner onMake={() => setSheet("recovery")} />}
          <Group title="Profile">
            <Row icon={Pencil} label="Display name" value={account.displayName} onClick={() => setSheet("name")} />
            <Row icon={User} label="Username" value={`@${account.username}`} onClick={() => setSheet("username")} />
            <Row icon={Pencil} label="Bio" value={account.bio ? (account.bio.length > 24 ? `${account.bio.slice(0, 24)}…` : account.bio) : "Add one"} onClick={() => setSheet("bio")} />
          </Group>
          <Group title="Security" note="Your password unlocks your encryption keys on each device. Only keys made from it are ever sent.">
            <Row icon={Lock} label="Password" onClick={() => setSheet("password")} />
            <Row icon={Key} label="Recovery code" value={account.hasRecovery ? "Set up" : "Not set up"} tone={account.hasRecovery ? undefined : "brand"} onClick={() => setSheet("recovery")} />
            <Row icon={Users} label="Signed-in devices" value={sessions ? String(sessions.length) : ""} onClick={() => setSheet("sessions")} />
          </Group>
          <Group>
            <Row icon={LogOut} label="Log out" action onClick={signOut} />
            <Row icon={Trash} label="Delete account" danger onClick={() => setSheet("delete")} />
          </Group>

          <Sheet open={sheet === "name"} onClose={close} title="Display name">
            <DisplayNameForm account={account} onSaved={() => { changed(); close(); }} />
          </Sheet>
          <Sheet open={sheet === "bio"} onClose={close} title="Bio">
            <BioForm account={account} onSaved={() => { changed(); close(); }} />
          </Sheet>
          <Sheet open={sheet === "username"} onClose={close} title="Username">
            <UsernameForm account={account} onSaved={changed} />
          </Sheet>
          <Sheet open={sheet === "password"} onClose={close} title="Change password">
            <PasswordForm username={account.username} onDone={loadSessions} />
          </Sheet>
          <Sheet open={sheet === "recovery"} onClose={() => { close(); changed(); }} title={account.hasRecovery ? "New recovery code" : "Make a recovery code"}>
            <RecoveryCodeSetup doneLabel="Done" onDone={() => { close(); changed(); }} />
          </Sheet>
          <Sheet open={sheet === "sessions"} onClose={close} title="Signed-in devices">
            <SessionsList sessions={sessions} reload={loadSessions} />
          </Sheet>
          <Sheet open={sheet === "delete"} onClose={close} title="Delete account">
            <DeleteForm username={account.username} />
          </Sheet>
        </>
      )}
    </SettingsPage>
  );
}

async function signOut() {
  await api("/api/auth/logout", { method: "POST" });
  await signOutHere();
}

/** A form in a sheet: a line on what it does, the fields, a note, then one full-width button. */
function Block({ description, note, action, children, onSubmit }: { title?: string; description?: React.ReactNode; note?: React.ReactNode; action: React.ReactNode; children: React.ReactNode; onSubmit: (e: React.FormEvent) => void }) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {description && <p className="text-sm text-mute">{description}</p>}
      {children}
      {note && <p className="text-xs leading-relaxed text-mute">{note}</p>}
      <div className="pt-1 [&>button]:w-full">{action}</div>
    </form>
  );
}

/* ---------- Forms ---------- */

function DisplayNameForm({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const [name, setName] = useState(account.displayName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const id = useId();
  const v = name.trim();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/account", { method: "PATCH", body: { displayName: v } });
      setMsg({ ok: true, text: "Saved" });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Block
      title="Display name"
      description="Shown next to your messages and trades."
      note="1 to 30 characters."
      onSubmit={submit}
      action={<Button disabled={busy || !v || v === account.displayName}>{busy ? "Saving…" : "Save"}</Button>}
    >
      <label htmlFor={id} className="sr-only">Display name</label>
      <Input id={id} value={name} maxLength={30} autoComplete="nickname" onChange={(e) => { setName(e.target.value); setMsg(null); }} />
      {msg && <div className="mt-2.5"><Status ok={msg.ok}>{msg.text}</Status></div>}
    </Block>
  );
}

function BioForm({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const [bio, setBio] = useState(account.bio);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const id = useId();
  const v = bio.trim().replace(/\s+/g, " ");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/account", { method: "PATCH", body: { bio: v } });
      setMsg({ ok: true, text: "Saved" });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Block
      title="Bio"
      description="A line about you, on your profile and in the member list of chats you're in."
      note={`${v.length} of ${BIO_MAX} characters. Leave it empty to remove it.`}
      onSubmit={submit}
      action={<Button disabled={busy || v === account.bio}>{busy ? "Saving…" : "Save"}</Button>}
    >
      <label htmlFor={id} className="sr-only">Bio</label>
      <textarea
        id={id}
        value={bio}
        maxLength={BIO_MAX}
        rows={3}
        placeholder="Second-year economics. Always ten minutes late."
        onChange={(e) => { setBio(e.target.value.replace(/\n/g, " ")); setMsg(null); }}
        className="w-full resize-none rounded-xl border border-line bg-ink px-3.5 py-2.5 text-[15px] outline-none placeholder:text-white/25 focus:border-white/30"
      />
      {msg && <div className="mt-2.5"><Status ok={msg.ok}>{msg.text}</Status></div>}
    </Block>
  );
}

function UsernameForm({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const [value, setValue] = useState(account.username);
  const [password, setPassword] = useState("");
  const [check, setCheck] = useState<{ for: string; ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const id = useId();
  const u = clean(value);
  const locked = account.nextUsernameChangeAt;
  const changedName = u !== account.username;
  const valid = USERNAME.test(u);

  useEffect(() => {
    if (!changedName || !valid) return;
    let alive = true;
    const t = setTimeout(() => {
      api<{ available: boolean; reason?: string }>(`/api/account/username?check=${encodeURIComponent(u)}`)
        .then((r) => alive && setCheck({ for: u, ok: r.available, text: r.available ? `@${u} is available` : r.reason ?? "Not available" }))
        .catch((e) => alive && setCheck({ for: u, ok: false, text: (e as Error).message }));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [u, changedName, valid]);

  let hint: { tone: "mute" | "up" | "down"; text: React.ReactNode } = { tone: "mute", text: "3 to 20 letters, numbers or underscores." };
  if (locked) hint = { tone: "mute", text: `You changed it recently. You can change it again on ${day(locked)}.` };
  else if (!changedName) hint = { tone: "mute", text: "3 to 20 letters, numbers or underscores." };
  else if (/[^a-z0-9_]/.test(u)) hint = { tone: "down", text: "Only letters, numbers and underscores." };
  else if (!valid) hint = { tone: "down", text: u.length > 20 ? "That is over 20 characters." : "At least 3 characters." };
  else if (check?.for !== u) hint = { tone: "mute", text: "Checking…" };
  else hint = { tone: check.ok ? "up" : "down", text: check.ok ? <><Check size={14} /> {check.text}</> : check.text };
  const ready = !locked && changedName && valid && check?.for === u && check.ok;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await changeUsername(account.username, password, u);
      setPassword("");
      setMsg({ ok: true, text: `You're now @${r.username}` });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Block
      title="Username"
      description="Friends use it to add you to groups and in your profile link."
      note="You can change it once every 7 days. Your old username stays reserved for 30 days, and links to it still reach you."
      onSubmit={submit}
      action={<Button disabled={busy || !ready || !password}>{busy ? "Changing…" : "Change username"}</Button>}
    >
      <div className="space-y-3">
        <div>
          <label htmlFor={id} className="sr-only">Username</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute">@</span>
            <Input
              id={id}
              value={value}
              disabled={!!locked}
              maxLength={24}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => { setValue(e.target.value.replace(/\s/g, "")); setMsg(null); }}
              className="pl-8 disabled:opacity-60"
              aria-describedby={`${id}-hint`}
            />
          </div>
          <p id={`${id}-hint`} aria-live="polite" className={`mt-2 flex min-h-5 items-center gap-1 text-sm ${{ mute: "text-mute", up: "text-up", down: "text-down" }[hint.tone]}`}>{hint.text}</p>
        </div>
        {ready && (
          <div>
            <input type="text" name="username" autoComplete="username" value={account.username} readOnly hidden />
            <Input type="password" aria-label="Current password" placeholder="Your password, to confirm" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="mt-2 text-xs text-mute">Needed because your login key is made from your username and password together.</p>
          </div>
        )}
        {msg && <Status ok={msg.ok}>{msg.text}</Status>}
      </div>
    </Block>
  );
}

function PasswordForm({ username, onDone }: { username: string; onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 4) return setMsg({ ok: false, text: "Use at least 4 characters." });
    if (next !== confirm) return setMsg({ ok: false, text: "The new passwords don't match." });
    if (next === current) return setMsg({ ok: false, text: "That's the same as your current password." });
    setBusy(true);
    try {
      const r = await changePassword(username, current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg({ ok: true, text: r.signedOut ? `Password changed. ${r.signedOut} other device${r.signedOut === 1 ? " was" : "s were"} signed out.` : "Password changed." });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Block
      title="Password"
      description="Your chats stay readable: the same encryption key is locked again with the new password, here on this device."
      note="Changing it signs out your other devices."
      onSubmit={submit}
      action={<Button disabled={busy || !current || !next || !confirm}>{busy ? "Re-locking your keys…" : "Change password"}</Button>}
    >
      <div className="space-y-3">
        <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
        <Input type="password" aria-label="Current password" placeholder="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input type="password" aria-label="New password" placeholder="New password" autoComplete="new-password" minLength={4} value={next} onChange={(e) => setNext(e.target.value)} />
        <Input type="password" aria-label="Confirm new password" placeholder="Confirm new password" autoComplete="new-password" minLength={4} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {msg && <Status ok={msg.ok}>{msg.text}</Status>}
      </div>
    </Block>
  );
}

async function signOutHere() {
  await forgetIdentities();
  location.href = "/";
}

function SessionsList({ sessions, reload }: { sessions: Session[] | null; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  async function revoke(body: { id: string } | { others: true }, self = false) {
    setBusy("id" in body ? body.id : "others");
    setErr("");
    try {
      await api("/api/account/sessions", { body });
      if (self) return signOutHere();
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const others = (sessions ?? []).filter((s) => !s.current).length;
  return (
    <div className="space-y-3">
      <ul className="-mx-1 divide-y divide-line">
        {!sessions && <li className="py-3 text-sm text-mute">Loading…</li>}
        {sessions?.map((s) => {
          const seen = Date.now() - new Date(s.lastSeenAt).getTime() < 120_000 ? "Active now" : `Active ${ago(s.lastSeenAt)} ago`;
          return (
            <li key={s.id} className="flex items-center gap-3 px-1 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{s.device}</span>
                  {s.current && <Badge tone="up">This device</Badge>}
                </div>
                <div className="truncate text-xs text-mute">{[s.place, s.current ? "Active now" : seen, `signed in ${new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`].filter(Boolean).join(" · ")}</div>
              </div>
              <Button type="button" variant="ghost" className="!px-3 !py-1.5 text-sm" disabled={!!busy} onClick={() => revoke({ id: s.id }, s.current)}>
                {busy === s.id ? "…" : s.current ? "Log out" : "Revoke"}
              </Button>
            </li>
          );
        })}
      </ul>
      {err && <p role="alert" className="text-sm text-down">{err}</p>}
      <Button type="button" variant="ghost" className="w-full" disabled={!!busy || !others} onClick={() => revoke({ others: true })}>
        {busy === "others" ? "Signing out…" : "Log out everywhere else"}
      </Button>
    </div>
  );
}

function DeleteForm({ username }: { username: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const matches = clean(confirm) === username;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!matches) return;
    setBusy(true);
    setErr("");
    try {
      await deleteAccount(username, password, confirm);
      await signOutHere();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <ul className="list-disc space-y-1 pl-5 text-sm text-mute">
        <li>You leave every group, and each one sees that you left.</li>
        <li>Messages you sent stay in your friends&apos; history, shown as from a deleted user.</li>
        <li>Your trades stay so every market still adds up. Your coins are gone.</li>
        <li>@{username} is held for 30 days, then anyone can take it.</li>
      </ul>
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      <Input type="password" aria-label="Your password" placeholder="Your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <div>
        <label className="mb-1.5 block text-sm text-mute">Type <b className="font-medium text-white">{username}</b> to confirm</label>
        <Input aria-label={`Type ${username} to confirm`} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {err && <p role="alert" className="text-sm text-down">{err}</p>}
      <Button variant="down" className="w-full" disabled={busy || !matches || !password}>{busy ? "Deleting…" : "Delete my account"}</Button>
    </form>
  );
}