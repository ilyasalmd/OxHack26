import { getDb } from "@/lib/db";
import { requireMember, route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";
import { getMarket, price } from "@/lib/markets";
import { CURRENCY, isAdminUsername } from "@/lib/config";
import { firstSentence } from "@/lib/text";

// "Market recap" text, read out by the browser's own speech on the device. No outside voice service.
export const GET = route<IdCtx>(async (_req, user, ctx) => {
  const id = await idParam(ctx);
  const db = await getDb();
  const m = await getMarket(db, id);
  await requireMember(m.group_id, user.id);
  const [mem] = await db.query<{ summary: string }>(`SELECT summary FROM memories WHERE market_id = $1`, [id]);
  const pct = Math.round(price(m) * 100);
  const text =
    m.status === "resolved"
      ? `Final bell on "${m.title}". It resolved ${m.outcome ? "yes" : "no"}. ${mem?.summary ?? ""}`
      : `Market update. "${m.title}" is trading at ${pct} percent, with ${Math.round(m.volume)} ${CURRENCY.name} traded so far. ${isAdminUsername(user.username) ? m.ai_rationale : firstSentence(m.ai_rationale)}`;
  return { text };
});
