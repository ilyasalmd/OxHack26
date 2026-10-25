"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { ProfilePhoto } from "@/components/profile-photo";
import { Group, Row, column } from "@/components/settings";
import { TopBar, fmt, pct } from "@/components/ui";
import { Camera, LogOut, Palette, Shield, User, Users } from "@/components/icons";
import { forgetIdentities } from "@/lib/e2ee";
import { ACCENTS, useAccent } from "@/lib/theme";

type Position = { status: string; yes: number; no: number; price: number };

/**
 * The profile: who you are and a few numbers, then five rows. Everything else lives one tap
 * down, on its own page, so this screen never turns into one long list.
 */
export default function You() {
  const { me, loading } = useSession();
  const router = useRouter();
  const [accent] = useAccent();
  const [calls, setCalls] = useState<{ right: number; total: number } | null>(null);

  useEffect(() => {
    if (!loading && !me) router.replace("/?next=/settings");
  }, [loading, me, router]);
  const userId = me?.user.id;
  useEffect(() => {
    if (!userId) return;
    // A settled stake is called right when the side you held most of is the side that happened.
    api<{ positions: Position[] }>("/api/portfolio")
      .then(({ positions }) => {
        const done = positions.filter((p) => p.status === "resolved" && Math.abs(p.yes - p.no) > 0.001);
        setCalls({ right: done.filter((p) => p.yes > p.no === p.price > 0.5).length, total: done.length });
      })
      .catch(() => {});
  }, [userId]);

  if (!me) return null;
  const groups = me.groups.filter((g) => !g.is_dm).length;
  const dms = me.groups.length - groups;
  const recovery = me.account.hasRecovery;

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    await forgetIdentities();
    location.href = "/";
  }

  return (
    <main className="flex min-h-dvh flex-col lg:min-h-full">
      <TopBar title="You" />
      <div className={column}>
        <header className="flex flex-col items-center pt-2 text-center">
          <ProfilePhoto size={88} />
          <h1 className="mt-3 max-w-full truncate text-2xl font-bold tracking-tight">{me.user.display_name}</h1>
          <p className="text-mute">@{me.user.username}</p>
        </header>

        <div className="grid grid-cols-3 gap-2">
          <Stat href="/portfolio" label="Net worth" value={fmt(me.netWorth.total, 0)} sub={me.config.currency.ticker} />
          <Stat
            label="Called right"
            value={!calls ? "…" : calls.total ? pct(calls.right / calls.total) : "–"}
            sub={!calls ? "" : calls.total ? `${calls.right} of ${calls.total}` : "Nothing settled"}
          />
          <Stat href="/settings/groups" label="Groups" value={String(groups)} sub={dms ? `+${dms} private chat${dms === 1 ? "" : "s"}` : "joined"} />
        </div>

        <Group>
          <Row icon={Camera} label="Photo" value={me.photo?.avatarId ? "" : "Add one"} href="/settings/photo" />
          <Row icon={Palette} label="Theme" value={ACCENTS.find((a) => a.k === accent)?.label} href="/settings/theme" />
          <Row icon={Users} label="Groups" value={String(groups)} href="/settings/groups" />
          <Row icon={Shield} label="Privacy" href="/settings/privacy" />
          <Row icon={User} label="Account" value={recovery ? "" : "Make a recovery code"} tone="brand" href="/settings/account" />
        </Group>

        <button type="button" onClick={logout} className="mx-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-mute transition hover:text-down">
          <LogOut size={15} /> Log out
        </button>
      </div>
    </main>
  );
}

function Stat({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <>
      <div className="text-xs text-mute">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tabular tracking-tight">{value}</div>
      <div className="min-h-4 truncate text-xs text-mute">{sub}</div>
    </>
  );
  const cls = "block min-w-0 rounded-2xl border border-line bg-panel px-3 py-3 text-center";
  return href ? <Link href={href} className={`${cls} transition hover:bg-raised`}>{body}</Link> : <div className={cls}>{body}</div>;
}
