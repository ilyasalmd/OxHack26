import type { ConfirmedSignatureInfo, ParsedInstruction, ParsedTransactionWithMeta, PartiallyDecodedInstruction } from "@solana/web3.js";
import { explorer } from "./solana";

// What one Solana transaction means for the app's token: read from the parsed instructions, never
// from our database, so the Chain pages show what the chain itself recorded.

export type TxKind = "mint" | "burn" | "create" | "other";
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
  decimals: number
): TxSummary {
  const ixs = (tx?.transaction.message.instructions ?? []) as (ParsedInstruction | PartiallyDecodedInstruction)[];
  let kind: TxKind = "other";
  let amount: number | null = null;
  let memo: string | null = null;
  for (const ix of ixs) {
    if (!("parsed" in ix)) continue;
    if (ix.program === "spl-memo") memo = String(ix.parsed);
    if (ix.program === "spl-token" && ["mintTo", "mintToChecked", "burn", "burnChecked"].includes(ix.parsed?.type)) {
      kind = ix.parsed.type.startsWith("mint") ? "mint" : "burn";
      const info = ix.parsed.info;
      amount = Number(info.tokenAmount?.uiAmount ?? Number(info.amount) / 10 ** decimals);
    }
    if (ix.program === "spl-token" && ix.parsed?.type === "initializeMint") kind = "create";
  }
  const owner = tx?.meta?.postTokenBalances?.find((b) => b.mint === mint)?.owner ?? null;
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
