"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { Avatar, TopBar, fmt } from "@/components/ui";
import { ArrowUpRight, Check, Copy } from "@/components/icons";

type Detail = {
  signature: string;
  url: string;
  slot: number;
  time: string | null;
  ok: boolean;
  kind: "mint" | "burn" | "stake" | "payout" | "close" | "create" | "other";
  amount: number | null;
  memo: string | null;
  fee: number | null;
  owner: string | null;
  who: { name: string; color: string } | null;
  confirmations: string | null;
  blockhash: string;
  payer: string | null;
  programs: string[];
  token: { mint: string; decimals: number };
  network: string;
  event: { kind: string; memo: string | null; queuedAt: string; devnetUrl: string | null; market: { id: number; title: string | null; kind: string | null; status: string | null } | null } | null;
};

const KIND: Record<Detail["kind"], { label: string; tone: string; sign: string; what: string }> = {
  mint: { label: "Mint", tone: "text-up", sign: "+", what: "New coins sent to a wallet: an allowance or an opening balance." },
  burn: { label: "Burn", tone: "text-down", sign: "−", what: "Coins taken out of a wallet and destroyed: a friend bet, or what a finished stake's vault had left over." },
  stake: { label: "Stake", tone: "text-down", sign: "−", what: "Coins moved from a wallet into a stake's vault: a buy-in or a trading fee." },
  payout: { label: "Payout", tone: "text-up", sign: "+", what: "Coins paid from a stake's vault to a wallet: a sale, a win, a refund or listing fees. The house mints any shortfall into the vault first." },
  close: { label: "Close", tone: "text-brand", sign: "", what: "A finished stake's vault: what was left in it burned, and the account closed." },
  create: { label: "Create", tone: "text-brand", sign: "", what: "The token itself being created." },
  other: { label: "Other", tone: "text-mute", sign: "", what: "A transaction that touched the token without minting or burning." },
};
const PROGRAM: Record<string, string> = { "spl-token": "Token program", "spl-memo": "Memo program", "spl-associated-token-account": "Associated token account", system: "System program" };

export default function ChainTxPage() {
  const { sig } = useParams<{ sig: string }>();
  const { me } = useSession();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Detail>(`/api/chain/${sig}`).then(setD).catch((e) => setErr((e as Error).message));
  }, [sig]);
  if (!me) return null;
  if (!me.account.isAdmin) return <main className="p-10 text-center text-sm text-mute">The chain view is for the app&apos;s admin.</main>;
  const ticker = me.config.currency.ticker;
  const k = d ? KIND[d.kind] : null;

  return (
    <main className="flex min-h-dvh flex-col lg:min-h-full">
      <TopBar back="/chain" title="Transaction" backOnDesktop />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 lg:px-8">
        {err && <p className="mt-8 text-sm text-down">{err}</p>}
        {!d && !err && <p className="mt-8 text-sm text-mute">Reading the chain…</p>}
        {d && k && (
          <>
            <div className="mt-8 flex items-start gap-4">
              {d.who ? <Avatar name={d.who.name} color={d.who.color} size={44} /> : <div className="h-11 w-11 shrink-0 rounded-full bg-white/[.06]" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm text-mute">
                  {k.label} · {d.ok ? d.confirmations ?? "confirmed" : "failed"}{d.time ? ` · ${new Date(d.time).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
                </div>
                {d.amount != null ? (
                  <div className={`mt-1 text-4xl font-semibold tracking-tight tabular ${k.tone}`}>{k.sign}{fmt(d.amount)} <span className="text-lg font-medium text-mute">{ticker}</span></div>
                ) : (
                  <div className="mt-1 text-2xl font-semibold tracking-tight">{k.label}</div>
                )}
                <div className="mt-1 text-[15px]">
                  {d.who?.name ?? (d.owner ? "Someone outside your chats" : "Mint authority")}
                  {d.memo && <span className="text-mute"> · {d.memo}</span>}
                </div>
              </div>
            </div>

            {d.event?.market && (
              <Link href={`/m/${d.event.market.id}`} className="mt-6 flex items-center gap-3 rounded-2xl bg-panel px-4 py-3.5 hover:bg-white/[.06]">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-mute">{d.event.market.kind === "stock" ? "Stock" : "Bet"} this belongs to{d.event.market.status === "resolved" ? " · settled" : d.event.market.status === "void" ? " · called off" : ""}</div>
                  <div className="truncate text-[15px] font-medium">{d.event.market.title}</div>
                </div>
                <ArrowUpRight size={16} className="shrink-0 text-mute" />
              </Link>
            )}
            {d.event?.market && d.event.kind === "memo" && (
              <Link href={`/chain/pricing/${d.event.market.id}`} className="mt-2 flex items-center gap-3 rounded-2xl bg-panel px-4 py-3.5 hover:bg-white/[.06]">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-mute">Pricing record</div>
                  <div className="text-[15px] font-medium">How the AI set this price, and the hash in this memo</div>
                </div>
                <ArrowUpRight size={16} className="shrink-0 text-mute" />
              </Link>
            )}

            {d.event?.devnetUrl && (
              <a href={d.event.devnetUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-3 rounded-2xl bg-panel px-4 py-3.5 hover:bg-white/[.06]">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-mute">Public copy</div>
                  <div className="text-[15px] font-medium">The same transaction on Solana devnet, checkable by anyone</div>
                </div>
                <ArrowUpRight size={16} className="shrink-0 text-mute" />
              </a>
            )}

            <Field label="Signature" value={d.signature} mono copy />
            <Field label="Slot" value={d.slot.toLocaleString("en-GB")} />
            <Field label="Time" value={d.time ? new Date(d.time).toISOString() : "–"} mono />
            <Field label="Status" value={d.ok ? `Ok · ${d.confirmations ?? "confirmed"}` : "Failed"} />
            <Field label="Network" value={d.network === "localnet" ? "Local validator (your Mac)" : d.network} />
            <Field label={`${ticker} token mint`} value={d.token.mint} mono copy sub={`${d.token.decimals} decimals`} />
            {d.owner && <Field label="Wallet" value={d.owner} mono copy sub={d.who ? `${d.who.name}'s custodial wallet` : undefined} />}
            {d.payer && <Field label="Fee payer" value={d.payer} mono copy sub={d.fee != null ? `${d.fee} SOL network fee` : undefined} />}
            <Field label="Recent blockhash" value={d.blockhash} mono />
            <Field label="Programs" value={d.programs.map((p) => PROGRAM[p] ?? p).join(", ")} />
            {d.event && <Field label="App event" value={`${d.event.kind} queued ${new Date(d.event.queuedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`} sub={d.event.memo ?? undefined} />}

            <p className="mt-8 text-sm leading-relaxed text-mute">{k.what}</p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white/[.06] px-3.5 py-2 hover:bg-white/10">
                Open in Solana Explorer <ArrowUpRight size={14} />
              </a>
              <CopyButton text={`solana confirm -v ${d.signature} --url http://localhost:8899`} label="Copy verify command" />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Field({ label, value, sub, mono, copy }: { label: string; value: string; sub?: string; mono?: boolean; copy?: boolean }) {
  return (
    <div className="mt-5 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-mute">{label}</div>
        <div className={`mt-0.5 break-all text-[14px] ${mono ? "font-mono text-[13px]" : ""}`}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-mute">{sub}</div>}
      </div>
      {copy && <CopyButton text={value} />}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm text-mute hover:bg-white/10 hover:text-white ${label ? "bg-white/[.06]" : "mt-2"}`}
      aria-label={label ?? "Copy"}
      title={label ?? "Copy"}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {label && <span>{done ? "Copied" : label}</span>}
    </button>
  );
}
