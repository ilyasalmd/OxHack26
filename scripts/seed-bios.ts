/**
 * A short bio for every sample person and demo account, in keeping with the sample chats. Only
 * fills a bio that is still empty, so anything someone wrote themselves stays. Safe to run again:
 *
 *   npx tsx --env-file=.env.local scripts/seed-bios.ts
 */
import { getDb } from "../lib/db";

const BIOS: Record<string, string> = {
  ilyas: "Maths & Econ, second year. Flat 4B. Will bet on anything with a deadline.",
  aariz: "Flat 4B's washing-up rota, in theory. Spring weeks, run club, strong opinions.",
  durukan: "Econometrics enjoyer. Applying to everything. Finance Soc sponsorships.",
  barkin: "Sunday League striker, allegedly. Coursework always just in time.",
  stakesadmin: "Keeps the clock and the rules. Doesn't take sides.",
  jake: "Running late. Be there in 5.",
  sam: "Up at 6 for the gym. Sometimes.",
  maya: "Run club, 10k PBs and too many group chats.",
  priya: "Spring week hunting. Holds the receipts for every bet.",
  leo: "Stats problem sheets and Finance Soc. Always has the numbers.",
  chloe: "Economics, JPM applications and 7am runs.",
  omar: "Finance Soc. Says he'll pay you back Friday.",
  aisha: "Maths & Econ. The one who actually reads the lecture notes.",
  dan: "Sunday League. Shoots from anywhere.",
  tom: "Treasurer of everything. Keeper on Sundays.",
  zara: "Finance Soc events. Merch queen.",
  mum: "Sunday lunch is at 1. Don't be late.",
  dad: "Has lost his glasses again.",
  yasmin: "Driving lessons, FIFA and winding Zayn up.",
  zayn: "Training for a sub-25 5k. Replies eventually.",
  nadia: "Medicine, anatomy mocks and Paris plans.",
};

async function main() {
  const db = await getDb();
  let n = 0;
  for (const [username, bio] of Object.entries(BIOS)) {
    const rows = await db.query(`UPDATE users SET bio = $2 WHERE username = $1 AND bio = '' AND deleted_at IS NULL RETURNING id`, [username, bio]);
    n += rows.length;
  }
  console.log(`Wrote ${n} bios`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
