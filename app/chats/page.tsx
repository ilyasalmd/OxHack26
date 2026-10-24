"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { UnlockPrompt } from "@/components/unlock";
import { GroupMark, LastLine, Logo, useChatActions } from "@/components/shell";
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
                <GroupMark name={g.name} size={52} />
                <div className="min-w-0 flex-1 border-b border-line pb-3 pt-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[17px] font-semibold">{g.name}</span>
                    {g.last && <span className="ml-auto shrink-0 text-xs text-mute">{ago(g.last.created_at, me.clock.now)}</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[15px] text-mute">
                    <span className="truncate"><LastLine g={g} /></span>
                    {g.open_markets > 0 && <span className="ml-auto shrink-0 rounded-full bg-brand px-1.5 py-px text-[11px] font-bold text-black tabular">{g.open_markets}</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      {/* Laptop: overview */}
      <main className="hidden min-h-full lg:block">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-10 py-10 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-sm text-mute">{greeting(new Date(me.clock.now))}, {me.user.display_name}</div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">Overview</h1>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex items-center gap-2 text-sm" onClick={share}><Link2 size={15} /> {copied ? "Link copied" : "Share profile"}</Button>
              <Button variant="ghost" className="flex items-center gap-2 text-sm" onClick={actions.join}><Users size={15} /> Join</Button>
              <Button className="flex items-center gap-2 text-sm" onClick={actions.create} disabled={!identity}><Plus size={15} /> New chat</Button>
            </div>
          </div>

          {!identity && <div className="mt-6"><UnlockPrompt /></div>}

          <div className="mt-8 grid grid-cols-4 gap-3">
            <Stat label="Net worth" value={<Coins value={me.netWorth.total} ticker={c.ticker} />} />
            <Stat label="Cash" value={fmt(me.netWorth.balance)} />
            <Stat label="Invested" value={fmt(me.netWorth.positions)} />
            <Stat label="Next allowance" value={`+${me.config.economy.weeklyAllowance}`} sub={nextAllowance} />
          </div>

          <section className="mt-10">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold tracking-tight">Live situations</h2>
              <div className="flex gap-1 overflow-x-auto">
                {cats.map((x) => (
                  <button key={x} onClick={() => setCat(x)} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${cat === x ? "bg-white text-black" : "text-mute hover:bg-white/5 hover:text-white"}`}>{x}</button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {shown.map((s) => <SituationCard key={s.id} s={s} now={me.clock.now} />)}
              {feed && !shown.length && <p className="text-sm text-mute">Nothing live right now. Post a situation in one of your chats.</p>}
              {!feed && <p className="text-sm text-mute">Loading…</p>}
            </div>
          </section>

          <section className="mt-10">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Your chats</h2>
              <span className="text-sm text-mute tabular">{live} live situations</span>
            </div>
            <div className="grid grid-cols-2 gap-3 2xl:grid-cols-3">
              {me.groups.map((g) => (
                <Link key={g.id} href={`/g/${g.id}`} className="group rounded-2xl border border-line bg-panel p-4 transition hover:border-white/15">
                  <div className="flex items-center gap-3">
                    <GroupMark name={g.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{g.name}</div>
                      <div className="text-xs text-mute">{g.members} members</div>
                    </div>
                    <ChevronRight size={16} className="text-mute transition group-hover:translate-x-0.5 group-hover:text-white" />
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-mute">
                    <span className="truncate"><LastLine g={g} /></span>
                    {g.open_markets > 0 && <span className="ml-2 shrink-0 rounded bg-brand/10 px-1.5 py-0.5 font-semibold text-brand">{g.open_markets} live</span>}
                  </div>
                </Link>
              ))}
              {!me.groups.length && <p className="text-sm text-mute">No chats yet. Start one with your friends&apos; usernames, or join with an invite code.</p>}
            </div>
          </section>

          <div className="mt-12 flex items-center gap-2 text-xs text-mute"><Logo size={18} /> Play money only. Chats are end-to-end encrypted on your devices.</div>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-10 xl:self-start">
          <section className="rounded-2xl border border-line bg-panel">
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <h2 className="text-sm font-semibold">Latest calls</h2>
              <span className="flex items-center gap-1.5 text-[11px] text-mute"><span className="h-1.5 w-1.5 rounded-full bg-up" /> Live</span>
            </div>
            <ul className="pb-2">
              {feed?.calls.map((t) => (
                <li key={t.id}>
                  <Link href={`/m/${t.market_id}`} className="flex gap-3 px-4 py-2.5 hover:bg-white/[.03]">
                    <Avatar name={t.display_name} color={t.color} size={28} />
                    <div className="min-w-0 flex-1 text-sm leading-snug">
                      <div>
                        <span className="font-medium">{t.display_name}</span>{" "}
                        <span className={t.side === "yes" ? "text-up" : "text-down"}>{callVerb(t)}</span>{" "}
                        <span className="text-mute tabular">{fmt(t.coins, 0)}</span>
                      </div>
                      <div className="truncate text-xs text-mute">{t.title}</div>
                    </div>
                    <span className="text-[11px] text-mute">{ago(t.created_at, me.clock.now)}</span>
                  </Link>
                </li>
              ))}
              {feed && !feed.calls.length && <li className="px-4 py-4 text-sm text-mute">No trades yet.</li>}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-panel">
            <h2 className="px-4 pb-2 pt-4 text-sm font-semibold">Top traders</h2>
            <ol className="pb-2">
              {feed?.leaders.map((l, i) => (
                <li key={l.id}>
                  <Link href={`/u/${l.username}`} className={`flex items-center gap-3 px-4 py-2 hover:bg-white/[.03] ${l.me ? "bg-brand/[.04]" : ""}`}>
                    <span className={`w-4 text-xs tabular ${i === 0 ? "font-semibold text-brand" : "text-mute"}`}>{i + 1}</span>
                    <Avatar name={l.display_name} color={l.color} size={26} />
                    <span className="min-w-0 flex-1 truncate text-sm">{l.display_name}{l.me && <span className="ml-1.5 text-[11px] text-mute">you</span>}</span>
                    <span className="text-sm tabular">{fmt(l.net_worth, 0)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </aside>
        </div>
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
