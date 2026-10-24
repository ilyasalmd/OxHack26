import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { HttpError, requireMember, route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";

// Hands back the encrypted bytes to members of the chat it belongs to. A profile photo goes to
// anyone who shares a chat with its owner. Either way it's ciphertext; the key is never here.
export const GET = route<IdCtx>(async (_req, user, ctx) => {
  const id = await idParam(ctx);
  const db = await getDb();
  const [a] = await db.query<{ owner_id: number; group_id: number | null; data: Uint8Array }>(`SELECT owner_id, group_id, data FROM attachments WHERE id = $1`, [id]);
  if (!a) throw new HttpError(404, "Not found");
  if (a.group_id != null) await requireMember(a.group_id, user.id);
  else if (a.owner_id !== user.id) {
    const [shared] = await db.query(
      `SELECT 1 FROM group_members a JOIN group_members b ON a.group_id = b.group_id WHERE a.user_id = $1 AND b.user_id = $2 LIMIT 1`,
      [user.id, a.owner_id]
    );
    if (!shared) throw new HttpError(403, "Not shared with you");
  }
  return new NextResponse(new Uint8Array(a.data), {
    headers: {
      "content-type": "application/octet-stream",
      // Ids are never reused and the bytes never change, so the browser can keep them.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
});
