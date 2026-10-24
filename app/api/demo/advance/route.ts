import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { body } from "@/lib/http";
import { demoOffset, now, setDemoOffset, withClock } from "@/lib/clock";
import { DEMO_MODE, isAdminUsername } from "@/lib/config";
import { runDecay } from "@/lib/markets";
import { applyAllowance } from "@/lib/economy";

// Time machine for the admin's demos: jump the admin's clock forward so allowances, deadlines
// and bond-style decay can be shown in seconds. Nobody else's time moves; anyone else is refused.
// hours: 0 puts the admin back on real time.
export const POST = route(async (req, user) => {
  if (!isAdminUsername(user.username)) throw new HttpError(403, "Only the app's admin can change the date");
  if (!DEMO_MODE) throw new HttpError(403, "Demo mode is off");
  const { hours } = await body(req, z.object({ hours: z.number().min(0).max(24 * 60) }));
  const db = await getDb();
  const offset = hours === 0 ? 0 : demoOffset() + hours * 3600_000;
  await setDemoOffset(db, offset);
  const t = await withClock(offset, user.id, async () => {
    await runDecay(db);
    await applyAllowance(db, user.id);
    return now();
  });
  return { now: t, offsetMs: offset };
});
