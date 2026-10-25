import crypto from "node:crypto";
import { Keypair, PublicKey, SendTransactionError, SystemInstruction, SystemProgram, Transaction, type Connection } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  decodeInstruction,
  isBurnInstruction,
  isCloseAccountInstruction,
  isInitializeAccount3Instruction,
  isMintToInstruction,
  isTransferInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";
import type { ChainConfig } from "../lib/solana";

/**
 * A small in-memory Solana for the outbox tests. It runs the instructions the outbox uses (system
 * create-with-seed, associated token accounts, SPL mint/burn/transfer/initialise/close, memo),
 * applies each transaction atomically, lets a signature land only once, and expires a blockhash
 * after 150 blocks like the real chain. Tests can make the network misbehave:
 *   nextSend = "land-then-throw"  the transaction lands, but the sender gets a network error
 *   nextSend = "drop"             the transaction never reaches the chain, sender gets an error
 *   forgetStatuses = true         the RPC answers "never heard of it" for every signature
 */
type Tok = { mint: string; owner: string; amount: bigint };
type Acc = { owner: string; lamports: number; token: Tok | null };
type Status = { slot: number; confirmations: number | null; err: unknown; confirmationStatus: "confirmed" | "finalized" | "processed" };

export class FakeChain {
  accounts = new Map<string, Acc>();
  statuses = new Map<string, Status>();
  blockhashes = new Map<string, number>(); // blockhash -> last valid height
  height = 1000;
  supply = BigInt(0);
  landed: string[] = [];
  nextSend: "ok" | "land-then-throw" | "drop" = "ok";
  forgetStatuses = false;

  constructor(public mint: PublicKey, public authority: PublicKey) {}

  advance(blocks: number) {
    this.height += blocks;
  }

  balanceOf(tokenAccount: PublicKey) {
    return Number(this.accounts.get(tokenAccount.toBase58())?.token?.amount ?? BigInt(0));
  }

  private fail(msg: string): never {
    throw Object.assign(new Error(msg), { logs: [msg] });
  }

  /** Runs every instruction, all or nothing. */
  private execute(tx: Transaction) {
    const before = new Map([...this.accounts].map(([k, v]) => [k, { ...v, token: v.token ? { ...v.token } : null }]));
    const supply = this.supply;
    try {
      for (const ix of tx.instructions) {
        const pid = ix.programId.toBase58();
        if (pid === SystemProgram.programId.toBase58()) {
          if (SystemInstruction.decodeInstructionType(ix) !== "CreateWithSeed") this.fail("unsupported system instruction");
          const p = SystemInstruction.decodeCreateWithSeed(ix);
          const addr = p.newAccountPubkey.toBase58();
          if (this.accounts.has(addr)) this.fail(`Create Account: account Address { address: ${addr}, base: Some(${p.basePubkey.toBase58()}) } already in use`);
          this.accounts.set(addr, { owner: p.programId.toBase58(), lamports: p.lamports, token: null });
        } else if (pid === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()) {
          const [, ata, owner, mint] = ix.keys.map((k) => k.pubkey.toBase58());
          if (!this.accounts.has(ata)) this.accounts.set(ata, { owner: TOKEN_PROGRAM_ID.toBase58(), lamports: 2039280, token: { mint, owner, amount: BigInt(0) } });
        } else if (pid === TOKEN_PROGRAM_ID.toBase58()) {
          const d = decodeInstruction(ix);
          const tok = (k: PublicKey) => this.accounts.get(k.toBase58())?.token ?? this.fail(`no token account ${k.toBase58()}`);
          const signed = (k: PublicKey) => ix.keys.some((x) => x.isSigner && x.pubkey.equals(k)) || this.fail("missing signature");
          if (isInitializeAccount3Instruction(d)) {
            const acc = this.accounts.get(d.keys.account.pubkey.toBase58()) ?? this.fail("no account to initialise");
            acc.token = { mint: d.keys.mint.pubkey.toBase58(), owner: d.data.owner.toBase58(), amount: BigInt(0) };
          } else if (isMintToInstruction(d)) {
            if (!d.keys.authority.pubkey.equals(this.authority)) this.fail("not the mint authority");
            signed(d.keys.authority.pubkey);
            tok(d.keys.destination.pubkey).amount += BigInt(d.data.amount);
            this.supply += BigInt(d.data.amount);
          } else if (isBurnInstruction(d)) {
            const t = tok(d.keys.account.pubkey);
            if (t.owner !== d.keys.owner.pubkey.toBase58()) this.fail("owner does not match");
            signed(d.keys.owner.pubkey);
            if (t.amount < BigInt(d.data.amount)) this.fail("insufficient funds");
            t.amount -= BigInt(d.data.amount);
            this.supply -= BigInt(d.data.amount);
          } else if (isTransferInstruction(d)) {
            const from = tok(d.keys.source.pubkey);
            if (from.owner !== d.keys.owner.pubkey.toBase58()) this.fail("owner does not match");
            signed(d.keys.owner.pubkey);
            if (from.amount < BigInt(d.data.amount)) this.fail("insufficient funds");
            from.amount -= BigInt(d.data.amount);
            tok(d.keys.destination.pubkey).amount += BigInt(d.data.amount);
          } else if (isCloseAccountInstruction(d)) {
            const t = tok(d.keys.account.pubkey);
            if (t.amount !== BigInt(0)) this.fail("non-native account can only be closed if its balance is zero");
            this.accounts.delete(d.keys.account.pubkey.toBase58());
          } else this.fail("unsupported token instruction");
        } else if (pid !== "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr") this.fail(`unknown program ${pid}`);
      }
    } catch (e) {
      this.accounts = before;
      this.supply = supply;
      throw e;
    }
  }

  private submit(raw: Uint8Array, skipPreflight: boolean) {
    const tx = Transaction.from(Buffer.from(raw));
    const sig = bs58.encode(tx.signature!);
    if (!tx.verifySignatures()) this.fail("signature verification failed");
    const lastValid = this.blockhashes.get(tx.recentBlockhash!);
    if (lastValid == null || this.height > lastValid) {
      throw new SendTransactionError({ action: "simulate", signature: sig, transactionMessage: "Blockhash not found", logs: [] });
    }
    // The same signature can only ever be processed once.
    if (this.statuses.has(sig)) return sig;
    try {
      this.execute(tx);
      this.statuses.set(sig, { slot: this.height, confirmations: null, err: null, confirmationStatus: "confirmed" });
      this.landed.push(sig);
    } catch (e) {
      const logs = (e as { logs?: string[] }).logs ?? [];
      if (!skipPreflight) throw new SendTransactionError({ action: "simulate", signature: sig, transactionMessage: `Transaction simulation failed: ${(e as Error).message}`, logs });
      // Without a pre-flight check a failing transaction still lands, as a failure, and moves nothing.
      this.statuses.set(sig, { slot: this.height, confirmations: null, err: { InstructionError: [0, (e as Error).message] }, confirmationStatus: "confirmed" });
    }
    return sig;
  }

  connection(): Connection {
    const self = this;
    const api = {
      async getMinimumBalanceForRentExemption(n: number) {
        return 890880 + n * 6960;
      },
      async getLatestBlockhash() {
        const blockhash = bs58.encode(crypto.randomBytes(32));
        const lastValidBlockHeight = self.height + 150;
        self.blockhashes.set(blockhash, lastValidBlockHeight);
        return { blockhash, lastValidBlockHeight };
      },
      async getBlockHeight() {
        return self.height;
      },
      async getAccountInfo(pk: PublicKey) {
        const a = self.accounts.get(pk.toBase58());
        return a ? { owner: new PublicKey(a.owner), lamports: a.lamports, data: Buffer.alloc(0), executable: false, rentEpoch: 0 } : null;
      },
      async getTokenAccountBalance(pk: PublicKey) {
        const t = self.accounts.get(pk.toBase58())?.token;
        if (!t) throw new Error("could not find account");
        return { context: { slot: self.height }, value: { amount: t.amount.toString(), decimals: 2, uiAmount: Number(t.amount) / 100 } };
      },
      async sendRawTransaction(raw: Uint8Array, opts?: { skipPreflight?: boolean }) {
        const mode = self.nextSend;
        self.nextSend = "ok";
        if (mode === "drop") throw new Error("fetch failed: socket hang up");
        const sig = self.submit(raw, !!opts?.skipPreflight);
        if (mode === "land-then-throw") throw new Error("fetch failed: connection reset");
        return sig;
      },
      async getSignatureStatuses(sigs: string[]) {
        return { context: { slot: self.height }, value: sigs.map((s) => (self.forgetStatuses ? null : self.statuses.get(s) ?? null)) };
      },
    };
    return api as unknown as Connection;
  }

  config(payer: Keypair): ChainConfig {
    return { connection: this.connection(), payer, mint: this.mint, cluster: "localnet" };
  }
}

/** A fresh mint whose authority is the payer, as `npm run solana:setup` makes. */
export function fakeChain() {
  const payer = Keypair.generate();
  const chain = new FakeChain(Keypair.generate().publicKey, payer.publicKey);
  return { chain, payer, cfg: chain.config(payer) };
}
