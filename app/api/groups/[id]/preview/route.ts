import { Situation } from "@/lib/schemas";
import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { previewSituation } from "@/lib/markets";


export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const { vector: _v, ...p } = await previewSituation(id, await body(req, Situation));
  return p;
});
