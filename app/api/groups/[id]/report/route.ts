import { z } from "zod";
import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { reportMessage } from "@/lib/reports";
import { REPORT_REASON_IDS } from "@/lib/safety";

// Report a chat message. Chat is end-to-end encrypted, so the text is only stored when the
// reporter's app sends it (they ticked "include the message").
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const b = await body(
    req,
    z.object({ messageId: z.number().int(), reason: z.enum(REPORT_REASON_IDS), note: z.string().max(500).optional(), messageText: z.string().max(4000).nullish() })
  );
  limit(`report:${user.id}`, 20, 86400);
  return reportMessage(user, id, b.messageId, b.reason, b.note ?? "", b.messageText);
});
