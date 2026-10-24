"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { loadIdentity, unwrapGroupKey, wrapGroupKey } from "@/lib/e2ee";
import { groupKey, shareKeyWithNewcomers } from "./groupkeys";
import { registerPhotos, setPhotoViewer, type PhotoInfo } from "./media";

export type Me = {
  user: { id: number; username: string; display_name: string; color: string; balance: number; public_key: string; wallet_pubkey: string | null };
  netWorth: { balance: number; positions: number; total: number };
  maxStake: number;
  nextAllowanceAt: string;
  groups: { id: number; name: string; emoji: string; invite_code: string; members: number; open_markets: number; unread: number; muted: boolean; last: { kind: string; body: string | null; created_at: string; user_id: number | null; ciphertext: string | null; iv: string | null; author: string | null } | null;
    my_key: { wrapped_key: string; wrapper_public_key: string } | null;
    is_dm?: boolean;
    photo_id?: number | null;
    /** A private chat's other person. */
    peer?: { id: number; username: string; display_name: string; color: string; public_key: string; avatar_id: number | null; avatar_key: string | null } | null;
  }[];
  /** Your profile photo, your profile key wrapped for you, and people who still need it wrapped for them. */
  photo?: { avatarId: number | null; key: string | null; missing: { id: number; public_key: string }[] };
  clock: { now: string; offsetMs: number };
  pendingKeys: { group_id: number; wrapped_key: string; wrapper_public_key: string; members: { id: number; public_key: string; has_key: boolean }[] }[];
  account: { hasRecovery: boolean; isAdmin: boolean; profilePending: boolean };
  config: {
    currency: { name: string; ticker: string };
    economy: { startingBalance: number; weeklyAllowance: number; maxStakeFraction: number; balanceFloor: number; stockFee: number; freeTrades: number };
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

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<CryptoKey | null>(null);
  const loadedFor = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const m = await api<Me>("/api/me");
      setMe(m);
      if (loadedFor.current !== m.user.id) {
        loadedFor.current = m.user.id;
        setIdentity(await loadIdentity(m.user.id));
      }
      return m;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
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
