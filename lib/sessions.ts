import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getDb, type Q } from "./db";
import { COOKIE, MAX_AGE, hashToken } from "./auth";
import { sign } from "./secret";
import { clientIp } from "./ratelimit";

/** Opens a new session row for this device and sets the cookie on `res`. */
export async function startSession(req: NextRequest, res: NextResponse, userId: number, q?: Q) {
  const token = crypto.randomBytes(32).toString("base64url");
  const t = new Date();
  await (q ?? (await getDb())).query(
    `INSERT INTO sessions (id, user_id, created_at, last_seen_at, user_agent, ip_hint) VALUES ($1,$2,$3,$3,$4,$5)`,
    [hashToken(token), userId, t, (req.headers.get("user-agent") ?? "").slice(0, 400), ipHint(req)]
  );
  res.cookies.set(COOKIE, sign(`s:${token}`), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Revokes every live session of a user, or every one but `keepId`. */
export async function revokeSessions(q: Q, userId: number, keepId: string | null = null) {
  const rows = await q.query(
    `UPDATE sessions SET revoked_at = $3 WHERE user_id = $1 AND revoked_at IS NULL AND ($2::text IS NULL OR id <> $2) RETURNING id`,
    [userId, keepId, new Date()]
  );
  return rows.length;
}

/** A rough place: the country when a proxy says so, and the first two octets of the address. */
export function ipHint(req: NextRequest) {
  const ip = clientIp(req);
  const v4 = ip.match(/(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  let net = "";
  if (ip === "local" || ip === "::1" || ip.startsWith("127.")) net = "local network";
  else if (v4) net = `${v4[1]}.${v4[2]}.x.x`;
  else if (ip.includes(":")) net = `${ip.split(":").filter(Boolean).slice(0, 2).join(":")}::`;
  const country = req.headers.get("cf-ipcountry");
  return [country && /^[A-Z]{2}$/.test(country) && country !== "XX" ? country : "", net].filter(Boolean).join(", ");
}

/** "Safari on iPhone", from a user agent string. */
export function describeDevice(ua: string) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
      : /Firefox\/|FxiOS/.test(ua) ? "Firefox"
        : /Chrome\/|CriOS/.test(ua) ? "Chrome"
          : /Safari\//.test(ua) ? "Safari"
            : /curl\//.test(ua) ? "curl"
              : "Browser";
  const os = /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
      : /Android/.test(ua) ? "Android"
        : /Mac OS X|Macintosh/.test(ua) ? "Mac"
          : /Windows/.test(ua) ? "Windows"
            : /CrOS/.test(ua) ? "ChromeOS"
              : /Linux/.test(ua) ? "Linux"
                : "";
  return os ? `${browser} on ${os}` : browser;
}
