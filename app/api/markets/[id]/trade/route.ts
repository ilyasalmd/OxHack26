import { z } from "zod";
import { route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { trade } from "@/lib/markets";
import { limit } from "@/lib/ratelimit";

export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  limit(`trade:${user.id}`, 30, 60);
  const b = await body(req, z.object({ side: z.enum(["yes", "no"]), action: z.enum(["buy", "sell"]), amount: z.number().positive() }));
  return trade(user, id, b);
});
