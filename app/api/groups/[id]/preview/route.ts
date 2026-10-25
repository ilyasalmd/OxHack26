import { Situation } from "@/lib/schemas";
import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { previewSituation } from "@/lib/markets";
import { limit } from "@/lib/ratelimit";

export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  // Each preview can spend a Gemma call, so it has its own, looser, limit.
  limit(`preview:${user.id}`, 60, 3600);
  const { vector: _v, ...p } = await previewSituation(id, await body(req, Situation), user.id);
  return p;
});
