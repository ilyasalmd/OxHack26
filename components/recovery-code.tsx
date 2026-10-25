"use client";
import { useId, useState } from "react";
import { useSession } from "./session";
import { makeRecoveryCode } from "./account";
import { Button, Input } from "./ui";
import { Check, Key } from "./icons";

/**
 * The recovery code, shown exactly once.
 *
 *   After sign-up (code from prepareSignup in lib/e2ee):  <RecoveryCodeSetup code={recoveryCode} onDone={...} />
 *   From settings (asks for the password, makes a new one): <RecoveryCodeSetup onDone={...} />
 */
export function RecoveryCodeSetup({ code: given, onDone, doneLabel = "Continue" }: { code?: string; onDone: () => void; doneLabel?: string }) {
  const [code, setCode] = useState(given ?? "");
  if (!code) return <MakeCode onMade={setCode} />;
  return <ShowCode code={code} onDone={onDone} doneLabel={doneLabel} />;
}

function MakeCode({ onMade }: { onMade: (code: string) => void }) {
  const { me } = useSession();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    setBusy(true);
    setErr("");
    try {
      onMade(await makeRecoveryCode(me.user.username, pw));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-mute">
        A recovery code lets you reset a forgotten password without losing your encrypted chats. Making a new one replaces any code you had before.
      </p>
      <input type="text" name="username" autoComplete="username" value={me?.user.username ?? ""} readOnly hidden />
      <Input type="password" aria-label="Your password" placeholder="Your password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus />
      {err && <p role="alert" className="text-sm text-down">{err}</p>}
      <Button className="w-full" disabled={busy || !pw}>{busy ? "Making your code…" : "Make recovery code"}</Button>
    </form>
  );
}

function ShowCode({ code, onDone, doneLabel }: { code: string; onDone: () => void; doneLabel: string }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const id = useId();
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-ink text-white"><Key size={17} /></div>
        <p className="text-sm text-mute">
          If you forget your password, this code is the only way back into your account and your encrypted chats. Nobody else can reset it for you. Keep it in a password manager or write it down.
        </p>
      </div>
      <div className="rounded-xl border border-line bg-ink px-4 py-4 text-center">
        <code className="select-all font-mono text-[17px] font-medium tracking-[0.08em] text-white lg:text-lg" aria-label="Recovery code">{code}</code>
      </div>
      <Button type="button" variant="ghost" className="flex w-full items-center justify-center gap-2" onClick={copy}>
        {copied ? <><Check size={16} /> Copied</> : "Copy code"}
      </Button>
      <p className="text-xs text-mute">This is the only time it will be shown.</p>
      <label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3.5 py-3 text-sm">
        <input id={id} type="checkbox" className="h-4 w-4 accent-white" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I&apos;ve saved it somewhere safe
      </label>
      <Button type="button" className="w-full" disabled={!saved} onClick={onDone}>{doneLabel}</Button>
    </div>
  );
}
