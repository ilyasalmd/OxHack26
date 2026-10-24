"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Button, Sheet } from "./ui";
import { REPORT_REASONS, type ReportReason } from "@/lib/safety";

/**
 * Report a situation or a chat message. For a message, `text` is the decrypted text from this device:
 * it is only sent when the reporter ticks the box, because the server can't read chat on its own.
 */
export function ReportSheet({
  open,
  onClose,
  kind,
  url,
  messageId,
  text,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  kind: "situation" | "message";
  url: string;
  messageId?: number;
  text?: string | null;
  onDone?: (r: { voided?: boolean }) => void;
}) {
  const [reason, setReason] = useState<ReportReason>("mean");
  const [note, setNote] = useState("");
  const [include, setInclude] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<{ voided?: boolean } | null>(null);
  useEffect(() => {
    if (open) {
      setReason("mean");
      setNote("");
      setInclude(false);
      setErr("");
      setSent(null);
    }
  }, [open]);

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ voided?: boolean }>(url, {
        body: { reason, note: note.trim() || undefined, ...(kind === "message" ? { messageId, messageText: include && text ? text : undefined } : {}) },
      });
      setSent(r);
      onDone?.(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={kind === "situation" ? "Report this stake" : "Report this message"}>
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-mute">
            {sent.voided
              ? "Thanks. This stake has been called off and everyone was refunded."
              : kind === "message"
                ? "Thanks. We hid this message for you."
                : "Thanks. If another member reports it too, it will be called off and everyone refunded."}
          </p>
          <Button className="w-full" onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            {REPORT_REASONS.map((r) => (
              <label key={r.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm ${reason === r.id ? "border-white/40 bg-white/5" : "border-line"}`}>
                <input type="radio" name="reason" checked={reason === r.id} onChange={() => setReason(r.id)} className="mt-1 accent-white" />
                <span>
                  <span className="font-medium">{r.label}</span>
                  {r.hint && <span className="block text-xs text-mute">{r.hint}</span>}
                </span>
              </label>
            ))}
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Anything else we should know? (optional)" className="w-full rounded-xl border border-line bg-ink p-3 outline-none placeholder:text-mute focus:border-white/40" />
          {kind === "message" && (
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={include} disabled={!text} onChange={(e) => setInclude(e.target.checked)} className="mt-1 accent-white" />
              <span>
                <span className="font-medium">Include the message text</span>
                <span className="mt-0.5 block text-xs text-mute">
                  Chats are end-to-end encrypted, so we can&apos;t read this message. Tick this to send us a copy of it from your phone. Off by default, and we only keep it if you tick it.
                </span>
              </span>
            </label>
          )}
          <p className="text-xs text-mute">
            {kind === "situation"
              ? "Reports are private. If two members report a stake, or the person it's about does, it is called off and everyone is refunded."
              : "Reports are private. The message is hidden for you straight away."}
          </p>
          {err && <p className="text-sm text-down">{err}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-[2]" disabled={busy} onClick={submit}>{busy ? "Sending…" : "Send report"}</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
