"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { addMember, groupKey, shareKeyWithNewcomers } from "@/components/groupkeys";
import { UnlockPrompt } from "@/components/unlock";
import { TimeMachine } from "@/components/timemachine";
import { Avatar, Badge, Button, Change, Input, LiveNumber, Sheet, TopBar, fmt, pct, timeLeft } from "@/components/ui";
import { GroupMark, pendingChatNames } from "@/components/shell";
import { cacheFor, decryptWith, persistChat, prefetchChat, restoreChat, sortMsgs, warmChat, type ChatKey } from "@/components/chat/cache";
import { Alert, Camera, Chart, Plus, Chat, Check, ChevronLeft, Close, Flag, Hourglass, Key, Lock, Pencil, Settings, Sparkle, Timer, TrendUp } from "@/components/icons";
import { ReportSheet } from "@/components/report";
import { NewSituation } from "@/components/new-situation";
import { FriendBetCard, NewFriendBet, StakeChooser, type FriendBetLite } from "@/components/friend-bet";
import { Board, Insights } from "@/components/group-stats";
import { decryptPayload, encryptMessage, forgetIdentities, type Attachment, type Payload } from "@/lib/e2ee";
import { primeAttachment, registerPhotos, shrinkImage, squarePhoto, uploadEncrypted, useAttachment } from "@/components/media";
import { Composer, type PickedImage } from "@/components/chat/composer";
import { VoiceNote, type Recording } from "@/components/chat/voice";
import { ImageBubble, Lightbox } from "@/components/chat/image";
import { DeliveryMark, TypingBubble, typingLine, type Delivery } from "@/components/chat/status";
import { ChatMark, chatName } from "@/components/chat/mark";
import { openDm } from "@/components/groupkeys";
import { moodScores } from "@/lib/mood";
import { selectSnippets, type Snippet } from "@/lib/chat-context";
import { SETTLE_WINDOW_HOURS } from "@/lib/safety";
import { sides, typeLabel } from "@/lib/labels";
import { formatOdds, useOddsFormat } from "@/lib/odds";
import { WALLPAPERS, photoWallpaper, wallpaperStyle } from "@/lib/wallpapers";

export type Member = {
  id: number;
  username: string;
  display_name: string;
  color: string;
  public_key: string;
  balance: number;
  has_key: boolean;
  subject_policy: "anyone" | "nobody";
  avatar_id?: number | null;
  avatar_key?: string | null;
  /** Newest message id this member's app has fetched, and has had on screen. */
  delivered_upto?: number;
  read_upto?: number;
};
export type MarketLite = {
  id: number;
  title: string;
  kind: "bet" | "stock";
  answer?: "yesno" | "number";
  line?: number | null;
  unit?: string;
  category: string;
  subject_id: number | null;
  creator_id: number;
  status: string;
  outcome: boolean | null;
  proposed_outcome: boolean | null;
  proposed_by: number | null;
  proposed_at: string | null;
  /** Said to have happened before the deadline, with evidence: settles only on a confirmation. */
  proposed_early?: boolean;
  votes?: { needed: number; confirms: number; rejects: number; canVote: boolean; mine: boolean | null } | null;
  void_reason: string | null;
  closed: boolean;
  price: number;
  open_prob: number;
  resolves_at: string;
  volume: number;
};
export type Msg = {
  id: number;
  user_id: number | null;
  kind: string;
  ciphertext: string | null;
  iv: string | null;
  body: string | null;
  market_id: number | null;
  /** A friend bet's card, or a line about what happened to it. */
  friend_bet_id?: number | null;
  created_at: string;
  text?: string | null;
  payload?: Payload | null;
  /** Your own message before the server has it: shown at once, then confirmed. */
  pending?: "sending" | "slow" | "failed";
  /** Stable React key across the optimistic → confirmed switch. */
  ck?: string;
  /** A photo or voice note you just sent, played from this device while it uploads. */
  local?: string;
};
export type Feed = {
  group: {
    id: number;
    name: string;
    emoji: string;
    invite_code: string;
    ai_context: string;
    is_dm?: boolean;
    description_ct?: string | null;
    description_iv?: string | null;
    photo_id?: number | null;
  };
  members: Member[];
  /** People who wrote in the chat and have since left: name and colour only. */
  former: { id: number; username: string; display_name: string; color: string }[];
  myKey: { wrapped_key: string; wrapper_public_key: string } | null;
  /** Your own settings for this chat. */
  prefs?: { wallpaper: string | null; muted: boolean };
  messages: Msg[];
  markets: MarketLite[];
  friendBets?: FriendBetLite[];
  typing?: { id: number; mode: "text" | "voice" }[];
  now: string;
};

const PANELS = ["Markets", "Board", "Insights"] as const;
// A send that hasn't come back says so after this long, and offers a retry after the second.
const SLOW_SEND_MS = 5_000;
const GIVE_UP_SEND_MS = 25_000;
type Panel = (typeof PANELS)[number];

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const { me, loading, identity, refresh, setIdentity } = useSession();
  const router = useRouter();
  // A phone shows the chat alone (markets live in their own tab); a laptop shows a panel beside it.
  const [panel, setPanel] = useState<Panel>("Markets");
  const [cached] = useState(() => (me ? cacheFor(me.user.id).get(id) : undefined));
  const [feed, setFeed] = useState<Omit<Feed, "messages"> | null>(cached?.feed ?? null);
  const [messages, setMessages] = useState<Msg[]>(cached?.messages ?? []);
  // Polling starts once the device cache has been consulted, so the first request asks only for what's new.
  const [ready, setReady] = useState(!!cached);
  // A chat opens showing its newest messages; earlier ones are drawn as you scroll up (they're already in memory).
  // `floor` is the oldest message id drawn; anything newer (and anything still sending) is always drawn.
  const PAGE = 60;
  const [floor, setFloor] = useState<number | null>(null);
  const wall = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  // Messages that were already in the chat when it opened appear in place; only new ones slide in.
  const animateAfter = useRef<number>(cached ? cached.lastId : Number.MAX_SAFE_INTEGER);
  const [dropped, setDropped] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<Msg | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  // "+ Stake" asks first: invest (the market, as before) or bet a friend one-on-one.
  const [chooseOpen, setChooseOpen] = useState(false);
  const [betOpen, setBetOpen] = useState(false);
  // Laptop: markets, board and insights live in a panel beside the chat, closed until asked for.
  const [sideOpen, setSideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reporting, setReporting] = useState<Msg | null>(null);
  const [err, setErr] = useState("");
  const [keyFailed, setKeyFailed] = useState(false);
  const lastId = useRef(cached?.lastId ?? 0);
  // The live feed: one request at a time that the server answers when something changes.
  // `kick` asks for an immediate fetch (after you act), `waiters` are the callers awaiting it.
  const feedLive = useRef<{ ctrl: AbortController | null; kick: boolean; waiters: (() => void)[]; running: boolean; etag: string | null }>({ ctrl: null, kick: false, waiters: [], running: false, etag: null });
  const markedRead = useRef(false);
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = messages;
  const keyRef = useRef<ChatKey | null>(cached?.key ?? null);
  // The server's clock minus ours (the admin's demo clock runs ahead), so a new bubble gets the right time.
  const skew = useRef(0);
  const retries = useRef(new Map<string, () => void>());
  // Your own photo as this chat's background, decrypted on this device.
  const wallPhoto = photoWallpaper(feed?.prefs?.wallpaper);
  const wallUrl = useAttachment(wallPhoto?.id, keyRef.current?.key, "image/jpeg");

  useEffect(() => {
    if (!loading && !me) router.replace(`/?next=/g/${id}`);
  }, [loading, me, router, id]);

  const decryptAll = useCallback((msgs: Msg[]) => decryptWith(keyRef.current, msgs), []);

  // Not in memory yet: draw the chat as this device last saw it (decrypted now), then catch up.
  const userId = me?.user.id;
  useEffect(() => {
    if (ready || !userId) return;
    let alive = true;
    restoreChat(userId, id, identity)
      .then((c) => {
        if (!alive) return;
        if (c && !feed) {
          keyRef.current = c.key;
          lastId.current = c.lastId;
          animateAfter.current = c.lastId;
          setFeed(c.feed);
          setMessages(c.messages);
        }
      })
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
    // Runs once per chat, as soon as the account is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId, id]);

  // Keep this chat's latest state for the next time it's opened (sent messages only), in memory and on the device.
  useEffect(() => {
    if (!feed || !me) return;
    const entry = { feed, messages: messages.filter((m) => !m.pending), lastId: lastId.current, key: keyRef.current };
    cacheFor(me.user.id).set(id, entry);
    const t = setTimeout(() => persistChat(me.user.id, id, entry), 400);
    return () => clearTimeout(t);
  }, [id, feed, messages, me]);

  // Once this chat is up, fetch the others quietly, one at a time, so switching to them is instant.
  const loaded = !!feed;
  useEffect(() => {
    if (!loaded || !me) return;
    let stop = false;
    (async () => {
      for (const g of me.groups.slice(0, 12)) {
        if (stop) return;
        if (g.id !== id) await prefetchChat(me.user.id, g.id, identity);
      }
    })();
    return () => {
      stop = true;
    };
    // The list of chats changes on every session refresh; fetching ahead once per open is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, id, identity]);

  /**
   * One fetch of the live feed. With `wait`, the server holds it until something changes (up to
   * ~20s) and the phone downloads nothing in between; otherwise it answers at once, with a few
   * bytes when nothing changed.
   */
  const fetchOnce = useCallback(async (wait: boolean, signal: AbortSignal) => {
    {
      // With the chat on screen, everything in it counts as read, including what this fetch brings.
      const visible = document.visibilityState === "visible";
      const etag = feedLive.current.etag;
      const r = await api<(Feed & { etag?: string }) | { unchanged: true; etag: string; now: string }>(
        `/api/groups/${id}?after=${lastId.current}&read=${visible ? Number.MAX_SAFE_INTEGER : 0}${etag ? `&etag=${encodeURIComponent(etag)}${wait ? "&wait=1" : ""}` : ""}`,
        { signal }
      );
      if ("unchanged" in r) {
        // Nothing new: only the clock moves (for "2h left" and the like).
        skew.current = Date.parse(r.now) - Date.now();
        setFeed((cur) => (cur ? { ...cur, now: r.now } : cur));
        return;
      }
      const f = r;
      feedLive.current.etag = f.etag ?? null;
      // Clear this chat's unread badge in the chat list straight away rather than on the next refresh.
      if (visible && !markedRead.current) {
        markedRead.current = true;
        refresh();
      }
      const { messages: fresh, ...rest } = f;
      skew.current = Date.parse(f.now) - Date.now();
      registerPhotos(f.members);
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
        // The first fetch of a chat this device has never seen: it's history, so it appears in place.
        if (animateAfter.current === Number.MAX_SAFE_INTEGER) animateAfter.current = fresh[fresh.length - 1].id;
        lastId.current = fresh[fresh.length - 1].id;
        const dec = await decryptAll(fresh);
        setMessages((old) => {
          const out = [...old];
          for (const m of dec) {
            if (out.some((o) => o.id === m.id)) continue;
            // Our own "sending…" bubble arriving back from the server: confirm it in place.
            const mine = m.payload?.n ? out.findIndex((o) => o.pending && o.payload?.n === m.payload!.n) : -1;
            if (mine >= 0) out[mine] = { ...m, ck: out[mine].ck, local: out[mine].local };
            else out.push(m);
          }
          return sortMsgs(out);
        });
      }
    }
  }, [id, identity, decryptAll, setIdentity, refresh]);

  /** Fetch now (after you send, vote, trade…) instead of waiting for the server's next answer. */
  const poll = useCallback(() => {
    const L = feedLive.current;
    if (!L.running) return Promise.resolve();
    return new Promise<void>((res) => {
      L.waiters.push(res);
      L.kick = true;
      L.ctrl?.abort();
    });
  }, []);

  // The live loop. While the chat is on screen, one request is always waiting at the server and
  // comes back the moment something changes. In the background it checks every 15s instead, so a
  // hidden tab holds no connection open.
  useEffect(() => {
    if (!userId || !ready) return;
    const L = feedLive.current;
    let stop = false;
    L.running = true;
    const pause = (ms: number) =>
      new Promise<void>((res) => {
        const ctrl = new AbortController();
        L.ctrl = ctrl;
        const t = setTimeout(res, ms);
        ctrl.signal.addEventListener("abort", () => {
          clearTimeout(t);
          res();
        });
      });
    (async () => {
      let first = true;
      let fails = 0;
      while (!stop) {
        const kicked = L.kick;
        L.kick = false;
        const waiters = L.waiters.splice(0);
        const hidden = document.visibilityState !== "visible";
        if (hidden && !first && !kicked) {
          await pause(15_000);
          if (stop) break;
        }
        const ctrl = new AbortController();
        L.ctrl = ctrl;
        try {
          await fetchOnce(!first && !kicked && !hidden, ctrl.signal);
          fails = 0;
          setErr("");
        } catch (e) {
          if (!ctrl.signal.aborted) {
            setErr((e as Error).message);
            // No signal or a server hiccup: back off (1s, 2s, 4s… up to 15s) rather than hammer it.
            fails++;
            await pause(Math.min(15_000, 1000 * 2 ** (fails - 1)));
          }
        } finally {
          if (L.ctrl === ctrl) L.ctrl = null;
          waiters.forEach((w) => w());
        }
        first = false;
      }
    })();
    // Back from another app or a locked phone (or leaving it): re-ask at once with the right "read".
    const wake = () => {
      L.kick = true;
      L.ctrl?.abort();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      stop = true;
      L.running = false;
      L.ctrl?.abort();
      L.waiters.splice(0).forEach((w) => w());
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [userId, ready, fetchOnce]);

  // Scrolling up to the top of what's drawn reveals the next page of earlier messages, keeping your place.
  const sent = messages.filter((m) => !m.pending);
  const floorAt = floor == null ? Math.max(0, sent.length - PAGE) : sent.findIndex((m) => m.id >= floor);
  const hidden = Math.max(0, floorAt);
  useEffect(() => {
    if (floor == null && sent.length) setFloor(sent[Math.max(0, sent.length - PAGE)].id);
  }, [floor, sent]);
  const revealEarlier = useCallback(() => {
    const el = wall.current;
    if (!el || !hidden) return;
    anchor.current = { height: el.scrollHeight, top: el.scrollTop };
    setFloor(sent[Math.max(0, hidden - PAGE)].id);
  }, [hidden, sent]);
  useEffect(() => {
    const el = wall.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    el.scrollTop = a.top + (el.scrollHeight - a.height);
  }, [floor]);
  // Whether you're reading the newest messages (then new ones scroll into view) or scrolled up
  // through history (then they don't pull you down, unless they're your own).
  const atBottom = useRef(true);
  const onWallScroll = () => {
    const el = wall.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (el.scrollTop < 240 && hidden) revealEarlier();
  };

  const typingCount = feed?.typing?.length ?? 0;
  // Open at the newest message straight away, then glide down as new ones arrive. Only the
  // message list scrolls (scrollIntoView would also move the page itself on a phone), and it goes
  // all the way down, so the newest bubble sits clear of the message bar rather than under its edge.
  const landed = useRef(false);
  const newest = messages[messages.length - 1];
  const mineLast = !!newest && (!!newest.pending || newest.user_id === me?.user.id);
  useEffect(() => {
    const el = wall.current;
    if (!messages.length || anchor.current || !el) return;
    if (landed.current && !atBottom.current && !mineLast) return;
    el.scrollTo({ top: el.scrollHeight, behavior: landed.current ? "smooth" : "auto" });
    atBottom.current = true;
    landed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, typingCount, !!feed]);
  // The phone keyboard opening (or the window resizing) keeps the newest message in view.
  useEffect(() => {
    const vv = window.visualViewport;
    const keep = () => {
      const el = wall.current;
      if (el && atBottom.current) el.scrollTo({ top: el.scrollHeight });
    };
    vv?.addEventListener("resize", keep);
    window.addEventListener("resize", keep);
    return () => {
      vv?.removeEventListener("resize", keep);
      window.removeEventListener("resize", keep);
    };
  }, []);

  const members = useMemo(
    () =>
      new Map<number, Member>([
        ...(feed?.former ?? []).map((f) => [f.id, { ...f, public_key: "", balance: 0, has_key: false, subject_policy: "anyone" as const }] as const),
        ...(feed?.members ?? []).map((m) => [m.id, m] as const),
      ]),
    [feed]
  );
  const markets = useMemo(() => new Map(feed?.markets.map((m) => [m.id, m]) ?? []), [feed]);
  const friendBets = useMemo(() => new Map(feed?.friendBets?.map((b) => [b.id, b]) ?? []), [feed]);

  /**
   * Sends straight away on screen (clock mark), then encrypts, uploads any file and posts. The
   * bubble turns into a sent message when the server answers, or offers a retry if it can't.
   */
  function sendOptimistic(text: string, file?: { kind: Attachment["kind"]; bytes: Uint8Array; url: string; meta: Omit<Attachment, "id" | "kind" | "size"> }) {
    const k = keyRef.current;
    if (!k || !me) return;
    const n = Math.random().toString(36).slice(2, 10);
    const ck = `c-${n}`;
    const a: Attachment | undefined = file ? { id: 0, kind: file.kind, size: file.bytes.length, ...file.meta } : undefined;
    const temp: Msg = {
      id: -Date.now(),
      ck,
      user_id: me.user.id,
      kind: "chat",
      ciphertext: null,
      iv: null,
      body: null,
      market_id: null,
      created_at: new Date(Date.now() + skew.current).toISOString(),
      text,
      payload: { t: text, a, n },
      pending: "sending",
      local: file?.url,
    };
    setMessages((old) => [...old, temp]);
    const patch = (fn: (m: Msg) => Msg) => setMessages((old) => old.map((m) => (m.ck === ck && m.pending ? fn(m) : m)));
    const attempt = async () => {
      patch((m) => ({ ...m, pending: "sending" }));
      // On a weak connection: say it's slow after a few seconds, and give up (with a retry) rather
      // than spin for ever. The server knows the message by `n`, so a retry can't post it twice.
      const stop = new AbortController();
      const slow = setTimeout(() => patch((m) => (m.pending === "sending" ? { ...m, pending: "slow" } : m)), SLOW_SEND_MS);
      const giveUp = setTimeout(() => stop.abort(), GIVE_UP_SEND_MS);
      try {
        if (a && file && !a.id) {
          a.id = await uploadEncrypted(file.kind, id, k.key, file.bytes);
          primeAttachment(a.id, file.url);
        }
        const body = await encryptMessage(k.key, text, { ...(a ? { a } : {}), n });
        const { id: realId } = await api<{ id: number }>(`/api/groups/${id}/messages`, { body: { ...body, nonce: n }, signal: stop.signal });
        retries.current.delete(ck);
        // If the poll already brought it back, the bubble was confirmed there.
        setMessages((old) => sortMsgs(old.map((m) => (m.ck === ck && m.pending ? { ...m, id: realId, pending: undefined, payload: { t: text, a, n } } : m))));
        void poll();
      } catch {
        patch((m) => ({ ...m, pending: "failed" }));
      } finally {
        clearTimeout(slow);
        clearTimeout(giveUp);
      }
    };
    retries.current.set(ck, attempt);
    void attempt();
  }
  const sendText = (text: string) => sendOptimistic(text);
  const sendImage = (img: PickedImage, caption: string) => sendOptimistic(caption, { kind: "image", bytes: img.bytes, url: img.url, meta: { mime: "image/jpeg", w: img.w, h: img.h } });
  const sendVoice = (r: Recording) => sendOptimistic("", { kind: "voice", bytes: r.bytes, url: URL.createObjectURL(r.blob), meta: { mime: r.mime, dur: Math.round(r.dur * 10) / 10, wave: r.wave } });
  const typing = (mode: "text" | "voice" | null) => {
    void api(`/api/groups/${id}/typing`, { body: { mode } }).catch(() => {});
  };

  /**
   * Your message's mark: a clock while it sends, a tick once the server has it, and the app's mark
   * once at least one other person has had it on screen. Who has read it is in the tooltip.
   */
  const delivery = (m: Msg): { state: Delivery; title?: string } => {
    if (m.pending) return { state: m.pending === "slow" ? "sending" : m.pending };
    const others = (feed?.members ?? []).filter((x) => x.id !== me?.user.id);
    if (!others.length) return { state: "sent" };
    const readers = others.filter((x) => (x.read_upto ?? 0) >= m.id);
    const got = others.filter((x) => (x.delivered_upto ?? 0) >= m.id).length;
    if (readers.length) {
      const names = readers.map((x) => x.display_name.split(" ")[0]);
      const title = readers.length === others.length && others.length > 1 ? "Read by everyone" : `Read by ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}`;
      return { state: "read", title };
    }
    return { state: got === others.length ? "delivered" : "sent", title: others.length > 1 ? `Sent · delivered to ${got} of ${others.length}` : got ? "Delivered" : "Sent" };
  };

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

  /** Relevant, redacted snippets for one situation, picked on this device (always on; see lib/ai-disclosure.ts). */
  const chatSnippets = useCallback(
    (subjectId: number | null, title: string): Snippet[] =>
      feed
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
    if (!feed) return null;
    const out: Record<string, Snippet[]> = {};
    for (const m of feed.markets.filter((x) => x.kind === "stock" && x.status === "open")) {
      const s = chatSnippets(m.subject_id, m.title).slice(-8);
      if (s.length) out[m.id] = s;
    }
    return out;
  }, [feed, chatSnippets]);

  if (!me) return null;
  if (!feed) {
    // The chat exists in the sidebar already (a brand-new one included); draw its frame while the first feed loads.
    const known = me.groups.find((g) => g.id === id) ?? (pendingChatNames.has(id) ? { name: pendingChatNames.get(id)!, members: 1 } : undefined);
    return (
      <main className="chat-in flex min-h-dvh flex-col lg:min-h-full">
        <TopBar back="/chats" title={<div className="flex items-center gap-3"><GroupMark name={known?.name ?? ""} size={36} /><div><div className="font-semibold leading-tight">{known?.name ?? ""}</div><div className="text-xs text-mute">{err || (known ? `${known.members} members` : "")}</div></div></div>} />
        <div className="chat-wall flex flex-1 flex-col justify-end gap-3 px-4 pb-24 lg:px-8" aria-hidden>
          {/* While the device cache is read (a few ms) the wall stays plain; grey bubbles only for a chat this device has never opened. */}
          {ready && [62, 44, 70, 38, 56].map((w, k) => (
            <div key={k} className={`h-11 animate-pulse rounded-2xl bg-white/[.05] ${k % 2 ? "self-end" : "ml-11"}`} style={{ width: `${w}%`, maxWidth: 420 }} />
          ))}
        </div>
      </main>
    );
  }
  const c = me.config.currency;
  const live = feed.markets.filter((m) => m.status === "open" && !m.closed).length;
  const dm = !!feed.group.is_dm;
  const peer = dm ? feed.members.find((m) => m.id !== me.user.id) ?? null : null;
  const chat = { ...feed.group, peer, my_key: feed.myKey };
  const typers = (feed.typing ?? []).map((t) => ({ ...t, who: members.get(t.id) })).filter((t) => t.who);
  const typingNow = typingLine(typers.map((t) => ({ name: t.who!.display_name, mode: t.mode })));
  const viewingWho = viewing?.user_id ? members.get(viewing.user_id) : null;

  const header = (
    <TopBar
      back="/chats"
      title={
        <button onClick={() => setSettingsOpen(true)} className="flex min-w-0 items-center gap-3 text-left">
          <ChatMark g={chat} size={34} />
          <span className="min-w-0">
            <div className="truncate leading-tight">{chatName(chat)}</div>
            <div className="flex items-center gap-1.5 text-xs font-normal text-mute">
              {typingNow ? (
                <span className="truncate text-brand">{typingNow}</span>
              ) : (
                <>
                  <span className="truncate">{dm ? `@${peer?.username ?? ""}` : `${feed.members.length} members`}</span>
                  <span className="flex shrink-0 items-center gap-1"><Lock size={11} /> {dm ? "Private" : "Encrypted"}</span>
                </>
              )}
            </div>
          </span>
        </button>
      }
      right={
        <>
          <Link href={`/markets?g=${id}`} className="flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1.5 text-sm font-semibold text-brand lg:hidden" aria-label="Open this chat's markets">
            <TrendUp size={14} /> {live} live
          </Link>
          <button onClick={() => setSideOpen((v) => !v)} className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold lg:flex ${sideOpen ? "bg-white text-black" : "bg-brand/15 text-brand hover:bg-brand/25"}`} aria-pressed={sideOpen} title="Markets, leaderboard and insights for this chat">
            <TrendUp size={14} /> {live} live
          </button>
          <button onClick={() => setSettingsOpen(true)} className="hidden rounded-md p-2 text-mute hover:bg-white/5 hover:text-white lg:block" title="Chat settings">
            <Settings size={17} />
          </button>
        </>
      }
    />
  );

  return (
    <main className="chat-in flex h-dvh flex-col lg:h-full">
      <div className="lg:hidden">{header}</div>

      <div className="flex min-h-0 flex-1">
        <section
          className="relative flex min-w-0 flex-1 flex-col"
          onDragOver={(e) => {
            if (!keyRef.current || ![...e.dataTransfer.types].includes("Files")) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
            if (f) setDropped(f);
          }}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand/60 bg-ink/80 text-sm font-medium text-brand">Drop a photo to send it</div>
          )}
          <div className="hidden lg:block">{header}</div>
          {!identity && <UnlockPrompt />}
          {!identity && keyFailed && (
            <p className="mx-3 mt-3 flex items-center gap-2 text-sm text-mute"><Key size={15} /> Your account was reset since this device last unlocked it. Enter your password once to read the chat.</p>
          )}
          {identity && !feed.myKey && (
            <p className="m-3 flex items-center gap-2 rounded-xl border border-line bg-panel p-3 text-sm text-mute"><Key size={15} /> Waiting for a friend&apos;s app to share the chat key with you. Markets work in the meantime.</p>
          )}
          <div ref={wall} onScroll={onWallScroll} className="chat-wall thin-scroll flex-1 overflow-y-auto" style={wallpaperStyle(feed.prefs?.wallpaper, wallUrl === "error" ? null : wallUrl)}>
            <div className="mx-auto max-w-3xl px-3 pb-5 pt-3 lg:px-6 lg:py-5">
              {hidden > 0 && (
                <button onClick={revealEarlier} className="mx-auto mb-2 flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-xs text-mute hover:text-white">
                  <ChevronLeft size={12} className="rotate-90" /> {hidden} earlier
                </button>
              )}
              {runs(messages.slice(hidden)).map((r, i, all) => {
                const first = Array.isArray(r) ? r[0] : r;
                const before = all[i - 1];
                const prev = before && (Array.isArray(before) ? before[before.length - 1] : before);
                const nextItem = all[i + 1];
                const next = nextItem && (Array.isArray(nextItem) ? nextItem[0] : nextItem);
                const day = dayLabel(first.created_at, feed.now);
                return (
                  <div key={first.ck ?? first.id}>
                    {(!prev || dayLabel(prev.created_at, feed.now) !== day) && (
                      <div className="sticky top-2 z-10 my-3 flex justify-center">
                        <span className="rounded-full border border-line bg-ink/90 px-3 py-1 text-[11px] font-medium text-mute backdrop-blur">{day}</span>
                      </div>
                    )}
                    {Array.isArray(r) ? (
                      <TradeRun trades={r} members={members} />
                    ) : (
                      <MessageRow
                        m={r}
                        prev={prev}
                        next={next}
                        meId={me.user.id}
                        members={members}
                        markets={markets}
                        friendBets={friendBets}
                        onBetChanged={poll}
                        now={feed.now}
                        ticker={c.ticker}
                        groupKey={keyRef.current?.key ?? null}
                        delivery={delivery}
                        animate={!!r.pending || r.id > animateAfter.current}
                        onReport={setReporting}
                        onReview={review}
                        onOpen={setViewing}
                        onRetry={(ck) => retries.current.get(ck)?.()}
                      />
                    )}
                  </div>
                );
              })}
              {typers.map((t) => <TypingBubble key={t.id} who={t.who!} mode={t.mode} />)}
            </div>
          </div>
          <Composer
            disabled={!keyRef.current}
            dropped={dropped}
            onDropHandled={() => setDropped(null)}
            onText={sendText}
            onImage={sendImage}
            onVoice={sendVoice}
            onTyping={typing}
            onSituation={() => setChooseOpen(true)}
          />
        </section>

        <aside className={`${sideOpen ? "lg:flex" : "hidden"} hidden min-h-0 w-full flex-col lg:w-[400px] lg:border-l lg:border-line lg:bg-panel/50 xl:w-[440px]`}>
          <nav className="hidden h-[57px] shrink-0 items-center gap-1 border-b border-line px-3 lg:flex">
            {PANELS.map((t) => (
              <button key={t} onClick={() => setPanel(t)} className={`rounded-lg px-3 py-1.5 text-sm ${panel === t ? "bg-white/[.08] text-white" : "text-mute hover:text-white"}`}>
                {t}
              </button>
            ))}
            <button onClick={() => setSideOpen(false)} className="ml-auto rounded-md p-1.5 text-mute hover:bg-white/5 hover:text-white" aria-label="Close panel"><Close size={16} /></button>
          </nav>
          <div className="thin-scroll flex-1 overflow-y-auto">
            {panel === "Markets" && <MarketList markets={feed.markets} members={members} now={feed.now} />}
            {panel === "Board" && <Board groupId={id} ticker={c.ticker} meId={me.user.id} />}
            {panel === "Insights" && <Insights groupId={id} moods={moods} stockSnippets={stockSnippets} withChat onRepriced={poll} />}
          </div>
          {panel === "Markets" && (
            <div className="border-t border-line p-3">
              <Button className="flex w-full items-center justify-center gap-2" onClick={() => setChooseOpen(true)}><Plus size={16} /> New stake</Button>
            </div>
          )}
        </aside>
      </div>
      <div className="lg:hidden"><TimeMachine onJump={poll} /></div>
      {/* On an iPhone the home bar sits over the bottom of the screen: keep the message bar above it. */}
      <div className="shrink-0 bg-ink pb-[env(safe-area-inset-bottom)] lg:hidden" />

      <StakeChooser
        open={chooseOpen}
        onClose={() => setChooseOpen(false)}
        onInvest={() => { setChooseOpen(false); setNewOpen(true); }}
        onBet={() => { setChooseOpen(false); setBetOpen(true); }}
      />
      <NewFriendBet
        open={betOpen}
        onClose={() => setBetOpen(false)}
        groupId={id}
        now={feed.now}
        ticker={c.ticker}
        onCreated={() => { setBetOpen(false); poll(); refresh(); }}
      />
      <NewSituation
        open={newOpen}
        onClose={() => setNewOpen(false)}
        groupId={id}
        members={feed.members}
        meId={me.user.id}
        now={feed.now}
        aiContext={feed.group.ai_context}
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
      {viewing && (
        <ViewPhoto
          m={viewing}
          groupKey={keyRef.current?.key ?? null}
          meta={<><b className="text-white">{viewing.user_id === me.user.id ? "You" : (viewingWho?.display_name ?? "")}</b> · {new Date(viewing.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
          onClose={() => setViewing(null)}
        />
      )}
      <GroupSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} feed={feed} groupId={id} keyRef={keyRef} identity={identity} onChange={() => { poll(); refresh(); }} />
    </main>
  );
}

/** Stored messages in order, then your own still-sending ones in the order you sent them. */
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
          <Link key={t.id} href={`/m/${t.market_id}`} prefetch={false} className="block hover:text-white">
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

function MessageRow({
  m,
  prev,
  next,
  meId,
  members,
  markets,
  friendBets,
  onBetChanged,
  now,
  ticker,
  groupKey,
  delivery,
  animate,
  onReport,
  onReview,
  onOpen,
  onRetry,
}: {
  m: Msg;
  prev?: Msg;
  next?: Msg;
  meId: number;
  members: Map<number, Member>;
  markets: Map<number, MarketLite>;
  friendBets: Map<number, FriendBetLite>;
  onBetChanged: () => unknown;
  now: string;
  ticker: string;
  groupKey: CryptoKey | null;
  delivery: (m: Msg) => { state: Delivery; title?: string };
  /** Slide in (a message that just arrived) rather than appear in place (history). */
  animate?: boolean;
  onReport: (m: Msg) => void;
  onReview: (marketId: number, what: "confirm" | "dispute") => Promise<void>;
  onOpen: (m: Msg) => void;
  onRetry: (ck: string) => void;
}) {
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
    const a = m.payload?.a;
    const media = a?.kind === "image" || a?.kind === "voice";
    const d = mine ? delivery(m) : null;
    const meta = (
      <span className={`inline-flex items-center gap-1 text-[10px] tabular ${a && !m.text ? (a.kind === "image" ? "text-white/85" : mine ? "text-white/60" : "text-mute") : `float-right ml-3 mt-1.5 ${mine ? "text-white/60" : "text-mute"}`}`}>
        {clock(m.created_at)}
        {d && <DeliveryMark state={d.state} title={d.title} />}
      </span>
    );
    return (
      <div className={`${animate ? "msg-in " : ""}group flex items-end ${mine ? "justify-end" : "justify-start"} gap-2 ${first ? "mt-2.5" : "mt-0.5"}`}>
        {!mine && (
          <div className="w-7 shrink-0">
            {last && who && (who.username ? <Link href={`/u/${who.username}`} prefetch={false} aria-label={`${who.display_name}'s profile`}><Avatar id={who.id} name={who.display_name} color={who.color} size={28} /></Link> : <Avatar name={who.display_name} color={who.color} size={28} />)}
          </div>
        )}
        {mine && m.pending === "slow" && (
          <span className="mb-1 shrink-0 text-xs text-mute" aria-live="polite">Slow connection, still sending</span>
        )}
        {mine && m.pending === "failed" && m.ck && (
          <button onClick={() => onRetry(m.ck!)} className="mb-1 flex shrink-0 items-center gap-1 rounded-full bg-down/15 px-2.5 py-1 text-xs font-medium text-down hover:bg-down/25">
            <Alert size={13} /> Not sent, retry
          </button>
        )}
        <div
          onTouchStart={mine ? undefined : () => { stopPress(); press.current = setTimeout(() => onReport(m), 550); }}
          onTouchEnd={stopPress}
          onTouchMove={stopPress}
          onTouchCancel={stopPress}
          className={`max-w-[78%] rounded-2xl [-webkit-touch-callout:none] lg:max-w-[430px] ${a?.kind === "image" ? "p-1" : "px-3.5 py-1.5"} ${corner} ${!first ? (mine ? "rounded-tr-md" : "rounded-tl-md") : ""} ${mine ? "bg-mine text-white" : "bg-raised"} ${(m.pending === "sending" || m.pending === "slow") && media ? "opacity-80" : ""}`}>
          {first && !mine && who && <div className={`text-[13px] font-semibold ${a?.kind === "image" ? "px-2.5 pb-1 pt-0.5" : ""}`} style={{ color: who.color }}>{who.display_name}</div>}
          {a?.kind === "image" ? (
            <ChatImage m={m} a={a} groupKey={groupKey} onOpen={() => onOpen(m)}>{!m.text && meta}</ChatImage>
          ) : a?.kind === "voice" ? (
            <ChatVoice m={m} a={a} groupKey={groupKey} mine={mine}>{!m.text && meta}</ChatVoice>
          ) : null}
          {(m.text || !a) && (
            <span className={`whitespace-pre-wrap break-words ${a?.kind === "image" ? "block px-2.5 pt-1.5" : ""}`}>
              {m.text ?? (m.payload === undefined || !groupKey ? <span className="inline-flex items-center gap-1 italic text-mute"><Lock size={12} /> can&apos;t decrypt yet</span> : null)}
            </span>
          )}
          {!(a && !m.text) && <span className={a?.kind === "image" ? "block px-2.5 pb-0.5" : ""}>{meta}</span>}
        </div>
        {!mine && (
          <button onClick={() => onReport(m)} className="mb-1 hidden shrink-0 rounded-md p-1 text-mute opacity-0 transition hover:bg-white/5 hover:text-white focus:opacity-100 group-hover:opacity-100 lg:block" title="Report message" aria-label="Report message">
            <Flag size={14} />
          </button>
        )}
      </div>
    );
  }
  const fb = m.friend_bet_id ? friendBets.get(m.friend_bet_id) : null;
  if (m.kind === "friendbet" && fb) return <FriendBetCard bet={fb} members={members} meId={meId} now={now} ticker={ticker} onChange={onBetChanged} />;
  const mk = m.market_id ? markets.get(m.market_id) : null;
  if ((m.kind === "market" || m.kind === "resolution") && mk) return <MarketCard m={m} mk={mk} who={who} now={now} ticker={ticker} meId={meId} members={members} onReview={onReview} />;
  return (
    <div className="my-2 text-center text-xs text-mute">
      {m.market_id ? (
        <Link href={`/m/${m.market_id}`} prefetch={false} className="hover:text-white">
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

/** A photo in the chat: your local copy while it sends, otherwise decrypted on demand. */
function ChatImage({ m, a, groupKey, onOpen, children }: { m: Msg; a: Attachment; groupKey: CryptoKey | null; onOpen: () => void; children?: React.ReactNode }) {
  const url = useAttachment(m.local ? null : a.id, groupKey, a.mime);
  return <ImageBubble a={a} url={m.local ?? url} onOpen={onOpen}>{children}</ImageBubble>;
}

function ChatVoice({ m, a, groupKey, mine, children }: { m: Msg; a: Attachment; groupKey: CryptoKey | null; mine: boolean; children?: React.ReactNode }) {
  const url = useAttachment(m.local ? null : a.id, groupKey, a.mime);
  return <VoiceNote a={a} url={m.local ?? (url === "error" ? null : url)} mine={mine}>{children}</VoiceNote>;
}

function ViewPhoto({ m, groupKey, meta, onClose }: { m: Msg; groupKey: CryptoKey | null; meta: React.ReactNode; onClose: () => void }) {
  const a = m.payload?.a;
  const url = useAttachment(m.local || !a ? null : a.id, groupKey, a?.mime ?? "image/jpeg");
  const src = m.local ?? (url && url !== "error" ? url : null);
  if (!src) return null;
  return <Lightbox url={src} caption={m.text ?? undefined} meta={meta} onClose={onClose} />;
}

/** The pending-result strip on a chat card: confirm it, or (after a second tap) void it and refund everyone. */
/**
 * A situation in the chat, kept quiet: who posted it, the question, then one row of two odds
 * buttons. Bets read like a bookmaker's (odds first, chance small); stocks show their price.
 */
function MarketCard({ m, mk, who, now, meId, members, onReview }: { m: Msg; mk: MarketLite; who: Member | null | undefined; now: string; ticker: string; meId: number; members: Map<number, Member>; onReview: (marketId: number, what: "confirm" | "dispute") => Promise<void> }) {
  const [fmtOdds] = useOddsFormat();
  const resolved = mk.status === "resolved";
  const voided = mk.status === "void";
  const pending = mk.status === "open" && mk.proposed_outcome != null;
  const settledNow = m.kind === "resolution";
  const live = !resolved && !voided && !mk.closed;
  const stock = mk.kind === "stock" && mk.answer !== "number";
  const lbl = sides(mk);
  const type = typeLabel(mk);
  const when = voided ? "called off" : resolved ? "settled" : pending ? "result proposed" : stock ? `matures ${new Date(mk.resolves_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : timeLeft(mk.resolves_at, now);
  if ((resolved || voided) && !settledNow) {
    // Old news: one line, so the chat isn't a wall of finished cards.
    return (
      <div className="msg-in my-2 flex justify-center">
        <Link href={`/m/${mk.id}`} prefetch={false} className="flex w-full max-w-[92%] items-center gap-2 rounded-full bg-white/[.04] px-4 py-2 text-[13px] text-mute hover:bg-white/[.07] lg:max-w-md">
          <span className="truncate">{mk.title}</span>
          <span className={`ml-auto shrink-0 font-semibold ${voided ? "text-mute" : mk.outcome ? "text-up" : "text-down"}`}>{voided ? "Called off" : mk.outcome ? lbl.yes : lbl.no}</span>
        </Link>
      </div>
    );
  }
  return (
    <div className="msg-in my-4 flex justify-center">
      <div className="w-full max-w-[92%] overflow-hidden rounded-2xl bg-panel lg:max-w-md">
        <Link href={`/m/${mk.id}`} prefetch={false} className="block px-4 pt-3.5 hover:bg-white/[.02]">
          <div className="flex items-center gap-2 text-xs text-mute">
            {who ? <Avatar id={who.id} name={who.display_name} color={who.color} size={16} /> : <Sparkle size={13} />}
            <span className="truncate"><b className="font-medium text-white/80">{who?.display_name ?? "Someone"}</b> · {type === "Yes or no" ? when : `${type} · ${when}`}</span>
            <span className="ml-auto shrink-0 tabular">{clock(m.created_at)}</span>
          </div>
          <div className={`mt-2 text-[17px] font-semibold leading-snug ${voided ? "text-mute line-through decoration-white/30" : ""}`}>{mk.title}</div>
          {(resolved || voided) && (
            <div className="mt-2 text-sm font-semibold">
              {voided ? <span className="text-mute">Called off, everyone refunded</span> : <span className={mk.outcome ? "text-up" : "text-down"}>{mk.outcome ? lbl.yes : lbl.no}</span>}
            </div>
          )}
        </Link>
        {pending && <ProposalActions mk={mk} meId={meId} members={members} now={now} onReview={onReview} />}
        {live ? (
          <div className="grid grid-cols-2 gap-2 p-3">
            <OddsButton href={`/m/${mk.id}?side=yes`} tone="up" label={lbl.yes} big={stock ? fmt(mk.price * 100, 1) : formatOdds(mk.price, fmtOdds)} small={stock ? "price" : pct(mk.price)} />
            <OddsButton href={`/m/${mk.id}?side=no`} tone="down" label={lbl.no} big={stock ? fmt((1 - mk.price) * 100, 1) : formatOdds(1 - mk.price, fmtOdds)} small={stock ? "price" : pct(1 - mk.price)} />
          </div>
        ) : (
          <div className="h-3.5" />
        )}
      </div>
    </div>
  );
}

function OddsButton({ href, tone, label, big, small }: { href: string; tone: "up" | "down"; label: string; big: string; small: string }) {
  const t = tone === "up" ? "bg-up/10 text-up hover:bg-up/20" : "bg-down/10 text-down hover:bg-down/20";
  return (
    <Link href={href} prefetch={false} className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 transition ${t}`}>
      <span className="truncate text-sm font-semibold">{label}</span>
      <span className="ml-2 text-right leading-tight">
        <span className="block text-[17px] font-semibold tabular">{big}</span>
        <span className="block text-[10px] text-white/45 tabular">{small}</span>
      </span>
    </Link>
  );
}

function ProposalActions({ mk, meId, members, now, onReview }: { mk: MarketLite; meId: number; members: Map<number, Member>; now: string; onReview: (marketId: number, what: "confirm" | "dispute") => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const by = mk.proposed_by ? members.get(mk.proposed_by) : null;
  const v = mk.votes;
  const canReview = !!v?.canVote;
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
        <span className="text-mute">{by?.display_name ?? "Someone"} {mk.proposed_early ? "says it already happened: " : "proposed "}</span>
        <b className={mk.proposed_outcome ? "text-up" : "text-down"}>{(mk.proposed_outcome ? sides(mk).yes : sides(mk).no).toUpperCase()}</b>
        <span className="text-mute">. {canReview ? (mk.proposed_early ? "Check the evidence before you vote." : "Is that right?") : mk.proposed_by === meId ? "The group is voting on it." : meId === mk.subject_id ? "It's about you, so you can only call it off." : "You'd gain from it, so you don't vote."}</span>
      </div>
      {v && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <div className="flex h-1.5 flex-1 gap-1">
            {Array.from({ length: Math.max(1, v.needed) }, (_, i) => <span key={i} className={`flex-1 rounded-full ${i < v.confirms ? "bg-up" : "bg-white/10"}`} />)}
          </div>
          <span className="shrink-0 text-mute tabular">{v.confirms} of {v.needed} confirmed{v.rejects ? ` · ${v.rejects} rejected` : ""}</span>
        </div>
      )}
      <div className="mt-1 text-xs text-mute">
        {mk.proposed_early
          ? "Settles once most of the group confirms it."
          : settlesAt > new Date(now).getTime()
            ? `If the vote isn't decided, it settles in ${timeLeft(new Date(settlesAt), now).replace(" left", "")} unless more people reject it.`
            : "Settling any moment now."}
      </div>
      {canReview && mk.proposed_early && (
        <Link href={`/m/${mk.id}`} prefetch={false} className="mt-2.5 block rounded-xl bg-white/[.07] py-2 text-center text-sm font-medium hover:bg-white/10">
          See the evidence and vote
        </Link>
      )}
      {canReview && !mk.proposed_early &&
        (asking ? (
          <div className="mt-2.5 space-y-2">
            <p className="text-xs text-mute">If most of the group rejects it, the claim is dropped and someone can propose the right result.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" className="!py-2 text-sm" disabled={busy} onClick={() => setAsking(false)}>Cancel</Button>
              <Button variant="down" className="!py-2 text-sm" disabled={busy} onClick={() => go("dispute")}>Reject it</Button>
            </div>
          </div>
        ) : (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <Button variant="up" className="!py-2 text-sm" disabled={busy || v?.mine === true} onClick={() => go("confirm")}>{v?.mine === true ? "You confirmed" : "Confirm"}</Button>
            <Button variant={v?.mine === false ? "down" : "ghost"} className="!py-2 text-sm" disabled={busy || v?.mine === false} onClick={() => setAsking(true)}>{v?.mine === false ? "You rejected" : "Reject"}</Button>
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
                      {m.category} · {m.status === "void" ? "called off" : m.status === "resolved" ? "settled" : m.proposed_outcome != null ? `proposed ${(m.proposed_outcome ? sides(m).yesShort : sides(m).noShort).toUpperCase()}` : timeLeft(m.resolves_at, now)} · {m.volume.toFixed(0)} vol
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular">{m.status === "void" ? <span className="text-mute">VOID</span> : m.status === "resolved" ? (m.outcome ? sides(m).yesShort.toUpperCase() : sides(m).noShort.toUpperCase()) : <LiveNumber value={m.price}>{pct(m.price)}</LiveNumber>}</div>
                    {m.status === "open" && <Change from={m.open_prob} to={m.price} />}
                  </div>
                </Link>
              );
            })}
          </section>
        ) : null
      )}
      {!markets.length && <p className="p-10 text-center text-mute">No stakes yet. Create the first one.</p>}
    </div>
  );
}

/** Group photo, name and description, editable by any member. The description is encrypted like a message. */
function GroupProfile({ feed, groupId, groupKey, onChange, say }: { feed: Omit<Feed, "messages">; groupId: number; groupKey: CryptoKey | null; onChange: () => void; say: (m: string) => void }) {
  const g = feed.group;
  const [desc, setDesc] = useState<string | null>(null);
  const [editing, setEditing] = useState<"name" | "desc" | null>(null);
  const [name, setName] = useState(g.name);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const pickPhoto = useRef<HTMLInputElement>(null);
  const photo = useAttachment(g.photo_id, groupKey, "image/jpeg");
  useEffect(() => {
    if (!g.description_ct || !g.description_iv || !groupKey) return setDesc(g.description_ct ? null : "");
    let alive = true;
    decryptPayload(groupKey, g.description_iv, g.description_ct).then((p) => alive && setDesc(p?.t ?? null));
    return () => {
      alive = false;
    };
  }, [g.description_ct, g.description_iv, groupKey]);
  async function save(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      await api(`/api/groups/${groupId}`, { method: "PATCH", body });
      setEditing(null);
      say(done);
      onChange();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function setPhoto(file: File | undefined) {
    if (!file || !groupKey) return;
    setBusy(true);
    try {
      const sq = await squarePhoto(file);
      const photoId = await uploadEncrypted("group_photo", groupId, groupKey, sq.bytes);
      primeAttachment(photoId, URL.createObjectURL(sq.blob));
      await save({ photoId }, "Group photo updated");
    } catch (e) {
      say((e as Error).message);
      setBusy(false);
    }
  }
  async function saveDesc() {
    if (!groupKey) return;
    const t = text.trim();
    await save({ description: t ? await encryptMessage(groupKey, t) : null }, "Description saved");
  }
  return (
    <div className="flex flex-col items-center text-center">
      <button type="button" onClick={() => pickPhoto.current?.click()} disabled={!groupKey || busy} className="group relative rounded-2xl" aria-label="Change group photo" title="Change group photo">
        {photo && photo !== "error" ? (
          <img src={photo} alt="" className="h-24 w-24 rounded-2xl object-cover" />
        ) : (
          <GroupMark name={g.name} size={96} />
        )}
        <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-panel bg-white text-black"><Camera size={15} /></span>
      </button>
      <input ref={pickPhoto} type="file" accept="image/*" hidden onChange={(e) => { void setPhoto(e.target.files?.[0]); e.target.value = ""; }} />
      {g.photo_id && <button onClick={() => save({ photoId: null }, "Group photo removed")} disabled={busy} className="mt-2 text-xs text-mute hover:text-white">Remove photo</button>}
      {editing === "name" ? (
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) void save({ name: name.trim() }, "Renamed"); }} className="mt-3 flex w-full gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
          <Button disabled={busy || !name.trim()}>Save</Button>
        </form>
      ) : (
        <button onClick={() => { setName(g.name); setEditing("name"); }} className="mt-3 flex items-center gap-1.5 text-xl font-semibold tracking-tight hover:text-white/80">
          {g.name} <Pencil size={14} className="text-mute" />
        </button>
      )}
      <div className="text-sm text-mute">Group · {feed.members.length} members</div>
      {editing === "desc" ? (
        <div className="mt-3 w-full text-left">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500} placeholder="What's this group for?" className="w-full rounded-xl border border-line bg-ink p-3 outline-none" autoFocus />
          <div className="mt-2 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
            <Button className="flex-1" disabled={busy} onClick={saveDesc}>Save</Button>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-mute"><Lock size={12} /> Encrypted. Only members can read it.</p>
        </div>
      ) : (
        <button onClick={() => { setText(desc ?? ""); setEditing("desc"); }} disabled={!groupKey} className="mt-3 w-full rounded-xl border border-line bg-ink px-3.5 py-2.5 text-left text-sm hover:border-white/20">
          {desc ? <span className="whitespace-pre-wrap text-white/90">{desc}</span> : <span className="text-mute">{g.description_ct && desc === null ? "Unlock to read the description" : "Add a group description"}</span>}
        </button>
      )}
    </div>
  );
}

/** Your own look for this chat: a background and mute. Saved for you only, on every device. */
function ChatLook({ feed, groupId, chatKey, onChange }: { feed: Omit<Feed, "messages">; groupId: number; chatKey: CryptoKey | null; onChange: () => void }) {
  const [wall, setWall] = useState<string | null>(feed.prefs?.wallpaper ?? null);
  const [muted, setMuted] = useState(!!feed.prefs?.muted);
  // A photo picked from this device, shown here to darken before it's encrypted and saved.
  const [picked, setPicked] = useState<{ url: string; bytes: Uint8Array } | null>(null);
  const photo = photoWallpaper(wall);
  const [dim, setDim] = useState(photo?.dim ?? 35);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pick = useRef<HTMLInputElement>(null);
  const photoUrl = useAttachment(photo?.id, chatKey, "image/jpeg");
  async function save(next: { wallpaper?: string | null; muted?: boolean }) {
    if (next.wallpaper !== undefined) setWall(next.wallpaper);
    if (next.muted !== undefined) setMuted(next.muted);
    await api(`/api/groups/${groupId}/prefs`, { method: "PUT", body: next }).catch((e) => setErr(e.message));
    onChange();
  }
  async function choose(file: File | undefined) {
    if (!file) return;
    setErr("");
    try {
      // Redrawn on a canvas first: smaller, and without the photo's location or camera details.
      const img = await shrinkImage(file, 1600, 0.8);
      setPicked({ url: URL.createObjectURL(img.blob), bytes: img.bytes });
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function usePicked() {
    if (!picked || !chatKey) return;
    setBusy(true);
    setErr("");
    try {
      // Encrypted with the chat's key on this device; the server only lets you download it back.
      const id = await uploadEncrypted("wallpaper", null, chatKey, picked.bytes);
      primeAttachment(id, picked.url);
      await save({ wallpaper: `photo:${id}:${dim}` });
      setPicked(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const swatches = [{ id: null, label: "Default" }, ...WALLPAPERS.map((w) => ({ id: w.id as string | null, label: w.label }))];
  const preview = picked?.url ?? (photo && photoUrl !== "error" ? photoUrl : null);
  return (
    <div>
      <div className="mb-2 text-sm font-semibold">Background</div>
      {picked || photo ? (
        <div className="mb-3 rounded-xl border border-line p-3">
          <div className="chat-wall flex aspect-[16/10] flex-col justify-end gap-1.5 rounded-lg p-3" style={wallpaperStyle(`photo:0:${dim}`, preview)}>
            <span className="max-w-[70%] self-start rounded-2xl bg-raised px-3 py-1.5 text-xs">Can you still read this?</span>
            <span className="max-w-[70%] self-end rounded-2xl bg-brand px-3 py-1.5 text-xs text-black">Looks good</span>
          </div>
          <label className="mt-3 flex items-center gap-3 text-xs text-mute">
            Darken
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={dim}
              onChange={(e) => setDim(Number(e.target.value))}
              onPointerUp={() => !picked && photo && dim !== photo.dim && save({ wallpaper: `photo:${photo.id}:${dim}` })}
              onKeyUp={() => !picked && photo && dim !== photo.dim && save({ wallpaper: `photo:${photo.id}:${dim}` })}
              className="flex-1 accent-[var(--color-brand)]"
              aria-label="Darken the photo"
            />
          </label>
          {picked ? (
            <div className="mt-3 flex gap-2">
              <Button className="flex-1" onClick={usePicked} disabled={busy || !chatKey}>{busy ? "Saving…" : "Use this photo"}</Button>
              <Button variant="ghost" onClick={() => setPicked(null)} disabled={busy}>Cancel</Button>
            </div>
          ) : (
            <div className="mt-3 flex gap-4 text-sm">
              <button type="button" onClick={() => pick.current?.click()} className="font-medium hover:underline">Choose another photo</button>
              <button type="button" onClick={() => save({ wallpaper: null })} className="text-mute hover:text-white">Remove</button>
            </div>
          )}
        </div>
      ) : null}
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => pick.current?.click()}
          disabled={!chatKey}
          className={`flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-[11px] font-medium ring-2 transition disabled:opacity-40 ${photo ? "border-transparent ring-brand" : "border-white/20 ring-transparent hover:border-white/40"}`}
          title={chatKey ? "Choose a photo from this device" : "Unlock your chats first"}
        >
          <Camera size={18} />
          Photo
        </button>
        {swatches.map((w) => (
          <button
            key={w.label}
            type="button"
            onClick={() => save({ wallpaper: w.id })}
            aria-pressed={wall === w.id}
            className={`chat-wall flex aspect-[3/4] items-end rounded-xl p-1.5 text-[11px] font-medium ring-2 transition ${wall === w.id ? "ring-brand" : "ring-transparent hover:ring-white/20"}`}
            style={wallpaperStyle(w.id)}
          >
            <span className="rounded-md bg-black/40 px-1.5 py-0.5">{w.label}</span>
          </button>
        ))}
      </div>
      <input ref={pick} type="file" accept="image/*" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
      {err && <p className="mt-2 text-sm text-down">{err}</p>}
      <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3 text-sm">
        <span>
          <span className="block font-medium">Mute this chat</span>
          <span className="text-xs text-mute">Unread messages show a grey badge instead of a bright one.</span>
        </span>
        <input type="checkbox" checked={muted} onChange={(e) => save({ muted: e.target.checked })} className="h-5 w-5 accent-[var(--color-brand)]" />
      </label>
    </div>
  );
}

function GroupSettings({ open, onClose, feed, groupId, keyRef, identity, onChange }: { open: boolean; onClose: () => void; feed: Omit<Feed, "messages">; groupId: number; keyRef: React.RefObject<{ key: CryptoKey; raw: Uint8Array } | null>; identity: CryptoKey | null; onChange: () => void }) {
  const [ctx, setCtx] = useState(feed.group.ai_context);
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState("");
  const [askLeave, setAskLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const router = useRouter();
  const { me, refresh } = useSession();
  const dm = !!feed.group.is_dm;
  const peer = dm ? feed.members.find((m) => m.id !== me?.user.id) : undefined;
  useEffect(() => setCtx(feed.group.ai_context), [feed.group.ai_context]);
  async function message(username: string) {
    if (!identity || !me) return setMsg("Unlock your chats first");
    setOpening(username);
    try {
      const dm = await openDm(identity, me.user.username, username);
      await warmChat(me.user.id, dm, identity);
      router.push(`/g/${dm}`);
      onClose();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setOpening(null);
    }
  }
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
    <Sheet open={open} onClose={onClose} title={dm ? "Private chat" : "Group info"}>
      <div className="space-y-5">
        {dm && peer ? (
          <div className="flex flex-col items-center text-center">
            <Avatar id={peer.id} name={peer.display_name} color={peer.color} size={96} />
            <div className="mt-3 text-xl font-semibold tracking-tight">{peer.display_name}</div>
            <Link href={`/u/${peer.username}`} className="text-sm text-mute hover:text-white">@{peer.username}</Link>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-mute"><Lock size={12} /> Only the two of you can read this chat. Nobody else can be added.</p>
          </div>
        ) : (
          <>
            <GroupProfile feed={feed} groupId={groupId} groupKey={keyRef.current?.key ?? null} onChange={onChange} say={setMsg} />
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
          </>
        )}
        <ChatLook feed={feed} groupId={groupId} chatKey={keyRef.current?.key ?? null} onChange={onChange} />
        <div className="grid grid-cols-2 gap-2 lg:hidden">
          <Link href={`/markets?g=${groupId}`} className="rounded-xl border border-line bg-ink px-3 py-2.5 text-sm font-medium hover:border-white/20">Markets</Link>
          <Link href={`/g/${groupId}/stats`} className="rounded-xl border border-line bg-ink px-3 py-2.5 text-sm font-medium hover:border-white/20">Leaderboard and insights</Link>
        </div>
        <div>
          <div className="mb-1 text-sm font-semibold">AI context</div>
          <p className="mb-2 text-xs text-mute">Shared with the AI to price stakes: term dates, exam weeks, fixtures, deadlines. Relevant chat messages are shared too, as set out in the <Link href="/terms#ai" className="text-brand hover:underline">Terms</Link>.</p>
          <textarea value={ctx} onChange={(e) => setCtx(e.target.value)} rows={4} placeholder="e.g. Autumn term ends 12 Dec. Exams 5–16 Jan. Results out 1 Jul." className="w-full rounded-xl border border-line bg-ink p-3 outline-none" />
          <Button variant="ghost" className="mt-2 w-full" onClick={saveCtx}>Save context</Button>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold">Members</div>
          {feed.members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-1.5">
              <Link href={`/u/${m.username}`} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-85">
                <Avatar id={m.id} name={m.display_name} color={m.color} size={34} />
                <span className="min-w-0 truncate">
                  {m.id === me?.user.id ? "You" : m.display_name} <span className="text-sm text-mute">@{m.username}</span>
                </span>
              </Link>
              <span className="flex shrink-0 items-center gap-1 text-xs text-mute" title={m.has_key ? "Has the chat key" : "Waiting for the chat key"}>{m.has_key ? <Check size={12} /> : <><Hourglass size={12} /> no key yet</>}</span>
              {!dm && m.id !== me?.user.id && (
                <button onClick={() => message(m.username)} disabled={opening === m.username} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[.06] px-3 py-1.5 text-xs font-medium hover:bg-white/10 disabled:opacity-50" title={`Message ${m.display_name} privately`}>
                  <Chat size={13} /> Message
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-line pt-4">
          {askLeave ? (
            <div className="space-y-3">
              <p className="text-sm text-mute">
                Leave {dm && peer ? `your chat with ${peer.display_name}` : feed.group.name}? You&apos;ll lose access to the chat and its key. Your positions stay and still settle. Open stakes about you are called off and refunded.
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
