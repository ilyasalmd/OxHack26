import { route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";
import { confirmResult } from "@/lib/markets";

export const POST = route<IdCtx>(async (_req, user, ctx) => {
  return confirmResult(user, await idParam(ctx));
});
