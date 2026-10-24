"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { Button, Input } from "@/components/ui";
import { Logo } from "@/components/shell";
import { Coin, Lock, Sparkle } from "@/components/icons";
import { ChatPreview } from "@/components/landing/chat-preview";
import { MobileAuth } from "@/components/landing/mobile-auth";
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

  const features = [
    { icon: Lock, title: "End-to-end encrypted", body: "Chats are locked on your devices. The server only sees the market." },
    { icon: Sparkle, title: "Odds from your history", body: "Every situation is priced from what actually happened in your group before." },
    { icon: Coin, title: "Coins on Solana", body: "Every stake and payout is recorded as a token on Solana. Play money only." },
  ];

  return (
    <main className="min-h-dvh overflow-x-clip">
      <div className="lg:hidden">
        <MobileAuth
          mode={mode} setMode={setMode}
          username={username} setUsername={setUsername}
          displayName={displayName} setDisplayName={setDisplayName}
          password={password} setPassword={setPassword}
          busy={busy} err={err} setErr={setErr} submit={submit}
        />
      </div>

      <div className="hidden min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
        <section className="flex flex-col justify-between border-r border-line bg-panel px-16 py-14">
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="text-lg font-semibold tracking-tight">Friend Stocks</span>
          </div>
          <div className="max-w-xl">
            <h1 className="text-6xl font-semibold leading-[1.05] tracking-tight">Your group chat,<br />now with a stock market.</h1>
            <p className="mt-4 text-xl text-mute">Bet on your mates, back yourself, and keep everyone honest. Every situation gets fair odds from your own history.</p>
            <ul className="mt-8 space-y-5">
              {features.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-ink text-white"><Icon size={17} /></div>
                  <div>
                    <div className="font-medium">{title}</div>
                    <div className="text-sm text-mute">{body}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-mute">Built for OxHack 2026. Theme: time.</p>
        </section>

        <section className="relative flex flex-col items-center justify-center overflow-hidden px-16 py-4 [@media(min-height:760px)]:py-6 [@media(min-height:850px)]:py-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_100%,rgba(198,255,61,.05),transparent)]" />
          <div className="relative w-full max-w-sm">
            <h2 className="mb-1 text-2xl font-semibold tracking-tight">{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
            <p className="mb-6 text-sm text-mute">{mode === "signup" ? "Everyone starts with 500 coins and gets 50 more each week." : "Log in to unlock your encrypted chats."}</p>
            <form onSubmit={submit} className="space-y-3">
              <Input aria-label="Username" placeholder="Username" autoCapitalize="none" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              {mode === "signup" && <Input aria-label="Display name" placeholder="Display name, e.g. Jake" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
              <Input aria-label="Password" type="password" placeholder="Password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} />
              {err && <p role="alert" className="text-sm text-down">{err}</p>}
              <Button className="w-full" disabled={busy}>
                {busy ? (mode === "signup" ? "Generating your keys…" : "Unlocking…") : mode === "signup" ? "Create account" : "Log in"}
              </Button>
            </form>
            <button className="mt-4 text-sm text-mute hover:text-white" onClick={() => { setErr(""); setMode(mode === "signup" ? "login" : "signup"); }}>
              {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
            </button>
            <p className="mt-6 text-xs text-mute">
              Play money only. Your password never leaves this device: it unlocks your encryption keys locally, and only a derived login key is sent.
            </p>
            <div className="mt-6 [@media(max-height:640px)]:hidden">
              <div className="mb-2.5 flex items-center gap-2 text-xs text-mute">
                <span className="h-1.5 w-1.5 rounded-full bg-up" />
                Inside a group
              </div>
              <ChatPreview />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
