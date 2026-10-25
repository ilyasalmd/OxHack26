"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { decryptBytes, encryptBytes, importGroupKey, unwrapGroupKey } from "@/lib/e2ee";

// Encrypted files on the device: upload after encrypting, download and decrypt into a blob URL.
// Decrypted copies only ever live in this tab's memory.

export type UploadKind = "voice" | "image" | "group_photo" | "avatar" | "wallpaper";

export async function uploadEncrypted(kind: UploadKind, groupId: number | null, key: CryptoKey, data: Uint8Array) {
  const sealed = await encryptBytes(key, data);
  const r = await fetch(`/api/attachments?kind=${kind}${groupId != null ? `&group=${groupId}` : ""}`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: sealed as BufferSource,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error ?? `Upload failed (${r.status})`);
  return out.id as number;
}

const urls = new Map<number, Promise<string | null>>();

/** A blob URL for attachment `id`, decrypted with `key`. Cached for the life of the tab. */
export function attachmentUrl(id: number, key: CryptoKey, mime: string) {
  let p = urls.get(id);
  if (!p) {
    p = fetch(`/api/attachments/${id}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => decryptBytes(key, new Uint8Array(buf)))
      .then((bytes) => URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime })))
      .catch(() => {
        urls.delete(id);
        return null;
      });
    urls.set(id, p);
  }
  return p;
}

/** The sender already has the file: reuse its local copy instead of downloading what it just sent. */
export function primeAttachment(id: number, url: string) {
  urls.set(id, Promise.resolve(url));
}

/** Hook form of attachmentUrl. `null` while loading (or with no key), "error" if it can't be opened. */
export function useAttachment(id: number | null | undefined, key: CryptoKey | null | undefined, mime: string) {
  const [url, setUrl] = useState<string | null | "error">(null);
  useEffect(() => {
    if (!id || !key) return setUrl(null);
    let alive = true;
    attachmentUrl(id, key, mime).then((u) => alive && setUrl(u ?? "error"));
    return () => {
      alive = false;
    };
  }, [id, key, mime]);
  return url;
}

// Profile photos. Each person's photo is encrypted with their own profile key, which their app
// wraps for everyone they share a chat with. Screens hand us whatever they learn about people
// (photo id, the key wrapped for this viewer, the owner's public key) and any <Avatar id> picks it up.

type PhotoRec = { avatarId: number; wrapped: string; ownerPub: string };
export type PhotoInfo = { id: number; avatar_id?: number | null; avatar_key?: string | null; public_key?: string };

const photos = new Map<number, PhotoRec>();
const listeners = new Set<() => void>();
let viewer: CryptoKey | null = null;
const notify = () => listeners.forEach((l) => l());

export function setPhotoViewer(identity: CryptoKey | null) {
  if (viewer === identity) return;
  viewer = identity;
  notify();
}

export function registerPhotos(people: PhotoInfo[]) {
  let changed = false;
  for (const p of people) {
    if (p.avatar_id === undefined) continue; // this screen didn't say either way
    const cur = photos.get(p.id);
    if (!p.avatar_id || !p.avatar_key || !p.public_key) {
      if (cur && !p.avatar_id) {
        photos.delete(p.id);
        changed = true;
      }
      continue;
    }
    if (cur?.avatarId === p.avatar_id && cur.wrapped === p.avatar_key) continue;
    photos.set(p.id, { avatarId: p.avatar_id, wrapped: p.avatar_key, ownerPub: p.public_key });
    changed = true;
  }
  if (changed) notify();
}

const profileKeys = new Map<string, Promise<CryptoKey | null>>();
/** Opens a profile key wrapped for this viewer. */
export function openProfileKey(wrapped: string, ownerPub: string) {
  if (!viewer) return Promise.resolve(null);
  const k = `${ownerPub}:${wrapped}`;
  let p = profileKeys.get(k);
  if (!p) {
    p = unwrapGroupKey(wrapped, viewer, ownerPub)
      .then((raw) => importGroupKey(raw))
      .catch(() => null);
    profileKeys.set(k, p);
  }
  return p;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The decrypted photo of user `id`, if they have one and have shared their key with this viewer. */
export function useUserPhoto(id: number | undefined) {
  const rec = useSyncExternalStore(subscribe, () => (id ? photos.get(id) : undefined), () => undefined);
  const hasViewer = useSyncExternalStore(subscribe, () => !!viewer, () => false);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!rec || !hasViewer) return setUrl(null);
    let alive = true;
    openProfileKey(rec.wrapped, rec.ownerPub)
      .then((k) => (k ? attachmentUrl(rec.avatarId, k, "image/jpeg") : null))
      .then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [rec, hasViewer]);
  return url;
}

// Images are re-drawn on a canvas before encrypting: that strips location and camera metadata
// and keeps files small.

export async function shrinkImage(file: Blob, max = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't read that image"))), "image/jpeg", quality));
  return { blob, bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

/** A square crop from the centre, for profile and group photos. `zoom` above 1 crops in closer. */
export async function squarePhoto(file: Blob, size = 384, zoom = 1) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height) / Math.max(1, zoom);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't read that image"))), "image/jpeg", 0.85));
  return { blob, bytes: new Uint8Array(await blob.arrayBuffer()) };
}
