import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { COOKIE, MAX_AGE, route, sessionId } from "@/lib/auth";
import { body } from "@/lib/http";
import { describeDevice, revokeSessions } from "@/lib/sessions";

// Signed-in devices. Ids are the stored hashes, which can't be turned back into cookies.
export const GET = route(async (req, user) => {
  const db = await getDb();
  const me = sessionId(req);
  const rows = await db.query<{ id: string; created_at: Date; last_seen_at: Date; user_agent: string; ip_hint: string }>(
    `SELECT id, created_at, last_seen_at, user_agent, ip_hint FROM sessions
     WHERE user_id = $1 AND revoked_at IS NULL AND created_at > $2 ORDER BY last_seen_at DESC`,
    [user.id, new Date(Date.now() - MAX_AGE * 1000)]
  );
  return {
    sessions: rows
      .map((s) => ({ id: s.id, device: describeDevice(s.user_agent), place: s.ip_hint, createdAt: s.created_at, lastSeenAt: s.last_seen_at, current: s.id === me }))
      .sort((a, b) => Number(b.current) - Number(a.current)),
  };
});

//   { id }          sign one device out (this one too)
//   { others: true } sign out everywhere else
export const POST = route(async (req, user) => {
  const b = await body(req, z.union([z.object({ id: z.string().min(10) }), z.object({ others: z.literal(true) })]));
  const db = await getDb();
  const me = sessionId(req);
  if ("others" in b) return { signedOut: await revokeSessions(db, user.id, me) };
  const done = await db.query(`UPDATE sessions SET revoked_at = $3 WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`, [b.id, user.id, new Date()]);
  if (b.id !== me) return { signedOut: done.length };
  const res = NextResponse.json({ signedOut: done.length, self: true });
  res.cookies.delete(COOKIE);
  return res;
});
