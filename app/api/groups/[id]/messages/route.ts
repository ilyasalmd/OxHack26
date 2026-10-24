import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { now } from "@/lib/clock";

// The server only ever receives AES-GCM ciphertext for chat messages.
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const b = await body(req, z.object({ ciphertext: z.string().min(8).max(20000), iv: z.string().min(8).max(64) }));
  const db = await getDb();
  const [m] = await db.query(
    `INSERT INTO messages (group_id, user_id, kind, ciphertext, iv, created_at) VALUES ($1,$2,'chat',$3,$4,$5) RETURNING id::int`,
    [id, user.id, b.ciphertext, b.iv, now()]
  );
  return m;
});
