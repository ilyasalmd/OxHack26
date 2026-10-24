import { z } from "zod";
import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { body } from "@/lib/http";
import { joinByInvite } from "@/lib/groups";

// Joining by invite code: you're in straight away, and the next member who has
// the app open wraps the chat key for you (you'll see "waiting for key" until then).
export const POST = route(async (req, user) => {
  const { code } = await body(req, z.object({ code: z.string().min(3) }));
  return { id: await joinByInvite(await getDb(), user.id, code) };
});
