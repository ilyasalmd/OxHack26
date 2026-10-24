"use client";
import { useEffect } from "react";
import type { Attachment } from "@/lib/e2ee";
import { Close, ImageIcon, Lock } from "../icons";

/** Fits a photo into the bubble at its own shape: at most 260px wide and 320px tall. */
function box(a: Attachment) {
  const w = a.w ?? 4;
  const h = a.h ?? 3;
  const scale = Math.min(260 / w, 320 / h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** A photo in a bubble. `children` (the time and ticks) sit on the photo's bottom-right corner. */
export function ImageBubble({ a, url, onOpen, children }: { a: Attachment; url: string | null | "error"; onOpen: () => void; children?: React.ReactNode }) {
  const size = box(a);
  return (
    <div className="relative">
    <button type="button" onClick={onOpen} disabled={!url || url === "error"} className="relative block max-w-full overflow-hidden rounded-xl bg-black/30" style={{ width: size.width, aspectRatio: `${size.width} / ${size.height}` }} aria-label="Open photo">
      {url && url !== "error" ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-xs text-white/50">
          {url === "error" ? <><ImageIcon size={20} /> Photo unavailable</> : <><Lock size={16} className="animate-pulse" /> Decrypting</>}
        </span>
      )}
    </button>
      {children && <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-black/45 px-2 py-0.5 backdrop-blur-sm">{children}</span>}
    </div>
  );
}

/** Full-screen photo. Esc, the close button or a tap outside the photo closes it. */
export function Lightbox({ url, caption, meta, onClose }: { url: string; caption?: string; meta?: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="pop fixed inset-0 z-[60] flex flex-col bg-black/95" onClick={onClose} role="dialog" aria-label="Photo">
      <div className="flex items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+12px)] text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1 truncate">{meta}</div>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Close photo"><Close size={18} /></button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        <img src={url} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      </div>
      {caption && <p className="mx-auto max-w-2xl px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2 text-center text-[15px] text-white/90" onClick={(e) => e.stopPropagation()}>{caption}</p>}
    </div>
  );
}
