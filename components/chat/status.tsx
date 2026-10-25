"use client";
import { Alert, Mic } from "../icons";
import { Avatar } from "../ui";

export type Delivery = "sending" | "failed" | "sent" | "delivered" | "read";

// One tick that bends into the app's mark (the market line with its arrow) once someone reads it.
// Both shapes use the same four points, so the line can glide from one into the other.
const TICK = "M4 12.5 L9 17.5 L9 17.5 L20 6.5";
const KINK = "M3 17 L9 11 L13 15 L21 7";

/** A single tick, or the app's kinked tick once read. Animates between the two. */
export function TickMark({ read, size = 15 }: { read: boolean; size?: number }) {
  const d = read ? KINK : TICK;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={read ? 2.6 : 2.2} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-[color,stroke-width] duration-300 ${read ? "text-brand" : ""}`} aria-hidden>
      {/* The `d` style lets browsers that can animate paths morph the line; the others simply swap it. */}
      <path d={d} style={{ d: `path("${d}")`, transition: "d .35s cubic-bezier(.2,.8,.2,1)" } as React.CSSProperties} />
      <path d="M15 7h6v6" className="transition-opacity duration-300" style={{ opacity: read ? 1 : 0, transitionDelay: read ? ".15s" : "0s" }} />
    </svg>
  );
}

/**
 * The mark on your own messages: a spinner while it sends, one tick once the server has it,
 * and that tick turns into the app's mark once at least one other person has read it.
 */
export function DeliveryMark({ state, title }: { state: Delivery; title?: string }) {
  const label = { sending: "Sending", failed: "Not sent", sent: "Sent", delivered: "Delivered", read: "Read" }[state];
  return (
    <span className={`inline-flex h-[15px] w-[15px] items-center justify-center ${state === "failed" ? "text-down" : "text-white/75"}`} title={title ?? label} aria-label={label} role="img">
      {state === "sending" ? (
        <span className="inline-block h-[11px] w-[11px] animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
      ) : state === "failed" ? (
        <Alert size={13} />
      ) : (
        <TickMark read={state === "read"} />
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
