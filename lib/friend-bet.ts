import { getDb, type Q } from "./db";
import { now } from "./clock";
import { ECONOMY } from "./config";
import { credit, maxStake } from "./economy";
import { HttpError, type User } from "./auth";
import { topicProblem } from "./safety";

// Bet a friend: a one-on-one bet in a chat, separate from the stake market (no AI, no house).
// The poster picks a side and says what each person puts in ("I put 30, you put 20"); one friend
// takes the other side; the winner gets both (50). A friend can counter with a different amount
// before anyone takes it. Settling: whoever lost can say so and it pays at once; if someone says
// they won, the other confirms, or it stands a day after the deadline. A dispute calls it off.

const round2 = (x: number) => Math.round(x * 100) / 100;
/** After the deadline, a claim nobody answers stands after this long. */
export const CLAIM_WINDOW_MS = 24 * 3600_000;
/** A live bet nobody settles is called off and refunded this long after the deadline. */
export const UNSETTLED_MS = 3 * 24 * 3600_000;

export type FriendBet = {
  id: number;
  group_id: number;
  creator_id: number;
  title: string;
  resolves_at: Date;
  side: "yes" | "no";
  stake: number;
  taker_stake: number;
  taker_id: number | null;
  status: "open" | "live" | "claimed" | "settled" | "cancelled" | "refunded";
  claim_by: number | null;
  claimed_at: Date | null;
  winner_id: number | null;
  created_at: Date;
  settled_at: Date | null;
};

async function line(q: Q, b: FriendBet, userId: number | null, body: string) {
  await q.query(`INSERT INTO messages (group_id, user_id, kind, body, friend_bet_id, created_at) VALUES ($1,$2,'system',$3,$4,$5)`, [b.group_id, userId, body, b.id, now()]);
}

async function member(q: Q, groupId: number, userId: number) {
  const [m] = await q.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, userId]);
  if (!m) throw new HttpError(403, "You're not in this chat");
}

/** Puts coins aside within the usual caps: at most 25% of your balance, and 50 always stays safe. */
async function putIn(q: Q, userId: number, amount: number, reason: string) {
  const [u] = await q.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1 FOR UPDATE`, [userId]);
  const cap = maxStake(u.balance);
  if (!(amount >= ECONOMY.minTrade)) throw new HttpError(400, `The smallest amount is ${ECONOMY.minTrade}`);
  if (amount > cap + 1e-9) throw new HttpError(400, `You can put in at most ${cap.toFixed(0)} right now (${ECONOMY.maxStakeFraction * 100}% of your balance, keeping ${ECONOMY.balanceFloor} safe)`);
  await credit(q, userId, -amount, reason);
}

async function lockBet(q: Q, id: number) {
  const [b] = await q.query<FriendBet>(`SELECT * FROM friend_bets WHERE id = $1 FOR UPDATE`, [id]);
  if (!b) throw new HttpError(404, "Bet not found");
  return b;
}

const name = async (q: Q, id: number) => (await q.query<{ display_name: string }>(`SELECT display_name FROM users WHERE id = $1`, [id]))[0]?.display_name ?? "Someone";
const pot = (b: Pick<FriendBet, "stake" | "taker_stake">) => round2(b.stake + b.taker_stake);
const other = (b: FriendBet, userId: number) => (userId === b.creator_id ? b.taker_id! : b.creator_id);

/** Post a bet in a chat: the poster's coins are set aside now. */
export async function createFriendBet(user: User, groupId: number, input: { title: string; resolvesAt: string; side: "yes" | "no"; stake: number; theirStake: number }) {
  const title = input.title.trim();
  if (title.length < 4) throw new HttpError(400, "Say what the bet is");
  const problem = topicProblem(title);
  if (problem) throw new HttpError(400, problem);
  const ends = new Date(input.resolvesAt);
  if (!(ends.getTime() > now().getTime() + 5 * 60_000)) throw new HttpError(400, "Pick an end time at least a few minutes from now");
  const stake = round2(input.stake);
  const theirs = round2(input.theirStake);
  if (!(theirs >= ECONOMY.minTrade)) throw new HttpError(400, `Your friend has to put in at least ${ECONOMY.minTrade}`);
  const db = await getDb();
  return db.tx(async (q) => {
    await member(q, groupId, user.id);
    await putIn(q, user.id, stake, `Bet a friend · ${title}`);
    const [b] = await q.query<FriendBet>(
      `INSERT INTO friend_bets (group_id, creator_id, title, resolves_at, side, stake, taker_stake, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [groupId, user.id, title, ends, input.side, stake, theirs, now()]
    );
    await q.query(`INSERT INTO messages (group_id, user_id, kind, body, friend_bet_id, created_at) VALUES ($1,$2,'friendbet',$3,$4,$5)`, [groupId, user.id, `posted a bet: ${title}`, b.id, now()]);
    return { id: b.id };
  });
}

async function startWith(q: Q, b: FriendBet, takerId: number, takerStake: number) {
  await putIn(q, takerId, takerStake, `Bet a friend · ${b.title}`);
  await q.query(`UPDATE friend_bets SET taker_id = $2, taker_stake = $3, status = 'live' WHERE id = $1`, [b.id, takerId, takerStake]);
  await q.query(`UPDATE friend_bet_counters SET status = 'closed' WHERE bet_id = $1 AND status = 'open'`, [b.id]);
}

/** Every move on a bet, from its chat card. */
export async function actOnFriendBet(
  user: User,
  betId: number,
  a: { action: "take" } | { action: "counter"; theirStake: number } | { action: "accept"; counterId: number } | { action: "cancel" } | { action: "won" } | { action: "lost" } | { action: "confirm" } | { action: "dispute" }
) {
  const db = await getDb();
  return db.tx(async (q) => {
    const b = await lockBet(q, betId);
    await member(q, b.group_id, user.id);
    const inBet = user.id === b.creator_id || user.id === b.taker_id;
    const over = new Date(b.resolves_at).getTime() <= now().getTime();
    switch (a.action) {
      case "take": {
        if (b.status !== "open") throw new HttpError(400, "Someone already took this bet");
        if (user.id === b.creator_id) throw new HttpError(400, "You can't take your own bet");
        if (over) throw new HttpError(400, "This bet has ended");
        await startWith(q, b, user.id, b.taker_stake);
        await line(q, b, user.id, `took the bet: “${b.title}”. Winner takes ${pot(b).toFixed(0)}`);
        return { ok: true };
      }
      case "counter": {
        if (b.status !== "open") throw new HttpError(400, "This bet isn't open any more");
        if (user.id === b.creator_id) throw new HttpError(400, "Change your own bet by cancelling it and posting a new one");
        if (over) throw new HttpError(400, "This bet has ended");
        const theirs = round2(a.theirStake);
        if (!(theirs >= ECONOMY.minTrade)) throw new HttpError(400, `Put in at least ${ECONOMY.minTrade}`);
        if (Math.abs(theirs - b.taker_stake) < 0.01) throw new HttpError(400, "That's what the bet already asks: just take it");
        await q.query(`UPDATE friend_bet_counters SET status = 'closed' WHERE bet_id = $1 AND user_id = $2 AND status = 'open'`, [b.id, user.id]);
        await q.query(`INSERT INTO friend_bet_counters (bet_id, user_id, taker_stake, created_at) VALUES ($1,$2,$3,$4)`, [b.id, user.id, theirs, now()]);
        await line(q, b, user.id, `would take “${b.title}” for ${theirs.toFixed(0)} instead of ${b.taker_stake.toFixed(0)}`);
        return { ok: true };
      }
      case "accept": {
        if (user.id !== b.creator_id) throw new HttpError(403, "Only whoever posted the bet can accept a counter-offer");
        if (b.status !== "open") throw new HttpError(400, "This bet isn't open any more");
        const [c] = await q.query<{ id: number; user_id: number; taker_stake: number }>(`SELECT * FROM friend_bet_counters WHERE id = $1 AND bet_id = $2 AND status = 'open'`, [a.counterId, b.id]);
        if (!c) throw new HttpError(400, "That counter-offer was withdrawn");
        if (over) throw new HttpError(400, "This bet has ended");
        // They may have left the chat since they made the offer.
        await member(q, b.group_id, c.user_id);
        await startWith(q, b, c.user_id, c.taker_stake);
        await q.query(`UPDATE friend_bet_counters SET status = 'accepted' WHERE id = $1`, [c.id]);
        await line(q, b, user.id, `accepted ${await name(q, c.user_id)}'s offer on “${b.title}”. Winner takes ${round2(b.stake + c.taker_stake).toFixed(0)}`);
        return { ok: true };
      }
      case "cancel": {
        if (user.id !== b.creator_id) throw new HttpError(403, "Only whoever posted the bet can cancel it");
        if (b.status !== "open") throw new HttpError(400, b.taker_id ? "Someone already took it, so it can't be cancelled" : "This bet is already over");
        await credit(q, b.creator_id, b.stake, `Bet cancelled · ${b.title}`);
        await q.query(`UPDATE friend_bets SET status = 'cancelled', settled_at = $2 WHERE id = $1`, [b.id, now()]);
        await q.query(`UPDATE friend_bet_counters SET status = 'closed' WHERE bet_id = $1 AND status = 'open'`, [b.id]);
        await line(q, b, user.id, `cancelled the bet “${b.title}” and got their ${b.stake.toFixed(0)} back`);
        return { ok: true };
      }
      case "lost": {
        if (!inBet) throw new HttpError(403, "Only the two people in the bet can settle it");
        if (b.status !== "live" && b.status !== "claimed") throw new HttpError(400, "This bet isn't waiting for a result");
        await payOut(q, b, other(b, user.id), `${await name(q, user.id)} says they lost`);
        return { ok: true };
      }
      case "won": {
        if (!inBet) throw new HttpError(403, "Only the two people in the bet can settle it");
        if (b.status !== "live") throw new HttpError(400, b.status === "claimed" ? "Someone has already said how it ended" : "This bet isn't waiting for a result");
        await q.query(`UPDATE friend_bets SET status = 'claimed', claim_by = $2, claimed_at = $3 WHERE id = $1`, [b.id, user.id, now()]);
        await line(q, b, user.id, `says they won “${b.title}”. ${await name(q, other(b, user.id))} can confirm or dispute`);
        return { ok: true };
      }
      case "confirm": {
        if (b.status !== "claimed" || user.id !== other(b, b.claim_by!)) throw new HttpError(403, "Only the other person in the bet can confirm");
        await payOut(q, b, b.claim_by!, `${await name(q, user.id)} confirmed`);
        return { ok: true };
      }
      case "dispute": {
        if (b.status !== "claimed" || user.id !== other(b, b.claim_by!)) throw new HttpError(403, "Only the other person in the bet can dispute");
        await refund(q, b, `${await name(q, user.id)} disputed it, so the bet is off and both got their money back`);
        return { ok: true };
      }
    }
  });
}

async function payOut(q: Q, b: FriendBet, winnerId: number, how: string) {
  await credit(q, winnerId, pot(b), `Won a bet · ${b.title}`);
  await q.query(`UPDATE friend_bets SET status = 'settled', winner_id = $2, settled_at = $3 WHERE id = $1`, [b.id, winnerId, now()]);
  await line(q, b, winnerId, `won ${pot(b).toFixed(0)} on “${b.title}” (${how})`);
}

async function refund(q: Q, b: FriendBet, why: string) {
  await credit(q, b.creator_id, b.stake, `Bet called off · ${b.title}`);
  if (b.taker_id) await credit(q, b.taker_id, b.taker_stake, `Bet called off · ${b.title}`);
  await q.query(`UPDATE friend_bets SET status = 'refunded', settled_at = $2 WHERE id = $1`, [b.id, now()]);
  await line(q, b, null, `“${b.title}”: ${why}`);
}

/**
 * Background tidy-up (runs with the worker): nobody took it by the deadline → the poster gets their
 * coins back; a claim nobody answered stands a day after the deadline; a live bet nobody settled
 * within 3 days of the deadline is called off and refunded.
 */
export async function finaliseFriendBets(q: Q) {
  const t = now();
  const due = await q.query<{ id: number }>(
    `SELECT id FROM friend_bets WHERE (status IN ('open', 'live') AND resolves_at <= $1) OR status = 'claimed' ORDER BY id`,
    [t]
  );
  for (const { id } of due) {
    const db = await getDb();
    await db.tx(async (tq) => {
      const b = await lockBet(tq, id);
      const end = new Date(b.resolves_at).getTime();
      if (b.status === "open" && end <= t.getTime()) {
        await credit(tq, b.creator_id, b.stake, `Nobody took the bet · ${b.title}`);
        await tq.query(`UPDATE friend_bets SET status = 'cancelled', settled_at = $2 WHERE id = $1`, [b.id, t]);
        await tq.query(`UPDATE friend_bet_counters SET status = 'closed' WHERE bet_id = $1 AND status = 'open'`, [b.id]);
        await line(tq, b, null, `Nobody took “${b.title}” before it ended, so the stake went back`);
      } else if (b.status === "claimed" && t.getTime() >= Math.max(new Date(b.claimed_at!).getTime(), end) + CLAIM_WINDOW_MS) {
        await payOut(tq, b, b.claim_by!, "nobody disputed it within a day");
      } else if (b.status === "live" && t.getTime() >= end + UNSETTLED_MS) {
        await refund(tq, b, "nobody settled it within 3 days of the end, so both got their money back");
      }
    });
  }
}

/** Coins someone has in bets that haven't finished, counted at what they put in. */
export async function lockedInFriendBetsFor(q: Q, userId: number) {
  const [r] = await q.query<{ v: number | null }>(
    `SELECT (coalesce((SELECT sum(stake) FROM friend_bets WHERE creator_id = $1 AND status IN ('open', 'live', 'claimed')), 0)
       + coalesce((SELECT sum(taker_stake) FROM friend_bets WHERE taker_id = $1 AND status IN ('live', 'claimed')), 0))::float8 AS v`,
    [userId]
  );
  return r.v ?? 0;
}

/** Every bet in a chat, shaped for its card, with the counter-offers still open. */
export async function friendBetsForChat(q: Q, groupId: number) {
  const bets = await q.query<FriendBet>(`SELECT * FROM friend_bets WHERE group_id = $1 ORDER BY id`, [groupId]);
  const counters = await q.query<{ id: number; bet_id: number; user_id: number; taker_stake: number }>(
    `SELECT c.id, c.bet_id, c.user_id, c.taker_stake FROM friend_bet_counters c JOIN friend_bets b ON b.id = c.bet_id
     WHERE b.group_id = $1 AND c.status = 'open' AND b.status = 'open' ORDER BY c.id`,
    [groupId]
  );
  return bets.map((b) => ({
    id: b.id,
    title: b.title,
    resolves_at: b.resolves_at,
    side: b.side,
    creator_id: b.creator_id,
    taker_id: b.taker_id,
    stake: b.stake,
    taker_stake: b.taker_stake,
    pot: pot(b),
    status: b.status,
    claim_by: b.claim_by,
    claimed_at: b.claimed_at,
    winner_id: b.winner_id,
    counters: counters.filter((c) => c.bet_id === b.id).map(({ id, user_id, taker_stake }) => ({ id, user_id, taker_stake })),
  }));
}
