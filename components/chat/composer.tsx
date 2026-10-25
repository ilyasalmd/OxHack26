"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Sheet } from "../ui";
import { Camera, ImageIcon, Lock, Mic, Plus, Send, Trash } from "../icons";
import { shrinkImage } from "../media";
import { mmss, useRecorder, VOICE_MAX_SECONDS, type Recording } from "./voice";

export type PickedImage = { url: string; bytes: Uint8Array; w: number; h: number };
type Mode = "text" | "voice" | null;

/**
 * The bar under the chat. Empty, it offers a voice note; once you type, the mic turns into Send.
 * Photos come from the picker, the camera (phone), a paste, or a drop onto the chat.
 */
export function Composer({
  disabled,
  dropped,
  onDropHandled,
  onText,
  onImage,
  onVoice,
  onTyping,
  onSituation,
}: {
  disabled: boolean;
  dropped: File | null;
  onDropHandled: () => void;
  onText: (text: string) => void;
  onImage: (img: PickedImage, caption: string) => void;
  onVoice: (rec: Recording) => void;
  onTyping: (mode: Mode) => void;
  onSituation: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [img, setImg] = useState<PickedImage | null>(null);
  const [caption, setCaption] = useState("");
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const filePick = useRef<HTMLInputElement>(null);
  const camPick = useRef<HTMLInputElement>(null);
  const rec = useRecorder();
  const lastPing = useRef<{ mode: Mode; at: number }>({ mode: null, at: 0 });

  /** Tell the chat what we're doing, at most every 3 seconds (the server forgets after 5). */
  function ping(mode: Mode) {
    const l = lastPing.current;
    if (mode === l.mode && (mode === null || Date.now() - l.at < 3000)) return;
    lastPing.current = { mode, at: Date.now() };
    onTyping(mode);
  }
  useEffect(() => {
    if (!rec.recording) return;
    ping("voice");
    if (rec.elapsed >= VOICE_MAX_SECONDS) void finishVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- driven by the recorder's clock
  }, [rec.recording, rec.elapsed]);

  async function pick(file: File | null | undefined) {
    setErr("");
    if (!file) return;
    if (!file.type.startsWith("image/")) return setErr("Only photos can be sent for now");
    try {
      const s = await shrinkImage(file);
      setImg({ url: URL.createObjectURL(s.blob), bytes: s.bytes, w: s.w, h: s.h });
      setCaption(draft);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    if (!dropped) return;
    void pick(dropped);
    onDropHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one drop, one pick
  }, [dropped]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || disabled) return;
    setDraft("");
    ping(null);
    onText(text);
    input.current?.focus();
  }
  function sendImage() {
    if (!img) return;
    onImage(img, caption.trim());
    setImg(null);
    setCaption("");
    setDraft("");
    ping(null);
  }
  async function startVoice() {
    setErr("");
    try {
      await rec.start();
    } catch (e) {
      const m = (e as Error).name === "NotAllowedError" ? "Allow the microphone to record a voice note" : (e as Error).message;
      setErr(m);
    }
  }
  async function finishVoice() {
    const r = await rec.stop();
    ping(null);
    if (r) onVoice(r);
    else setErr("Hold on a little longer to record a voice note");
  }
  function cancelVoice() {
    rec.cancel();
    ping(null);
  }

  const hasText = !!draft.trim();
  return (
    <div className="border-t border-line bg-ink px-3 py-2.5 lg:px-6 lg:py-3">
      {err && <p className="mx-auto mb-2 max-w-3xl text-xs text-down">{err}</p>}
      {rec.recording ? (
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button type="button" onClick={cancelVoice} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-mute hover:bg-white/5 hover:text-down" aria-label="Cancel voice note"><Trash size={18} /></button>
          <div className="flex h-[42px] min-w-0 flex-1 items-center gap-3 rounded-full bg-white/[.07] px-4">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-down" />
            <span className="w-10 shrink-0 text-sm tabular">{mmss(rec.elapsed)}</span>
            <div className="flex h-6 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden">
              {rec.levels.map((v, i) => (
                <span key={i} className="w-[3px] shrink-0 rounded-full bg-white/70" style={{ height: `${Math.max(10, Math.min(100, v * 400))}%` }} />
              ))}
            </div>
          </div>
          <button type="button" onClick={finishVoice} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mine text-white" aria-label="Send voice note"><Send size={17} /></button>
        </div>
      ) : (
        <form onSubmit={submit} className="mx-auto flex max-w-3xl items-center gap-1.5 lg:gap-2">
          <button type="button" onClick={onSituation} className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-semibold text-black hover:brightness-105" title="New stake">
            <Plus size={17} /> <span className="hidden lg:inline">Stake</span>
          </button>
          <button type="button" onClick={() => filePick.current?.click()} disabled={disabled} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-mute hover:bg-white/5 hover:text-white disabled:opacity-40" title="Send a photo" aria-label="Send a photo">
            <ImageIcon size={19} />
          </button>
          <div className="relative min-w-0 flex-1">
            <input
              ref={input}
              name="message"
              autoComplete="off"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                ping(e.target.value.trim() ? "text" : null);
              }}
              onBlur={() => ping(null)}
              onPaste={(e) => {
                const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
                if (f) {
                  e.preventDefault();
                  void pick(f);
                }
              }}
              placeholder={disabled ? "Unlock to chat" : "Message"}
              disabled={disabled}
              className="h-[42px] w-full rounded-full bg-white/[.07] pl-4 pr-11 outline-none transition placeholder:text-mute focus:bg-white/[.1] lg:pr-4"
            />
            <button type="button" onClick={() => camPick.current?.click()} disabled={disabled} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-mute hover:text-white disabled:opacity-40 lg:hidden" aria-label="Take a photo">
              <Camera size={18} />
            </button>
          </div>
          {hasText ? (
            <button onMouseDown={(e) => e.preventDefault()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mine text-white transition" aria-label="Send">
              <Send size={17} />
            </button>
          ) : (
            <button type="button" onClick={startVoice} disabled={disabled} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-40" aria-label="Record a voice note" title="Record a voice note">
              <Mic size={18} />
            </button>
          )}
          <input ref={filePick} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={camPick} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </form>
      )}

      <Sheet open={!!img} onClose={() => setImg(null)} title="Send photo">
        {img && (
          <div className="space-y-3">
            <img src={img.url} alt="" className="mx-auto max-h-[55dvh] rounded-xl object-contain" />
            <form onSubmit={(e) => { e.preventDefault(); sendImage(); }} className="flex gap-2">
              <input autoComplete="off" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption" className="h-[42px] min-w-0 flex-1 rounded-full bg-white/[.07] px-4 outline-none placeholder:text-mute focus:bg-white/[.1]" autoFocus />
              <Button className="flex items-center gap-1.5 !rounded-full"><Send size={16} /> Send</Button>
            </form>
            <p className="flex items-center gap-1.5 text-xs text-mute"><Lock size={12} /> Encrypted on this device before it&apos;s sent. Location and camera details are removed.</p>
          </div>
        )}
      </Sheet>
    </div>
  );
}
