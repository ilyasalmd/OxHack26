import { getDb } from "@/lib/db";
import { requireMember, route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";
import { insights, leaderboard } from "@/lib/stats";

export const GET = route<IdCtx>(async (_req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const db = await getDb();
  const memories = await db.query(
    `SELECT id, title, outcome, summary, category, ai_prob, crowd_prob, created_at FROM memories WHERE group_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [id]
  );
  return { leaderboard: await leaderboard(db, id), insights: await insights(db, id), memories };
});
