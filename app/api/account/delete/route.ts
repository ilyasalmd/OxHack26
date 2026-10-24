import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { COOKIE, HttpError, route } from "@/lib/auth";
import { body } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { now } from "@/lib/clock";
import { checkAuthKey } from "@/lib/accounts";
import { revokeSessions } from "@/lib/sessions";
import { callOffSituationsAbout } from "@/lib/markets";

// Delete the account. The row stays, scrubbed, because trades, positions and old messages
// point at it and the markets have to keep adding up. The public key stays too: group keys
// this person wrapped for others can only be opened with it.
export const POST = route(async (req, user) => {
  limit(`account-change:${user.id}`, 5, 3600);
  const b = await body(req, z.object({ authKey: z.string().length(64), confirm: z.string() }));
  if (b.confirm.trim().replace(/^@/, "").toLowerCase() !== user.username) throw new HttpError(400, "Type your username exactly to confirm");
  const db = await getDb();
  await checkAuthKey(db, user.id, b.authKey);
  const t = new Date();
  // Situations about them stop before the scrub, with stakes refunded, as the privacy notice promises.
  await callOffSituationsAbout(user.id, user.display_name);
  await db.tx(async (q) => {
    const groups = await q.query<{ group_id: number }>(`SELECT group_id FROM group_members WHERE user_id = $1`, [user.id]);
    for (const g of groups)
      await q.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1, NULL, 'system', $2, $3)`, [g.group_id, `${user.display_name} left`, now()]);
    await q.query(`DELETE FROM group_members WHERE user_id = $1`, [user.id]);
    await q.query(`DELETE FROM group_keys WHERE user_id = $1`, [user.id]);
    await revokeSessions(q, user.id);
    // The name is held for 30 days like a rename, so nobody can take it to pose as them.
    await q.query(`INSERT INTO username_history (user_id, old_username, changed_at) VALUES ($1,$2,$3)`, [user.id, user.username, t]);
    // Without the wallet secret, queued burns for this wallet can never be signed.
    await q.query(`UPDATE chain_ops SET status = 'failed', error = 'account deleted' WHERE user_id = $1 AND status = 'pending'`, [user.id]);
    await q.query(
      `UPDATE users SET username = 'deleted-' || id, display_name = 'Deleted user', color = '#52525b',
         auth_hash = '', enc_private_key = '', key_salt = '', wallet_secret_enc = NULL,
         recovery_hash = NULL, recovery_salt = NULL, enc_private_key_recovery = NULL, deleted_at = $2
       WHERE id = $1`,
      [user.id, t]
    );
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
});
