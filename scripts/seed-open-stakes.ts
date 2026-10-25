/**
 * A few live stakes in the three chats that only had history (Finance Soc Committee, Nadia,
 * Siblings), posted by the people in them through the normal market code, with some early trades,
 * so every sample chat has something open to trade. Marked sample, like the rest of the demo data.
 * Skips any chat that already has an open stake:
 *
 *   npx tsx --env-file=.env.local scripts/seed-open-stakes.ts
 */
import { getDb } from "../lib/db";
import { createMarket, trade } from "../lib/markets";
import type { User } from "../lib/auth";

const DAY = 864e5;
type Open = { by: string; title: string; subject?: string; days: number; kind?: "bet" | "stock"; trades: [string, "yes" | "no", number][] };
const OPEN: Record<string, Open[]> = {
  "Finance Soc Committee": [
    { by: "zara", title: "Omar confirms the Goldman speaker by Friday", subject: "omar", days: 5, kind: "bet", trades: [["leo", "yes", 30], ["aisha", "no", 20]] },
    { by: "aisha", title: "The society reaches 200 members by December", days: 37, kind: "stock", trades: [["tom", "yes", 40], ["omar", "yes", 25], ["leo", "no", 15]] },
    { by: "leo", title: "Tom's treasurer report is in before the AGM", subject: "tom", days: 9, kind: "bet", trades: [["zara", "no", 25], ["omar", "yes", 20]] },
  ],
  Nadia: [
    { by: "nadia", title: "Nadia passes the anatomy mock on Monday", subject: "nadia", days: 2, kind: "bet", trades: [["ilyas", "yes", 40]] },
    { by: "nadia", title: "Ilyas cooks on Thursday like he promised", subject: "ilyas", days: 5, kind: "bet", trades: [["nadia", "no", 15]] },
    { by: "ilyas", title: "Paris gets booked before Sunday", days: 7, kind: "bet", trades: [["nadia", "yes", 30]] },
  ],
  Siblings: [
    { by: "zayn", title: "Yasmin passes her driving test first time", subject: "yasmin", days: 12, kind: "bet", trades: [["ilyas", "yes", 30], ["zayn", "no", 20]] },
    { by: "yasmin", title: "Zayn runs a 5k under 25 minutes by Christmas", subject: "zayn", days: 60, kind: "stock", trades: [["ilyas", "no", 25], ["yasmin", "yes", 15]] },
    { by: "ilyas", title: "Mum's birthday present is ordered before Friday", days: 5, kind: "bet", trades: [["yasmin", "no", 20], ["zayn", "yes", 10]] },
  ],
};

async function main() {
  const db = await getDb();
  const who = async (username: string) =>
    (await db.query<User>(`SELECT id, username, display_name, color, balance, public_key FROM users WHERE username = $1 AND deleted_at IS NULL`, [username]))[0];
  for (const [chat, stakes] of Object.entries(OPEN)) {
    const [g] = await db.query<{ id: number }>(`SELECT id FROM groups WHERE name = $1 AND invite_code LIKE '%-demo' ORDER BY id LIMIT 1`, [chat]);
    if (!g) throw new Error(`No chat "${chat}"`);
    const [open] = await db.query(`SELECT 1 FROM markets WHERE group_id = $1 AND status = 'open'`, [g.id]);
    if (open) {
      console.log(`${chat}: already has open stakes`);
      continue;
    }
    for (const s of stakes) {
      const id = await createMarket(await who(s.by), g.id, {
        title: s.title,
        resolvesAt: new Date(Date.now() + s.days * DAY).toISOString(),
        subjectUsername: s.subject ?? null,
        kind: s.kind,
      });
      await db.query(`UPDATE markets SET sample = true WHERE id = $1`, [id]);
      for (const [u, side, amount] of s.trades) await trade(await who(u), id, { side, action: "buy", amount });
      const [m] = await db.query<{ title: string; kind: string; open_prob: number; ai_source: string }>(`SELECT title, kind, open_prob, ai_source FROM markets WHERE id = $1`, [id]);
      console.log(`${chat}: #${id} ${m.kind} "${m.title}" opened at ${Math.round(m.open_prob * 100)}% (${m.ai_source})`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
