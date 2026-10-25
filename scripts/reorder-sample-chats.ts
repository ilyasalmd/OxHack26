/**
 * Chats show messages in id order. seed-rich added its backdated stakes after seed-chats had
 * written months of conversation, so those stakes landed at the bottom of each sample chat with
 * dates jumping back and forth. This hands each sample chat's own message ids back out in date
 * order (the set of ids per chat stays the same, so read marks and other chats are untouched):
 *
 *   npx tsx --env-file=.env.local scripts/reorder-sample-chats.ts
 */
import fs from "node:fs";
import { getDb } from "../lib/db";

const IDS_FILE = ".data/seed-rich-ids.json";

async function main() {
  const db = await getDb();
  const groups = await db.query<{ id: number; name: string }>(
    `SELECT id, name FROM groups WHERE invite_code LIKE '%-demo' OR invite_code LIKE 'demo-punctuality-%' ORDER BY id`
  );
  const moved = new Map<number, number>();
  for (const g of groups) {
    const n = await db.tx(async (q) => {
      const rows = await q.query<{ id: string }>(`SELECT id FROM messages WHERE group_id = $1 ORDER BY created_at, id FOR UPDATE`, [g.id]);
      const ids = rows.map((r) => Number(r.id)).sort((a, b) => a - b);
      const pairs = rows.map((r, i) => [Number(r.id), ids[i]] as const).filter(([from, to]) => from !== to);
      if (!pairs.length) return 0;
      const from = pairs.map((p) => p[0]);
      const to = pairs.map((p) => p[1]);
      // Park on negative ids first so no two rows ever share an id mid-update.
      await q.query(`UPDATE messages SET id = -id WHERE id = ANY($1::bigint[])`, [from]);
      await q.query(
        `UPDATE messages m SET id = x.to_id FROM unnest($1::bigint[], $2::bigint[]) AS x(from_id, to_id) WHERE m.id = -x.from_id`,
        [from, to]
      );
      for (const [a, b] of pairs) moved.set(a, b);
      return pairs.length;
    });
    console.log(`${g.name}: ${n} messages moved into date order`);
  }
  // Keep seed-rich --undo pointing at the messages it actually added.
  if (fs.existsSync(IDS_FILE) && moved.size) {
    const ids = JSON.parse(fs.readFileSync(IDS_FILE, "utf8")) as { messages: number[] };
    ids.messages = ids.messages.map((id) => moved.get(id) ?? id);
    fs.writeFileSync(IDS_FILE, JSON.stringify(ids));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
