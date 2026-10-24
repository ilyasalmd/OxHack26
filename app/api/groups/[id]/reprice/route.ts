import { z } from "zod";
import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { repriceGroup } from "@/lib/markets";

// moods: per-member scores computed in the browser from decrypted chat. Only these
// numbers (never message text) reach the server and Gemini, and only if the user opts in.
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const b = await body(req, z.object({ moods: z.record(z.string(), z.number().min(-1).max(1)).nullable() }));
  return repriceGroup(user, id, b.moods);
});
