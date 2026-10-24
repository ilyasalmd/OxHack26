"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { addMember, groupKey, shareKeyWithNewcomers } from "@/components/groupkeys";
import { UnlockPrompt } from "@/components/unlock";
import { TimeMachine } from "@/components/timemachine";
import { Avatar, Badge, Button, Change, Input, LiveNumber, Sheet, TopBar, pct, timeLeft } from "@/components/ui";
import { GroupMark } from "@/components/shell";
import { Chart, Check, Flag, Hourglass, Key, Lock, Plus, Send, Settings, Sparkle, Timer, TrendUp } from "@/components/icons";
import { ReportSheet } from "@/components/report";
import { NewSituation } from "@/components/new-situation";
import { Board, Insights } from "@/components/group-stats";
import { decryptMessage, encryptMessage, forgetIdentities } from "@/lib/e2ee";
import { moodScores } from "@/lib/mood";
import { selectSnippets, type Snippet } from "@/lib/chat-context";
import { SETTLE_WINDOW_HOURS } from "@/lib/safety";

export type Member = { id: number; username: string; display_name: string; color: string; public_key: string; balance: number; has_key: boolean; subject_policy: "anyone" | "nobody" };
export type MarketLite = {
  id: number;
  title: string;
  kind: "bet" | "stock";
  category: string;
  subject_id: number | null;
  creator_id: number;
  status: string;
  outcome: boolean | null;
  proposed_outcome: boolean | null;
  proposed_by: number | null;
  proposed_at: string | null;
  void_reason: string | null;
  closed: boolean;
  price: number;
  open_prob: number;
  resolves_at: string;
  volume: number;
};
type Msg = { id: number; user_id: number | null; kind: string; ciphertext: string | null; iv: string | null; body: string | null; market_id: number | null; created_at: string; text?: string | null };
type Feed = {
  group: { id: number; name: string; emoji: string; invite_code: string; ai_context: string; ai_reads_chat: boolean };
  members: Member[];
  /** People who wrote in the chat and have since left: name and colour only. */
  former: { id: number; username: string; display_name: string; color: string }[];
  myKey: { wrapped_key: string; wrapper_public_key: string } | null;
  messages: Msg[];
  markets: MarketLite[];
  now: string;
};

const PANELS = ["Markets", "Board", "Insights"] as const;
type Panel = (typeof PANELS)[number];

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const { me, loading, identity, refresh, setIdentity } = useSession();
  const router = useRouter();
  // Phone shows one view at a time; a laptop shows the chat with the panel beside it.
  const [view, setView] = useState<"Chat" | Panel>("Chat");
  const [panel, setPanel] = useState<Panel>("Markets");
  const [feed, setFeed] = useState<Omit<Feed, "messages"> | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reporting, setReporting] = useState<Msg | null>(null);
  const [err, setErr] = useState("");
  const [keyFailed, setKeyFailed] = useState(false);
  const lastId = useRef(0);
  const polling = useRef(false);
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = messages;
  const keyRef = useRef<{ key: CryptoKey; raw: Uint8Array } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !me) router.replace(`/?next=/g/${id}`);
  }, [loading, me, router, id]);

  const decryptAll = useCallback(async (msgs: Msg[]) => {
    const k = keyRef.current;
    return Promise.all(msgs.map(async (m) => (m.kind === "chat" && k && m.ciphertext && m.iv ? { ...m, text: await decryptMessage(k.key, m.iv, m.ciphertext) } : m)));
  }, []);

  const poll = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const f = await api<Feed>(`/api/groups/${id}?after=${lastId.current}`);
      const { messages: fresh, ...rest } = f;
      setFeed(rest);
      if (identity && !keyRef.current && f.myKey) {
        // A key that won't unwrap (e.g. this browser holds keys from before a re-seed) must not
        // stop the market cards and system messages from showing.
        keyRef.current = await groupKey(id, identity, f.myKey).catch(() => null);
        if (!keyRef.current) {
          // This browser's saved identity is out of date (the account was re-created). Drop it so
          // the usual "unlock with your password" prompt appears instead of a dead end.
          setKeyFailed(true);
          await forgetIdentities();
          setIdentity(null);
          return;
        }
        setKeyFailed(false);
        // Now that we can read, decrypt anything that arrived before the key did.
        const fixed = new Map((await decryptAll(msgsRef.current)).map((m) => [m.id, m]));
        setMessages((cur) => cur.map((m) => (m.text == null && fixed.get(m.id)?.text != null ? fixed.get(m.id)! : m)));
      }
      if (keyRef.current && identity && f.members.some((m) => !m.has_key)) {
        shareKeyWithNewcomers(id, identity, keyRef.current.raw, f.members).catch(() => {});
      }
      if (fresh.length) {
        lastId.current = fresh[fresh.length - 1].id;
        const dec = await decryptAll(fresh);
        setMessages((old) => [...old, ...dec.filter((m) => !old.some((o) => o.id === m.id))]);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      polling.current = false;
    }
  }, [id, identity, decryptAll, setIdentity]);

  useEffect(() => {
    if (!me) return;
    poll();
    const t = setInterval(poll, 1500);
    return () => clearInterval(t);
  }, [me, poll]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, view]);

  const members = useMemo(
    () =>
      new Map<number, Member>([
        ...(feed?.former ?? []).map((f) => [f.id, { ...f, public_key: "", balance: 0, has_key: false, subject_policy: "anyone" as const }] as const),
        ...(feed?.members ?? []).map((m) => [m.id, m] as const),
      ]),
    [feed]
  );
  const markets = useMemo(() => new Map(feed?.markets.map((m) => [m.id, m]) ?? []), [feed]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !keyRef.current) return;
    setDraft("");
    const payload = await encryptMessage(keyRef.current.key, text);
    await api(`/api/groups/${id}/messages`, { body: payload });
    poll();
  }

  /** Confirm or dispute a proposed result straight from the chat card. */
  async function review(marketId: number, what: "confirm" | "dispute") {
    await api(`/api/markets/${marketId}/${what}`, { method: "POST", body: {} });
    await poll();
  }

  /** Mood per member, computed here from decrypted chat. Only the numbers can be shared. */
  const moods = useCallback(
    () => moodScores(messages.filter((m) => m.kind === "chat" && m.text).slice(-200).map((m) => ({ text: m.text!, authorId: m.user_id })), feed?.members ?? []),
    [messages, feed]
  );

  /** Relevant, redacted snippets for one situation, picked on this device. Empty unless the group opted in. */
  const chatSnippets = useCallback(
    (subjectId: number | null, title: string): Snippet[] =>
      feed?.group.ai_reads_chat
        ? selectSnippets({
            messages: messages.filter((m) => m.kind === "chat" && m.text).map((m) => ({ text: m.text!, authorId: m.user_id, at: m.created_at })),
            members: feed.members,
            subjectId,
            title,
            now: feed.now,
          })
        : [],
    [messages, feed]
  );
  const stockSnippets = useCallback(() => {
    if (!feed?.group.ai_reads_chat) return null;
    const out: Record<string, Snippet[]> = {};
    for (const m of feed.markets.filter((x) => x.kind === "stock" && x.status === "open")) {
      const s = chatSnippets(m.subject_id, m.title).slice(-8);
      if (s.length) out[m.id] = s;
    }
    return out;
  }, [feed, chatSnippets]);

  if (!me || !feed) return <main className="p-10 text-center text-mute">{err || "Loading…"}</main>;
  const c = me.config.currency;
  const live = feed.markets.filter((m) => m.status === "open").length;
  const shown: Panel = view === "Chat" ? panel : view;
  const pick = (t: "Chat" | Panel) => {
    setView(t);
    if (t !== "Chat") setPanel(t);
  };

  const header = (
    <TopBar
      back="/chats"
      title={
        <button onClick={() => setSettingsOpen(true)} className="flex items-center gap-3 text-left">
          <GroupMark name={feed.group.name} size={34} />
          <span className="min-w-0">
            <div className="truncate leading-tight">{feed.group.name}</div>
            <div className="flex items-center gap-1.5 text-xs font-normal text-mute">
              <span>{feed.members.length} members · {live} live</span>
              <span className="flex items-center gap-1"><Lock size={11} /> Encrypted</span>
              {feed.group.ai_reads_chat && <span className="flex items-center gap-1"><Sparkle size={11} /> AI reads relevant chat</span>}
            </div>
          </span>
        </button>
      }
      right={
        <>
          <Link href="/portfolio" className="rounded-lg bg-white/5 px-2.5 py-1 text-sm tabular lg:hidden">
            {me.user.balance.toFixed(0)} {c.ticker}
          </Link>
          <button onClick={() => setSettingsOpen(true)} className="hidden rounded-md p-2 text-mute hover:bg-white/5 hover:text-white lg:block" title="Chat settings">
            <Settings size={17} />
          </button>
        </>
      }
    />
  );

  return (
    <main className="flex h-dvh flex-col lg:h-full">
      <div className="lg:hidden">
        {header}
        <nav className="flex border-b border-line">
          {(["Chat", ...PANELS] as const).map((t) => (
            <button key={t} onClick={() => pick(t)} className={`flex-1 py-2.5 text-sm font-medium ${view === t ? "border-b-2 border-white text-white" : "text-mute"}`}>
              {t}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex min-h-0 flex-1">
        <section className={`${view === "Chat" ? "flex" : "hidden"} min-w-0 flex-1 flex-col lg:flex`}>
          <div className="hidden lg:block">{header}</div>
          {!identity && <UnlockPrompt />}
          {!identity && keyFailed && (
            <p className="mx-3 mt-3 flex items-center gap-2 text-sm text-mute"><Key size={15} /> Your account was reset since this device last unlocked it. Enter your password once to read the chat.</p>
          )}
          {identity && !feed.myKey && (
            <p className="m-3 flex items-center gap-2 rounded-xl border border-line bg-panel p-3 text-sm text-mute"><Key size={15} /> Waiting for a friend&apos;s app to share the chat key with you. Markets work in the meantime.</p>
          )}
          <div className="chat-wall thin-scroll flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-3 py-3 lg:px-6 lg:py-5">
              {runs(messages).map((r, i, all) => {
                const first = Array.isArray(r) ? r[0] : r;
                const before = all[i - 1];
                const prev = before && (Array.isArray(before) ? before[before.length - 1] : before);
                const nextItem = all[i + 1];
                const next = nextItem && (Array.isArray(nextItem) ? nextItem[0] : nextItem);
                const day = dayLabel(first.created_at, feed.now);
                return (
                  <div key={first.id}>
                    {(!prev || dayLabel(prev.created_at, feed.now) !== day) && (
                      <div className="sticky top-2 z-10 my-3 flex justify-center">
                        <span className="rounded-full border border-line bg-ink/90 px-3 py-1 text-[11px] font-medium text-mute backdrop-blur">{day}</span>
                      </div>
                    )}
                    {Array.isArray(r) ? (
                      <TradeRun trades={r} members={members} />
                    ) : (
                      <MessageRow m={r} prev={prev} next={next} meId={me.user.id} members={members} markets={markets} now={feed.now} ticker={c.ticker} onReport={setReporting} onReview={review} />
                    )}
                  </div>
                );
              })}
              <div ref={bottom} />
            </div>
          </div>
          <form onSubmit={send} className="border-t border-line bg-ink px-3 py-2.5 lg:px-6 lg:py-3">
            <div className="mx-auto flex max-w-3xl items-center gap-2">
              <button type="button" onClick={() => setNewOpen(true)} className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-semibold text-black hover:brightness-105" title="New situation">
                <Plus size={17} /> <span className="hidden lg:inline">Situation</span>
              </button>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={keyRef.current ? "Message" : "Unlock to chat"}
                disabled={!keyRef.current}
                className="h-10 flex-1 rounded-full border border-line bg-panel px-4 outline-none transition placeholder:text-mute focus:border-white/25"
              />
              <button className={`flex h-10 w-10 items-center justify-center rounded-full transition ${draft.trim() ? "scale-100 bg-[#2b6cff] text-white" : "scale-90 bg-white/10 text-mute"}`} disabled={!draft.trim()} aria-label="Send">
                <Send size={17} />
              </button>
            </div>
          </form>
        </section>

        <aside className={`${view === "Chat" ? "hidden" : "flex"} min-h-0 w-full flex-col lg:flex lg:w-[400px] lg:border-l lg:border-line lg:bg-panel/50 xl:w-[440px]`}>
          <nav className="hidden h-[57px] shrink-0 items-center gap-1 border-b border-line px-3 lg:flex">
            {PANELS.map((t) => (
              <button key={t} onClick={() => setPanel(t)} className={`rounded-lg px-3 py-1.5 text-sm ${panel === t ? "bg-white/[.08] text-white" : "text-mute hover:text-white"}`}>
                {t}
              </button>
            ))}
          </nav>
          <div className="thin-scroll flex-1 overflow-y-auto">
            {shown === "Markets" && <MarketList markets={feed.markets} members={members} now={feed.now} />}
            {shown === "Board" && <Board groupId={id} ticker={c.ticker} meId={me.user.id} />}
            {shown === "Insights" && <Insights groupId={id} moods={moods} stockSnippets={stockSnippets} aiReadsChat={feed.group.ai_reads_chat} onRepriced={poll} />}
          </div>
          {shown === "Markets" && (
            <div className="border-t border-line p-3">
              <Button className="flex w-full items-center justify-center gap-2" onClick={() => setNewOpen(true)}><Plus size={16} /> New situation</Button>
            </div>
          )}
        </aside>
      </div>
      <div className="lg:hidden"><TimeMachine onJump={poll} /></div>

      <NewSituation
        open={newOpen}
        onClose={() => setNewOpen(false)}
        groupId={id}
        members={feed.members}
        meId={me.user.id}
        now={feed.now}
        aiContext={feed.group.ai_context}
        aiReadsChat={feed.group.ai_reads_chat}
        chatSnippets={chatSnippets}
        moods={moods}
        onCreated={(mid) => {
          setNewOpen(false);
          poll();
          router.push(`/m/${mid}`);
        }}
      />
      <ReportSheet
        open={!!reporting}
        onClose={() => setReporting(null)}
        kind="message"
        url={`/api/groups/${id}/report`}
        messageId={reporting?.id}
        text={reporting?.text}
        onDone={() => reporting && setMessages((old) => old.filter((m) => m.id !== reporting.id))}
      />
      <GroupSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} feed={feed} groupId={id} keyRef={keyRef} identity={identity} onChange={() => { poll(); refresh(); }} />
    </main>
  );
}

/** Consecutive trade notices fold into one line so the chat stays a chat. */
function runs(msgs: Msg[]) {
  const out: (Msg | Msg[])[] = [];
  for (const m of msgs) {
    const last = out[out.length - 1];
    if (m.kind === "trade" && Array.isArray(last)) last.push(m);
    else out.push(m.kind === "trade" ? [m] : m);
  }
  return out.map((r) => (Array.isArray(r) && r.length === 1 ? r[0] : r));
}

function TradeRun({ trades, members }: { trades: Msg[]; members: Map<number, Member> }) {
  const [open, setOpen] = useState(false);
  const names = [...new Set(trades.map((t) => (t.user_id ? members.get(t.user_id)?.display_name : null)).filter(Boolean))];
  if (open)
    return (
      <div className="my-2 space-y-0.5 text-center text-xs text-mute" onClick={() => setOpen(false)}>
        {trades.map((t) => (
          <Link key={t.id} href={`/m/${t.market_id}`} className="block hover:text-white">
            <b className="text-white/80">{t.user_id ? members.get(t.user_id)?.display_name : ""}</b> {t.body}
          </Link>
        ))}
      </div>
    );
  return (
    <button onClick={() => setOpen(true)} className="mx-auto my-2 flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs text-mute hover:text-white">
      <Chart size={12} /> {names.slice(0, 2).join(", ")}{names.length > 2 ? ` +${names.length - 2}` : ""} made {trades.length} trades
    </button>
  );
}

/** Same sender, a few minutes apart: one visual block, like any chat app. */
const sameBlock = (a?: Msg, b?: Msg) => !!a && !!b && a.kind === "chat" && b.kind === "chat" && a.user_id === b.user_id && Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) < 5 * 60e3;
const clock = (t: string) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
function dayLabel(t: string, now: string) {
  const d = new Date(t);
  const n = new Date(now);
  const days = Math.round((new Date(n.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "long" });
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function MessageRow({ m, prev, next, meId, members, markets, now, ticker, onReport, onReview }: { m: Msg; prev?: Msg; next?: Msg; meId: number; members: Map<number, Member>; markets: Map<number, MarketLite>; now: string; ticker: string; onReport: (m: Msg) => void; onReview: (marketId: number, what: "confirm" | "dispute") => Promise<void> }) {
  // An author who is no longer a member is a deleted account; their messages stay, unnamed.
  const who = m.user_id ? (members.get(m.user_id) ?? ({ id: m.user_id, username: "", display_name: "Deleted user", color: "#52525b" } as Member)) : null;
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };
  if (m.kind === "chat") {
    const mine = m.user_id === meId;
    const first = !sameBlock(prev, m);
    const last = !sameBlock(m, next);
    const corner = mine ? (last ? "rounded-br-md" : "rounded-r-md") : last ? "rounded-bl-md" : "rounded-l-md";
    return (
      <div className={`msg-in group flex items-end ${mine ? "justify-end" : "justify-start"} gap-2 ${first ? "mt-2.5" : "mt-0.5"}`}>
        {!mine && <div className="w-7 shrink-0">{last && who && <Avatar name={who.display_name} color={who.color} size={28} />}</div>}
        <div
          onTouchStart={mine ? undefined : () => { stopPress(); press.current = setTimeout(() => onReport(m), 550); }}
          onTouchEnd={stopPress}
          onTouchMove={stopPress}
          onTouchCancel={stopPress}
          className={`max-w-[78%] rounded-2xl px-3.5 py-1.5 [-webkit-touch-callout:none] lg:max-w-[540px] ${corner} ${!first ? (mine ? "rounded-tr-md" : "rounded-tl-md") : ""} ${mine ? "bg-[#2b6cff] text-white" : "border border-white/[.06] bg-raised"}`}>
          {first && !mine && who && <div className="text-[13px] font-semibold" style={{ color: who.color }}>{who.display_name}</div>}
          <span className="whitespace-pre-wrap break-words">{m.text ?? <span className="inline-flex items-center gap-1 italic text-mute"><Lock size={12} /> can&apos;t decrypt yet</span>}</span>
          <span className={`float-right ml-3 mt-1.5 text-[10px] tabular ${mine ? "text-white/60" : "text-mute"}`}>{clock(m.created_at)}</span>
        </div>
        {!mine && (
          <button onClick={() => onReport(m)} className="mb-1 hidden shrink-0 rounded-md p-1 text-mute opacity-0 transition hover:bg-white/5 hover:text-white focus:opacity-100 group-hover:opacity-100 lg:block" title="Report message" aria-label="Report message">
            <Flag size={14} />
          </button>
        )}
      </div>
    );
  }
  const mk = m.market_id ? markets.get(m.market_id) : null;
  if ((m.kind === "market" || m.kind === "resolution") && mk) {
    const resolved = mk.status === "resolved";
    const voided = mk.status === "void";
    const pending = mk.status === "open" && mk.proposed_outcome != null;
    const settledNow = m.kind === "resolution";
    const live = !resolved && !voided && !mk.closed;
    return (
      <div className="msg-in my-4 flex justify-center">
        <div className={`w-full max-w-[92%] overflow-hidden rounded-2xl border bg-panel shadow-[0_8px_30px_-12px_rgba(0,0,0,.6)] lg:max-w-md ${settledNow ? (mk.outcome ? "border-up/30" : "border-down/30") : "border-line"}`}>
          <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-mute">
            {who ? <Avatar name={who.display_name} color={who.color} size={18} /> : <Sparkle size={14} />}
            <span><b className="font-medium text-white/85">{who?.display_name ?? "Someone"}</b> {settledNow ? "settled a " : "posted a "}{mk.kind === "stock" ? "stock" : "bet"}</span>
            <span className="ml-auto tabular">{clock(m.created_at)}</span>
          </div>
          <Link href={`/m/${mk.id}`} className="block px-4 pt-3 hover:bg-white/[.02]">
            <div className="flex items-center gap-2 text-[11px] text-mute">
              <Badge tone={mk.kind === "stock" ? "brand" : "mute"}>{mk.kind === "stock" ? "Stock" : "Bet"}</Badge>
              <span className="ml-auto">{voided ? "called off" : resolved ? "settled" : pending ? "result proposed" : timeLeft(mk.resolves_at, now)}</span>
            </div>
            <div className={`mt-1.5 text-[17px] font-semibold leading-snug ${voided ? "text-mute line-through decoration-white/30" : ""}`}>{mk.title}</div>
            <div className="mt-3 flex items-end justify-between">
              <div className="text-3xl font-semibold tracking-tight tabular">
                {voided ? <span className="text-mute">Called off</span> : resolved ? <span className={mk.outcome ? "text-up" : "text-down"}>{mk.outcome ? "Yes" : "No"}</span> : <LiveNumber value={mk.price}>{pct(mk.price)}</LiveNumber>}
              </div>
              <div className="text-right text-xs text-mute">
                {!resolved && !voided && <Change from={mk.open_prob} to={mk.price} />}
                <div className="tabular">{voided ? "everyone refunded" : `${mk.volume.toFixed(0)} ${ticker} traded`}</div>
              </div>
            </div>
            {!resolved && !voided && <div className="mt-3 h-1 overflow-hidden rounded-full bg-down/30"><div className="h-full rounded-full bg-up transition-[width] duration-700" style={{ width: `${mk.price * 100}%` }} /></div>}
          </Link>
          {pending && <ProposalActions mk={mk} meId={meId} members={members} now={now} onReview={onReview} />}
          {live ? (
            <div className="grid grid-cols-2 gap-2 p-3">
              <Link href={`/m/${mk.id}?side=yes`} className="rounded-xl bg-up/10 py-2 text-center text-sm font-semibold text-up transition hover:bg-up/20">Long</Link>
              <Link href={`/m/${mk.id}?side=no`} className="rounded-xl bg-down/10 py-2 text-center text-sm font-semibold text-down transition hover:bg-down/20">Short</Link>
            </div>
          ) : (
            <div className="h-3" />
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="my-2 text-center text-xs text-mute">
      {m.market_id ? (
        <Link href={`/m/${m.market_id}`} className="hover:text-white">
          {who && <b className="text-white/80">{who.display_name} </b>}
          {m.body}
        </Link>
      ) : (
        <>
          {who && <b className="text-white/80">{who.display_name} </b>}
          {m.body}
        </>
      )}
    </div>
  );
}

/** The pending-result strip on a chat card: confirm it, or (after a second tap) void it and refund everyone. */
function ProposalActions({ mk, meId, members, now, onReview }: { mk: MarketLite; meId: number; members: Map<number, Member>; now: string; onReview: (marketId: number, what: "confirm" | "dispute") => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const by = mk.proposed_by ? members.get(mk.proposed_by) : null;
  const canReview = meId !== mk.subject_id && meId !== mk.proposed_by;
  const settlesAt = mk.proposed_at ? new Date(mk.proposed_at).getTime() + SETTLE_WINDOW_HOURS * 3600e3 : 0;
  async function go(what: "confirm" | "dispute") {
    setBusy(true);
    setErr("");
    try {
      await onReview(mk.id, what);
    } catch (e) {
      setErr((e as Error).message);
      setAsking(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 border-t border-line px-4 py-3 text-sm">
      <div>
        <span className="text-mute">{by?.display_name ?? "Someone"} proposed </span>
        <b className={mk.proposed_outcome ? "text-up" : "text-down"}>{mk.proposed_outcome ? "YES" : "NO"}</b>
        <span className="text-mute">. {canReview ? "Is that right?" : mk.proposed_by === meId ? "Waiting for another member." : "It's about you, so you can only call it off."}</span>
      </div>
      <div className="mt-0.5 text-xs text-mute">{settlesAt > new Date(now).getTime() ? `Settles on its own in ${timeLeft(new Date(settlesAt), now).replace(" left", "")} if nobody replies.` : "Settling any moment now."}</div>
      {canReview &&
        (asking ? (
          <div className="mt-2.5 space-y-2">
            <p className="text-xs text-mute">Disputing voids the situation for everyone and refunds every trade.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" className="!py-2 text-sm" disabled={busy} onClick={() => setAsking(false)}>Cancel</Button>
              <Button variant="down" className="!py-2 text-sm" disabled={busy} onClick={() => go("dispute")}>Void and refund</Button>
            </div>
          </div>
        ) : (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <Button variant="up" className="!py-2 text-sm" disabled={busy} onClick={() => go("confirm")}>Confirm</Button>
            <Button variant="ghost" className="!py-2 text-sm" disabled={busy} onClick={() => setAsking(true)}>Dispute</Button>
          </div>
        ))}
      {err && <p className="mt-2 text-xs text-down">{err}</p>}
    </div>
  );
}

function MarketList({ markets, members, now }: { markets: MarketLite[]; members: Map<number, Member>; now: string }) {
  const groups = [
    { label: "Live bets", items: markets.filter((m) => m.status === "open" && !m.closed && m.kind === "bet") },
    { label: "Stocks (long-term)", items: markets.filter((m) => m.status === "open" && !m.closed && m.kind === "stock") },
    { label: "Result proposed", items: markets.filter((m) => m.status === "open" && m.proposed_outcome != null) },
    { label: "Awaiting result", items: markets.filter((m) => m.status === "open" && m.closed && m.proposed_outcome == null) },
    { label: "Settled", items: markets.filter((m) => m.status === "resolved").slice(0, 30) },
    { label: "Called off", items: markets.filter((m) => m.status === "void").slice(0, 20) },
  ];
  return (
    <div className="pb-4">
      {groups.map((g) =>
        g.items.length ? (
          <section key={g.label}>
            <h3 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-mute">{g.label}</h3>
            {g.items.map((m) => {
              const s = m.subject_id ? members.get(m.subject_id) : null;
              return (
                <Link key={m.id} href={`/m/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/5">
                  {s ? <Avatar name={s.display_name} color={s.color} size={38} /> : <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white/5 text-mute">{m.kind === "stock" ? <TrendUp size={16} /> : <Timer size={16} />}</div>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{m.title}</div>
                    <div className="text-xs text-mute">
                      {m.category} · {m.status === "void" ? "called off" : m.status === "resolved" ? "settled" : m.proposed_outcome != null ? `proposed ${m.proposed_outcome ? "YES" : "NO"}` : timeLeft(m.resolves_at, now)} · {m.volume.toFixed(0)} vol
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular">{m.status === "void" ? <span className="text-mute">VOID</span> : m.status === "resolved" ? (m.outcome ? "YES" : "NO") : <LiveNumber value={m.price}>{pct(m.price)}</LiveNumber>}</div>
                    {m.status === "open" && <Change from={m.open_prob} to={m.price} />}
                  </div>
                </Link>
              );
            })}
          </section>
        ) : null
      )}
      {!markets.length && <p className="p-10 text-center text-mute">No situations yet. Create the first one.</p>}
    </div>
  );
}

function GroupSettings({ open, onClose, feed, groupId, keyRef, identity, onChange }: { open: boolean; onClose: () => void; feed: Omit<Feed, "messages">; groupId: number; keyRef: React.RefObject<{ key: CryptoKey; raw: Uint8Array } | null>; identity: CryptoKey | null; onChange: () => void }) {
  const [ctx, setCtx] = useState(feed.group.ai_context);
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState("");
  const [askLeave, setAskLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const router = useRouter();
  const { refresh } = useSession();
  useEffect(() => setCtx(feed.group.ai_context), [feed.group.ai_context]);
  useEffect(() => {
    if (!open) setAskLeave(false);
  }, [open]);
  async function leave() {
    setLeaving(true);
    try {
      await api(`/api/groups/${groupId}/leave`, { method: "POST", body: {} });
      await refresh();
      router.replace("/chats");
    } catch (e) {
      setMsg((e as Error).message);
      setLeaving(false);
    }
  }
  const link = typeof location !== "undefined" ? `${location.origin}/join/${feed.group.invite_code}` : "";
  async function saveCtx() {
    await api(`/api/groups/${groupId}`, { method: "PATCH", body: { aiContext: ctx } });
    setMsg("Saved");
    onChange();
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!identity || !keyRef.current) return setMsg("Unlock the chat first");
    try {
      await addMember(groupId, identity, keyRef.current.raw, username.trim());
      setUsername("");
      setMsg("Added");
      onChange();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={feed.group.name}>
      <div className="space-y-5">
        <div>
          <div className="mb-1 text-sm font-semibold">Invite link</div>
          <button onClick={() => navigator.clipboard?.writeText(link).then(() => setMsg("Link copied"))} className="w-full truncate rounded-xl border border-line bg-ink px-3.5 py-2.5 text-left text-sm text-mute hover:text-white">
            {link}
          </button>
        </div>
        <form onSubmit={add} className="flex gap-2">
          <Input placeholder="Add by @username" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" />
          <Button>Add</Button>
        </form>
        <div>
          <div className="mb-1 text-sm font-semibold">AI context</div>
          <p className="mb-2 text-xs text-mute">Shared with the AI to price situations: term dates, exam weeks, fixtures, deadlines. Chat messages are only shared if “AI reads relevant chat” below is on.</p>
          <textarea value={ctx} onChange={(e) => setCtx(e.target.value)} rows={4} placeholder="e.g. Autumn term ends 12 Dec. Exams 5–16 Jan. Results out 1 Jul." className="w-full rounded-xl border border-line bg-ink p-3 outline-none" />
          <Button variant="ghost" className="mt-2 w-full" onClick={saveCtx}>Save context</Button>
        </div>
        <div className="rounded-xl border border-line p-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={feed.group.ai_reads_chat}
              onChange={async (e) => {
                await api(`/api/groups/${groupId}`, { method: "PATCH", body: { aiReadsChat: e.target.checked } });
                onChange();
              }}
            />
            <span>
              <span className="text-sm font-semibold">AI reads relevant chat</span>
              <span className="mt-1 block text-xs text-mute">
                Off by default. When on, each phone picks up to 20 messages that match a situation, swaps names for roles (subject, Friend A…), strips emails,
                numbers and links, and sends only those to the AI. You see exactly what was sent before listing. Everything else stays end-to-end encrypted.
                Everyone in the chat is told when this changes.
              </span>
            </span>
          </label>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold">Members</div>
          {feed.members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-1.5">
              <Avatar name={m.display_name} color={m.color} size={30} />
              <div className="flex-1">
                {m.display_name} <span className="text-sm text-mute">@{m.username}</span>
              </div>
              <span className="flex items-center gap-1 text-xs text-mute">{m.has_key ? <><Check size={12} /> has key</> : <><Hourglass size={12} /> no key yet</>}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-line pt-4">
          {askLeave ? (
            <div className="space-y-3">
              <p className="text-sm text-mute">
                Leave {feed.group.name}? You&apos;ll lose access to the chat and its key. Your positions stay and still settle. Open situations about you are called off and refunded.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setAskLeave(false)}>Stay</Button>
                <Button variant="down" className="flex-1" disabled={leaving} onClick={leave}>{leaving ? "Leaving…" : "Leave group"}</Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAskLeave(true)} className="text-sm text-down hover:underline">Leave group</button>
          )}
        </div>
        {msg && <p className="text-sm text-mute">{msg}</p>}
      </div>
    </Sheet>
  );
}
