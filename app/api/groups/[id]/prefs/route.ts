import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { isWallpaper } from "@/lib/wallpapers";

// Your own settings for one chat: its background and whether it's muted. Nobody else sees them.
export const PUT = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const b = await body(req, z.object({ wallpaper: z.string().nullable().optional().refine((w) => w == null || isWallpaper(w), "Unknown background"), muted: z.boolean().optional() }));
  const db = await getDb();
  if (b.wallpaper !== undefined) await db.query(`UPDATE group_members SET wallpaper = $3 WHERE group_id = $1 AND user_id = $2`, [id, user.id, b.wallpaper]);
  if (b.muted !== undefined) await db.query(`UPDATE group_members SET muted = $3 WHERE group_id = $1 AND user_id = $2`, [id, user.id, b.muted]);
  return { ok: true };
});
