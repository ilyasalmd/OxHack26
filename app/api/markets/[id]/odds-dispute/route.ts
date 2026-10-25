import { route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";
import { disputeOdds } from "@/lib/markets";
import { limit } from "@/lib/ratelimit";

// "Make the AI think again" about a stake's odds. Once per stake in total (lib/markets.ts disputeOdds),
// and a few per person per hour, since each one is a model call.
export const POST = route<IdCtx>(async (_req, user, ctx) => {
  limit(`odds-dispute:${user.id}`, 5, 3600);
  return disputeOdds(user, await idParam(ctx));
});
