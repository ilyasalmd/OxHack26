"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { addMember, groupKey, shareKeyWithNewcomers } from "@/components/groupkeys";
import { UnlockPrompt } from "@/components/unlock";
import { TimeMachine } from "@/components/timemachine";
import { Avatar, Badge, Button, Change, Input, LiveNumber, Sheet, TopBar, ago, pct, timeLeft } from "@/components/ui";
import { GroupMark } from "@/components/shell";
import { Chart, Check, Hourglass, Key, Lock, Plus, Send, Settings, Sparkle, Timer, TrendUp } from "@/components/icons";
import { NewSituation } from "@/components/new-situation";
import { Board, Insights } from "@/components/group-stats";
import { decryptMessage, encryptMessage } from "@/lib/e2ee";
import { moodScores } from "@/lib/mood";
import { selectSnippets, type Snippet } from "@/lib/chat-context";

export type Member = { id: number; username: string; display_name: string; color: string; public_key: string; balance: number; has_key: boolean };
export type MarketLite = {
  id: number;
  title: string;
  kind: "bet" | "stock";
  category: string;
  subject_id: number | null;
  creator_id: number;
  status: string;
  outcome: boolean | null;
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
  myKey: { wrapped_key: string; wrapper_public_key: string } | null;
  messages: Msg[];
  markets: MarketLite[];
  now: string;
};

const PANELS = ["Markets", "Board", "Insights"] as const;
type Panel = (typeof PANELS)[number];

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const { me, loading, identity, refresh } = useSession();
  const router = useRouter();
  // Phone shows one view at a time; a laptop shows the chat with the panel beside it.
  const [view, setView] = useState<"Chat" | Panel>("Chat");
  const [panel, setPanel] = useState<Panel>("Markets");
  const [feed, setFeed] = useState<Omit<Feed, "messages"> | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        setKeyFailed(!keyRef.current);
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
  }, [id, identity, decryptAll]);

  useEffect(() => {
    if (!me) return;
    poll();
    const t = setInterval(poll, 1500);
    return () => clearInterval(t);
  }, [me, poll]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, view]);

  const members = useMemo(() => new Map(feed?.members.map((m) => [m.id, m]) ?? []), [feed]);
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
          {identity && keyFailed && (
            <p className="m-3 flex items-center gap-2 rounded-xl border border-line bg-panel p-3 text-sm text-mute"><Key size={15} /> This device holds an old key for your account. Log out and back in to read the chat.</p>
          )}
          {identity && !feed.myKey && (
            <p className="m-3 flex items-center gap-2 rounded-xl border border-line bg-panel p-3 text-sm text-mute"><Key size={15} /> Waiting for a friend&apos;s app to share the chat key with you. Markets work in the meantime.</p>
          )}
          <div className="thin-scroll flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-1.5 px-3 py-3 lg:px-6 lg:py-5">
              {runs(messages).map((r) =>
                Array.isArray(r) ? (
                  <TradeRun key={r[0].id} trades={r} members={members} />
                ) : (
                  <MessageRow key={r.id} m={r} prev={messages[messages.indexOf(r) - 1]} meId={me.user.id} members={members} markets={markets} now={feed.now} ticker={c.ticker} />
                )
              )}
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
                className="h-10 flex-1 rounded-xl border border-line bg-panel px-4 outline-none placeholder:text-mute focus:border-white/25"
              />
              <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black disabled:bg-white/10 disabled:text-mute" disabled={!draft.trim()} aria-label="Send">
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
      <div className="space-y-0.5 py-1 text-center text-xs text-mute" onClick={() => setOpen(false)}>
        {trades.map((t) => (
          <Link key={t.id} href={`/m/${t.market_id}`} className="block hover:text-white">
            <b className="text-white/80">{t.user_id ? members.get(t.user_id)?.display_name : ""}</b> {t.body}
          </Link>
        ))}
      </div>
    );
  return (
    <button onClick={() => setOpen(true)} className="mx-auto flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs text-mute hover:text-white">
      <Chart size={12} /> {names.slice(0, 2).join(", ")}{names.length > 2 ? ` +${names.length - 2}` : ""} made {trades.length} trades
    </button>
  );
}

function MessageRow({ m, prev, meId, members, markets, now, ticker }: { m: Msg; prev?: Msg; meId: number; members: Map<number, Member>; markets: Map<number, MarketLite>; now: string; ticker: string }) {
  const who = m.user_id ? members.get(m.user_id) : null;
  if (m.kind === "chat") {
    const mine = m.user_id === meId;
    const showName = !mine && prev?.user_id !== m.user_id;
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"} gap-2`}>
        {!mine && <div className="w-7">{showName && who && <Avatar name={who.display_name} color={who.color} size={28} />}</div>}
        <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 lg:max-w-[560px] ${mine ? "rounded-br-md bg-[#2b6cff] text-white" : "rounded-bl-md bg-panel"}`}>
          {showName && who && <div className="text-xs font-semibold" style={{ color: who.color }}>{who.display_name}</div>}
          <div className="whitespace-pre-wrap break-words">{m.text ?? <span className="inline-flex items-center gap-1 italic text-mute"><Lock size={12} /> can&apos;t decrypt yet</span>}</div>
          <div className={`text-right text-[10px] ${mine ? "text-white/60" : "text-mute"}`}>{ago(m.created_at, now)}</div>
        </div>
      </div>
    );
  }
  const mk = m.market_id ? markets.get(m.market_id) : null;
  if ((m.kind === "market" || m.kind === "resolution") && mk) {
    const resolved = mk.status === "resolved";
    return (
      <Link href={`/m/${mk.id}`} className="pop mx-auto my-3 block max-w-[90%] rounded-2xl border border-line bg-panel p-4 transition hover:border-white/15 lg:max-w-md">
        <div className="mb-2 flex items-center gap-2 text-xs text-mute">
          <Badge tone={mk.kind === "stock" ? "brand" : "mute"}>{mk.kind === "stock" ? "Stock" : "Bet"}</Badge>
          <span>{who?.display_name ?? "Someone"} {m.kind === "resolution" ? "resolved" : "listed"}</span>
          <span className="ml-auto">{resolved ? "settled" : timeLeft(mk.resolves_at, now)}</span>
        </div>
        <div className="text-lg font-semibold leading-snug">{mk.title}</div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-3xl font-bold tabular">
              {resolved ? <span className={mk.outcome ? "text-up" : "text-down"}>{mk.outcome ? "YES" : "NO"}</span> : <LiveNumber value={mk.price}>{pct(mk.price)}</LiveNumber>}
            </div>
            {!resolved && <Change from={mk.open_prob} to={mk.price} />}
          </div>
          {!resolved && !mk.closed && (
            <div className="flex gap-2">
              <span className="rounded-lg bg-up/15 px-3 py-1.5 text-sm font-semibold text-up">Long</span>
              <span className="rounded-lg bg-down/15 px-3 py-1.5 text-sm font-semibold text-down">Short</span>
            </div>
          )}
        </div>
        <div className="mt-2 text-xs text-mute">{mk.volume.toFixed(0)} {ticker} traded</div>
      </Link>
    );
  }
  return (
    <div className="py-1 text-center text-xs text-mute">
      {m.market_id ? (
        <Link href={`/m/${m.market_id}`} className="hover:text-white">
          <b className="text-white/80">{who?.display_name ?? "AI"}</b> {m.body}
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

function MarketList({ markets, members, now }: { markets: MarketLite[]; members: Map<number, Member>; now: string }) {
  const groups = [
    { label: "Live bets", items: markets.filter((m) => m.status === "open" && !m.closed && m.kind === "bet") },
    { label: "Stocks (long-term)", items: markets.filter((m) => m.status === "open" && !m.closed && m.kind === "stock") },
    { label: "Awaiting result", items: markets.filter((m) => m.status === "open" && m.closed) },
    { label: "Settled", items: markets.filter((m) => m.status === "resolved").slice(0, 30) },
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
                      {m.category} · {m.status === "resolved" ? "settled" : timeLeft(m.resolves_at, now)} · {m.volume.toFixed(0)} vol
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular">{m.status === "resolved" ? (m.outcome ? "YES" : "NO") : <LiveNumber value={m.price}>{pct(m.price)}</LiveNumber>}</div>
                    {m.status !== "resolved" && <Change from={m.open_prob} to={m.price} />}
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
  useEffect(() => setCtx(feed.group.ai_context), [feed.group.ai_context]);
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
        {msg && <p className="text-sm text-mute">{msg}</p>}
      </div>
    </Sheet>
  );
}
