"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { changePassword, changeUsername, deleteAccount } from "@/components/account";
import { RecoveryCodeSetup } from "@/components/recovery-code";
import { SafetySettings } from "@/components/safety-settings";
import { Avatar, Badge, Button, Input, Sheet, TopBar, ago } from "@/components/ui";
import { Check, ChevronRight, Key } from "@/components/icons";
import { forgetIdentities } from "@/lib/e2ee";

type Account = { username: string; displayName: string; color: string; createdAt: string; hasRecovery: boolean; usernameChangedAt: string | null; nextUsernameChangeAt: string | null };
type Session = { id: string; device: string; place: string; createdAt: string; lastSeenAt: string; current: boolean };
type Layout = "card" | "sheet";
type SheetName = "name" | "username" | "password" | "recovery" | "sessions" | "delete";

const USERNAME = /^[a-z0-9_]{3,20}$/;
const clean = (v: string) => v.trim().replace(/^@/, "").toLowerCase();
const day = (t: string) => new Date(t).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const small = "!px-3.5 !py-1.5 text-sm";

function useWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const q = window.matchMedia("(min-width: 1024px)");
    const f = () => setWide(q.matches);
    f();
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  return wide;
}

export default function SettingsPage() {
  const { me, loading, refresh } = useSession();
  const router = useRouter();
  const wide = useWide();
  const [account, setAccount] = useState<Account | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [sheet, setSheet] = useState<SheetName | null>(null);

  useEffect(() => {
    if (!loading && !me) router.replace("/?next=/settings");
  }, [loading, me, router]);
  const loadAccount = useCallback(() => api<Account>("/api/account").then(setAccount).catch(() => {}), []);
  const loadSessions = useCallback(() => api<{ sessions: Session[] }>("/api/account/sessions").then((r) => setSessions(r.sessions)).catch(() => {}), []);
  const userId = me?.user.id;
  useEffect(() => {
    if (!userId) return;
    loadAccount();
    loadSessions();
  }, [userId, loadAccount, loadSessions]);

  if (!me) return null;
  if (!account)
    return (
      <main className="flex min-h-dvh flex-col lg:min-h-full">
        <TopBar title="You" />
        <p className="p-10 text-center text-mute">Loading…</p>
      </main>
    );

  const changed = async () => {
    await Promise.all([loadAccount(), refresh()]);
  };
  const close = () => setSheet(null);
  const props = { account, sessions, changed, loadSessions, open: setSheet };

  const sheets = (
    <>
      <Sheet open={sheet === "recovery"} onClose={() => { close(); changed(); }} title={account.hasRecovery ? "New recovery code" : "Make a recovery code"}>
        <RecoveryCodeSetup doneLabel="Done" onDone={() => { close(); changed(); }} />
      </Sheet>
      <Sheet open={sheet === "delete"} onClose={close} title="Delete account">
        <DeleteForm username={account.username} />
      </Sheet>
      {!wide && (
        <>
          <Sheet open={sheet === "name"} onClose={close} title="Display name">
            <DisplayNameForm layout="sheet" account={account} onSaved={() => { changed(); close(); }} />
          </Sheet>
          <Sheet open={sheet === "username"} onClose={close} title="Username">
            <UsernameForm layout="sheet" account={account} onSaved={changed} />
          </Sheet>
          <Sheet open={sheet === "password"} onClose={close} title="Change password">
            <PasswordForm layout="sheet" username={account.username} onDone={loadSessions} />
          </Sheet>
          <Sheet open={sheet === "sessions"} onClose={close} title="Signed-in devices">
            <SessionsList layout="sheet" sessions={sessions} reload={loadSessions} />
          </Sheet>
        </>
      )}
    </>
  );

  return (
    <main className="flex min-h-dvh flex-col lg:min-h-full">
      <TopBar title="You" />
      {wide ? <Laptop {...props} /> : <Phone {...props} />}
      {sheets}
    </main>
  );
}

type PageProps = { account: Account; sessions: Session[] | null; changed: () => Promise<void>; loadSessions: () => Promise<void>; open: (s: SheetName) => void };

/* ---------- Laptop: section nav on the left, cards on the right ---------- */

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "privacy", label: "Privacy" },
  { id: "devices", label: "Devices" },
  { id: "danger", label: "Danger zone" },
];

function Laptop({ account, sessions, changed, loadSessions, open }: PageProps) {
  const [active, setActive] = useState("profile");
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-80px 0px -55% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-[176px_minmax(0,1fr)] gap-12 px-8 pb-24 pt-8">
      <nav className="sticky top-[89px] self-start" aria-label="Settings sections">
        <div className="mb-3 flex items-center gap-2.5 px-3">
          <Avatar name={account.displayName} color={account.color} size={28} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-medium">{account.displayName}</div>
            <div className="truncate text-xs text-mute">@{account.username}</div>
          </div>
        </div>
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={() => setActive(s.id)}
            className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${active === s.id ? "bg-white/[.06] text-white" : "text-mute hover:text-white"}`}
          >
            {s.label}
            {s.id === "security" && !account.hasRecovery && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
          </a>
        ))}
      </nav>

      <div className="space-y-14">
        <Section id="profile" title="Profile" description="How friends see you, and the name they use to find you.">
          <DisplayNameForm layout="card" account={account} onSaved={changed} />
          <UsernameForm layout="card" account={account} onSaved={changed} />
        </Section>

        <Section id="security" title="Security" description="Your password unlocks your encryption keys on each device. Only keys derived from it are ever sent.">
          {!account.hasRecovery && <RecoveryBanner onMake={() => open("recovery")} />}
          <PasswordForm layout="card" username={account.username} onDone={loadSessions} />
          <Card
            title="Recovery code"
            description="The way back in if you forget your password. It opens a second copy of your encryption key, so your chats stay readable after a reset."
            footer={
              <>
                <span>Making a new code replaces the old one.</span>
                <Button type="button" variant={account.hasRecovery ? "ghost" : "primary"} className={small} onClick={() => open("recovery")}>
                  {account.hasRecovery ? "Make a new code" : "Make a recovery code"}
                </Button>
              </>
            }
          >
            {account.hasRecovery ? (
              <p className="flex items-center gap-2 text-sm"><Check size={16} className="text-up" /> Recovery code is set up</p>
            ) : (
              <p className="text-sm text-down">No recovery code yet</p>
            )}
          </Card>
        </Section>

        <Section id="privacy" title="Privacy" description="Who can post situations about you.">
          <SafetySettings />
        </Section>

        <Section id="devices" title="Devices" description="Everywhere you're signed in right now.">
          <SessionsList layout="card" sessions={sessions} reload={loadSessions} />
        </Section>

        <Section id="danger" title="Danger zone">
          <Card
            tone="danger"
            title="Delete account"
            description="You leave every group and can't sign in again. Your trades stay so markets still add up, and your old messages show as from a deleted user."
            footer={
              <>
                <span>This can&apos;t be undone.</span>
                <Button type="button" variant="down" className={small} onClick={() => open("delete")}>Delete account</Button>
              </>
            }
          />
        </Section>
      </div>
    </div>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-sm text-mute">{description}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Card({ title, description, children, footer, tone }: { title: string; description?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; tone?: "danger" }) {
  return (
    <div className={`overflow-hidden rounded-xl border bg-panel ${tone === "danger" ? "border-down/30" : "border-line"}`}>
      <div className="p-6">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {description && <p className="mt-1 max-w-2xl text-sm text-mute">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
      </div>
      {footer && <div className="flex min-h-[52px] items-center justify-between gap-4 border-t border-line bg-white/[.015] px-6 py-2.5 text-sm text-mute [&>button]:shrink-0 [&>button]:whitespace-nowrap">{footer}</div>}
    </div>
  );
}

/** One form, laid out as a settings card on a laptop or as the body of a sheet on a phone. */
function Block({ layout, title, description, note, action, children, onSubmit }: { layout: Layout; title: string; description?: React.ReactNode; note?: React.ReactNode; action: React.ReactNode; children: React.ReactNode; onSubmit: (e: React.FormEvent) => void }) {
  if (layout === "sheet")
    return (
      <form onSubmit={onSubmit} className="space-y-3">
        {description && <p className="text-sm text-mute">{description}</p>}
        {children}
        {note && <p className="text-xs leading-relaxed text-mute">{note}</p>}
        <div className="pt-1 [&>button]:w-full">{action}</div>
      </form>
    );
  return (
    <form onSubmit={onSubmit}>
      <Card title={title} description={description} footer={<><span>{note}</span>{action}</>}>{children}</Card>
    </form>
  );
}

function Status({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return <p role={ok ? "status" : "alert"} className={`flex items-center gap-1.5 text-sm ${ok ? "text-up" : "text-down"}`}>{ok && <Check size={15} />}{children}</p>;
}

function RecoveryBanner({ onMake }: { onMake: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-brand/25 bg-brand/[.05] p-4 sm:flex-row sm:items-center">
      <div className="flex flex-1 gap-3">
        <Key size={18} className="mt-0.5 text-brand" />
        <div className="text-sm">
          <div className="font-medium">Make a recovery code</div>
          <p className="mt-0.5 text-mute">Without one, a forgotten password means losing your account and your encrypted chats for good.</p>
        </div>
      </div>
      <Button type="button" className={`${small} shrink-0`} onClick={onMake}>Make one now</Button>
    </div>
  );
}

/* ---------- Forms (shared by both layouts) ---------- */

function DisplayNameForm({ layout, account, onSaved }: { layout: Layout; account: Account; onSaved: () => void }) {
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
      layout={layout}
      title="Display name"
      description="Shown next to your messages and trades."
      note="1 to 30 characters."
      onSubmit={submit}
      action={<Button className={layout === "card" ? small : ""} disabled={busy || !v || v === account.displayName}>{busy ? "Saving…" : "Save"}</Button>}
    >
      <label htmlFor={id} className="sr-only">Display name</label>
      <Input id={id} value={name} maxLength={30} autoComplete="nickname" onChange={(e) => { setName(e.target.value); setMsg(null); }} className="lg:max-w-sm" />
      {msg && <div className="mt-2.5"><Status ok={msg.ok}>{msg.text}</Status></div>}
    </Block>
  );
}

function UsernameForm({ layout, account, onSaved }: { layout: Layout; account: Account; onSaved: () => void }) {
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
      layout={layout}
      title="Username"
      description="Friends use it to add you to groups and in your profile link."
      note="You can change it once every 7 days. Your old username stays reserved for 30 days, and links to it still reach you."
      onSubmit={submit}
      action={<Button className={layout === "card" ? small : ""} disabled={busy || !ready || !password}>{busy ? "Changing…" : "Change username"}</Button>}
    >
      <div className="space-y-3 lg:max-w-sm">
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

function PasswordForm({ layout, username, onDone }: { layout: Layout; username: string; onDone: () => void }) {
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
      layout={layout}
      title="Password"
      description="Your chats stay readable: the same encryption key is locked again with the new password, here on this device."
      note="Changing it signs out your other devices."
      onSubmit={submit}
      action={<Button className={layout === "card" ? small : ""} disabled={busy || !current || !next || !confirm}>{busy ? "Re-locking your keys…" : "Change password"}</Button>}
    >
      <div className="space-y-3 lg:max-w-sm">
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

function SessionsList({ layout, sessions, reload }: { layout: Layout; sessions: Session[] | null; reload: () => Promise<void> }) {
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
  const list = (
    <ul className={layout === "card" ? "divide-y divide-line" : "-mx-1 divide-y divide-line"}>
      {!sessions && <li className="py-3 text-sm text-mute">Loading…</li>}
      {sessions?.map((s) => {
        const seen = Date.now() - new Date(s.lastSeenAt).getTime() < 120_000 ? "Active now" : `Active ${ago(s.lastSeenAt)} ago`;
        return (
          <li key={s.id} className={`flex items-center gap-3 ${layout === "card" ? "px-6 py-3.5" : "px-1 py-3"}`}>
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
  );
  const action = (
    <Button type="button" variant="ghost" className={layout === "card" ? small : "w-full"} disabled={!!busy || !others} onClick={() => revoke({ others: true })}>
      {busy === "others" ? "Signing out…" : "Log out everywhere else"}
    </Button>
  );
  if (layout === "sheet")
    return (
      <div className="space-y-3">
        {list}
        {err && <p role="alert" className="text-sm text-down">{err}</p>}
        {action}
      </div>
    );
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      {list}
      {err && <p role="alert" className="px-6 pb-3 text-sm text-down">{err}</p>}
      <div className="flex min-h-[52px] items-center justify-between gap-4 border-t border-line bg-white/[.015] px-6 py-2.5 text-sm text-mute [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        <span>{others ? `${others} other device${others === 1 ? "" : "s"}` : "No other devices"}</span>
        {action}
      </div>
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

/* ---------- Phone: a grouped list, each row opens a sheet ---------- */

function Phone({ account, sessions, open }: PageProps) {
  return (
    <div className="space-y-6 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-5">
      <div className="flex items-center gap-3 px-1">
        <Avatar name={account.displayName} color={account.color} size={52} />
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{account.displayName}</div>
          <div className="truncate text-sm text-mute">@{account.username}</div>
        </div>
      </div>
      {!account.hasRecovery && <RecoveryBanner onMake={() => open("recovery")} />}
      <Group title="Profile">
        <Row label="Display name" value={account.displayName} onClick={() => open("name")} />
        <Row label="Username" value={`@${account.username}`} onClick={() => open("username")} />
      </Group>
      <Group title="Security">
        <Row label="Password" onClick={() => open("password")} />
        <Row label="Recovery code" value={account.hasRecovery ? "Set up" : "Not set up"} tone={account.hasRecovery ? undefined : "brand"} onClick={() => open("recovery")} />
        <Row label="Signed-in devices" value={sessions ? String(sessions.length) : ""} onClick={() => open("sessions")} />
      </Group>
      <section>
        <h2 className="px-1 pb-2 text-xs font-medium uppercase tracking-wider text-mute">Privacy</h2>
        <SafetySettings />
      </section>
      <Group title="Danger zone">
        <Row label="Delete account" danger onClick={() => open("delete")} />
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="px-1 pb-2 text-xs font-medium uppercase tracking-wider text-mute">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">{children}</div>
    </section>
  );
}

function Row({ label, value, onClick, danger, tone }: { label: string; value?: string; onClick: () => void; danger?: boolean; tone?: "brand" }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left transition active:bg-white/[.04]">
      <span className={`flex-1 ${danger ? "text-down" : ""}`}>{label}</span>
      {value && <span className={`max-w-[50%] truncate text-sm ${tone === "brand" ? "text-brand" : "text-mute"}`}>{value}</span>}
      {!danger && <ChevronRight size={16} className="text-mute" />}
    </button>
  );
}
