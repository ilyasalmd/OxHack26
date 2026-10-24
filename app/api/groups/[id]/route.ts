import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { price, isClosed, type MarketRow } from "@/lib/markets";
import { now } from "@/lib/clock";

// One poll endpoint for the chat screen: new messages, live prices, members and key handshakes.
export const GET = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const after = Number(req.nextUrl.searchParams.get("after") ?? 0);
  const db = await getDb();
  const [group] = await db.query(`SELECT id, name, emoji, invite_code, ai_context, created_by FROM groups WHERE id = $1`, [id]);
  const members = await db.query(
    `SELECT u.id, u.username, u.display_name, u.color, u.public_key, u.balance, (k.user_id IS NOT NULL) AS has_key
     FROM group_members gm JOIN users u ON u.id = gm.user_id
     LEFT JOIN group_keys k ON k.group_id = gm.group_id AND k.user_id = u.id
     WHERE gm.group_id = $1 ORDER BY u.balance DESC`,
    [id]
  );
  const [myKey] = await db.query(
    `SELECT k.wrapped_key, w.public_key AS wrapper_public_key FROM group_keys k JOIN users w ON w.id = k.wrapped_by WHERE k.group_id = $1 AND k.user_id = $2`,
    [id, user.id]
  );
  const messages = await db.query(
    `SELECT id::int, user_id, kind, ciphertext, iv, body, market_id, created_at FROM (
       SELECT * FROM messages WHERE group_id = $1 AND id > $2 ORDER BY id DESC LIMIT 200) t ORDER BY id`,
    [id, after]
  );
  const markets = await db.query<MarketRow>(`SELECT * FROM markets WHERE group_id = $1 ORDER BY created_at DESC`, [id]);
  return {
    group,
    members,
    myKey: myKey ?? null,
    messages,
    markets: markets.map((m) => ({
      id: m.id,
      title: m.title,
      kind: m.kind,
      category: m.category,
      subject_id: m.subject_id,
      creator_id: m.creator_id,
      status: m.status,
      outcome: m.outcome,
      closed: isClosed(m),
      price: price(m),
      open_prob: m.open_prob,
      resolves_at: m.resolves_at,
      volume: m.volume,
    })),
    now: now(),
  };
});

export const PATCH = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const b = await body(req, z.object({ aiContext: z.string().max(2000) }));
  const db = await getDb();
  await db.query(`UPDATE groups SET ai_context = $2 WHERE id = $1`, [id, b.aiContext]);
  await db.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1,$2,'system','updated the AI context (dates & deadlines)',$3)`, [id, user.id, now()]);
  return { ok: true };
});
