/**
 * One-on-one friend bets for the sample chats: a couple already settled in each chat's history,
 * then live and open ones made now through the real bet code (coins set aside, chat cards posted).
 * Skips a chat that already has friend bets. Run reorder-sample-chats.ts afterwards so the
 * backdated cards sit at their dates:
 *
 *   npx tsx --env-file=.env.local scripts/seed-friend-bets.ts
 */
import { getDb, type Q } from "../lib/db";
import { actOnFriendBet, createFriendBet } from "../lib/friend-bet";
import type { User } from "../lib/auth";

const DAY = 864e5;
// [poster, taker, title, poster's side, poster puts in, taker puts in, days ago it ended, poster won]
type Past = [string, string, string, "yes" | "no", number, number, number, boolean];
// [poster, title, side, stake, theirs, days from now, taker (or null: still open), counter-offer]
type Now = [string, string, "yes" | "no", number, number, number, string | null, [string, number]?];

const BETS: Record<string, { past: Past[]; now: Now[] }> = {
  "Flat 4B": {
    past: [
      ["jake", "sam", "Jake is up before 10 on Saturday", "yes", 20, 20, 23, false],
      ["maya", "priya", "The landlord fixes the boiler this week", "no", 15, 25, 9, true],
    ],
    now: [
      ["ilyas", "Aariz does the washing up before Sunday", "no", 20, 20, 3, "aariz"],
      ["priya", "Sam finishes the whole series before me", "no", 15, 15, 6, null, ["sam", 10]],
    ],
  },
  "Maths & Econ Y2": {
    past: [
      ["leo", "chloe", "Leo gets above 70 on the stats problem sheet", "yes", 25, 25, 16, true],
      ["omar", "aisha", "The lecturer runs over on Friday", "yes", 10, 15, 5, true],
    ],
    now: [
      ["durukan", "Barkin hands in the econometrics coursework early", "no", 30, 20, 8, "barkin"],
      ["priya", "Ilyas starts revision before reading week", "no", 20, 20, 10, null],
    ],
  },
  "Sunday League": {
    past: [
      ["dan", "jake", "Dan scores from outside the box", "yes", 10, 30, 14, false],
      ["tom", "omar", "We keep a clean sheet against Wanderers", "yes", 20, 20, 7, true],
    ],
    now: [
      ["barkin", "Barkin gets a goal on Sunday", "yes", 20, 30, 4, "ilyas"],
      ["sam", "Jake turns up for the warm-up", "no", 15, 15, 4, null, ["jake", 25]],
    ],
  },
  "Spring Week Grind": {
    past: [["zara", "chloe", "Chloe hears back from JPM before half term", "no", 20, 20, 12, false]],
    now: [["aariz", "Durukan gets a first-round invite this month", "yes", 25, 25, 20, "durukan"]],
  },
  "Run Club": {
    past: [["tom", "maya", "Maya breaks 50 minutes for 10k", "no", 20, 20, 18, false]],
    now: [["chloe", "Ilyas makes Tuesday's 7am run", "no", 15, 15, 2, "ilyas"]],
  },
  "Finance Soc Committee": {
    past: [["leo", "zara", "The careers fair stall sells out of merch", "yes", 15, 15, 20, true]],
    now: [["ilyas", "Durukan's sponsorship email gets a reply this week", "yes", 20, 20, 5, null, ["durukan", 15]]],
  },
  Family: {
    past: [["yasmin", "dad", "Dad finds his glasses by himself", "no", 10, 10, 11, true]],
    now: [["mum", "Ilyas comes home for Sunday lunch", "yes", 10, 10, 6, "dad"]],
  },
  Nadia: {
    past: [
      ["nadia", "ilyas", "Ilyas is ready before me on Saturday", "no", 15, 15, 19, true],
      ["ilyas", "nadia", "Nadia finishes the film without falling asleep", "no", 10, 10, 6, false],
    ],
    now: [["nadia", "Ilyas remembers the restaurant booking", "no", 20, 20, 5, "ilyas"]],
  },
  Siblings: {
    past: [["zayn", "yasmin", "Yasmin beats Zayn at FIFA", "no", 15, 15, 8, false]],
    now: [["yasmin", "Zayn replies to Mum within an hour", "no", 10, 10, 2, "zayn"]],
  },
};

const who = async (q: Q, username: string) =>
  (await q.query<User>(`SELECT id, username, display_name, color, balance, public_key FROM users WHERE username = $1 AND deleted_at IS NULL`, [username]))[0];

async function main() {
  const db = await getDb();
  for (const [chat, { past, now }] of Object.entries(BETS)) {
    const [g] = await db.query<{ id: number }>(`SELECT id FROM groups WHERE name = $1 AND invite_code LIKE '%-demo' ORDER BY id LIMIT 1`, [chat]);
    if (!g) throw new Error(`No chat "${chat}"`);
    const [has] = await db.query(`SELECT 1 FROM friend_bets WHERE group_id = $1`, [g.id]);
    if (has) {
      console.log(`${chat}: already has friend bets`);
      continue;
    }
    // History: written as it would have happened, without moving anyone's coins today.
    for (const [a, b, title, side, stake, theirs, ago, posterWon] of past) {
      const p = await who(db, a);
      const t = await who(db, b);
      const end = new Date(Date.now() - ago * DAY);
      const posted = new Date(end.getTime() - (2 + Math.random() * 3) * DAY);
      const taken = new Date(posted.getTime() + (1 + Math.random() * 5) * 36e5);
      const settled = new Date(end.getTime() + (1 + Math.random() * 6) * 36e5);
      const winner = posterWon ? p : t;
      const loser = posterWon ? t : p;
      const [bet] = await db.query<{ id: number }>(
        `INSERT INTO friend_bets (group_id, creator_id, title, resolves_at, side, stake, taker_stake, taker_id, status, winner_id, created_at, settled_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'settled',$9,$10,$11) RETURNING id`,
        [g.id, p.id, title, end, side, stake, theirs, t.id, winner.id, posted, settled]
      );
      const msg = (userId: number | null, kind: string, body: string, at: Date) =>
        db.query(`INSERT INTO messages (group_id, user_id, kind, body, friend_bet_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [g.id, userId, kind, body, bet.id, at]);
      await msg(p.id, "friendbet", `posted a bet: ${title}`, posted);
      await msg(t.id, "system", `took the bet: “${title}”. Winner takes ${(stake + theirs).toFixed(0)}`, taken);
      await msg(winner.id, "system", `won ${(stake + theirs).toFixed(0)} on “${title}” (${loser.display_name} says they lost)`, settled);
    }
    // Live and open: through the real code, so coins are set aside and the cards work.
    for (const [a, title, side, stake, theirs, days, taker, counter] of now) {
      const p = await who(db, a);
      const { id } = await createFriendBet(p, g.id, { title, resolvesAt: new Date(Date.now() + days * DAY).toISOString(), side, stake, theirStake: theirs });
      if (taker) await actOnFriendBet(await who(db, taker), id, { action: "take" });
      if (counter) await actOnFriendBet(await who(db, counter[0]), id, { action: "counter", theirStake: counter[1] });
    }
    console.log(`${chat}: ${past.length} settled, ${now.filter((n) => n[6]).length} live, ${now.filter((n) => !n[6]).length} open`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
