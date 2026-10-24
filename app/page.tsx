"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { Button, Input } from "@/components/ui";
import { createIdentity, deriveKeys, randomSalt, saveIdentity, unlockIdentity } from "@/lib/e2ee";

export default function Landing() {
  const { me, loading, refresh, setIdentity } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!loading && me) router.replace(new URLSearchParams(location.search).get("next") ?? "/chats");
  }, [loading, me, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const uname = username.trim().toLowerCase().replace(/^@/, "");
      if (mode === "signup") {
        const keySalt = randomSalt();
        const { authKey, encKey } = await deriveKeys(password, uname, keySalt);
        const id = await createIdentity(encKey);
        const r = await api<{ id: number }>("/api/auth/signup", {
          body: { username: uname, displayName: displayName.trim() || uname, authKey, publicKey: id.publicKey, encPrivateKey: id.encPrivateKey, keySalt },
        });
        await saveIdentity(r.id, id.privateKey);
        setIdentity(id.privateKey);
      } else {
        const { salt } = await api<{ salt: string }>(`/api/auth/salt?username=${encodeURIComponent(uname)}`);
        const { authKey, encKey } = await deriveKeys(password, uname, salt);
        const r = await api<{ id: number; encPrivateKey: string }>("/api/auth/login", { body: { username: uname, authKey } });
        const key = await unlockIdentity(r.encPrivateKey, encKey);
        await saveIdentity(r.id, key);
        setIdentity(key);
      }
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col px-6 pb-10 pt-16">
      <div className="mb-10">
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-3xl">📈</div>
        <h1 className="text-4xl font-bold tracking-tight">Friend Stocks</h1>
        <p className="mt-3 text-lg text-mute">Your group chat, now with a stock market. Bet on your mates, back yourself, and keep everyone honest.</p>
      </div>
      <div className="mb-6 grid grid-cols-3 gap-2 text-center text-xs text-mute">
        <div className="rounded-2xl bg-panel p-3"><div className="text-xl">🔒</div>End-to-end encrypted chats</div>
        <div className="rounded-2xl bg-panel p-3"><div className="text-xl">🤖</div>AI odds from your history</div>
        <div className="rounded-2xl bg-panel p-3"><div className="text-xl">◎</div>Coins on Solana</div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Input placeholder="username" autoCapitalize="none" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        {mode === "signup" && <Input placeholder="display name (e.g. Jake)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
        <Input type="password" placeholder="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} />
        {err && <p className="text-sm text-down">{err}</p>}
        <Button className="w-full" disabled={busy}>
          {busy ? (mode === "signup" ? "Generating your keys…" : "Unlocking…") : mode === "signup" ? "Create account · get 500 free" : "Log in"}
        </Button>
      </form>
      <button className="mt-4 text-sm text-mute" onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
        {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
      </button>
      <p className="mt-auto pt-10 text-xs text-mute">
        Play money only. Your password never leaves this device: it unlocks your encryption keys locally, and only a derived login key is sent.
      </p>
    </main>
  );
}
