"use client";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./session";
import { Button, TopBar } from "./ui";
import { Check, ChevronRight, Key } from "./icons";

type Icon = (p: { size?: number; className?: string }) => React.ReactNode;

/** The column every profile screen sits in: one narrow list, centred on a laptop. */
export const column = "mx-auto w-full max-w-xl space-y-6 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-5 lg:px-8 lg:pt-8";

/** A page you open from the profile: signed-in only, with a way back to it. */
export function SettingsPage({ title, children }: { title: string; children: React.ReactNode }) {
  const { me, loading } = useSession();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!loading && !me) router.replace(`/?next=${path}`);
  }, [loading, me, router, path]);
  if (!me) return null;
  return (
    <main className="flex min-h-dvh flex-col lg:min-h-full">
      <TopBar title={title} back="/settings" backOnDesktop />
      <div className={column}>{children}</div>
    </main>
  );
}

/** A titled block on a settings page, with an optional line saying what it's for. */
export function Section({ title, note, children }: { title?: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      {title && <h2 className="px-1 pb-2 text-xs font-medium uppercase tracking-wider text-mute">{title}</h2>}
      {note && <p className="px-1 pb-3 text-sm text-mute">{note}</p>}
      {children}
    </section>
  );
}

/** Rows that belong together, in one rounded card. */
export function Group({ title, note, children }: { title?: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Section title={title} note={note}>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">{children}</div>
    </Section>
  );
}

/** One line in a group: a link to another page, or a button that opens a sheet (or, with `action`, just does it). */
export function Row({ icon: I, label, value, href, onClick, danger, tone, action }: { icon?: Icon; label: string; value?: React.ReactNode; href?: string; onClick?: () => void; danger?: boolean; tone?: "brand"; action?: boolean }) {
  const body = (
    <>
      {I && <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${danger ? "bg-down/15 text-down" : "bg-brand/15 text-brand"}`}><I size={17} /></span>}
      <span className={`flex-1 ${danger ? "text-down" : ""}`}>{label}</span>
      {value != null && value !== "" && <span className={`max-w-[50%] truncate text-sm ${tone === "brand" ? "text-brand" : "text-mute"}`}>{value}</span>}
      {!danger && !action && <ChevronRight size={16} className="text-mute" />}
    </>
  );
  const cls = "flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-raised active:bg-raised";
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

export function Status({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return <p role={ok ? "status" : "alert"} className={`flex items-center gap-1.5 text-sm ${ok ? "text-up" : "text-down"}`}>{ok && <Check size={15} />}{children}</p>;
}

export function RecoveryBanner({ onMake }: { onMake: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand/25 bg-brand/[.05] p-4 sm:flex-row sm:items-center">
      <div className="flex flex-1 gap-3">
        <Key size={18} className="mt-0.5 text-brand" />
        <div className="text-sm">
          <div className="font-medium">Make a recovery code</div>
          <p className="mt-0.5 text-mute">Without one, a forgotten password means losing your account and your encrypted chats for good.</p>
        </div>
      </div>
      <Button type="button" className="!px-3.5 !py-1.5 shrink-0 text-sm" onClick={onMake}>Make one now</Button>
    </div>
  );
}
