"use client";
import { useState } from "react";
import { api } from "./api";
import { useSession } from "./session";
import { Avatar, Button, Input, Sheet, fmt, timeLeft } from "./ui";
import { Chart, Users } from "./icons";

// Bet a friend: one-on-one bets in a chat, kept apart from the stake market. Three pieces:
// the "+ Stake" chooser, the form to post a bet, and the bet's card in the chat.

type Person = { id: number; display_name: string; color: string };
export type FriendBetLite = {
  id: number;
  title: string;
  resolves_at: string;
  side: "yes" | "no";
  creator_id: number;
  taker_id: number | null;
  /** Aimed at one friend: only they can take it. Null means anyone in the chat. */
  target_id?: number | null;
  stake: number;
  taker_stake: number;
  pot: number;
  status: "open" | "live" | "claimed" | "settled" | "cancelled" | "refunded";
  claim_by: number | null;
  claimed_at: string | null;
  winner_id: number | null;
  created_at?: string;
  settled_at?: string | null;
  counters: { id: number; user_id: number; taker_stake: number }[];
};

/** "+ Stake" first asks which kind: the market (as before) or a one-on-one bet. */
export function StakeChooser({ open, onClose, onInvest, onBet }: { open: boolean; onClose: () => void; onInvest: () => void; onBet: () => void }) {
  const Option = ({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) => (
    <button type="button" onClick={onClick} className="flex w-full items-start gap-3 rounded-2xl border border-line bg-ink p-4 text-left transition hover:border-white/25">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[.06]">{icon}</span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-mute">{text}</span>
      </span>
    </button>
  );
  return (
    <Sheet open={open} onClose={onClose} title="New stake">
      <div className="space-y-2.5">
        <Option icon={<Chart size={17} />} title="Invest" text="Open it to the whole chat. The AI sets the odds and everyone can trade." onClick={onInvest} />
        <Option icon={<Users size={17} />} title="Bet a friend" text="One-on-one. You set what each of you puts in; a friend takes the other side and the winner gets both." onClick={onBet} />
      </div>
    </Sheet>
  );
}

function localInput(d: Date) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
}

/** Post a bet: what it is, when it ends, your side, and what each of you puts in. */
export function NewFriendBet({ open, onClose, groupId, now, ticker, members, onCreated }: { open: boolean; onClose: () => void; groupId: number; now: string; ticker: string; members: Person[]; onCreated: () => void }) {
  const { me } = useSession();
  const base = new Date(now);
  const presets: [string, Date][] = [
    ["Tonight", new Date(new Date(base).setHours(23, 0, 0, 0) <= base.getTime() ? base.getTime() + 3 * 3600e3 : new Date(base).setHours(23, 0, 0, 0))],
    ["Tomorrow", new Date(base.getTime() + 864e5)],
    ["This week", new Date(base.getTime() + 7 * 864e5)],
  ];
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(localInput(presets[1][1]));
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [mine, setMine] = useState("20");
  const [theirs, setTheirs] = useState("20");
  // Who can take it: anyone in the chat (null) or one friend.
  const [target, setTarget] = useState<number | null>(null);
  const friends = members.filter((m) => m.id !== me?.user.id);
  const targetName = friends.find((f) => f.id === target)?.display_name;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const balance = me?.user.balance ?? 0;
  const cap = Math.max(0, Math.floor(Math.min(balance * (me?.config.economy.maxStakeFraction ?? 0.25), balance - (me?.config.economy.balanceFloor ?? 50))));
  const a = Number(mine) || 0;
  const b = Number(theirs) || 0;
  const ok = title.trim().length >= 4 && a >= 1 && a <= cap && b >= 1;

  async function post() {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/groups/${groupId}/friend-bets`, { body: { title: title.trim(), resolvesAt: new Date(when).toISOString(), side, stake: a, theirStake: b, targetId: target } });
      setTitle("");
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Bet a friend">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">What&apos;s the bet?</span>
          <Input placeholder="e.g. Sam is late on Friday" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} autoFocus />
        </label>

        {friends.length > 1 && (
          <div>
            <span className="mb-1.5 block text-sm font-medium">Who can take it?</span>
            <div className="thin-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              <button type="button" onClick={() => setTarget(null)} className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium ${target === null ? "bg-white text-black" : "bg-white/[.06] hover:bg-white/10"}`}>Anyone</button>
              {friends.map((f) => (
                <button type="button" key={f.id} onClick={() => setTarget(f.id)} className={`flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-medium ${target === f.id ? "bg-white text-black" : "bg-white/[.06] hover:bg-white/10"}`}>
                  <Avatar id={f.id} name={f.display_name} color={f.color} size={22} />
                  {f.display_name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <span className="mb-1.5 block text-sm font-medium">You say it…</span>
          <div className="grid grid-cols-2 gap-2">
            {(["yes", "no"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSide(s)} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${side === s ? (s === "yes" ? "border-up bg-up/15 text-up" : "border-down bg-down/15 text-down") : "border-line hover:border-white/20"}`}>
                {s === "yes" ? "Happens" : "Doesn't happen"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="rounded-xl bg-ink px-3 py-2.5">
            <span className="block text-[11px] text-mute">You put in</span>
            <span className="flex items-baseline gap-1">
              <input inputMode="numeric" value={mine} onChange={(e) => setMine(e.target.value.replace(/[^0-9]/g, ""))} aria-label="You put in" className="w-full min-w-0 bg-transparent text-2xl font-semibold tabular outline-none" />
              <span className="text-sm text-mute">{ticker}</span>
            </span>
          </label>
          <label className="rounded-xl bg-ink px-3 py-2.5">
            <span className="block text-[11px] text-mute">{targetName ? `${targetName} puts in` : "Your friend puts in"}</span>
            <span className="flex items-baseline gap-1">
              <input inputMode="numeric" value={theirs} onChange={(e) => setTheirs(e.target.value.replace(/[^0-9]/g, ""))} aria-label="Your friend puts in" className="w-full min-w-0 bg-transparent text-2xl font-semibold tabular outline-none" />
              <span className="text-sm text-mute">{ticker}</span>
            </span>
          </label>
        </div>
        <p className="text-sm text-mute">
          {a >= 1 && b >= 1 ? (
            <>Whoever&apos;s right takes <b className="text-white">{fmt(a + b, 0)} {ticker}</b>.{a !== b && ` Putting in more than your friend means you're more sure (${Math.round((a / (a + b)) * 100)}% vs ${Math.round((b / (a + b)) * 100)}%).`}</>
          ) : (
            "Both of you put something in; the winner takes both."
          )}
          {a > cap && <span className="block text-down">You can put in at most {cap} right now.</span>}
        </p>

        <div>
          <span className="mb-1.5 block text-sm font-medium">When do we find out?</span>
          <div className="flex gap-2">
            {presets.map(([l, d]) => (
              <button type="button" key={l} onClick={() => setWhen(localInput(d))} className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium ${when === localInput(d) ? "bg-white text-black" : "bg-white/[.06] hover:bg-white/10"}`}>{l}</button>
            ))}
          </div>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-2" />
        </div>

        {err && <p className="text-sm text-down">{err}</p>}
        <Button className="w-full !py-3" disabled={!ok || busy} onClick={post}>{busy ? "Posting…" : `Post bet · put in ${fmt(a, 0)} ${ticker}`}</Button>
        <p className="text-center text-xs text-mute">
          {targetName
            ? `Only ${targetName} can take it, offer a different amount or turn it down. You get your ${ticker} back if they don't take it.`
            : `Anyone in the chat can take it, or offer a different amount. You get your ${ticker} back if nobody takes it.`}
        </p>
      </div>
    </Sheet>
  );
}

/** The bet in the chat: who's on which side, the pot, and the one or two things you can do next. */
export function FriendBetCard({ bet, members, meId, now, ticker, onChange }: { bet: FriendBetLite; members: Map<number, Person>; meId: number; now: string; ticker: string; onChange: () => unknown }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [countering, setCountering] = useState(false);
  const [counter, setCounter] = useState("");
  const person = (id: number | null) => (id ? (members.get(id) ?? { id, display_name: "Someone", color: "#52525b" }) : null);
  const creator = person(bet.creator_id)!;
  const taker = person(bet.taker_id);
  const me = (id: number | null) => id === meId;
  const nameOf = (p: Person | null) => (p ? (me(p.id) ? "You" : p.display_name) : "Someone");
  const says = (yes: boolean) => (yes ? "it happens" : "it doesn't");
  const creatorYes = bet.side === "yes";
  const inBet = me(bet.creator_id) || me(bet.taker_id);
  const ended = new Date(bet.resolves_at).getTime() <= new Date(now).getTime();
  const done = bet.status === "settled" || bet.status === "cancelled" || bet.status === "refunded";
  const target = person(bet.target_id ?? null);
  // Aimed at one friend: only they get the take / offer / turn down buttons.
  const mayTake = !me(bet.creator_id) && (!bet.target_id || me(bet.target_id));

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/friend-bets/${bet.id}`, { body });
      setCountering(false);
      await onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const Side = ({ p, yes, amount }: { p: Person | null; yes: boolean; amount: number }) => (
    <div className={`rounded-xl px-3 py-2 ${yes ? "bg-up/10" : "bg-down/10"}`}>
      <div className={`text-[11px] font-semibold ${yes ? "text-up" : "text-down"}`}>Says {says(yes)}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-sm">
        {p ? <Avatar id={p.id} name={p.display_name} color={p.color} size={16} /> : <span className="h-4 w-4 rounded-full border border-dashed border-white/30" />}
        <span className="truncate">{p ? nameOf(p) : target ? nameOf(target) : "Open"}</span>
        <span className="ml-auto shrink-0 tabular text-mute">{fmt(amount, 0)}</span>
      </div>
    </div>
  );

  const status = {
    open: ended ? (target ? `ended, ${nameOf(target)} didn't take it` : "ended, nobody took it") : `${target ? `for ${me(target.id) ? "you" : target.display_name}` : "open"} · ends ${timeLeft(bet.resolves_at, now)}`,
    live: ended ? "ended · waiting for a result" : `on · ends ${timeLeft(bet.resolves_at, now)}`,
    claimed: `${nameOf(person(bet.claim_by))} say${me(bet.claim_by) ? "" : "s"} they won`,
    settled: `${nameOf(person(bet.winner_id))} won ${fmt(bet.pot, 0)} ${ticker}`,
    cancelled: target ? `${nameOf(target)} didn't take it · money back` : "nobody took it · money back",
    refunded: "called off · both got their money back",
  }[bet.status];

  return (
    <div className="msg-in my-4 flex justify-center">
      <div className="w-full max-w-[92%] overflow-hidden rounded-2xl bg-panel lg:max-w-md">
        <div className="px-4 pt-3.5">
          <div className="flex items-center gap-2 text-xs text-mute">
            <Users size={13} />
            <span className="truncate"><b className="font-medium text-white/80">Bet a friend</b> · {status}</span>
          </div>
          <div className={`mt-2 text-[17px] font-semibold leading-snug ${bet.status === "cancelled" || bet.status === "refunded" ? "text-mute line-through decoration-white/30" : ""}`}>{bet.title}</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Side p={creatorYes ? creator : taker} yes amount={creatorYes ? bet.stake : bet.taker_stake} />
            <Side p={creatorYes ? taker : creator} yes={false} amount={creatorYes ? bet.taker_stake : bet.stake} />
          </div>
          <div className="mt-2 text-center text-xs text-mute">Winner takes <b className="text-white/90 tabular">{fmt(bet.pot, 0)} {ticker}</b></div>
        </div>

        <div className="space-y-2 p-3">
          {/* Open: anyone else can take it or offer a different amount; the poster sees offers and can cancel. */}
          {bet.status === "open" && !ended && mayTake && !countering && (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button variant={creatorYes ? "down" : "up"} disabled={busy} onClick={() => act({ action: "take" })}>Take it · put in {fmt(bet.taker_stake, 0)}</Button>
              <Button variant="ghost" disabled={busy} onClick={() => { setCounter(String(Math.round(bet.taker_stake))); setCountering(true); }}>Offer different</Button>
            </div>
          )}
          {bet.status === "open" && !ended && target && me(target.id) && !countering && (
            <button type="button" className="block w-full text-center text-sm text-mute underline underline-offset-2 hover:text-white" disabled={busy} onClick={() => act({ action: "decline" })}>Turn it down</button>
          )}
          {bet.status === "open" && !ended && target && !me(target.id) && !me(bet.creator_id) && (
            <p className="text-center text-sm text-mute">Waiting for {target.display_name} to take it.</p>
          )}
          {countering && (
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-mute">I&apos;d put in</span>
              <Input inputMode="numeric" value={counter} onChange={(e) => setCounter(e.target.value.replace(/[^0-9]/g, ""))} className="!py-2" />
              <Button className="shrink-0 !py-2" disabled={busy || !(Number(counter) >= 1)} onClick={() => act({ action: "counter", theirStake: Number(counter) })}>Send</Button>
              <button type="button" className="shrink-0 text-sm text-mute" onClick={() => setCountering(false)}>Cancel</button>
            </div>
          )}
          {bet.status === "open" && bet.counters.length > 0 && (
            <div className="space-y-1.5">
              {bet.counters.map((c) => {
                const who = person(c.user_id)!;
                return (
                  <div key={c.id} className="flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{nameOf(who)} would put in <b className="tabular">{fmt(c.taker_stake, 0)}</b> <span className="text-mute">(winner takes {fmt(bet.stake + c.taker_stake, 0)})</span></span>
                    {me(bet.creator_id) && <Button className="shrink-0 !px-3 !py-1.5 text-sm" disabled={busy} onClick={() => act({ action: "accept", counterId: c.id })}>Accept</Button>}
                  </div>
                );
              })}
            </div>
          )}
          {bet.status === "open" && me(bet.creator_id) && (
            <div className="flex items-center justify-between gap-2 text-sm text-mute">
              <span>{ended ? (target ? `${target.display_name} didn't take it. Your stake comes back shortly.` : "Nobody took it. Your stake comes back shortly.") : `Waiting for ${target ? target.display_name : "a friend"} to take it.`}</span>
              {!ended && <button type="button" className="shrink-0 underline underline-offset-2 hover:text-white" disabled={busy} onClick={() => act({ action: "cancel" })}>Cancel bet</button>}
            </div>
          )}

          {/* Live: only the two people in it settle it. Saying you lost pays at once. */}
          {bet.status === "live" && inBet && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="up" disabled={busy} onClick={() => act({ action: "won" })}>I won</Button>
              <Button variant="ghost" disabled={busy} onClick={() => act({ action: "lost" })}>I lost</Button>
            </div>
          )}
          {bet.status === "claimed" && inBet && !me(bet.claim_by) && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="up" disabled={busy} onClick={() => act({ action: "confirm" })}>Confirm · pay {nameOf(person(bet.claim_by))}</Button>
              <Button variant="ghost" disabled={busy} onClick={() => act({ action: "dispute" })}>Dispute</Button>
            </div>
          )}
          {bet.status === "claimed" && (me(bet.claim_by) || !inBet) && (
            <p className="text-center text-xs text-mute">Waiting for {nameOf(person(other(bet, bet.claim_by!)))} to confirm. If they don&apos;t answer, it pays a day after the bet ends.</p>
          )}
          {done && bet.status === "settled" && me(bet.winner_id) && <p className="text-center text-sm font-semibold text-up">You won {fmt(bet.pot, 0)} {ticker}</p>}
          {err && <p className="text-sm text-down">{err}</p>}
        </div>
      </div>
    </div>
  );
}

const other = (b: FriendBetLite, id: number) => (id === b.creator_id ? b.taker_id : b.creator_id);
