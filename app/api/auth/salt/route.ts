import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// The E2EE key salt is needed before login so the browser can derive its keys.
export async function GET(req: NextRequest) {
  const username = (req.nextUrl.searchParams.get("username") ?? "").toLowerCase();
  const db = await getDb();
  const [u] = await db.query<{ key_salt: string }>(`SELECT key_salt FROM users WHERE username = $1`, [username]);
  if (!u) return NextResponse.json({ error: "No account with that username" }, { status: 404 });
  return NextResponse.json({ salt: u.key_salt });
}
