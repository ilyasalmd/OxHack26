import { route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";
import { disputeResult } from "@/lib/markets";

// A dispute voids the situation and refunds everyone.
export const POST = route<IdCtx>(async (_req, user, ctx) => {
  await disputeResult(user, await idParam(ctx));
  return { ok: true };
});
