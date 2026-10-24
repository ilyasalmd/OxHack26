import { z } from "zod";
import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { body } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { RENAME_COOLDOWN_MS } from "@/lib/accounts";

// The settings page's view of the account.
export const GET = route(async (_req, user) => {
  const db = await getDb();
  const [a] = await db.query<{ created_at: Date; username_changed_at: Date | null; has_recovery: boolean }>(
    `SELECT created_at, username_changed_at, recovery_hash IS NOT NULL AS has_recovery FROM users WHERE id = $1`,
    [user.id]
  );
  const next = a.username_changed_at ? new Date(new Date(a.username_changed_at).getTime() + RENAME_COOLDOWN_MS) : null;
  return {
    username: user.username,
    displayName: user.display_name,
    color: user.color,
    createdAt: a.created_at,
    hasRecovery: a.has_recovery,
    usernameChangedAt: a.username_changed_at,
    nextUsernameChangeAt: next && next.getTime() > Date.now() ? next : null,
  };
});

// Display name: no password needed.
export const PATCH = route(async (req, user) => {
  limit(`profile:${user.id}`, 30, 3600);
  const b = await body(req, z.object({ displayName: z.string().trim().min(1, "Enter a name").max(30, "30 characters at most") }));
  const db = await getDb();
  await db.query(`UPDATE users SET display_name = $2 WHERE id = $1`, [user.id, b.displayName]);
  return { displayName: b.displayName };
});
