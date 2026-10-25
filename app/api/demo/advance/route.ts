import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { body } from "@/lib/http";
import { demoOffset, now, setDemoOffset, withClock } from "@/lib/clock";
import { DEMO_MODE, isAdminUsername } from "@/lib/config";
import { SAMPLE_GROUPS } from "@/lib/demo";
import { MATURITY_FALLBACK_MS } from "@/lib/safety";
import { runDecay } from "@/lib/markets";
import { applyAllowance } from "@/lib/economy";

// Time machine for the admin's demos: jump the admin's clock forward so allowances, deadlines
// and bond-style decay can be shown in seconds. Nobody else's time moves; anyone else is refused.
// hours: 0 puts the admin back on real time. Only the sample chats the admin is in move; with
// preview: true nothing changes, and the reply says how many live stakes the jump would reach.
export const POST = route(async (req, user) => {
  if (!isAdminUsername(user.username)) throw new HttpError(403, "Only the app's admin can change the date");
  if (!DEMO_MODE) throw new HttpError(403, "Demo mode is off");
  const { hours, preview } = await body(req, z.object({ hours: z.number().min(0).max(24 * 60), preview: z.boolean().optional() }));
  const db = await getDb();
  const offset = hours === 0 ? 0 : demoOffset() + hours * 3600_000;
  if (preview) {
    const from = await withClock(demoOffset(), user.id, () => now());
    const to = new Date(Date.now() + offset);
    const [r] = await db.query<{ due: number; off: number }>(
      `SELECT count(*) FILTER (WHERE m.resolves_at <= $3)::int AS due, count(*) FILTER (WHERE m.resolves_at <= $4 AND m.proposed_outcome IS NULL)::int AS off
         FROM markets m JOIN groups gr ON gr.id = m.group_id
        WHERE m.status = 'open' AND m.resolves_at > $2 AND ${SAMPLE_GROUPS}
          AND m.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1)`,
      [user.id, from, to, new Date(to.getTime() - MATURITY_FALLBACK_MS)]
    );
    return { due: r.due, calledOff: r.off };
  }
  await setDemoOffset(db, offset);
  const t = await withClock(offset, user.id, async () => {
    await runDecay(db);
    await applyAllowance(db, user.id);
    return now();
  });
  return { now: t, offsetMs: offset };
});
