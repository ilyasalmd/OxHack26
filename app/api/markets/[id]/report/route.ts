import { z } from "zod";
import { route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { reportMarket } from "@/lib/reports";
import { REPORT_REASON_IDS } from "@/lib/safety";

export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  const b = await body(req, z.object({ reason: z.enum(REPORT_REASON_IDS), note: z.string().max(500).optional() }));
  limit(`report:${user.id}`, 20, 86400);
  return reportMarket(user, id, b.reason, b.note ?? "");
});
