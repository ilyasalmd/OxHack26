"use client";
import { useRef, useState } from "react";
import { api } from "./api";
import { useSession } from "./session";
import { Avatar } from "./ui";
import { Camera, Lock } from "./icons";
import { primeAttachment, squarePhoto, uploadEncrypted } from "./media";
import { importGroupKey, newGroupKey, unwrapGroupKey, wrapGroupKey } from "@/lib/e2ee";

/**
 * Your profile photo, tap to change. It's encrypted on this device with your profile key, which
 * your app then wraps for each person you share a chat with, so the server only holds ciphertext.
 */
export function ProfilePhoto({ size = 52, withHelp = false }: { size?: number; withHelp?: boolean }) {
  const { me, identity, refresh } = useSession();
  const pick = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!me) return null;

  async function change(file: File | undefined) {
    if (!file || !identity || !me) return;
    setBusy(true);
    setErr("");
    try {
      const existing = me.photo?.key;
      const raw = existing ? await unwrapGroupKey(existing, identity, me.user.public_key) : newGroupKey();
      const sq = await squarePhoto(file);
      const avatarId = await uploadEncrypted("avatar", null, await importGroupKey(raw), sq.bytes);
      primeAttachment(avatarId, URL.createObjectURL(sq.blob));
      await api("/api/profile/avatar", { method: "PUT", body: { avatarId, ...(existing ? {} : { selfKey: await wrapGroupKey(raw, identity, me.user.public_key) }) } });
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    await api("/api/profile/avatar", { method: "PUT", body: { avatarId: null } }).catch((e) => setErr(e.message));
    await refresh();
    setBusy(false);
  }

  const button = (
    <button type="button" onClick={() => pick.current?.click()} disabled={!identity || busy} className="relative shrink-0 rounded-full disabled:opacity-60" aria-label="Change profile photo" title={identity ? "Change profile photo" : "Unlock your chats to change your photo"}>
      <Avatar id={me.user.id} name={me.user.display_name} color={me.user.color} size={size} />
      <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-ink bg-white text-black" style={{ width: Math.max(20, size * 0.38), height: Math.max(20, size * 0.38) }}>
        <Camera size={Math.max(11, size * 0.2)} />
      </span>
      <input ref={pick} type="file" accept="image/*" hidden onChange={(e) => { void change(e.target.files?.[0]); e.target.value = ""; }} />
    </button>
  );
  if (!withHelp) return button;
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-panel p-5">
      {button}
      <div className="min-w-0 flex-1">
        <div className="font-medium">Profile photo</div>
        <p className="mt-0.5 flex items-start gap-1.5 text-sm text-mute"><Lock size={13} className="mt-0.5" /> Encrypted on this device. Only people you share a chat with can see it.</p>
        <div className="mt-2 flex gap-3 text-sm">
          <button onClick={() => pick.current?.click()} disabled={!identity || busy} className="font-medium text-white hover:underline disabled:opacity-50">{busy ? "Saving…" : me.photo?.avatarId ? "Change" : "Add a photo"}</button>
          {me.photo?.avatarId && <button onClick={remove} disabled={busy} className="text-mute hover:text-white">Remove</button>}
        </div>
        {err && <p className="mt-1 text-sm text-down">{err}</p>}
      </div>
    </div>
  );
}
