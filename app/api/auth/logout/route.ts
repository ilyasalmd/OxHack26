import { NextRequest, NextResponse } from "next/server";
import { COOKIE, sessionId } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const sid = sessionId(req);
  if (sid) await (await getDb()).query(`UPDATE sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL`, [sid, new Date()]);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}
