import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, route, setSession } from "@/lib/auth";
import { body } from "@/lib/http";

export const POST = route(
  async (req) => {
    const b = await body(req, z.object({ username: z.string(), authKey: z.string().length(64) }));
    const db = await getDb();
    const [u] = await db.query<{ id: number; auth_hash: string; enc_private_key: string; username: string }>(
      `SELECT id, auth_hash, enc_private_key, username FROM users WHERE username = $1`,
      [b.username.toLowerCase()]
    );
    if (!u || !(await bcrypt.compare(b.authKey, u.auth_hash))) throw new HttpError(401, "Wrong username or password");
    const res = NextResponse.json({ id: u.id, username: u.username, encPrivateKey: u.enc_private_key });
    setSession(res, u.id);
    return res;
  },
  { auth: false }
);
