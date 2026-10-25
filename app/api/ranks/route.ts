import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { ranksAcrossChats } from "@/lib/ranks";
import { cached } from "@/lib/cache";

export const GET = route(async (_req, user) => ({ ranks: await cached(`ranks:${user.id}`, 30_000, async () => ranksAcrossChats(await getDb(), user.id)) }));
