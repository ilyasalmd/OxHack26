/**
 * Puts every real account into every sample chat it isn't in yet (demo only), so everyone sees
 * the synthetic history. The sample people stay in the chats their story puts them in. New sign-ups get this automatically; this catches existing accounts.
 * Real accounts join as guests: they see everything but are only listed to themselves.
 * Memberships parked earlier (group_members_parked) come back first with their original keys.
 *
 *   npm run demo:join
 */
import { getDb } from "../lib/db";
import { DEMO_DATA_FOR_ALL } from "../lib/config";
import { SAMPLE_GROUPS, joinSampleGroups } from "../lib/demo";
import { HUMANS, PEOPLE } from "./seed-content";

async function main() {
  if (!DEMO_DATA_FOR_ALL) throw new Error("DEMO_DATA_FOR_ALL is false, so accounts don't get the sample chats");
  const db = await getDb();
  const [parked] = await db.query<{ t: string | null }>(`SELECT to_regclass('group_keys_parked')::text AS t`);
  if (parked?.t) {
    const back = await db.query(
      `INSERT INTO group_members SELECT p.* FROM group_members_parked p JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
        ON CONFLICT DO NOTHING RETURNING user_id`
    );
    await db.query(
      `INSERT INTO group_keys SELECT k.* FROM group_keys_parked k
         JOIN group_members m ON m.group_id = k.group_id AND m.user_id = k.user_id
        ON CONFLICT DO NOTHING`
    );
    console.log(`Put back ${back.length} parked memberships`);
  }
  const users = await db.query<{ id: number; username: string }>(`SELECT id, username FROM users WHERE deleted_at IS NULL AND NOT (username = ANY($1)) ORDER BY id`,
    [PEOPLE.map((p) => p.username)]
  );
  let total = 0;
  for (const u of users) {
    const n = await joinSampleGroups(u.id);
    if (n) console.log(`@${u.username}: joined ${n} sample chats`);
    total += n;
  }
  if (!total) console.log("Every account is already in every sample chat.");
  // Real accounts are guests in the sample chats (only listed to themselves), so each chat keeps its own cast.
  // The teammates stay full members of the group chats seed-humans.ts put them in.
  const guests = await db.query(
    `UPDATE group_members gm SET guest = true FROM groups gr, users u
      WHERE gr.id = gm.group_id AND u.id = gm.user_id AND ${SAMPLE_GROUPS}
        AND NOT (u.username = ANY($1)) AND gm.user_id <> gr.created_by AND NOT gm.guest RETURNING gm.user_id`,
    [[...PEOPLE, ...HUMANS].map((p) => p.username)]
  );
  if (guests.length) console.log(`Marked ${guests.length} sample-chat memberships as guests`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
