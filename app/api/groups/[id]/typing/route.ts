import { z } from "zod";
import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { setTyping } from "@/lib/chat";

// "Typing…" or "recording a voice note…": the app pings this every few seconds while you do. Kept in memory, never stored.
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const { mode } = await body(req, z.object({ mode: z.enum(["text", "voice"]).nullable() }));
  setTyping(id, user.id, mode);
  return { ok: true };
});
