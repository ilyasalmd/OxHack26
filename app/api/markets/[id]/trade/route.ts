import { z } from "zod";
import { route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { trade } from "@/lib/markets";

export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  const b = await body(req, z.object({ side: z.enum(["yes", "no"]), action: z.enum(["buy", "sell"]), amount: z.number().positive() }));
  return trade(user, id, b);
});
