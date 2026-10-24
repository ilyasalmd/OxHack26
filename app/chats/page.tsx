"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { UnlockPrompt } from "@/components/unlock";
import { LastLine, useChatActions } from "@/components/shell";
import { ChatMark, chatName } from "@/components/chat/mark";
import { prefetchChat } from "@/components/chat/cache";
import { Avatar, Button, Coins, ago, fmt, pct, timeLeft } from "@/components/ui";
import { ChevronRight, Link2, Plus, Users } from "@/components/icons";

type Situation = { id: number; title: string; kind: string; category: string; group: string; creator: string; resolves_at: string; volume: number; traders: number; price: number; change: number };
type Call = { id: number; side: string; action: string; coins: number; price_after: number; created_at: string; market_id: number; title: string; kind: string; display_name: string; username: string; color: string };
type Leader = { id: number; display_name: string; username: string; color: string; net_worth: number; me: boolean };
type Feed = { markets: Situation[]; calls: Call[]; leaders: Leader[] };

const CATEGORY: Record<string, string> = { punctuality: "Punctuality", fitness: "Fitness", football: "Sport", sport: "Sport", uni: "Uni", work: "Work", relationships: "Social", social: "Social", other: "Other" };
const label = (c: string) => CATEGORY[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

export default function Chats() {
  const { me, loading, identity } = useSession();
  const router = useRouter();
  const actions = useChatActions();
  const [copied, setCopied] = useState(false);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [cat, setCat] = useState("All");

  useEffect(() => {
    if (!loading && !me) router.replace("/");
  }, [loading, me, router]);
  const userId = me?.user.id;
  useEffect(() => {
    if (!userId) return;
    const load = () => api<Feed>("/api/feed").then(setFeed).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [userId]);
  // On a laptop the most recent chat opens straight away; the chat list lives in the sidebar.
  const latest = me?.groups.length
    ? [...me.groups].sort((a, b) => (b.last ? Date.parse(b.last.created_at) : 0) - (a.last ? Date.parse(a.last.created_at) : 0))[0].id
    : null;
  useEffect(() => {
    if (latest != null && matchMedia("(min-width: 1024px)").matches) router.replace(`/g/${latest}`);
  }, [latest, router]);
  // On a phone, fetch the chats at the top of the list ahead, three at a time, so tapping one slides it in already drawn.
  useEffect(() => {
    if (!me || !identity || matchMedia("(min-width: 1024px)").matches) return;
    let stop = false;
    const top = [...me.groups].sort((a, b) => (b.last ? Date.parse(b.last.created_at) : 0) - (a.last ? Date.parse(a.last.created_at) : 0)).slice(0, 8);
    const next = async (): Promise<void> => {
      const g = top.shift();
      if (g && !stop) return prefetchChat(me.user.id, g.id, identity).then(next);
    };
    void Promise.all([next(), next(), next()]);
    return () => {
      stop = true;
    };
    // The list of chats changes on every session refresh; fetching ahead once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, identity]);
  if (!me) return null;
  const c = me.config.currency;

  async function share() {
    const url = `${location.origin}/u/${me!.user.username}`;
    try {
      if (navigator.share) await navigator.share({ title: "Add me on FriendStakes", text: `I'm @${me!.user.username} on FriendStakes`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {}
  }
  const nextAllowance = new Date(me.nextAllowanceAt).toLocaleDateString("en-GB", { weekday: "long" });
  const live = me.groups.reduce((s, g) => s + g.open_markets, 0);
  const cats = ["All", ...new Set((feed?.markets ?? []).map((m) => label(m.category)))];
  const shown = (feed?.markets ?? []).filter((m) => cat === "All" || label(m.category) === cat);

  return (
    <>
      {/* Phone: the chat list and nothing else, like a messaging app. Markets, money and the account have their own tabs. */}
      <main className="flex min-h-dvh flex-col lg:hidden">
        <header className="flex items-center justify-between px-5 pb-3 pt-[calc(env(safe-area-inset-top)+16px)]">
          <h1 className="text-[28px] font-bold tracking-tight">Chats</h1>
          <div className="flex gap-2">
            <button onClick={actions.join} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[.07] text-white hover:bg-white/10" aria-label="Join with an invite code" title="Join with a code"><Users size={17} /></button>
            <button onClick={actions.create} disabled={!identity} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black hover:bg-white/90 disabled:opacity-40" aria-label="New chat" title="New chat"><Plus size={18} /></button>
          </div>
        </header>

        {!identity && <UnlockPrompt />}

        <ul className="flex-1">
          {me.groups.length === 0 && <li className="px-5 py-10 text-center text-mute">No chats yet. Start one with your friends&apos; usernames, or join with an invite code.</li>}
          {me.groups.map((g) => (
            <li key={g.id}>
              <Link href={`/g/${g.id}`} className="flex items-center gap-3.5 px-5 py-3 active:bg-white/5">
                <ChatMark g={g} size={48} />
                <div className="min-w-0 flex-1 py-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[17px] font-semibold">{chatName(g)}</span>
                    {g.last && <span className="ml-auto shrink-0 text-xs text-mute">{ago(g.last.created_at, me.clock.now)}</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[15px] text-mute">
                    <span className="truncate"><LastLine g={g} /></span>
                    {g.unread > 0 && <span className={`ml-auto flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular ${g.muted ? "bg-white/15 text-white/70" : "bg-brand text-black"}`} aria-label={`${g.unread} unread`}>{g.unread > 99 ? "99+" : g.unread}</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      {/* Laptop: overview */}
      {/* Laptop: the chats ARE the home screen (they sit in the sidebar), so this just opens the latest one. */}
      <main className="hidden min-h-full items-center justify-center lg:flex">
        {!me.groups.length ? (
          <div className="text-center">
            <p className="text-mute">No chats yet.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="ghost" className="flex items-center gap-2 text-sm" onClick={actions.join}><Users size={15} /> Join with a code</Button>
              <Button className="flex items-center gap-2 text-sm" onClick={actions.create} disabled={!identity}><Plus size={15} /> New chat</Button>
            </div>
            {!identity && <div className="mt-6"><UnlockPrompt /></div>}
          </div>
        ) : (
          <p className="text-sm text-mute">Opening your latest chat…</p>
        )}
      </main>
      {actions.sheets}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="text-xs text-mute">{label}</div>
      <div className="mt-1.5 text-xl font-semibold tracking-tight tabular">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-mute">{sub}</div>}
    </div>
  );
}

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function callVerb(t: Call) {
  const stock = t.kind === "stock";
  if (t.action === "sell") return t.side === "yes" ? "sold long" : "covered short";
  return t.side === "yes" ? (stock ? "bought" : "went long") : stock ? "shorted" : "went short";
}

/** One live situation: the odds front and centre, with one-tap Long and Short. */
function SituationCard({ s, now }: { s: Situation; now: string }) {
  const stock = s.kind === "stock";
  const big = stock ? fmt(s.price * 100, 1) : pct(s.price);
  const move = Math.round(s.change * 100);
  return (
    <div className="flex h-full flex-col rounded-2xl border border-line bg-panel p-4 transition hover:border-white/15">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-mute">
        <span>{label(s.category)}</span>
        <span className="h-0.5 w-0.5 rounded-full bg-mute" />
        <span className="normal-case tracking-normal">{timeLeft(s.resolves_at, now)}</span>
        <span className="ml-auto truncate normal-case tracking-normal">{s.group}</span>
      </div>
      <Link href={`/m/${s.id}`} className="mt-2 line-clamp-2 min-h-[2.75rem] font-medium leading-snug hover:underline hover:decoration-white/30 hover:underline-offset-4">{s.title}</Link>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-3xl font-semibold tracking-tight tabular">{big}</div>
          <div className="text-xs text-mute">{stock ? "share price" : "chance of yes"}</div>
        </div>
        <div className="text-right text-xs text-mute tabular">
          {move !== 0 && <div className={move > 0 ? "text-up" : "text-down"}>{move > 0 ? "+" : "−"}{Math.abs(move)} today</div>}
          <div>{fmt(s.volume, 0)} traded · @{s.creator}</div>
        </div>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-down/30"><div className="h-full rounded-full bg-up" style={{ width: `${s.price * 100}%` }} /></div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href={`/m/${s.id}?side=yes`} className="rounded-xl bg-up/10 py-2 text-center text-sm font-semibold text-up transition hover:bg-up/20">Long</Link>
        <Link href={`/m/${s.id}?side=no`} className="rounded-xl bg-down/10 py-2 text-center text-sm font-semibold text-down transition hover:bg-down/20">Short</Link>
      </div>
    </div>
  );
}
