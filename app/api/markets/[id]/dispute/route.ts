import { route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";
import { disputeResult } from "@/lib/markets";

// A vote to reject the proposed result; most of the group rejecting it drops the claim.
export const POST = route<IdCtx>(async (_req, user, ctx) => {
  return disputeResult(user, await idParam(ctx));
});
