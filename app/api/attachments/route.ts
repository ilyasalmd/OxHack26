import { getDb } from "@/lib/db";
import { HttpError, requireMember, route } from "@/lib/auth";
import { now } from "@/lib/clock";
import { limit } from "@/lib/ratelimit";
import { ATTACHMENT_LIMITS, isAttachmentKind } from "@/lib/chat";

// Uploads an encrypted file (IV + AES-GCM ciphertext, made in the browser) and returns its id.
// The message that points at it, and the key that opens it, travel inside the chat's encryption.
//   POST /api/attachments?kind=voice&group=12   body: raw bytes
export const POST = route(async (req, user) => {
  const kind = req.nextUrl.searchParams.get("kind");
  if (!isAttachmentKind(kind)) throw new HttpError(400, "Unknown attachment kind");
  const groupId = kind === "avatar" || kind === "wallpaper" ? null : Number(req.nextUrl.searchParams.get("group"));
  if (groupId !== null) {
    if (!Number.isInteger(groupId)) throw new HttpError(400, "Which chat is this for?");
    await requireMember(groupId, user.id);
  }
  limit(`upload:${user.id}`, 40, 60);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > ATTACHMENT_LIMITS[kind]) throw new HttpError(413, "That file is too big");
  const data = new Uint8Array(await req.arrayBuffer());
  if (data.length > ATTACHMENT_LIMITS[kind]) throw new HttpError(413, "That file is too big");
  if (data.length < 12 + 16) throw new HttpError(400, "That doesn't look like an encrypted file");
  const db = await getDb();
  const [a] = await db.query<{ id: number }>(
    `INSERT INTO attachments (owner_id, group_id, kind, data, size, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::int`,
    [user.id, groupId, kind, data, data.length, now()]
  );
  return { id: a.id };
});
