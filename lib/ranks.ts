import type { Q } from "./db";
import { now } from "./clock";
import { isQuiet, sharedCalls, skillByUser, stakeScores } from "./skill";

/**
 * The Ranks tab: everyone you share a chat with, ranked by forecasting skill over the settled
 * stakes in the chats you're in (the same scoring as each chat's board, lib/skill.ts). A friend's
 * calls in chats you aren't in never count, so nobody's rank leaks what happens elsewhere.
 */
export async function ranksAcrossChats(q: Q, userId: number) {
  const people = await q.query<{ id: number; username: string; display_name: string; color: string; shared: number }>(
    `SELECT u.id, u.username, u.display_name, u.color, count(DISTINCT gm.group_id)::int AS shared
     FROM users u JOIN group_members gm ON gm.user_id = u.id
     WHERE gm.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1)
       AND (NOT gm.guest OR u.id = $1) AND u.deleted_at IS NULL
     GROUP BY u.id`,
    [userId]
  );
  const skills = skillByUser(stakeScores(await sharedCalls(q, userId)));
  const rows = people.map((p) => {
    const sk = skills.get(p.id);
    return {
      ...p,
      skill: sk && sk.stakes ? sk.skill : null,
      stakes: sk?.stakes ?? 0,
      early: sk ? sk.early : true,
      tier: sk?.tier ?? null,
      quiet: isQuiet(sk?.last),
      weeksSinceCall: sk?.last ? Math.floor((now().getTime() - sk.last) / (7 * 86_400_000)) : null,
    };
  });
  return rows.sort((a, b) => (a.skill == null ? 1 : 0) - (b.skill == null ? 1 : 0) || (b.skill ?? 0) - (a.skill ?? 0) || a.display_name.localeCompare(b.display_name));
}
