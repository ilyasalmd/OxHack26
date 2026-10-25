"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { forgetIdentities, loadIdentity, unwrapGroupKey, wrapGroupKey } from "@/lib/e2ee";
import { groupKey, shareKeyWithNewcomers } from "./groupkeys";
import { registerPhotos, setPhotoViewer, type PhotoInfo } from "./media";
import { clearCache, lastUser, meKey, readCache, rememberUser, writeCache } from "./chat/store";

export type Me = {
  user: { id: number; username: string; display_name: string; color: string; balance: number; public_key: string; wallet_pubkey: string | null };
  netWorth: { balance: number; positions: number; total: number };
  maxStake: number;
  nextAllowanceAt: string;
  groups: { id: number; name: string; emoji: string; invite_code: string; members: number; open_markets: number; unread: number; muted: boolean; last: { kind: string; body: string | null; created_at: string; user_id: number | null; ciphertext: string | null; iv: string | null; deleted?: boolean; author: string | null } | null;
    my_key: { wrapped_key: string; wrapper_public_key: string } | null;
    is_dm?: boolean;
    photo_id?: number | null;
    /** A private chat's other person. */
    peer?: { id: number; username: string; display_name: string; color: string; public_key: string; avatar_id: number | null; avatar_key: string | null } | null;
  }[];
  /** Your profile photo, your profile key wrapped for you, and people who still need it wrapped for them. */
  photo?: { avatarId: number | null; key: string | null; missing: { id: number; public_key: string }[] };
  clock: { now: string; offsetMs: number };
  /** Fingerprint of everything else here, sent back so an unchanged list costs a few bytes. */
  etag?: string;
  pendingKeys: { group_id: number; wrapped_key: string; wrapper_public_key: string; members: { id: number; public_key: string; has_key: boolean }[] }[];
  account: { hasRecovery: boolean; isAdmin: boolean; profilePending: boolean };
  config: {
    currency: { name: string; ticker: string };
    economy: { startingBalance: number; weeklyAllowance: number; maxStakeFraction: number; balanceFloor: number; stockFee: number; freeTrades: number };
    bookmaker: { vig: number };
    demo: boolean;
    ai: boolean;
    solana: boolean;
    timescale: boolean;
    db: string;
  };
};

type Ctx = {
  me: Me | null;
  loading: boolean;
  identity: CryptoKey | null;
  setIdentity: (k: CryptoKey | null) => void;
  refresh: () => Promise<Me | null>;
};

const SessionCtx = createContext<Ctx>(null as unknown as Ctx);

/**
 * Every fresh open of the app (a new tab or window, or a link opened again) starts signed out, so
 * whoever is holding the phone picks the account and presses Log in; a saved password only fills
 * the form. Reloading or moving around inside the open tab keeps you signed in.
 */
let openedFresh: boolean | null = null;
function isFreshOpen() {
  if (openedFresh === null) {
    try {
      openedFresh = !sessionStorage.getItem("fs_open");
      sessionStorage.setItem("fs_open", "1");
    } catch {
      openedFresh = false;
    }
  }
  return openedFresh;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<CryptoKey | null>(null);
  const loadedFor = useRef<number | null>(null);

  // The server's answer always wins over anything drawn from the device cache.
  const fresh = useRef(false);

  const meRef = useRef<Me | null>(null);
  meRef.current = me;

  const refresh = useCallback(async () => {
    try {
      // Send what we already have; the server answers "unchanged" (a few bytes) when nothing moved.
      const have = meRef.current?.etag;
      const r = await api<Me | { unchanged: true; etag: string; clock: Me["clock"] }>(`/api/me${have ? `?etag=${encodeURIComponent(have)}` : ""}`);
      fresh.current = true;
      if ("unchanged" in r) {
        const cur = meRef.current;
        if (cur) {
          // Only the clock moved: keep everything else as it is, so nothing redraws for no reason.
          const next = { ...cur, clock: r.clock };
          meRef.current = next;
          setMe(next);
          return next;
        }
        return null;
      }
      const m = r;
      setMe(m);
      if (loadedFor.current !== m.user.id) {
        // Someone else's cache must not be shown to this account.
        if (loadedFor.current != null) await clearCache();
        loadedFor.current = m.user.id;
        setIdentity(await loadIdentity(m.user.id));
      }
      rememberUser(m.user.id);
      void writeCache(meKey(m.user.id), m);
      return m;
    } catch (e) {
      fresh.current = true;
      // No signal (a tunnel, a flaky hotspot): keep showing what we have rather than logging out.
      if (!(e instanceof ApiError)) return null;
      setMe(null);
      // Signed out: nothing of the last account stays on this device.
      if (loadedFor.current != null) {
        loadedFor.current = null;
        setIdentity(null);
        await clearCache();
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Draw the last known chat list (and unlock the identity key) straight from the device while
  // the first /api/me is in flight, so a reload doesn't start from an empty screen.
  useEffect(() => {
    const uid = lastUser();
    if (!uid || isFreshOpen()) return;
    let alive = true;
    (async () => {
      const [cached, key] = await Promise.all([readCache<Me>(meKey(uid)), loadIdentity(uid)]);
      if (!alive || fresh.current || loadedFor.current != null) return;
      if (cached && cached.user?.id === uid) {
        loadedFor.current = uid;
        setMe(cached);
        setIdentity(key);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const signedOut = isFreshOpen()
      ? Promise.all([api("/api/auth/logout", { method: "POST" }).catch(() => {}), forgetIdentities().catch(() => {}), clearCache().catch(() => {})])
      : Promise.resolve();
    void signedOut.then(refresh);
    const t = setInterval(() => void signedOut.then(refresh), 5000);
    // Coming back to the tab (or the phone waking up) catches up at once rather than on the next tick.
    const wake = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [refresh]);

  useEffect(() => {
    if (!identity || !me?.pendingKeys.length) return;
    for (const p of me.pendingKeys) {
      groupKey(p.group_id, identity, p)
        .then((k) => k && shareKeyWithNewcomers(p.group_id, identity, k.raw, p.members))
        .catch(() => {});
    }
  }, [identity, me]);

  // Profile photos: everyone's <Avatar id> decrypts with this device's identity key.
  useEffect(() => setPhotoViewer(identity), [identity]);
  useEffect(() => {
    if (!me) return;
    const people: PhotoInfo[] = me.groups.flatMap((g) => (g.peer ? [g.peer] : []));
    if (me.photo) people.push({ id: me.user.id, avatar_id: me.photo.avatarId, avatar_key: me.photo.key, public_key: me.user.public_key });
    registerPhotos(people);
  }, [me]);
  // Anyone you share a chat with gets your profile key, wrapped for them on this device.
  const photoMissing = me?.photo?.missing.map((m) => m.id).join(",");
  useEffect(() => {
    const p = me?.photo;
    if (!identity || !me || !p?.key || !p.missing.length) return;
    unwrapGroupKey(p.key, identity, me.user.public_key)
      .then(async (raw) => {
        const keys = await Promise.all(p.missing.map(async (m) => ({ viewerId: m.id, wrapped: await wrapGroupKey(raw, identity, m.public_key) })));
        await api("/api/profile/avatar/keys", { body: { keys } });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the set of people changes
  }, [identity, photoMissing]);

  return <SessionCtx.Provider value={{ me, loading, identity, setIdentity, refresh }}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);
