import { z } from "zod";
import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { repriceGroup } from "@/lib/markets";
import { ChatSnippet } from "@/lib/schemas";

// moods: per-member scores computed in the browser from decrypted chat (opt-in per user).
// chat: per-stock redacted snippets, only honoured when the group allows the AI to read chat.
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const b = await body(
    req,
    z.object({
      moods: z.record(z.string(), z.number().min(-1).max(1)).nullable(),
      chat: z.record(z.string(), z.array(ChatSnippet).max(8)).nullish(),
    })
  );
  return repriceGroup(user, id, b.moods, b.chat ?? null);
});
