import { getDb } from "@/lib/db";
import { requireMember, route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";
import { now } from "@/lib/clock";
import { callOffSituationsAbout } from "@/lib/markets";

// Leaving removes your membership and your copy of the chat key. Your positions stay, so they still
// settle and pay out. Situations about you can't be vetoed once you're gone, so they are called off.
export const POST = route<IdCtx>(async (_req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const db = await getDb();
  await db.tx(async (q) => {
    await q.query(`DELETE FROM group_keys WHERE group_id = $1 AND user_id = $2`, [id, user.id]);
    await q.query(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [id, user.id]);
    await q.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1,$2,'system',$3,$4)`, [id, null, `${user.display_name} left`, now()]);
  });
  const calledOff = await callOffSituationsAbout(user.id, user.display_name, id);
  return { ok: true, calledOff };
});
