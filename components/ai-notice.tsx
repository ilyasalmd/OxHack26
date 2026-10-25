"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AI_CHAT } from "@/lib/ai-disclosure";
import { Close, Sparkle } from "./icons";

/** The always-on AI chat notice: shown before creating or joining a chat, in group info and in Settings. */
export function AiChatNotice({ open = false, className = "" }: { open?: boolean; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-ink p-3 text-sm ${className}`}>
      <div className="flex items-center gap-2 font-semibold"><Sparkle size={14} className="text-brand" /> {AI_CHAT.title} <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-white/[.06] px-2 py-0.5 text-[11px] font-medium text-mute">{AI_CHAT.status}</span></div>
      <p className="mt-1.5 text-xs leading-relaxed text-mute">{AI_CHAT.short}</p>
      <details open={open} className="mt-2 text-xs">
        <summary className="cursor-pointer select-none text-mute hover:text-white">Exactly what the AI receives and what is stored</summary>
        <ul className="mt-2 space-y-1.5 text-mute">
          {AI_CHAT.points.map((p) => (
            <li key={p.head}><span className="font-semibold text-white/85">{p.head}.</span> {p.body}</li>
          ))}
        </ul>
        <Link href="/privacy#ai" className="mt-2 inline-block text-brand hover:underline">Privacy notice</Link>
      </details>
    </div>
  );
}

const seenKey = (groupId: number) => `fs:ai-notice:${groupId}`;

/** One-time strip at the top of a chat, for people who were added by a friend and never saw the join screen. */
export function AiChatBanner({ groupId }: { groupId: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(!localStorage.getItem(seenKey(groupId)));
    } catch {
      setShow(false);
    }
  }, [groupId]);
  if (!show) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(seenKey(groupId), new Date().toISOString());
    } catch {}
    setShow(false);
  };
  return (
    <div className="m-3 flex items-start gap-2 rounded-xl border border-line bg-panel p-3 text-xs text-mute" role="note">
      <Sparkle size={14} className="mt-px shrink-0 text-brand" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold text-white">{AI_CHAT.title}, always on.</span> {AI_CHAT.short} <Link href="/privacy#ai" className="text-brand hover:underline">What exactly</Link>
      </p>
      <button onClick={dismiss} className="shrink-0 rounded-md p-0.5 hover:bg-white/10 hover:text-white" aria-label="Dismiss">
        <Close size={14} />
      </button>
    </div>
  );
}
