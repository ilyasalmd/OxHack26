import { getDb } from "./db";
import { runDecay } from "./markets";
import { drainChainOps } from "./outbox";

// In-process background loop: time decay for long-term stocks, friend bets that are due, and the Solana outbox.
const g = globalThis as unknown as { __fsWorker?: NodeJS.Timeout };

export function ensureWorker() {
  if (g.__fsWorker) return;
  g.__fsWorker = setInterval(async () => {
    try {
      await runDecay(await getDb());
      await (await import("./friend-bet")).finaliseFriendBets(await getDb());
      await drainChainOps();
    } catch (e) {
      console.warn("[worker]", (e as Error).message);
    }
  }, 5000);
}
