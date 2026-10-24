"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { DeskAuth, PhoneAuth, type AuthProps } from "@/components/landing/auth-flow";
import { deriveKeys, prepareSignup, saveIdentity, unlockIdentity } from "@/lib/e2ee";

export default function Landing() {
  const { me, loading, refresh, setIdentity } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Shown once right after sign-up. The session arrives meanwhile, so hold the redirect until it's saved.
  const [recovery, setRecovery] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && me && !recovery) router.replace(new URLSearchParams(location.search).get("next") ?? "/chats");
  }, [loading, me, recovery, router]);

  async function submit(e: React.FormEvent, mode: "signup" | "login") {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const uname = username.trim().toLowerCase().replace(/^@/, "");
      if (mode === "signup") {
        const s = await prepareSignup({ username: uname, displayName, password });
        const r = await api<{ id: number }>("/api/auth/signup", { body: s.body });
        await saveIdentity(r.id, s.privateKey);
        setRecovery(s.recoveryCode);
        setIdentity(s.privateKey);
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

  const p: AuthProps = {
    username, setUsername, displayName, setDisplayName, password, setPassword, busy, err, setErr, submit,
    recovery, finish: async () => { await refresh(); setRecovery(null); },
  };
  return (
    <main className="min-h-dvh overflow-x-clip">
      <div className="lg:hidden">
        <PhoneAuth {...p} />
      </div>
      <DeskAuth {...p} />
    </main>
  );
}
