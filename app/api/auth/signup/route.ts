import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { body } from "@/lib/http";
import { now } from "@/lib/clock";
import { ECONOMY } from "@/lib/config";
import { credit } from "@/lib/economy";
import { newWallet } from "@/lib/solana";
import { clientIp, limit } from "@/lib/ratelimit";
import { cleanUsername, usernameProblem } from "@/lib/accounts";
import { startSession } from "@/lib/sessions";
import { joinSampleGroups } from "@/lib/demo";
import { DEMO_DATA_FOR_ALL } from "@/lib/config";

const COLORS = ["#00d26a", "#4f8cff", "#ff6b6b", "#ffb020", "#b26bff", "#00c2d1", "#ff7ac6", "#9be15d"];

const Schema = z.object({
  username: z.string().regex(/^@?[a-z0-9_]{3,20}$/i, "3-20 letters, numbers or _"),
  displayName: z.string().trim().min(1).max(30),
  authKey: z.string().length(64),
  publicKey: z.string().min(20),
  encPrivateKey: z.string().min(20),
  keySalt: z.string().min(8),
  // The recovery code's proof and second sealed copy of the key (see prepareSignup in lib/e2ee).
  recoveryAuthKey: z.string().length(64).optional(),
  recoverySalt: z.string().min(8).optional(),
  encPrivateKeyRecovery: z.string().min(20).optional(),
});

export const POST = route(
  async (req) => {
    limit(`signup:ip:${clientIp(req)}`, 5, 3600);
    const b = await body(req, Schema);
    const db = await getDb();
    const username = cleanUsername(b.username);
    const recovery = b.recoveryAuthKey && b.recoverySalt && b.encPrivateKeyRecovery;
    // The browser only ever sends keys derived from the password, never the password.
    const [hash, recoveryHash] = await Promise.all([bcrypt.hash(b.authKey, 10), recovery ? bcrypt.hash(b.recoveryAuthKey!, 10) : null]);
    const wallet = newWallet();
    const id = await db.tx(async (q) => {
      const problem = await usernameProblem(q, username);
      if (problem) throw new HttpError(409, problem);
      const [u] = await q.query<{ id: number }>(
        `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt, wallet_pubkey, wallet_secret_enc,
           recovery_hash, recovery_salt, enc_private_key_recovery)
         VALUES ($1,$2,$3,$4,0,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [username, b.displayName, hash, COLORS[Math.floor(Math.random() * COLORS.length)], now(), b.publicKey, b.encPrivateKey, b.keySalt, wallet.pubkey, wallet.secretEnc,
          recoveryHash, recovery ? b.recoverySalt : null, recovery ? b.encPrivateKeyRecovery : null]
      );
      await credit(q, u.id, ECONOMY.startingBalance, "Welcome bonus");
      // Unanswered "about you" questions, offered once after sign-up.
      await q.query(`INSERT INTO profiles (user_id, answers, done, updated_at) VALUES ($1, '{}'::jsonb, false, $2) ON CONFLICT DO NOTHING`, [u.id, now()]);
      return u.id;
    }).catch((e) => {
      // Two sign-ups racing for one name: the unique index catches the loser.
      if (/unique|duplicate/i.test((e as Error).message)) throw new HttpError(409, "That username is taken");
      throw e;
    });
    // Demo: start in the sample chats rather than an empty app. A failure here must not fail the sign-up.
    if (DEMO_DATA_FOR_ALL) await joinSampleGroups(id).catch((e) => console.warn("[demo] joining sample chats failed:", (e as Error).message));
    const res = NextResponse.json({ id, username });
    await startSession(req, res, id);
    return res;
  },
  { auth: false }
);
