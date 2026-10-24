import { getDb } from "./db";
import { now } from "./clock";
import { HttpError, type User } from "./auth";
import { getMarket, vetoMarket, voidMarket } from "./markets";
import { REPORTS_TO_VOID, type ReportReason } from "./safety";

async function assertMember(groupId: number, userId: number) {
  const db = await getDb();
  const [m] = await db.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, userId]);
  if (!m) throw new HttpError(403, "You're not in this group");
}

/**
 * Report a situation. Two different members reporting it, or the person it's about, calls it off
 * and refunds everyone. Reporting twice counts once.
 */
export async function reportMarket(user: User, marketId: number, reason: ReportReason, note = "") {
  const db = await getDb();
  const m = await getMarket(db, marketId);
  await assertMember(m.group_id, user.id);
  const isSubject = m.subject_id === user.id;
  if (m.creator_id === user.id && !isSubject) throw new HttpError(400, "You posted this one. Ask a friend to report it if it needs to go.");
  await db.query(
    `INSERT INTO reports (reporter_id, group_id, market_id, target_user_id, reason, note, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
    [user.id, m.group_id, m.id, m.creator_id, reason, note.slice(0, 500), now()]
  );
  if (m.status !== "open") return { ok: true, voided: false };
  if (isSubject) {
    // The subject's report is their veto.
    const r = await vetoMarket(user, marketId);
    return { ok: true, voided: r.voided };
  }
  const [{ n }] = await db.query<{ n: number }>(`SELECT count(DISTINCT reporter_id)::int AS n FROM reports WHERE market_id = $1`, [marketId]);
  if (n < REPORTS_TO_VOID) return { ok: true, voided: false };
  const r = await voidMarket(marketId, {
    reason: "reports",
    actorId: null,
    text: `“${m.title}” was reported by ${n} members, so it was called off and everyone was refunded`,
  });
  return { ok: true, voided: r.voided };
}

/**
 * Report a chat message. The server cannot read chat, so the text is stored only when the reporter
 * chose to include it (messageText is then the decrypted text from their device).
 */
export async function reportMessage(user: User, groupId: number, messageId: number, reason: ReportReason, note = "", messageText?: string | null) {
  const db = await getDb();
  await assertMember(groupId, user.id);
  const [msg] = await db.query<{ id: number; user_id: number | null; kind: string }>(`SELECT id, user_id, kind FROM messages WHERE id = $1 AND group_id = $2`, [messageId, groupId]);
  if (!msg || msg.kind !== "chat") throw new HttpError(404, "Message not found");
  if (msg.user_id === user.id) throw new HttpError(400, "That's your own message");
  await db.query(
    `INSERT INTO reports (reporter_id, group_id, message_id, target_user_id, reason, note, message_text, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
    [user.id, groupId, messageId, msg.user_id, reason, note.slice(0, 500), messageText ? messageText.slice(0, 4000) : null, now()]
  );
  return { ok: true };
}
