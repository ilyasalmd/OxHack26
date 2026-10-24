import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { price, isClosed, voteState, type MarketRow, type VoteState } from "@/lib/markets";
import { now } from "@/lib/clock";
import { AVATAR_COLS, whoIsTyping } from "@/lib/chat";

// One poll endpoint for the chat screen: new messages, live prices, members and key handshakes.
export const GET = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const after = Number(req.nextUrl.searchParams.get("after") ?? 0) || 0;
  // `read`: the newest message this app has on screen with the chat in view (anything above the
  // newest message means all of it).
  const read = Number(req.nextUrl.searchParams.get("read") ?? 0) || 0;
  const db = await getDb();
  // These reads don't depend on each other, so they go to the database together, not one after another.
  const [[group], members, [prefs], [myKey], former, messages, markets] = await Promise.all([
    db.query(
      `SELECT id, name, emoji, invite_code, ai_context, ai_reads_chat, created_by, is_dm, description_ct, description_iv, photo_id::int AS photo_id FROM groups WHERE id = $1`,
      [id]
    ),
    db.query(
      `SELECT u.id, u.username, u.display_name, u.color, u.public_key, u.balance, u.subject_policy, (k.user_id IS NOT NULL) AS has_key,
         ${AVATAR_COLS("u", "$2")}, gm.delivered_upto::int AS delivered_upto, gm.read_upto::int AS read_upto
       FROM group_members gm JOIN users u ON u.id = gm.user_id
       LEFT JOIN group_keys k ON k.group_id = gm.group_id AND k.user_id = u.id
       WHERE gm.group_id = $1 AND (NOT gm.guest OR gm.user_id = $2) ORDER BY u.balance DESC`,
      [id, user.id]
    ),
    db.query<{ wallpaper: string | null; muted: boolean }>(`SELECT wallpaper, muted FROM group_members WHERE group_id = $1 AND user_id = $2`, [id, user.id]),
    db.query(
      `SELECT k.wrapped_key, w.public_key AS wrapper_public_key FROM group_keys k JOIN users w ON w.id = k.wrapped_by WHERE k.group_id = $1 AND k.user_id = $2`,
      [id, user.id]
    ),
    // People who left (or guests, who aren't listed) still wrote some of the chat; the page needs their name and colour, not their keys.
    db.query(
      `SELECT DISTINCT u.id, u.username, u.display_name, u.color FROM messages m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = $1 AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = $1 AND gm.user_id = u.id AND (NOT gm.guest OR gm.user_id = $2))`,
      [id, user.id]
    ),
    // A message you reported is hidden for you from then on.
    db.query(
      `SELECT id::int, user_id, kind, ciphertext, iv, body, market_id, created_at FROM (
         SELECT * FROM messages m WHERE group_id = $1 AND id > $2
           AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.reporter_id = $3 AND r.message_id = m.id)
         ORDER BY id DESC LIMIT 200) t ORDER BY id`,
      [id, after, user.id]
    ),
    db.query<MarketRow>(`SELECT * FROM markets WHERE group_id = $1 ORDER BY created_at DESC`, [id]),
  ]);
  // Ticks: whatever this app just fetched is delivered; what it says is on screen is read.
  const newest = messages.length ? (messages[messages.length - 1] as { id: number }).id : 0;
  if (newest || read)
    await db.query(
      `UPDATE group_members gm SET delivered_upto = GREATEST(gm.delivered_upto, LEAST(GREATEST($3::bigint, $4::bigint), x.top)), read_upto = GREATEST(gm.read_upto, LEAST($4::bigint, x.top))
       FROM (SELECT coalesce(max(id), 0) AS top FROM messages WHERE group_id = $1) x
       WHERE gm.group_id = $1 AND gm.user_id = $2
         AND (gm.read_upto < LEAST($4::bigint, x.top) OR gm.delivered_upto < LEAST(GREATEST($3::bigint, $4::bigint), x.top))`,
      [id, user.id, newest, read]
    );
  // The vote on each proposed result, for the card in the chat.
  const votes = new Map<number, VoteState>();
  for (const m of markets) if (m.status === "open" && m.proposed_outcome != null) votes.set(m.id, await voteState(db, m));
  return {
    group,
    members,
    former,
    myKey: myKey ?? null,
    prefs: prefs ?? { wallpaper: null, muted: false },
    messages,
    typing: whoIsTyping(id, user.id),
    markets: markets.map((m) => ({
      id: m.id,
      title: m.title,
      kind: m.kind,
      answer: m.answer,
      line: m.line,
      unit: m.unit,
      category: m.category,
      subject_id: m.subject_id,
      creator_id: m.creator_id,
      status: m.status,
      outcome: m.outcome,
      proposed_outcome: m.proposed_outcome,
      proposed_by: m.proposed_by,
      proposed_at: m.proposed_at,
      // Once the deadline passes, an early claim is handled like any other proposal.
      proposed_early: m.proposed_early && new Date(m.resolves_at) > now(),
      void_reason: m.void_reason,
      votes: votes.has(m.id)
        ? (({ eligible, needed, confirms, rejects }) => ({ needed, confirms: confirms.length, rejects: rejects.length, canVote: eligible.includes(user.id), mine: confirms.includes(user.id) ? true : rejects.includes(user.id) ? false : null }))(votes.get(m.id)!)
        : null,
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
  const b = await body(
    req,
    z.object({
      aiContext: z.string().max(2000).optional(),
      aiReadsChat: z.boolean().optional(),
      name: z.string().trim().min(1).max(40).optional(),
      // Encrypted with the group key in the browser, like a message. null clears it.
      description: z.object({ ciphertext: z.string().min(8).max(4000), iv: z.string().min(8).max(64) }).nullable().optional(),
      photoId: z.number().int().nullable().optional(),
    })
  );
  const db = await getDb();
  const [g] = await db.query<{ is_dm: boolean }>(`SELECT is_dm FROM groups WHERE id = $1`, [id]);
  const say = (text: string) =>
    db.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1,$2,'system',$3,$4)`, [id, user.id, text, now()]);
  if (b.aiContext !== undefined) {
    await db.query(`UPDATE groups SET ai_context = $2 WHERE id = $1`, [id, b.aiContext]);
    await say("updated the AI context (dates & deadlines)");
  }
  if (g.is_dm && (b.name !== undefined || b.description !== undefined || b.photoId !== undefined)) throw new HttpError(400, "A private chat shows the other person's name and photo");
  if (b.name !== undefined) {
    await db.query(`UPDATE groups SET name = $2 WHERE id = $1`, [id, b.name]);
    await say(`renamed the group to “${b.name}”`);
  }
  if (b.description !== undefined) {
    await db.query(`UPDATE groups SET description_ct = $2, description_iv = $3 WHERE id = $1`, [id, b.description?.ciphertext ?? null, b.description?.iv ?? null]);
    await say(b.description ? "changed the group description" : "removed the group description");
  }
  if (b.photoId !== undefined) {
    if (b.photoId !== null) {
      const [a] = await db.query(`SELECT 1 FROM attachments WHERE id = $1 AND group_id = $2 AND kind = 'group_photo'`, [b.photoId, id]);
      if (!a) throw new HttpError(400, "Upload the photo first");
    }
    await db.query(`UPDATE groups SET photo_id = $2 WHERE id = $1`, [id, b.photoId]);
    await say(b.photoId ? "changed the group photo" : "removed the group photo");
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
