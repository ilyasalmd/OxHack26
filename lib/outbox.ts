import crypto from "node:crypto";
import { Keypair, PublicKey, SendTransactionError, SystemProgram, Transaction, TransactionInstruction, type Connection } from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnInstruction,
  createCloseAccountInstruction,
  createInitializeAccount3Instruction,
  createMintToInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import { getDb, type Q } from "./db";
import { unseal } from "./secret";
import { CURRENCY } from "./config";
import { solanaConfig, type ChainConfig } from "./solana";

/*
 * The Solana outbox: sends each queued chain_ops row exactly once.
 *
 * What each kind does on chain:
 *   stake   coins move from the person's wallet into the stake's vault (a buy-in or a trading fee)
 *   payout  coins move from the vault back to a person (a sale, a payout, a refund, listing fees);
 *           if the vault holds less than it owes, the house mints the difference into it first
 *   close   the stake is finished: whatever is left in the vault is the house's and is burned,
 *           and the empty vault is closed
 *   mint    new coins for a person that no stake owes them (weekly allowance, opening balance)
 *   burn    coins leaving a person outside any stake (a friend bet)
 *   memo    a stake's opening terms or its result, as hashes
 *
 * Why this can't pay twice. "I didn't hear back" doesn't mean "it failed", so:
 *   1. The transaction is built, signed and saved (bytes + signature + the block height its
 *      blockhash expires at) BEFORE it is sent. From then on the row is 'sent'.
 *   2. A 'sent' row is never rebuilt while it might still land. The worker asks the chain about
 *      that signature: landed means done; still in time means send the SAME bytes again (a
 *      signature can only land once); failed on chain means it can safely be rebuilt.
 *   3. Only after the blockhash has expired (checked against the finalized block height) and the
 *      chain still has no record of the signature is a new transaction built.
 *   4. Backstop: every transaction first creates a tiny receipt account whose address comes from
 *      the operation's id. Solana refuses to create the same address twice, so even if steps 1-3
 *      were fooled, a second transaction for the same operation fails as a whole and moves nothing.
 */

const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const receiptsOn = () => process.env.SOLANA_OP_RECEIPTS !== "false";

export type OpKind = "mint" | "burn" | "stake" | "payout" | "close" | "memo";
export type Op = {
  id: number;
  kind: OpKind;
  amount: number | null;
  memo: string | null;
  market_id: number | null;
  wallet_pubkey: string | null;
  wallet_secret_enc: string | null;
};
type Row = Op & { status: string; signature: string | null; tx_raw: string | null; last_valid_height: string | number | null; attempts: number };

const toUnits = (amount: number) => BigInt(Math.round(amount * 10 ** CURRENCY.decimals));
const memoIx = (text: string, signer: PublicKey) =>
  new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [{ pubkey: signer, isSigner: true, isWritable: false }], data: Buffer.from(text.slice(0, 500), "utf8") });

/**
 * The ledger reason without the stake's words: "buy long · Jake is late" goes on chain as
 * "buy long · #12". The chain only ever holds amounts, addresses, ids and hashes.
 */
export const chainMemo = (op: Pick<Op, "memo" | "market_id">) => {
  const head = (op.memo ?? "").split(" · ")[0].trim();
  return op.market_id != null ? `${head} · #${op.market_id}` : head;
};

/**
 * A short random tag for this database, mixed into vault and receipt addresses. Market and op ids
 * restart when the database is re-seeded but the chain remembers, so without it a fresh database
 * would land on old vaults and receipts.
 */
export async function chainNamespace(q: Q) {
  const [row] = await q.query<{ value: string }>(`SELECT value FROM app_settings WHERE key = 'chain_ns'`);
  if (row) return row.value;
  const ns = crypto.randomBytes(4).toString("hex");
  await q.query(`INSERT INTO app_settings (key, value) VALUES ('chain_ns', $1) ON CONFLICT (key) DO NOTHING`, [ns]);
  return (await q.query<{ value: string }>(`SELECT value FROM app_settings WHERE key = 'chain_ns'`))[0].value;
}

/** The token account that holds a stake's coins while it is open. Anyone can derive it. */
export const vaultSeed = (ns: string, marketId: number) => `v${ns}-${marketId}`;
export const vaultFor = (cfg: Pick<ChainConfig, "payer">, ns: string, marketId: number) =>
  PublicKey.createWithSeed(cfg.payer.publicKey, vaultSeed(ns, marketId), TOKEN_PROGRAM_ID);
export const receiptSeed = (ns: string, opId: number) => `r${ns}-${opId}`;
export const receiptFor = (cfg: Pick<ChainConfig, "payer">, ns: string, opId: number) =>
  PublicKey.createWithSeed(cfg.payer.publicKey, receiptSeed(ns, opId), SystemProgram.programId);

async function vaultBalance(conn: Connection, vault: PublicKey) {
  const info = await conn.getAccountInfo(vault);
  if (!info) return null;
  const bal = await conn.getTokenAccountBalance(vault);
  return BigInt(bal.value.amount);
}

/** The instructions for one op, read against the chain as it is now. */
export async function buildOp(cfg: ChainConfig, op: Op, ns: string, opts: { receipts?: boolean } = {}) {
  const conn = cfg.connection;
  const house = cfg.payer.publicKey;
  const tx = new Transaction();
  const signers: Keypair[] = [cfg.payer];
  if (opts.receipts ?? receiptsOn()) {
    const seed = receiptSeed(ns, op.id);
    tx.add(
      SystemProgram.createAccountWithSeed({
        fromPubkey: house,
        basePubkey: house,
        seed,
        newAccountPubkey: await receiptFor(cfg, ns, op.id),
        lamports: await conn.getMinimumBalanceForRentExemption(0),
        space: 0,
        programId: SystemProgram.programId,
      })
    );
  }
  const note = op.memo ? memoIx(`friendstakes: ${chainMemo(op)}`, house) : null;
  if (op.kind === "memo") {
    tx.add(memoIx(op.memo ?? "", house));
    return { tx, signers };
  }

  const vault = op.market_id != null ? await vaultFor(cfg, ns, op.market_id) : null;
  const openVault = async () => {
    const bal = await vaultBalance(conn, vault!);
    if (bal != null) return bal;
    tx.add(
      SystemProgram.createAccountWithSeed({
        fromPubkey: house,
        basePubkey: house,
        seed: vaultSeed(ns, op.market_id!),
        newAccountPubkey: vault!,
        lamports: await conn.getMinimumBalanceForRentExemption(ACCOUNT_SIZE),
        space: ACCOUNT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccount3Instruction(vault!, cfg.mint, house)
    );
    return BigInt(0);
  };

  if (op.kind === "close") {
    if (!vault) throw new Error("close needs a stake");
    const bal = await vaultBalance(conn, vault);
    if (bal != null) {
      if (bal > BigInt(0)) tx.add(createBurnInstruction(vault, cfg.mint, house, bal));
      tx.add(createCloseAccountInstruction(vault, house, house));
    }
    if (note) tx.add(note);
    return { tx, signers };
  }

  if (!op.wallet_pubkey || !op.wallet_secret_enc) throw new Error("user has no wallet");
  const owner = new PublicKey(op.wallet_pubkey);
  const ata = getAssociatedTokenAddressSync(cfg.mint, owner);
  tx.add(createAssociatedTokenAccountIdempotentInstruction(house, ata, owner, cfg.mint));
  const units = toUnits(op.amount!);
  const userSigner = () => {
    const kp = Keypair.fromSecretKey(unseal(op.wallet_secret_enc!));
    signers.push(kp);
    return kp.publicKey;
  };
  if (op.kind === "mint") tx.add(createMintToInstruction(cfg.mint, ata, house, units));
  else if (op.kind === "burn") tx.add(createBurnInstruction(ata, cfg.mint, userSigner(), units));
  else if (op.kind === "stake") {
    if (!vault) throw new Error("stake needs a stake");
    await openVault();
    tx.add(createTransferInstruction(ata, vault, userSigner(), units));
  } else if (op.kind === "payout") {
    if (!vault) throw new Error("payout needs a stake");
    const bal = await openVault();
    // An automated market maker can owe winners more than was paid in; the house covers that.
    if (bal < units) tx.add(createMintToInstruction(cfg.mint, vault, house, units - bal));
    tx.add(createTransferInstruction(vault, ata, house, units));
  } else throw new Error(`unknown op kind ${op.kind}`);
  if (note) tx.add(note);
  return { tx, signers };
}

/** Builds and signs; nothing is sent. */
export async function signOp(cfg: ChainConfig, op: Op, ns: string, opts: { receipts?: boolean } = {}) {
  const { tx, signers } = await buildOp(cfg, op, ns, opts);
  const { blockhash, lastValidBlockHeight } = await cfg.connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = cfg.payer.publicKey;
  tx.sign(...signers);
  return { raw: tx.serialize(), signature: bs58.encode(tx.signature!), lastValidBlockHeight };
}

type Fate = "landed" | "failed" | "pending" | "expired";

/** What the chain knows about a signature we sent. */
export async function fateOf(conn: Connection, signature: string, lastValidHeight: number): Promise<{ fate: Fate; err?: string }> {
  const look = async () => (await conn.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
  const read = (st: Awaited<ReturnType<typeof look>>) =>
    !st ? null : st.err ? { fate: "failed" as const, err: JSON.stringify(st.err) } : st.confirmationStatus === "processed" ? { fate: "pending" as const } : { fate: "landed" as const };
  const first = read(await look());
  if (first) return first;
  // Finalized height: once even the finalized chain is past the blockhash's last valid height,
  // no block that could still hold this transaction can appear.
  const height = await conn.getBlockHeight("finalized");
  if (height <= lastValidHeight) return { fate: "pending" };
  // It may have landed in the last few blocks before the expiry: ask once more.
  return read(await look()) ?? { fate: "expired" };
}

async function waitFor(conn: Connection, signature: string, lastValidHeight: number, ms: number) {
  const until = Date.now() + ms;
  for (;;) {
    const f = await fateOf(conn, signature, lastValidHeight);
    if (f.fate !== "pending" || Date.now() >= until) return f;
    await new Promise((r) => setTimeout(r, 400));
  }
}

/** True when the node refused the transaction in its pre-flight check, so it was never broadcast. */
const refusedBeforeSending = (e: unknown) => e instanceof SendTransactionError && /simulat|preflight/i.test(e.message);
const logsOf = (e: unknown) => ((e as { logs?: string[] }).logs ?? []).join("\n") + " " + (e as Error).message;

export type DrainOpts = { limit?: number; confirmMs?: number; cfg?: ChainConfig | null };

let running = false;
/** Sends what is queued, oldest first. Stops at the first op whose fate is still unknown, so ops land in order. */
export async function drainChainOps(o: DrainOpts = {}) {
  const cfg = o.cfg === undefined ? solanaConfig() : o.cfg;
  if (running || !cfg) return;
  running = true;
  try {
    const db = await getDb();
    const ns = await chainNamespace(db);
    const ops = await db.query<Row>(
      `SELECT c.id, c.kind, c.amount, c.memo, c.market_id, c.status, c.signature, c.tx_raw, c.last_valid_height, c.attempts,
              u.wallet_pubkey, u.wallet_secret_enc
       FROM chain_ops c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.status IN ('pending', 'sent') ORDER BY c.id LIMIT $1`,
      [o.limit ?? 10]
    );
    for (const op of ops) if (!(await processOp(db, cfg, ns, op, o.confirmMs ?? 20_000))) break;
  } finally {
    running = false;
  }
}

const done = (db: Q, id: number, signature: string | null, note: string | null = null) =>
  db.query(`UPDATE chain_ops SET status = 'confirmed', signature = COALESCE($2, signature), error = $3, tx_raw = NULL WHERE id = $1`, [id, signature, note]);

/** Back to the queue to be rebuilt, which is only safe once we know the old transaction can't land. */
const retry = (db: Q, id: number, error: string) =>
  db.query(
    `UPDATE chain_ops SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END, error = $2,
       signature = NULL, tx_raw = NULL, last_valid_height = NULL WHERE id = $1`,
    [id, error.slice(0, 300)]
  );

/** Returns false to stop the drain (the chain is unreachable or this op's fate is unknown). */
async function processOp(db: Q, cfg: ChainConfig, ns: string, op: Row, confirmMs: number): Promise<boolean> {
  const conn = cfg.connection;
  try {
    if (op.status === "sent" && op.signature && op.last_valid_height != null) {
      const lastValid = Number(op.last_valid_height);
      const f = await fateOf(conn, op.signature, lastValid);
      if (f.fate === "landed") return (await done(db, op.id, op.signature), true);
      if (f.fate === "failed") return (await retry(db, op.id, `failed on chain: ${f.err}`), false);
      if (f.fate === "pending") {
        // Still in time: the very same bytes again. If the first copy already landed, this one is a duplicate the chain drops.
        await conn.sendRawTransaction(Buffer.from(op.tx_raw!, "base64"), { skipPreflight: true }).catch(() => {});
        const again = await waitFor(conn, op.signature, lastValid, confirmMs);
        if (again.fate === "landed") return (await done(db, op.id, op.signature), true);
        if (again.fate === "failed") return (await retry(db, op.id, `failed on chain: ${again.err}`), false);
        if (again.fate === "pending") return false;
      }
      // Expired and never landed: it can't land now, so build a fresh one below.
      await db.query(`UPDATE chain_ops SET status = 'pending', tx_raw = NULL, error = 'expired unsent, rebuilt' WHERE id = $1 AND status = 'sent'`, [op.id]);
    }

    // The receipt says this op already happened on chain (its signature was lost somewhere).
    if (receiptsOn() && (await conn.getAccountInfo(await receiptFor(cfg, ns, op.id)))) {
      return (await done(db, op.id, null, "already on chain (receipt found)"), true);
    }

    const signed = await signOp(cfg, op, ns);
    // Saved before sending, and only if nobody else claimed the row meanwhile.
    const claimed = await db.query(
      `UPDATE chain_ops SET status = 'sent', signature = $2, tx_raw = $3, last_valid_height = $4, sent_at = now(), attempts = attempts + 1
       WHERE id = $1 AND status = 'pending' RETURNING id`,
      [op.id, signed.signature, Buffer.from(signed.raw).toString("base64"), signed.lastValidBlockHeight]
    );
    if (!claimed.length) return false;
    try {
      await conn.sendRawTransaction(signed.raw, { skipPreflight: false, preflightCommitment: "confirmed" });
    } catch (e) {
      if (!refusedBeforeSending(e)) return false; // unknown: the row stays 'sent' and is checked next time
      const receipt = (await receiptFor(cfg, ns, op.id)).toBase58();
      if (receiptsOn() && logsOf(e).includes(receipt) && /already in use/.test(logsOf(e))) {
        return (await done(db, op.id, null, "already on chain (receipt found)"), true);
      }
      await retry(db, op.id, (e as Error).message);
      return false; // usually the payer is out of SOL; don't hammer the RPC
    }
    const f = await waitFor(conn, signed.signature, signed.lastValidBlockHeight, confirmMs);
    if (f.fate === "landed") return (await done(db, op.id, signed.signature), true);
    if (f.fate === "failed") return (await retry(db, op.id, `failed on chain: ${f.err}`), false);
    return false; // pending or expired: next drain decides, from the saved signature
  } catch (e) {
    // A network error anywhere above. A 'sent' row is left as it is; a 'pending' one was never sent.
    console.warn("[chain]", (e as Error).message.split("\n")[0]);
    return false;
  }
}

/**
 * The devnet copy (scripts/devnet-publish.ts) and other one-off sends: same build, but
 * sent and confirmed in one go. Receipts make a rerun after a lost answer fail instead of pay twice.
 */
export async function sendOpNow(cfg: ChainConfig, op: Op, ns: string, opts: { receipts?: boolean } = {}) {
  const s = await signOp(cfg, op, ns, opts);
  await cfg.connection.sendRawTransaction(s.raw, { preflightCommitment: "confirmed" });
  const f = await waitFor(cfg.connection, s.signature, s.lastValidBlockHeight, 60_000);
  if (f.fate !== "landed") throw new Error(f.fate === "failed" ? `failed on chain: ${f.err}` : "not confirmed yet");
  return s.signature;
}
