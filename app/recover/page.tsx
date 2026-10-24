"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { recoverAccount } from "@/components/account";
import { RecoveryCodeSetup } from "@/components/recovery-code";
import { Button, Input } from "@/components/ui";
import { Logo } from "@/components/shell";
import { normaliseRecoveryCode } from "@/lib/e2ee";

// Forgot password. The recovery code opens a second sealed copy of the encryption key, so a
// reset keeps every chat readable; there is no email reset because the server can't do that.
export default function Recover() {
  const { me, refresh, setIdentity } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [newCode, setNewCode] = useState<string | null>(null);

  useEffect(() => {
    const u = new URLSearchParams(location.search).get("username");
    if (u) setUsername(u);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!normaliseRecoveryCode(code)) return setErr("A recovery code is 20 letters and numbers, like ABCD-EFGH-JKLM-NPQR-STUV.");
    if (password.length < 4) return setErr("Use at least 4 characters for the new password.");
    if (password !== confirm) return setErr("The two passwords don't match.");
    setBusy(true);
    try {
      const r = await recoverAccount(username, code, password);
      setIdentity(r.privateKey);
      setNewCode(r.recoveryCode);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    await refresh();
    router.replace("/chats");
  }

  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-10 flex items-center gap-2.5">
          <Logo size={28} />
          <span className="font-semibold tracking-tight">FriendStakes</span>
        </Link>

        {newCode ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Password changed</h1>
            <p className="mb-6 mt-1 text-sm text-mute">
              You&apos;re signed in here and your other devices were signed out. The code you just used no longer works, so here is a new one.
            </p>
            <RecoveryCodeSetup code={newCode} onDone={finish} doneLabel="Go to my chats" />
          </>
        ) : me && !busy ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">You&apos;re signed in</h1>
            <p className="mb-6 mt-1 text-sm text-mute">You&apos;re signed in as @{me.user.username}. To change your password, use Settings.</p>
            <Link href="/settings"><Button className="w-full">Open settings</Button></Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
            <p className="mb-6 mt-1 text-sm text-mute">Use the recovery code you saved when you made your account. Your chats stay encrypted and readable.</p>
            <form onSubmit={submit} className="space-y-3">
              <Input aria-label="Username" placeholder="Username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required />
              <Input
                aria-label="Recovery code"
                placeholder="Recovery code, XXXX-XXXX-XXXX-XXXX-XXXX"
                className="font-mono uppercase tracking-wide placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              <Input aria-label="New password" type="password" placeholder="New password" autoComplete="new-password" minLength={4} value={password} onChange={(e) => setPassword(e.target.value)} required />
              <Input aria-label="Confirm new password" type="password" placeholder="Confirm new password" autoComplete="new-password" minLength={4} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              {err && <p role="alert" className="text-sm text-down">{err}</p>}
              <Button className="w-full" disabled={busy}>{busy ? "Checking your code…" : "Reset password"}</Button>
            </form>
            <p className="mt-6 text-xs leading-relaxed text-mute">
              No recovery code? Without it or your password the encrypted chats can&apos;t be opened, by us or anyone else. You can still make a new account.
            </p>
            <Link href="/" className="mt-4 inline-block text-sm text-mute hover:text-white">Back to log in</Link>
          </>
        )}
      </div>
    </main>
  );
}
