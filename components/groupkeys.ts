import { importGroupKey, newGroupKey, unwrapGroupKey, wrapGroupKey } from "@/lib/e2ee";
import { api } from "./api";

const cache = new Map<number, { key: CryptoKey; raw: Uint8Array }>();

export async function groupKey(groupId: number, identity: CryptoKey, myKey: { wrapped_key: string; wrapper_public_key: string } | null) {
  const hit = cache.get(groupId);
  if (hit) return hit;
  if (!myKey) return null;
  const raw = await unwrapGroupKey(myKey.wrapped_key, identity, myKey.wrapper_public_key);
  const entry = { key: await importGroupKey(raw), raw };
  cache.set(groupId, entry);
  return entry;
}

/** Create a group: one fresh key, wrapped in this browser for every member. */
export async function createGroup(identity: CryptoKey, name: string, emoji: string, usernames: string[]) {
  const raw = newGroupKey();
  const users = await Promise.all(usernames.map((u) => api<{ username: string; public_key: string }>(`/api/users/${encodeURIComponent(u)}`)));
  const keys = await Promise.all(users.map(async (u) => ({ username: u.username, wrappedKey: await wrapGroupKey(raw, identity, u.public_key) })));
  const { id } = await api<{ id: number }>("/api/groups", { body: { name, emoji, keys } });
  return id;
}

export async function addMember(groupId: number, identity: CryptoKey, raw: Uint8Array, username: string) {
  const u = await api<{ username: string; public_key: string }>(`/api/users/${encodeURIComponent(username)}`);
  await api(`/api/groups/${groupId}/members`, { body: { username: u.username, wrappedKey: await wrapGroupKey(raw, identity, u.public_key) } });
}

/** Members who joined by invite link get the key from whoever is online next. */
export async function shareKeyWithNewcomers(groupId: number, identity: CryptoKey, raw: Uint8Array, members: { id: number; public_key: string; has_key: boolean }[]) {
  const missing = members.filter((m) => !m.has_key);
  if (!missing.length) return;
  const keys = await Promise.all(missing.map(async (m) => ({ userId: m.id, wrappedKey: await wrapGroupKey(raw, identity, m.public_key) })));
  await api(`/api/groups/${groupId}/keys`, { body: { keys } });
}
