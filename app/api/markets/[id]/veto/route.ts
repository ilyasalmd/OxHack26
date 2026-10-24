import { route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";
import { vetoMarket } from "@/lib/markets";

// The person a situation is about can call it off any time before it settles.
export const POST = route<IdCtx>(async (_req, user, ctx) => vetoMarket(user, await idParam(ctx)));
