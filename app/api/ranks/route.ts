import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { ranksAcrossChats } from "@/lib/ranks";

export const GET = route(async (_req, user) => ({ ranks: await ranksAcrossChats(await getDb(), user.id) }));
