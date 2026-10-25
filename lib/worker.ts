import { getDb } from "./db";
import { runDecay } from "./markets";
import { drainChainOps } from "./outbox";

// In-process background loop: time decay for long-term stocks, friend bets that are due, and the Solana outbox.
// A pass never starts while the last one is still running: against a remote database a decay pass
// takes seconds, and overlapping passes used to queue up and starve every request of connections.
const g = globalThis as unknown as { __fsWorker?: NodeJS.Timeout; __fsWorkerBusy?: boolean; __fsDecayAt?: number };
const DECAY_EVERY_MS = 60_000;

export function ensureWorker() {
  // A second server on the same database (a test copy) leaves the background jobs to the live one.
  if (g.__fsWorker || process.env.FS_WORKER === "off") return;
  g.__fsWorker = setInterval(async () => {
    if (g.__fsWorkerBusy) return;
    g.__fsWorkerBusy = true;
    try {
      // Deadlines and decay move by the minute, so once a minute is plenty; the chain outbox runs every pass.
      if (Date.now() - (g.__fsDecayAt ?? 0) >= DECAY_EVERY_MS) {
        g.__fsDecayAt = Date.now();
        await runDecay(await getDb());
        await (await import("./friend-bet")).finaliseFriendBets(await getDb());
      }
      await drainChainOps();
    } catch (e) {
      console.warn("[worker]", (e as Error).message);
    } finally {
      g.__fsWorkerBusy = false;
    }
  }, 5000);
}
