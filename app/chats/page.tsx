"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { UnlockPrompt } from "@/components/unlock";
import { TimeMachine } from "@/components/timemachine";
import { GroupMark, Logo, lastLine, useChatActions } from "@/components/shell";
import { Avatar, Button, Coins, ago, fmt, pct, timeLeft } from "@/components/ui";
import { ChevronRight, Link2, LogOut, Plus, Users } from "@/components/icons";
import { forgetIdentities } from "@/lib/e2ee";

type Situation = { id: number; title: string; kind: string; category: string; group: string; creator: string; resolves_at: string; volume: number; traders: number; price: number; change: number };
type Call = { id: number; side: string; action: string; coins: number; price_after: number; created_at: string; market_id: number; title: string; kind: string; display_name: string; username: string; color: string };
type Leader = { id: number; display_name: string; username: string; color: string; net_worth: number; me: boolean };
type Feed = { markets: Situation[]; calls: Call[]; leaders: Leader[] };

const CATEGORY: Record<string, string> = { punctuality: "Punctuality", fitness: "Fitness", football: "Sport", sport: "Sport", uni: "Uni", work: "Work", relationships: "Social", social: "Social", other: "Other" };
const label = (c: string) => CATEGORY[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

type Position = { market_id: number; title: string; kind: string; status: string; group: string; yes: number; no: number; spent: number; price: number; value: number };

export default function Chats() {
  const { me, loading, identity } = useSession();
  const router = useRouter();
  const actions = useChatActions();
  const [copied, setCopied] = useState(false);
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [cat, setCat] = useState("All");

  useEffect(() => {
    if (!loading && !me) router.replace("/");
  }, [loading, me, router]);
  const userId = me?.user.id;
  useEffect(() => {
    if (!userId) return;
    const load = () => {
      api<{ positions: Position[] }>("/api/portfolio").then((p) => setPositions(p.positions.filter((x) => x.status === "open"))).catch(() => {});
      api<Feed>("/api/feed").then(setFeed).catch(() => {});
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [userId]);
  if (!me) return null;
  const c = me.config.currency;

  async function share() {
    const url = `${location.origin}/u/${me!.user.username}`;
    try {
      if (navigator.share) await navigator.share({ title: "Add me on Friend Stocks", text: `I'm @${me!.user.username} on Friend Stocks`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {}
  }
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    await forgetIdentities();
    location.href = "/";
  }
  const nextAllowance = new Date(me.nextAllowanceAt).toLocaleDateString("en-GB", { weekday: "long" });
  const live = me.groups.reduce((s, g) => s + g.open_markets, 0);
  const cats = ["All", ...new Set((feed?.markets ?? []).map((m) => label(m.category)))];
  const shown = (feed?.markets ?? []).filter((m) => cat === "All" || label(m.category) === cat);

  return (
    <>
      {/* Phone: account card and chat list */}
      <main className="flex min-h-dvh flex-col lg:hidden">
        <header className="px-5 pb-4 pt-6">
          <div className="flex items-center gap-3">
            <Avatar name={me.user.display_name} color={me.user.color} size={40} />
            <div className="flex-1">
              <div className="font-semibold">{me.user.display_name}</div>
              <button onClick={share} className="text-sm text-mute hover:text-white">
                @{me.user.username} · {copied ? "link copied" : "share"}
              </button>
            </div>
            <button onClick={logout} className="rounded-md p-2 text-mute hover:text-white" aria-label="Log out"><LogOut size={18} /></button>
          </div>
          <Link href="/portfolio" className="mt-5 block rounded-2xl border border-line bg-panel p-5 transition hover:border-white/15">
            <div className="text-sm text-mute">Net worth</div>
            <div className="mt-1 text-4xl font-semibold tracking-tight">
              <Coins value={me.netWorth.total} ticker={c.ticker} />
            </div>
            <div className="mt-2 flex gap-4 text-sm text-mute tabular">
              <span>Cash {me.netWorth.balance.toFixed(0)}</span>
              <span>Invested {me.netWorth.positions.toFixed(0)}</span>
              <span className="ml-auto">+{me.config.economy.weeklyAllowance} {nextAllowance.slice(0, 3)}</span>
            </div>
          </Link>
        </header>

        {!identity && <UnlockPrompt />}

        {!!feed?.markets.length && (
          <section className="pb-5">
            <h2 className="px-5 pb-2 text-xl font-semibold tracking-tight">Live now</h2>
            <div className="flex snap-x scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
              {feed.markets.slice(0, 8).map((s) => (
                <div key={s.id} className="w-[78%] shrink-0 snap-start"><SituationCard s={s} now={me.clock.now} /></div>
              ))}
            </div>
          </section>
        )}

        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-xl font-semibold tracking-tight">Chats</h2>
          <div className="flex gap-2">
            <Button variant="ghost" className="!px-3 !py-1.5 text-sm" onClick={actions.join}>Join</Button>
            <Button className="flex items-center gap-1 !px-3 !py-1.5 text-sm" onClick={actions.create} disabled={!identity}><Plus size={14} /> New</Button>
          </div>
        </div>

        <ul className="flex-1">
          {me.groups.length === 0 && <li className="px-5 py-10 text-center text-mute">No chats yet. Start one with your friends&apos; usernames, or join with an invite code.</li>}
          {me.groups.map((g) => (
            <li key={g.id}>
              <Link href={`/g/${g.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-white/5">
                <GroupMark name={g.name} size={46} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{g.name}</span>
                    {g.open_markets > 0 && <span className="rounded bg-brand/10 px-1.5 text-[11px] font-semibold text-brand">{g.open_markets} live</span>}
                  </div>
                  <div className="truncate text-sm text-mute">{lastLine(g)}</div>
                </div>
                {g.last && <span className="text-xs text-mute">{ago(g.last.created_at, me.clock.now)}</span>}
              </Link>
            </li>
          ))}
        </ul>
        <div className="sticky bottom-0"><TimeMachine /></div>
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
                    <span className="truncate">{lastLine(g)}</span>
                    {g.open_markets > 0 && <span className="ml-2 shrink-0 rounded bg-brand/10 px-1.5 py-0.5 font-semibold text-brand">{g.open_markets} live</span>}
                  </div>
                </Link>
              ))}
              {!me.groups.length && <p className="text-sm text-mute">No chats yet. Start one with your friends&apos; usernames, or join with an invite code.</p>}
            </div>
          </section>

          <section className="mt-10">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Open positions</h2>
            <div className="overflow-hidden rounded-2xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-panel text-left text-xs text-mute">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Situation</th>
                    <th className="px-4 py-2.5 font-medium">Chat</th>
                    <th className="px-4 py-2.5 font-medium">Side</th>
                    <th className="px-4 py-2.5 text-right font-medium">Price</th>
                    <th className="px-4 py-2.5 text-right font-medium">Value</th>
                    <th className="px-4 py-2.5 text-right font-medium">P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions?.map((x) => (
                    <tr key={x.market_id} className="cursor-pointer border-t border-line hover:bg-white/[.03]" onClick={() => router.push(`/m/${x.market_id}`)}>
                      <td className="max-w-[320px] truncate px-4 py-3 font-medium">{x.title}</td>
                      <td className="px-4 py-3 text-mute">{x.group}</td>
                      <td className="px-4 py-3">{x.yes > 0.001 ? <span className="text-up">Long</span> : <span className="text-down">Short</span>}</td>
                      <td className="px-4 py-3 text-right tabular">{pct(x.price)}</td>
                      <td className="px-4 py-3 text-right tabular">{fmt(x.value)}</td>
                      <td className={`px-4 py-3 text-right tabular ${x.value >= x.spent ? "text-up" : "text-down"}`}>{x.value >= x.spent ? "+" : "−"}{fmt(Math.abs(x.value - x.spent))}</td>
                    </tr>
                  ))}
                  {positions && !positions.length && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-mute">No open positions. Open a chat and go long or short on a situation.</td></tr>
                  )}
                  {!positions && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-mute">Loading…</td></tr>
                  )}
                </tbody>
              </table>
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
