import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { route, sessionId } from "@/lib/auth";
import { inviteStatus, settleReferrals } from "@/lib/referrals";
import { keepDevice } from "@/lib/sessions";

// Your invite link and how many friends count so far. Asking for it also tags this browser's
// session with its device id, so the link's owner can't sign up "friends" from the same device.
export const GET = route(async (req, user) => {
  const db = await getDb();
  await db.tx((q) => settleReferrals(q, user.id));
  const res = NextResponse.json(await inviteStatus(db, user.id));
  const sid = sessionId(req);
  if (sid) await db.query(`UPDATE sessions SET device_hash = $2 WHERE id = $1 AND device_hash IS NULL`, [sid, keepDevice(req, res)]);
  return res;
});
