"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { loadIdentity } from "@/lib/e2ee";
import { groupKey, shareKeyWithNewcomers } from "./groupkeys";

export type Me = {
  user: { id: number; username: string; display_name: string; color: string; balance: number; public_key: string; wallet_pubkey: string | null };
  netWorth: { balance: number; positions: number; total: number };
  maxStake: number;
  nextAllowanceAt: string;
  groups: { id: number; name: string; emoji: string; invite_code: string; members: number; open_markets: number; last: { kind: string; body: string | null; created_at: string; user_id: number | null; ciphertext: string | null; iv: string | null; author: string | null } | null;
    my_key: { wrapped_key: string; wrapper_public_key: string } | null;
  }[];
  clock: { now: string; offsetMs: number };
  pendingKeys: { group_id: number; wrapped_key: string; wrapper_public_key: string; members: { id: number; public_key: string; has_key: boolean }[] }[];
  account: { hasRecovery: boolean };
  config: {
    currency: { name: string; ticker: string };
    economy: { startingBalance: number; weeklyAllowance: number; maxStakeFraction: number; balanceFloor: number; stockFee: number; freeTrades: number };
    demo: boolean;
    gemini: boolean;
    solana: boolean;
    timescale: boolean;
    db: string;
    voice: boolean;
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

  return <SessionCtx.Provider value={{ me, loading, identity, setIdentity, refresh }}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);
