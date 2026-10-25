import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { body } from "@/lib/http";
import { clientIp, limit } from "@/lib/ratelimit";
import { cleanUsername } from "@/lib/accounts";
import { startSession } from "@/lib/sessions";

export const POST = route(
  async (req) => {
    limit(`login:ip:${clientIp(req)}`, 10, 60);
    const b = await body(req, z.object({ username: z.string().max(40), authKey: z.string().length(64) }));
    const username = cleanUsername(b.username);
    limit(`login:user:${username}`, 20, 3600);
    const db = await getDb();
    const [u] = await db.query<{ id: number; auth_hash: string; enc_private_key: string; username: string }>(
      `SELECT id, auth_hash, enc_private_key, username FROM users WHERE username = $1 AND deleted_at IS NULL`,
      [username]
    );
    if (!u || !(await bcrypt.compare(b.authKey, u.auth_hash))) throw new HttpError(401, "Wrong username or password");
    const res = NextResponse.json({ id: u.id, username: u.username, encPrivateKey: u.enc_private_key });
    await startSession(req, res, u.id);
    return res;
  },
  { auth: false }
);
