import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { createMarket } from "@/lib/markets";
import { Situation } from "@/lib/schemas";
import { limit } from "@/lib/ratelimit";

export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  limit(`situation:${user.id}`, 10, 3600);
  limit(`situation-group:${id}`, 30, 86400);
  return { id: await createMarket(user, id, await body(req, Situation)) };
});
