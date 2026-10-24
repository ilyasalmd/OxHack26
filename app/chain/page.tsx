"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { Avatar, TopBar, ago, fmt } from "@/components/ui";
import { ArrowUpRight, Blocks, ChevronRight } from "@/components/icons";

type Tx = { signature: string; url: string; slot: number; time: string | null; ok: boolean; kind: string; amount: number | null; memo: string | null; fee: number | null; owner: string | null; who: { name: string; color: string } | null };
type Chain =
  | { enabled: false }
  | {
      enabled: true;
      network: { cluster: string; label: string; version: string; slot: number; epoch: number; tps: number | null };
      token: { mint: string; url: string; supply: number; decimals: number; authority: string };
      txs: Tx[];
      devnet: { mintUrl: string; published: number; total: number } | null;
    };

const short = (s: string, n = 4) => `${s.slice(0, n)}…${s.slice(-n)}`;
const KIND: Record<string, { label: string; tone: string; sign: string }> = {
  mint: { label: "Mint", tone: "text-up bg-up/10", sign: "+" },
  burn: { label: "Burn", tone: "text-down bg-down/10", sign: "−" },
  create: { label: "Create", tone: "text-brand bg-brand/10", sign: "" },
  other: { label: "Other", tone: "text-mute bg-white/5", sign: "" },
};

export default function ChainPage() {
  const { me } = useSession();
  const [c, setC] = useState<Chain | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const load = () => api<Chain>("/api/chain").then(setC).catch((e) => setErr((e as Error).message));
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);
  if (!me) return null;
  if (!me.account.isAdmin) return <main className="p-10 text-center text-sm text-mute">The chain view is for the app&apos;s admin.</main>;
  const ticker = me.config.currency.ticker;

  return (
    <main className="flex min-h-dvh flex-col lg:min-h-full">
      <TopBar back="/portfolio" title="Chain" />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 lg:px-8">
        <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-mute"><Blocks size={15} /> Solana</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight lg:text-3xl">Every stake and payout, on-chain</h1>
          </div>
          {c?.enabled && (
            <span className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-xs">
              <span className="relative flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-up/60" /><span className="relative h-2 w-2 rounded-full bg-up" /></span>
              {c.network.label} · v{c.network.version}
            </span>
          )}
        </div>

        {err && <p className="mt-6 text-sm text-down">{err}</p>}
        {!c && !err && <p className="mt-6 text-sm text-mute">Reading the chain…</p>}
        {c && !c.enabled && <p className="mt-6 text-sm text-mute">Chain sync is off on this server.</p>}

        {c?.enabled && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Slot" value={c.network.slot.toLocaleString("en-GB")} sub={`Epoch ${c.network.epoch}`} live />
              <Stat label="Throughput" value={c.network.tps == null ? "–" : `${c.network.tps} tx/s`} sub="whole network, last sample" />
              <Stat label={`${ticker} in circulation`} value={fmt(c.token.supply)} sub={`${c.token.decimals} decimals`} />
              <Stat label="Recent transactions" value={String(c.txs.length)} sub="for this token" />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
              <section className="overflow-hidden rounded-2xl border border-line">
                <div className="flex items-center justify-between bg-panel px-4 py-3">
                  <h2 className="text-sm font-semibold">Transactions</h2>
                  <span className="text-xs text-mute">read live from the RPC · tap one for its details</span>
                </div>
                <ul>
                  {c.txs.map((t) => {
                    const k = KIND[t.kind] ?? KIND.other;
                    return (
                      <li key={t.signature} className="border-t border-line">
                        <Link href={`/chain/${t.signature}`} className="group flex items-center gap-3 px-4 py-3 hover:bg-white/[.03]">
                          <span className={`w-14 shrink-0 rounded-md py-1 text-center text-[11px] font-semibold ${k.tone}`}>{k.label}</span>
                          {t.who ? <Avatar name={t.who.name} color={t.who.color} size={26} /> : <span className="h-[26px] w-[26px] shrink-0 rounded-full border border-line" />}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm">
                              <span className="font-medium">{t.who?.name ?? (t.owner ? short(t.owner) : "Mint authority")}</span>
                              {t.memo && <span className="text-mute"> · {t.memo}</span>}
                            </div>
                            <div className="flex gap-3 font-mono text-[11px] text-mute">
                              <span>{short(t.signature, 6)}</span>
                              <span className="hidden sm:inline">slot {t.slot.toLocaleString("en-GB")}</span>
                              {t.fee != null && <span className="hidden sm:inline">fee {t.fee} SOL</span>}
                            </div>
                          </div>
                          <div className="text-right">
                            {t.amount != null && <div className={`text-sm font-medium tabular ${t.kind === "mint" ? "text-up" : t.kind === "burn" ? "text-down" : ""}`}>{k.sign}{fmt(t.amount)}</div>}
                            <div className="text-[11px] text-mute">{t.ok ? (t.time ? ago(t.time) : "") : "failed"}</div>
                          </div>
                          <ChevronRight size={14} className="hidden shrink-0 text-mute group-hover:text-white sm:block" />
                        </Link>
                      </li>
                    );
                  })}
                  {!c.txs.length && <li className="border-t border-line px-4 py-8 text-center text-sm text-mute">No transactions yet. Place a trade and it appears here within seconds.</li>}
                </ul>
              </section>

              <aside className="space-y-4">
                <section className="rounded-2xl border border-line bg-panel p-4 text-sm">
                  <h2 className="font-semibold">The {ticker} token</h2>
                  <dl className="mt-3 space-y-2 text-xs">
                    <Row k="Mint address"><a href={c.token.url} target="_blank" rel="noreferrer" className="font-mono hover:text-white">{short(c.token.mint, 6)}</a></Row>
                    <Row k="Mint authority"><span className="font-mono">{short(c.token.authority, 6)}</span></Row>
                    <Row k="Standard">SPL Token</Row>
                    <Row k="Network">{c.network.label}</Row>
                  </dl>
                </section>
                {c.devnet && (
                  <section className="rounded-2xl border border-line bg-panel p-4 text-sm leading-relaxed text-mute">
                    <h2 className="mb-2 font-semibold text-white">Public copy on Solana devnet</h2>
                    <p>{c.devnet.published} of {c.devnet.total} transactions are also on public devnet, so anyone can check them without this server.</p>
                    <a href={c.devnet.mintUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-brand">The token on Solana Explorer <ArrowUpRight size={12} /></a>
                  </section>
                )}
                <section className="rounded-2xl border border-line bg-panel p-4 text-sm leading-relaxed text-mute">
                  <h2 className="mb-2 font-semibold text-white">What goes on-chain</h2>
                  <p>When you stake, the app burns that many {ticker} from your wallet. When you win or get your weekly allowance, it mints them back. Each one carries a short memo saying why.</p>
                  <p className="mt-2">Your chats, the odds and who bet what stay off-chain: chats are end-to-end encrypted and the market runs on the server. {ticker} is play money and can&apos;t be bought or sold.</p>
                  <Link href="/portfolio" className="mt-3 inline-flex items-center gap-1 text-brand">Your wallet <ArrowUpRight size={12} /></Link>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, sub, live }: { label: string; value: string; sub?: string; live?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="text-xs text-mute">{label}</div>
      <div key={live ? value : undefined} className={`mt-1.5 text-xl font-semibold tracking-tight tabular ${live ? "animate-[fade-up_.4s_ease-out]" : ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-mute">{sub}</div>}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-mute">{k}</dt>
      <dd className="text-right text-white/90">{children}</dd>
    </div>
  );
}
