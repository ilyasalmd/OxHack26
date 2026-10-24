import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, route, setSession } from "@/lib/auth";
import { body } from "@/lib/http";
import { now } from "@/lib/clock";
import { ECONOMY } from "@/lib/config";
import { credit } from "@/lib/economy";
import { newWallet } from "@/lib/solana";

const COLORS = ["#00d26a", "#4f8cff", "#ff6b6b", "#ffb020", "#b26bff", "#00c2d1", "#ff7ac6", "#9be15d"];

const Schema = z.object({
  username: z.string().regex(/^[a-z0-9_]{3,20}$/i, "3-20 letters, numbers or _"),
  displayName: z.string().min(1).max(30),
  authKey: z.string().length(64),
  publicKey: z.string().min(20),
  encPrivateKey: z.string().min(20),
  keySalt: z.string().min(8),
});

export const POST = route(
  async (req) => {
    const b = await body(req, Schema);
    const db = await getDb();
    const username = b.username.toLowerCase();
    // The browser only ever sends a key derived from the password, never the password.
    const hash = await bcrypt.hash(b.authKey, 10);
    const wallet = newWallet();
    const id = await db.tx(async (q) => {
      const [exists] = await q.query(`SELECT 1 FROM users WHERE username = $1`, [username]);
      if (exists) throw new HttpError(409, "That username is taken");
      const [u] = await q.query<{ id: number }>(
        `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt, wallet_pubkey, wallet_secret_enc)
         VALUES ($1,$2,$3,$4,0,$5,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [username, b.displayName, hash, COLORS[Math.floor(Math.random() * COLORS.length)], now(), b.publicKey, b.encPrivateKey, b.keySalt, wallet.pubkey, wallet.secretEnc]
      );
      await credit(q, u.id, ECONOMY.startingBalance, "Welcome bonus");
      return u.id;
    });
    const res = NextResponse.json({ id, username });
    setSession(res, id);
    return res;
  },
  { auth: false }
);
