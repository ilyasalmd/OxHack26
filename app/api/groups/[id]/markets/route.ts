import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { createMarket } from "@/lib/markets";
import { Situation } from "@/lib/schemas";

export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  return { id: await createMarket(user, id, await body(req, Situation)) };
});
