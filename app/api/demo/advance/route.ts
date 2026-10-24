import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { body } from "@/lib/http";
import { advanceClock, now } from "@/lib/clock";
import { DEMO_MODE } from "@/lib/config";
import { runDecay } from "@/lib/markets";
import { applyAllowance } from "@/lib/economy";

// Time machine for the demo: jump the app clock forward so allowances, deadlines
// and bond-style decay can be shown in seconds instead of weeks.
export const POST = route(async (req, user) => {
  if (!DEMO_MODE) throw new HttpError(403, "Demo mode is off");
  const { hours } = await body(req, z.object({ hours: z.number().min(1).max(24 * 60) }));
  const db = await getDb();
  await advanceClock(db, hours * 3600_000);
  await runDecay(db);
  await applyAllowance(db, user.id);
  return { now: now() };
});
