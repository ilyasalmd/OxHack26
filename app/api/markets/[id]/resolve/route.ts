import { z } from "zod";
import { HttpError, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { proposeResult } from "@/lib/markets";

// Proposes a result. Another member (not the subject, not the proposer) confirms or disputes it.
// After the deadline it also settles by itself after 24 hours; an early "it already happened" needs
// evidence (a note or a photo) and only ever settles on a confirmation.
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  const b = await body(req, z.object({ outcome: z.boolean().optional(), value: z.number().finite().optional(), note: z.string().max(200).optional(), evidenceId: z.number().int().positive().optional() }));
  if (b.value == null && b.outcome == null) throw new HttpError(400, "Say what happened");
  return proposeResult(user, id, b.value != null ? { value: b.value } : b.outcome!, b.note ?? "", b.evidenceId ?? null);
});
