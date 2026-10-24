"use client";
import { useEffect, useState } from "react";
import { useSession } from "../session";
import { groupKey } from "../groupkeys";
import { useAttachment } from "../media";
import { Avatar } from "../ui";
import { GroupMark } from "../shell";

export type ChatLike = {
  id: number;
  name: string;
  is_dm?: boolean;
  photo_id?: number | null;
  peer?: { id: number; display_name: string; color: string } | null;
  my_key?: { wrapped_key: string; wrapper_public_key: string } | null;
};

/** A private chat is named after the other person; a group by its own name. */
export const chatName = (g: ChatLike) => (g.is_dm && g.peer ? g.peer.display_name : g.name);

/** The picture beside a chat: the other person's photo in a private chat, else the group photo, else initials. */
export function ChatMark({ g, size = 40 }: { g: ChatLike; size?: number }) {
  const { identity } = useSession();
  const [key, setKey] = useState<CryptoKey | null>(null);
  useEffect(() => {
    if (!g.photo_id || !identity || !g.my_key) return;
    let alive = true;
    groupKey(g.id, identity, g.my_key)
      .then((k) => alive && setKey(k?.key ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [g.id, g.photo_id, g.my_key, identity]);
  const photo = useAttachment(g.is_dm ? null : g.photo_id, key, "image/jpeg");
  if (g.is_dm && g.peer) return <Avatar id={g.peer.id} name={g.peer.display_name} color={g.peer.color} size={size} />;
  if (photo && photo !== "error")
    // eslint-disable-next-line @next/next/no-img-element -- decrypted blob URL
    return <img src={photo} alt="" className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />;
  return <GroupMark name={g.name} size={size} />;
}
