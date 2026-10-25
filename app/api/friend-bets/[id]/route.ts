import { z } from "zod";
import { route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { actOnFriendBet } from "@/lib/friend-bet";
import { limit } from "@/lib/ratelimit";

// Every move on a friend bet from its chat card: take, counter, accept, cancel, won, lost, confirm, dispute.
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("take") }),
  z.object({ action: z.literal("counter"), theirStake: z.number().positive() }),
  z.object({ action: z.literal("accept"), counterId: z.number().int().positive() }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("won") }),
  z.object({ action: z.literal("lost") }),
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("dispute") }),
]);

export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  limit(`friendbet:${user.id}`, 30, 60);
  return actOnFriendBet(user, id, await body(req, Action));
});
