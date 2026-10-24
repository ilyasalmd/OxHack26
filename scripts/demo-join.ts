/**
 * Puts every account that isn't in any sample chat into all of them (demo only).
 * New sign-ups get this automatically; this catches accounts made before that.
 *
 *   npm run demo:join
 */
import { getDb } from "../lib/db";
import { joinSampleGroups } from "../lib/demo";

async function main() {
  const db = await getDb();
  const users = await db.query<{ id: number; username: string }>(
    `SELECT u.id, u.username FROM users u
      WHERE u.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM group_members gm JOIN groups g ON g.id = gm.group_id
                         WHERE gm.user_id = u.id AND g.invite_code LIKE '%-demo')
      ORDER BY u.id`
  ).catch(() =>
    // Before the accounts migration there is no deleted_at column.
    db.query<{ id: number; username: string }>(
      `SELECT u.id, u.username FROM users u
        WHERE NOT EXISTS (SELECT 1 FROM group_members gm JOIN groups g ON g.id = gm.group_id
                           WHERE gm.user_id = u.id AND g.invite_code LIKE '%-demo')
        ORDER BY u.id`
    )
  );
  for (const u of users) console.log(`@${u.username}: joined ${await joinSampleGroups(u.id)} sample chats`);
  if (!users.length) console.log("Every account is already in the sample chats.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
