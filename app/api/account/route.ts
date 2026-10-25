import { z } from "zod";
import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { body } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { RENAME_COOLDOWN_MS } from "@/lib/accounts";

// The settings page's view of the account.
export const GET = route(async (_req, user) => {
  const db = await getDb();
  const [a] = await db.query<{ created_at: Date; username_changed_at: Date | null; has_recovery: boolean; bio: string }>(
    `SELECT created_at, username_changed_at, recovery_hash IS NOT NULL AS has_recovery, bio FROM users WHERE id = $1`,
    [user.id]
  );
  const next = a.username_changed_at ? new Date(new Date(a.username_changed_at).getTime() + RENAME_COOLDOWN_MS) : null;
  return {
    username: user.username,
    displayName: user.display_name,
    bio: a.bio,
    color: user.color,
    createdAt: a.created_at,
    hasRecovery: a.has_recovery,
    usernameChangedAt: a.username_changed_at,
    nextUsernameChangeAt: next && next.getTime() > Date.now() ? next : null,
  };
});

// Display name and bio: no password needed.
export const PATCH = route(async (req, user) => {
  limit(`profile:${user.id}`, 30, 3600);
  const b = await body(
    req,
    z.object({
      displayName: z.string().trim().min(1, "Enter a name").max(30, "30 characters at most").optional(),
      bio: z.string().trim().max(140, "140 characters at most").optional(),
    })
  );
  const db = await getDb();
  if (b.displayName !== undefined) await db.query(`UPDATE users SET display_name = $2 WHERE id = $1`, [user.id, b.displayName]);
  if (b.bio !== undefined) await db.query(`UPDATE users SET bio = $2 WHERE id = $1`, [user.id, b.bio.replace(/\s+/g, " ")]);
  return { displayName: b.displayName ?? user.display_name, bio: b.bio };
});
