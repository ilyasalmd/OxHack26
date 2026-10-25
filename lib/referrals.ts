import crypto from "node:crypto";
import type { Q } from "./db";
import { ECONOMY } from "./config";
import { now } from "./clock";
import { credit } from "./economy";
import { SAMPLE_GROUPS } from "./demo";

/**
 * Invite friends. Everyone gets one invite link; a friend who signs up with it counts once they've
 * joined a chat with someone or made a stake, and the first ECONOMY.referralFriends of those pay the
 * inviter ECONOMY.referralReward, once per account, through the normal ledger (so it mints on chain too).
 *
 * Fake accounts: a friend can only be invited at sign-up, so every invitee is a distinct new account.
 * A sign-up from a device the inviter has used, or from a device another of their friends already
 * signed up on, never counts, nor do sign-ups past the daily cap on one link. Joining the sample
 * chats (where every new account lands as a guest) or a chat nobody else is in doesn't make anyone active.
 */

export const REFERRAL_CODE = /^[A-Za-z0-9_-]{6,16}$/;
export const REF_COOKIE = "fs_ref";

/** The user's invite code, made the first time they ask for it. */
export async function referralCode(q: Q, userId: number) {
  const [u] = await q.query<{ referral_code: string | null }>(`SELECT referral_code FROM users WHERE id = $1`, [userId]);
  if (u?.referral_code) return u.referral_code;
  for (;;) {
    const code = crypto.randomBytes(6).toString("base64url");
    const [set] = await q.query<{ referral_code: string }>(
      `UPDATE users SET referral_code = COALESCE(referral_code, $2) WHERE id = $1
         AND NOT EXISTS (SELECT 1 FROM users WHERE referral_code = $2) RETURNING referral_code`,
      [userId, code]
    );
    if (set) return set.referral_code;
  }
}

export type Blocked = "same_device" | "device_reused" | "too_many";

/**
 * Records that the brand-new account `inviteeId` signed up with `code`. Call it inside the sign-up
 * transaction, before the new account's session exists. Returns null when the code is unknown.
 */
export async function attachReferral(q: Q, inviteeId: number, code: string | null | undefined, deviceHash: string | null) {
  if (!code || !REFERRAL_CODE.test(code)) return null;
  const [inviter] = await q.query<{ id: number }>(`SELECT id FROM users WHERE referral_code = $1 AND deleted_at IS NULL`, [code]);
  if (!inviter || inviter.id === inviteeId) return null;
  let blocked: Blocked | null = null;
  if (deviceHash) {
    const [mine] = await q.query(`SELECT 1 FROM sessions WHERE user_id = $1 AND device_hash = $2 LIMIT 1`, [inviter.id, deviceHash]);
    const [reused] = mine ? [] : await q.query(`SELECT 1 FROM referrals WHERE inviter_id = $1 AND device_hash = $2 LIMIT 1`, [inviter.id, deviceHash]);
    blocked = mine ? "same_device" : reused ? "device_reused" : null;
  }
  // Security times run on the real clock, not the demo time machine.
  const t = new Date();
  if (!blocked) {
    const [{ n }] = await q.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM referrals WHERE inviter_id = $1 AND created_at > $2`,
      [inviter.id, new Date(t.getTime() - 86_400_000)]
    );
    if (n >= ECONOMY.referralDailyCap) blocked = "too_many";
  }
  await q.query(
    `INSERT INTO referrals (invitee_id, inviter_id, created_at, device_hash, blocked) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
    [inviteeId, inviter.id, t, deviceHash, blocked]
  );
  return { inviterId: inviter.id, blocked };
}

/** Friends of `inviterId` who now count: joined a real chat with someone else, made a stake, or a friend bet. */
async function markActive(q: Q, inviterId: number) {
  await q.query(
    `UPDATE referrals r SET active_at = $2
      WHERE r.inviter_id = $1 AND r.active_at IS NULL AND r.blocked IS NULL
        AND EXISTS (SELECT 1 FROM users u WHERE u.id = r.invitee_id AND u.deleted_at IS NULL)
        AND (EXISTS (SELECT 1 FROM trades t WHERE t.user_id = r.invitee_id AND NOT t.bot)
          OR EXISTS (SELECT 1 FROM friend_bets fb WHERE fb.creator_id = r.invitee_id OR fb.taker_id = r.invitee_id)
          OR EXISTS (SELECT 1 FROM group_members gm JOIN groups gr ON gr.id = gm.group_id
                      WHERE gm.user_id = r.invitee_id AND NOT gm.guest AND NOT gr.is_dm AND NOT ${SAMPLE_GROUPS}
                        AND EXISTS (SELECT 1 FROM group_members o WHERE o.group_id = gr.id AND o.user_id <> r.invitee_id AND NOT o.guest)))`,
    [inviterId, now()]
  );
}

/**
 * Brings the inviter's friends up to date and pays the reward the first time enough of them count.
 * Safe to call on every visit and concurrently: the payout is claimed with a guarded update.
 * Returns true when this call paid it.
 */
export async function settleReferrals(q: Q, inviterId: number) {
  const [pending] = await q.query(`SELECT 1 FROM referrals WHERE inviter_id = $1 AND active_at IS NULL AND blocked IS NULL LIMIT 1`, [inviterId]);
  if (pending) await markActive(q, inviterId);
  const [u] = await q.query<{ paid: boolean }>(`SELECT referral_paid_at IS NOT NULL AS paid FROM users WHERE id = $1`, [inviterId]);
  if (!u || u.paid || (await countedFriends(q, inviterId)) < ECONOMY.referralFriends) return false;
  const claimed = await q.query(`UPDATE users SET referral_paid_at = $2 WHERE id = $1 AND referral_paid_at IS NULL RETURNING id`, [inviterId, now()]);
  if (!claimed.length) return false;
  await credit(q, inviterId, ECONOMY.referralReward, `Invited ${ECONOMY.referralFriends} friends`);
  return true;
}

async function countedFriends(q: Q, inviterId: number) {
  const [{ n }] = await q.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM referrals r JOIN users u ON u.id = r.invitee_id
      WHERE r.inviter_id = $1 AND r.blocked IS NULL AND r.active_at IS NOT NULL AND u.deleted_at IS NULL`,
    [inviterId]
  );
  return n;
}

export type InviteStatus = {
  code: string;
  goal: number;
  reward: number;
  /** Friends who count towards the reward, capped at the goal. */
  done: number;
  paid: boolean;
  friends: { name: string; status: "counted" | "waiting" | "not_counted" }[];
};

/** What the inviter sees: their code, "2 of 3 friends", and each friend who signed up with it. Settle first. */
export async function inviteStatus(q: Q, userId: number): Promise<InviteStatus> {
  const code = await referralCode(q, userId);
  const rows = await q.query<{ name: string; blocked: string | null; active: boolean }>(
    `SELECT u.display_name AS name, r.blocked, r.active_at IS NOT NULL AS active
       FROM referrals r JOIN users u ON u.id = r.invitee_id
      WHERE r.inviter_id = $1 AND u.deleted_at IS NULL ORDER BY r.created_at`,
    [userId]
  );
  const [u] = await q.query<{ paid: boolean }>(`SELECT referral_paid_at IS NOT NULL AS paid FROM users WHERE id = $1`, [userId]);
  const friends = rows.map((r) => ({ name: r.name, status: r.blocked ? "not_counted" as const : r.active ? "counted" as const : "waiting" as const }));
  return {
    code,
    goal: ECONOMY.referralFriends,
    reward: ECONOMY.referralReward,
    done: Math.min(ECONOMY.referralFriends, friends.filter((f) => f.status === "counted").length),
    paid: u.paid,
    friends,
  };
}

/** On each visit: settles the user's own invites and, once they're active, the friend who invited them. */
export async function settleReferralsAround(q: Q, userId: number) {
  await settleReferrals(q, userId);
  const [r] = await q.query<{ inviter_id: number }>(
    `SELECT r.inviter_id FROM referrals r JOIN users u ON u.id = r.inviter_id
      WHERE r.invitee_id = $1 AND r.blocked IS NULL AND u.referral_paid_at IS NULL`,
    [userId]
  );
  if (r) await settleReferrals(q, r.inviter_id);
}
