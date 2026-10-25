import { z } from "zod";
import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { body } from "@/lib/http";

// Whether friends may post situations about you: 'anyone' (default) or 'nobody'.
// A person can always post about themselves.
export const GET = route(async (_req, user) => {
  const db = await getDb();
  const [u] = await db.query<{ subject_policy: "anyone" | "nobody" }>(`SELECT subject_policy FROM users WHERE id = $1`, [user.id]);
  return { policy: u?.subject_policy ?? "anyone" };
});

export const PUT = route(async (req, user) => {
  const { policy } = await body(req, z.object({ policy: z.enum(["anyone", "nobody"]) }));
  const db = await getDb();
  await db.query(`UPDATE users SET subject_policy = $2 WHERE id = $1`, [user.id, policy]);
  return { policy };
});
