import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { body } from "@/lib/http";

// Sets or removes your profile photo. The photo was encrypted in your browser with your profile
// key; `selfKey` is that key wrapped for you, so your other devices can open it too.
export const PUT = route(async (req, user) => {
  const b = await body(req, z.object({ avatarId: z.number().int().nullable(), selfKey: z.string().max(400).optional() }));
  const db = await getDb();
  if (b.avatarId !== null) {
    const [a] = await db.query(`SELECT 1 FROM attachments WHERE id = $1 AND owner_id = $2 AND kind = 'avatar'`, [b.avatarId, user.id]);
    if (!a) throw new HttpError(400, "Upload the photo first");
  }
  if (b.selfKey)
    await db.query(
      `INSERT INTO profile_keys (owner_id, viewer_id, wrapped) VALUES ($1,$1,$2) ON CONFLICT (owner_id, viewer_id) DO UPDATE SET wrapped = EXCLUDED.wrapped`,
      [user.id, b.selfKey]
    );
  await db.query(`UPDATE users SET avatar_id = $2 WHERE id = $1`, [user.id, b.avatarId]);
  return { ok: true };
});
