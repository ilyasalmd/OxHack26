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
  const [group] = await db.query(`SELECT id, name, emoji, invite_code, ai_context, ai_reads_chat, created_by FROM groups WHERE id = $1`, [id]);
  const members = await db.query(
    `SELECT u.id, u.username, u.display_name, u.color, u.public_key, u.balance, u.subject_policy, (k.user_id IS NOT NULL) AS has_key
     FROM group_members gm JOIN users u ON u.id = gm.user_id
     LEFT JOIN group_keys k ON k.group_id = gm.group_id AND k.user_id = u.id
     WHERE gm.group_id = $1 ORDER BY u.balance DESC`,
    [id]
  );
  const [myKey] = await db.query(
    `SELECT k.wrapped_key, w.public_key AS wrapper_public_key FROM group_keys k JOIN users w ON w.id = k.wrapped_by WHERE k.group_id = $1 AND k.user_id = $2`,
    [id, user.id]
  );
  // People who left still wrote some of the chat; the page needs their name and colour, not their keys.
  const former = await db.query(
    `SELECT DISTINCT u.id, u.username, u.display_name, u.color FROM messages m JOIN users u ON u.id = m.user_id
     WHERE m.group_id = $1 AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = $1 AND gm.user_id = u.id)`,
    [id]
  );
  // A message you reported is hidden for you from then on.
  const messages = await db.query(
    `SELECT id::int, user_id, kind, ciphertext, iv, body, market_id, created_at FROM (
       SELECT * FROM messages m WHERE group_id = $1 AND id > $2
         AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.reporter_id = $3 AND r.message_id = m.id)
       ORDER BY id DESC LIMIT 200) t ORDER BY id`,
    [id, after, user.id]
  );
  const markets = await db.query<MarketRow>(`SELECT * FROM markets WHERE group_id = $1 ORDER BY created_at DESC`, [id]);
  return {
    group,
    members,
    former,
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
      proposed_outcome: m.proposed_outcome,
      proposed_by: m.proposed_by,
      proposed_at: m.proposed_at,
      void_reason: m.void_reason,
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
  const b = await body(req, z.object({ aiContext: z.string().max(2000).optional(), aiReadsChat: z.boolean().optional() }));
  const db = await getDb();
  const say = (text: string) =>
    db.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1,$2,'system',$3,$4)`, [id, user.id, text, now()]);
  if (b.aiContext !== undefined) {
    await db.query(`UPDATE groups SET ai_context = $2 WHERE id = $1`, [id, b.aiContext]);
    await say("updated the AI context (dates & deadlines)");
  }
  if (b.aiReadsChat !== undefined) {
    const changed = await db.query(`UPDATE groups SET ai_reads_chat = $2 WHERE id = $1 AND ai_reads_chat <> $2 RETURNING id`, [id, b.aiReadsChat]);
    // Announced to everyone, because it changes what leaves their phones.
    if (changed.length)
      await say(
        b.aiReadsChat
          ? "turned ON “AI reads relevant chat”: when pricing, apps may share up to 20 matching messages with the AI, names and contact details removed"
          : "turned OFF “AI reads relevant chat”: no chat text is shared with the AI"
      );
  }
  return { ok: true };
});
