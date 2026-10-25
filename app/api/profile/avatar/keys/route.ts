import { z } from "zod";
import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { body } from "@/lib/http";

// Your app wraps your profile key for people you share a chat with, so they can see your photo.
export const POST = route(async (req, user) => {
  const b = await body(req, z.object({ keys: z.array(z.object({ viewerId: z.number().int(), wrapped: z.string().max(400) })).max(50) }));
  const db = await getDb();
  let added = 0;
  for (const k of b.keys) {
    const r = await db.query(
      `INSERT INTO profile_keys (owner_id, viewer_id, wrapped)
       SELECT $1, $2, $3 WHERE EXISTS (
         SELECT 1 FROM group_members a JOIN group_members o ON o.group_id = a.group_id WHERE a.user_id = $1 AND o.user_id = $2)
       ON CONFLICT DO NOTHING RETURNING viewer_id`,
      [user.id, k.viewerId, k.wrapped]
    );
    added += r.length;
  }
  return { added };
});
