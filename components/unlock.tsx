"use client";
import { useState } from "react";
import { api } from "./api";
import { useSession } from "./session";
import { Button, Input } from "./ui";
import { deriveKeys, saveIdentity, unlockIdentity } from "@/lib/e2ee";

/** Shown when you're logged in on a device that doesn't hold your decrypted key yet. */
export function UnlockPrompt() {
  const { me, setIdentity } = useSession();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const uname = me!.user.username;
      const { salt } = await api(`/api/auth/salt?username=${uname}`);
      const { authKey, encKey } = await deriveKeys(pw, uname, salt);
      const r = await api("/api/auth/login", { body: { username: uname, authKey } });
      const key = await unlockIdentity(r.encPrivateKey, encKey);
      await saveIdentity(me!.user.id, key);
      setIdentity(key);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={unlock} className="m-4 space-y-3 rounded-3xl border border-line bg-panel p-4">
      <p className="text-sm">🔒 Enter your password to unlock your encrypted chats on this device.</p>
      <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password" />
      {err && <p className="text-sm text-down">{err}</p>}
      <Button className="w-full" disabled={busy}>{busy ? "Unlocking…" : "Unlock"}</Button>
    </form>
  );
}
