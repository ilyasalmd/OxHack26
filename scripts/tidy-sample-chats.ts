/**
 * One-off tidy for the live sample chats before the demo:
 *  - "Demo: punctuality" becomes "Friday Dinner Crew", so no chat looks like a demo.
 *  - The throwaway test accounts made on 24 Oct (all called some spelling of Ilyas) leave: their
 *    open stakes are called off with everyone refunded, their messages and those stakes' chat
 *    lines go, and the accounts are scrubbed the same way deleting an account in the app does.
 * Every row it removes is written to .data/tidy-sample-chats-backup.json first. Safe to run again.
 *
 *   npx tsx --env-file=.env.local scripts/tidy-sample-chats.ts             (rename only)
 *   npx tsx --env-file=.env.local scripts/tidy-sample-chats.ts --accounts  (and remove the test accounts)
 */
import fs from "node:fs";
import { getDb } from "../lib/db";
import { voidMarket } from "../lib/markets";
import { revokeSessions } from "../lib/sessions";

const NEW_NAME = "Friday Dinner Crew";
const TEST_ACCOUNTS = ["id526", "hahsdhfjfhrbebeb", "iwdheifheifbeif", "dihfihibduvbdfuvbv"];
const BACKUP = ".data/tidy-sample-chats-backup.json";

async function main() {
  const db = await getDb();
  const renamed = await db.query<{ id: number }>(
    `UPDATE groups SET name = $1 WHERE name = 'Demo: punctuality' AND invite_code LIKE 'demo-punctuality-%' RETURNING id`,
    [NEW_NAME]
  );
  for (const g of renamed)
    await db.query(`UPDATE messages SET body = $2 WHERE group_id = $1 AND kind = 'system' AND body = 'created Demo: punctuality'`, [g.id, `created ${NEW_NAME}`]);
  console.log(renamed.length ? `Renamed the punctuality chat to "${NEW_NAME}"` : "Punctuality chat already renamed");

  if (!process.argv.includes("--accounts")) process.exit(0);
  const users = await db.query<{ id: number; username: string }>(`SELECT id, username FROM users WHERE username = ANY($1::text[]) AND deleted_at IS NULL`, [TEST_ACCOUNTS]);
  if (!users.length) {
    console.log("Test accounts already gone");
    process.exit(0);
  }
  const ids = users.map((u) => u.id);
  const markets = await db.query<{ id: number; title: string }>(`SELECT id, title FROM markets WHERE creator_id = ANY($1::int[]) AND status = 'open'`, [ids]);
  for (const m of markets) await voidMarket(m.id, { reason: "reports", actorId: null, text: `called off “${m.title}”` });
  const marketIds = (await db.query<{ id: number }>(`SELECT id FROM markets WHERE creator_id = ANY($1::int[])`, [ids])).map((m) => m.id);

  const doomed = await db.query(`SELECT * FROM messages WHERE user_id = ANY($1::int[]) OR market_id = ANY($2::int[])`, [ids, marketIds]);
  const members = await db.query(`SELECT * FROM group_members WHERE user_id = ANY($1::int[])`, [ids]);
  const prev = fs.existsSync(BACKUP) ? JSON.parse(fs.readFileSync(BACKUP, "utf8")) : [];
  fs.writeFileSync(BACKUP, JSON.stringify([...prev, { at: new Date(), users, markets: marketIds, messages: doomed, members }], null, 1));

  await db.tx(async (q) => {
    await q.query(`DELETE FROM messages WHERE id = ANY($1::bigint[])`, [doomed.map((m) => m.id)]);
    for (const u of users) {
      await q.query(`DELETE FROM group_members WHERE user_id = $1`, [u.id]);
      await q.query(`DELETE FROM group_keys WHERE user_id = $1`, [u.id]);
      await q.query(`DELETE FROM profiles WHERE user_id = $1`, [u.id]);
      await revokeSessions(q, u.id);
      await q.query(`UPDATE chain_ops SET status = 'failed', error = 'account deleted' WHERE user_id = $1 AND status = 'pending'`, [u.id]);
      await q.query(
        `UPDATE users SET username = 'deleted-' || id, display_name = 'Deleted user', color = '#52525b',
           auth_hash = '', enc_private_key = '', key_salt = '', wallet_secret_enc = NULL,
           recovery_hash = NULL, recovery_salt = NULL, enc_private_key_recovery = NULL, deleted_at = $2
         WHERE id = $1`,
        [u.id, new Date()]
      );
    }
  });
  console.log(`Removed ${users.length} test accounts (${users.map((u) => u.username).join(", ")}), called off ${markets.length} stakes, removed ${doomed.length} messages`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
