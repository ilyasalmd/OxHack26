import { z } from "zod";
import { route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { createFriendBet } from "@/lib/friend-bet";
import { limit } from "@/lib/ratelimit";

// Post a one-on-one bet in this chat: the bet, when it ends, your side, and what each of you puts in.
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  limit(`friendbet:${user.id}`, 20, 60);
  const b = await body(
    req,
    z.object({
      title: z.string().min(1).max(140),
      resolvesAt: z.string().min(1),
      side: z.enum(["yes", "no"]),
      stake: z.number().positive(),
      theirStake: z.number().positive(),
      // One friend in the chat who alone can take it; left out, anyone can.
      targetId: z.number().int().positive().nullish(),
    })
  );
  return createFriendBet(user, id, b);
});
