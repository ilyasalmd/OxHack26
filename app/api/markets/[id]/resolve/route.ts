import { z } from "zod";
import { HttpError, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { proposeResult } from "@/lib/markets";
import { startBotVotes } from "@/lib/bots";

// Proposes a result, and the rest of the chat votes on it (see voteOnResult). An early "it already
// happened" needs evidence (a note or a photo).
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  const b = await body(req, z.object({ outcome: z.boolean().optional(), value: z.number().finite().optional(), note: z.string().max(200).optional(), evidenceId: z.number().int().positive().optional() }));
  if (b.value == null && b.outcome == null) throw new HttpError(400, "Say what happened");
  const out = await proposeResult(user, id, b.value != null ? { value: b.value } : b.outcome!, b.note ?? "", b.evidenceId ?? null);
  // Demo only: in a sample chat, the sample people vote on it.
  startBotVotes(id);
  return out;
});
