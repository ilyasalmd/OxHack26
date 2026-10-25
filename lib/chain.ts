import type { ConfirmedSignatureInfo, ParsedInstruction, ParsedTransactionWithMeta, PartiallyDecodedInstruction } from "@solana/web3.js";
import { explorer } from "./solana";

// What one Solana transaction means for the app's token: read from the parsed instructions, never
// from our database, so the Chain pages show what the chain itself recorded.

export type TxKind = "mint" | "burn" | "stake" | "payout" | "close" | "create" | "other";
export type TxSummary = {
  signature: string;
  url: string;
  slot: number;
  time: string | null;
  ok: boolean;
  kind: TxKind;
  amount: number | null;
  memo: string | null;
  fee: number | null;
  owner: string | null;
};

export const stripMemo = (memo: string | null | undefined) => memo?.replace(/^(friendstakes|friend-stocks): /, "") ?? null;

export function describeTx(
  sig: Pick<ConfirmedSignatureInfo, "signature" | "slot" | "blockTime" | "err">,
  tx: ParsedTransactionWithMeta | null,
  mint: string,
  decimals: number,
  house: string | null = null
): TxSummary {
  const ixs = (tx?.transaction.message.instructions ?? []) as (ParsedInstruction | PartiallyDecodedInstruction)[];
  let kind: TxKind = "other";
  let amount: number | null = null;
  let memo: string | null = null;
  // A payout can top its vault up (a mint) before the transfer; the transfer is what the tx is about.
  const rank: Record<TxKind, number> = { other: 0, create: 1, mint: 2, burn: 2, close: 3, stake: 4, payout: 4 };
  const take = (k: TxKind, info?: { tokenAmount?: { uiAmount?: number }; amount?: string }) => {
    if (rank[k] < rank[kind]) return;
    kind = k;
    if (info) amount = Number(info.tokenAmount?.uiAmount ?? Number(info.amount) / 10 ** decimals);
  };
  for (const ix of ixs) {
    if (!("parsed" in ix)) continue;
    if (ix.program === "spl-memo") memo = String(ix.parsed);
    if (ix.program !== "spl-token") continue;
    const type = ix.parsed?.type as string;
    const info = ix.parsed?.info;
    if (["mintTo", "mintToChecked", "burn", "burnChecked"].includes(type)) take(type.startsWith("mint") ? "mint" : "burn", info);
    // Coins out of a stake's vault are signed by the house; coins into one by the person paying.
    if (type === "transfer" || type === "transferChecked") take(house && info?.authority === house ? "payout" : "stake", info);
    if (type === "closeAccount") take("close");
    if (type === "initializeMint") take("create");
  }
  const balances = tx?.meta?.postTokenBalances?.filter((b) => b.mint === mint) ?? [];
  const owner = (balances.find((b) => b.owner && b.owner !== house) ?? balances[0])?.owner ?? null;
  return {
    signature: sig.signature,
    url: explorer(sig.signature),
    slot: sig.slot,
    time: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : null,
    ok: !sig.err,
    kind,
    amount,
    memo: stripMemo(memo),
    fee: tx?.meta ? tx.meta.fee / 1e9 : null,
    owner,
  };
}
