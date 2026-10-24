import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { createMarket } from "@/lib/markets";
import { Situation } from "@/lib/schemas";
import { limit } from "@/lib/ratelimit";
import { startBots } from "@/lib/bots";

export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  limit(`situation:${user.id}`, 10, 3600);
  limit(`situation-group:${id}`, 30, 86400);
  const marketId = await createMarket(user, id, await body(req, Situation));
  // Demo only: in a sample chat, the sample people react and trade over the next minute.
  startBots(marketId, user.id);
  return { id: marketId };
});
