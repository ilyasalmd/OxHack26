import crypto from "node:crypto";

function appKey() {
  const s = process.env.APP_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("APP_SECRET must be set in production");
  return crypto.createHash("sha256").update(s ?? "friend-stocks-dev-only-secret").digest();
}

export function sign(value: string) {
  const mac = crypto.createHmac("sha256", appKey()).update(value).digest("base64url");
  return `${value}.${mac}`;
}

export function verify(signed: string | undefined) {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const expected = sign(value);
  const a = Buffer.from(expected);
  const b = Buffer.from(signed);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? value : null;
}

/** AES-256-GCM at rest, for custodial devnet wallet secrets. */
export function seal(plain: Uint8Array) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", appKey(), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

export function unseal(sealed: string) {
  const [iv, tag, body] = sealed.split(".").map((s) => Buffer.from(s, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", appKey(), iv);
  d.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([d.update(body), d.final()]));
}
