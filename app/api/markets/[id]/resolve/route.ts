import { z } from "zod";
import { route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { resolveMarket } from "@/lib/markets";

export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  const b = await body(req, z.object({ outcome: z.boolean(), note: z.string().max(200).optional() }));
  return resolveMarket(user, id, b.outcome, b.note ?? "");
});
