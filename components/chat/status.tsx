"use client";
import { Alert, Check, Mic, TrendUp } from "../icons";
import { Avatar } from "../ui";

export type Delivery = "sending" | "failed" | "sent" | "delivered" | "read";

/** The app's mark, small: a message that at least one friend has read. */
export function ReadMark({ size = 13 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-[4px] bg-brand text-black" style={{ width: size, height: size }} aria-hidden>
      <TrendUp size={size * 0.7} strokeWidth={3} />
    </span>
  );
}

/**
 * The mark on your own messages: a spinner while it sends, one tick once the server has it,
 * the app's mark once at least one other person has read it. The tooltip says who.
 */
export function DeliveryMark({ state, title }: { state: Delivery; title?: string }) {
  const label = { sending: "Sending", failed: "Not sent", sent: "Sent", delivered: "Delivered", read: "Read" }[state];
  return (
    <span className={`inline-flex translate-y-[3px] items-center ${state === "failed" ? "text-down" : "text-white/70"}`} title={title ?? label} aria-label={label} role="img">
      {state === "sending" ? (
        <span className="inline-block h-[11px] w-[11px] animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
      ) : state === "failed" ? (
        <Alert size={13} />
      ) : state === "read" ? (
        <ReadMark />
      ) : (
        <Check size={14} />
      )}
    </span>
  );
}

type Who = { id: number; display_name: string; color: string };

/** The bubble at the bottom of the chat while someone types or records. */
export function TypingBubble({ who, mode }: { who: Who; mode: "text" | "voice" }) {
  return (
    <div className="msg-in mt-2.5 flex items-end gap-2" aria-live="polite">
      <Avatar id={who.id} name={who.display_name} color={who.color} size={28} />
      <div className="flex h-9 items-center gap-2 rounded-2xl rounded-bl-md bg-raised px-3.5" title={`${who.display_name} is ${mode === "voice" ? "recording a voice note" : "typing"}`}>
        {mode === "voice" ? (
          <span className="flex items-center gap-1.5 text-[13px] text-mute"><Mic size={14} className="animate-pulse text-down" /> recording</span>
        ) : (
          <span className="flex items-center gap-1">
            {[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-white/60" style={{ animationDelay: `${i * 0.16}s` }} />)}
          </span>
        )}
      </div>
    </div>
  );
}

/** "Jake is typing…", "Jake and Priya are typing…", for the header. */
export function typingLine(people: { name: string; mode: "text" | "voice" }[]) {
  if (!people.length) return "";
  const names = people.map((p) => p.name.split(" ")[0]);
  const voice = people.every((p) => p.mode === "voice");
  const verb = voice ? "recording a voice note" : "typing";
  if (names.length === 1) return `${names[0]} is ${verb}…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are ${verb}…`;
  return `${names.length} people are ${verb}…`;
}
