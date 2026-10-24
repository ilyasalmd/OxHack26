"use client";
import { useEffect, useId, useState } from "react";
import { Avatar } from "@/components/ui";
import { Logo } from "@/components/shell";
import { Check, ChevronLeft, Lock } from "@/components/icons";
import s from "./landing.module.css";

/**
 * Phone sign-in, after Snapchat and WhatsApp: a calm welcome with one primary
 * action, then one question per screen with a progress bar and a back control.
 * All the real work still happens in the page's submit().
 */

type Screen = "welcome" | "name" | "username" | "password" | "login";
const STEPS: Screen[] = ["name", "username", "password"];
const USERNAME = /^[a-z0-9_]{3,20}$/;
const COMMON = new Set(["password", "12345678", "123456789", "qwerty", "qwertyuiop", "11111111", "abc12345", "iloveyou", "letmein", "password1", "00000000", "1234"]);

export type AuthProps = {
  mode: "signup" | "login";
  setMode: (m: "signup" | "login") => void;
  username: string;
  setUsername: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  busy: boolean;
  err: string;
  setErr: (v: string) => void;
  submit: (e: React.FormEvent) => void;
};

const field =
  "h-14 w-full rounded-2xl border border-line bg-panel px-4 text-lg outline-none transition placeholder:text-mute/70 focus:border-white/40 focus:bg-raised";
const primary =
  "flex h-14 w-full items-center justify-center rounded-2xl bg-white text-base font-semibold text-black transition active:scale-[.98] disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const secondary =
  "flex h-14 w-full items-center justify-center rounded-2xl border border-line bg-white/5 text-base font-medium text-white transition active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const clean = (v: string) => v.trim().toLowerCase().replace(/^@/, "");

export function MobileAuth(p: AuthProps) {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [back, setBack] = useState(false);

  function go(to: Screen, isBack = false) {
    setBack(isBack);
    p.setErr("");
    if (to === "login") p.setMode("login");
    else if (to !== "welcome") p.setMode("signup");
    setScreen(to);
  }

  // A username problem from the server belongs on the username screen.
  useEffect(() => {
    if (screen === "password" && /username/i.test(p.err)) {
      setBack(true);
      setScreen("username");
    }
  }, [p.err, screen]);

  const anim = back ? s.stepBack : s.stepIn;
  const step = STEPS.indexOf(screen);

  if (screen === "welcome") return <Welcome onStart={() => go("name")} onLogin={() => go("login")} anim={anim} />;

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex h-12 items-center gap-3">
        <button
          type="button"
          onClick={() => (step > 0 ? go(STEPS[step - 1], true) : go("welcome", true))}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-white/80 transition hover:bg-white/5 active:bg-white/10 focus-visible:outline-2 focus-visible:outline-brand"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        {step >= 0 ? (
          <div className="flex flex-1 gap-1.5" role="progressbar" aria-label="Sign-up progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((x, i) => (
              <div key={x} className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-white transition-[width] duration-500 ease-out" style={{ width: i <= step ? "100%" : "0%" }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 items-center gap-2">
            <Logo size={24} />
            <span className="text-sm font-semibold tracking-tight">Friend Stocks</span>
          </div>
        )}
        {step >= 0 && <span className="w-9 text-right text-xs text-mute tabular">{step + 1}/{STEPS.length}</span>}
      </div>

      <div key={screen} className={`flex flex-1 flex-col pt-8 ${anim}`}>
        {screen === "name" && <NameStep {...p} next={() => go("username")} />}
        {screen === "username" && <UsernameStep {...p} next={() => go("password")} />}
        {screen === "password" && <PasswordStep {...p} />}
        {screen === "login" && <LoginStep {...p} toSignup={() => go("name")} />}
      </div>
    </div>
  );
}

function Welcome({ onStart, onLogin, anim }: { onStart: () => void; onLogin: () => void; anim: string }) {
  return (
    <div className={`flex min-h-dvh flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] ${anim}`}>
      <div className="flex items-center gap-2.5">
        <Logo size={30} />
        <span className="text-base font-semibold tracking-tight">Friend Stocks</span>
      </div>

      <div className="flex flex-1 flex-col justify-center py-8">
        <Vignette />
        <h1 className="mt-10 text-[34px] font-semibold leading-[1.05] tracking-tight">Your group chat,<br />now with a stock market.</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-mute">Post what your mates are up to, then go long or short on it. Fair odds from your own history.</p>
      </div>

      <div className="space-y-3">
        <button type="button" className={primary} onClick={onStart}>Get started</button>
        <button type="button" className={secondary} onClick={onLogin}>I already have an account</button>
        <p className="flex items-center justify-center gap-1.5 pt-2 text-center text-xs text-mute">
          <Lock size={12} /> Chats are end-to-end encrypted. Play money only.
        </p>
      </div>
    </div>
  );
}

/** A quiet, still glimpse of a group: two messages and the situation they lead to. */
function Vignette() {
  return (
    <div aria-hidden className={`space-y-2 ${s.stagger}`}>
      <div className="flex items-end gap-2">
        <Avatar name="Maya" color="#ff7ac6" size={24} />
        <div className="rounded-2xl rounded-bl-md bg-panel px-3 py-2 text-[14px]">
          <div className="text-[11px] font-semibold text-[#ff7ac6]">Maya</div>
          Jake said 5 mins. That was 20 mins ago.
        </div>
      </div>
      <div className="flex justify-end">
        <div className="rounded-2xl rounded-br-md bg-[#2b6cff] px-3 py-2 text-[14px]">Listing it.</div>
      </div>
      <div className="rounded-2xl border border-line bg-panel p-3.5">
        <div className="flex items-center justify-between text-[11px] text-mute">
          <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-medium">Bet</span>
          <span>closes 21:00</span>
        </div>
        <div className="mt-1.5 text-[15px] font-semibold">Jake is late to Friday dinner</div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-2xl font-bold tabular">74%</span>
          <span className="flex gap-1.5">
            <span className="rounded-lg bg-up/15 px-2.5 py-1 text-xs font-semibold text-up">Long</span>
            <span className="rounded-lg bg-down/15 px-2.5 py-1 text-xs font-semibold text-down">Short</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Question({ htmlFor, title, sub }: { htmlFor: string; title: string; sub: string }) {
  return (
    <>
      <label htmlFor={htmlFor} className="block text-[28px] font-semibold leading-tight tracking-tight">{title}</label>
      <p className="mt-2 text-[15px] leading-relaxed text-mute">{sub}</p>
    </>
  );
}

function Hint({ tone = "mute", id, children }: { tone?: "mute" | "up" | "down"; id?: string; children: React.ReactNode }) {
  const c = { mute: "text-mute", up: "text-up", down: "text-down" }[tone];
  return <p id={id} className={`mt-2.5 flex min-h-5 items-center gap-1.5 text-sm ${c}`} aria-live="polite">{children}</p>;
}

function ErrorLine({ err }: { err: string }) {
  if (!err) return null;
  return <p role="alert" className="mt-3 rounded-xl border border-down/30 bg-down/10 px-3.5 py-2.5 text-sm text-down">{err}</p>;
}

function NameStep({ displayName, setDisplayName, next }: AuthProps & { next: () => void }) {
  const id = useId();
  const ok = displayName.trim().length > 0;
  return (
    <form className="flex flex-col" onSubmit={(e) => { e.preventDefault(); if (ok) next(); }}>
      <Question htmlFor={id} title="What should friends call you?" sub="This is the name your group sees next to your messages and trades." />
      <input id={id} className={`${field} mt-7`} placeholder="Your first name" autoComplete="given-name" autoCapitalize="words" enterKeyHint="next" maxLength={30} autoFocus value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      <Hint>You can change this later.</Hint>
      <button className={`${primary} mt-6`} disabled={!ok}>Continue</button>
    </form>
  );
}

function UsernameStep({ username, setUsername, displayName, err, setErr, next }: AuthProps & { next: () => void }) {
  const id = useId();
  const hintId = useId();
  const u = clean(username);
  const ok = USERNAME.test(u);
  const suggestion = displayName.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
  const badChars = /[^a-z0-9_]/.test(u);
  const userErr = /username/i.test(err) ? err : "";

  let hint: React.ReactNode = "3 to 20 letters, numbers or underscores.";
  let tone: "mute" | "up" | "down" = "mute";
  if (badChars) [hint, tone] = ["Only letters, numbers and underscores.", "down"];
  else if (u.length > 20) [hint, tone] = ["That is over 20 characters.", "down"];
  else if (ok) [hint, tone] = [<><Check size={15} /> Friends will find you as @{u}</>, "up"];
  else if (u.length > 0) hint = `${3 - u.length} more character${3 - u.length === 1 ? "" : "s"} to go.`;

  return (
    <form className="flex flex-col" onSubmit={(e) => { e.preventDefault(); if (ok) next(); }}>
      <Question htmlFor={id} title="Pick a username" sub="Friends use it to add you to groups. It stays separate from your display name." />
      <div className="relative mt-7">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-mute">@</span>
        <input
          id={id}
          className={`${field} pl-9 ${userErr || badChars ? "border-down/60" : ""}`}
          placeholder="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          maxLength={24}
          autoFocus
          aria-describedby={hintId}
          aria-invalid={badChars || !!userErr}
          value={username}
          onChange={(e) => { setUsername(e.target.value.replace(/\s/g, "")); if (userErr) setErr(""); }}
        />
      </div>
      <Hint tone={tone} id={hintId}>{hint}</Hint>
      {!u && suggestion.length >= 3 && (
        <button type="button" onClick={() => setUsername(suggestion)} className="mt-1 self-start rounded-full border border-line bg-white/5 px-3.5 py-2 text-sm text-white/90 transition active:bg-white/10">
          Use @{suggestion}
        </button>
      )}
      <ErrorLine err={userErr} />
      <button className={`${primary} mt-6`} disabled={!ok}>Continue</button>
    </form>
  );
}

function PasswordStep({ username, password, setPassword, busy, err, submit }: AuthProps) {
  const id = useId();
  const hintId = useId();
  const [show, setShow] = useState(false);
  const pw = password;
  const common = COMMON.has(pw.toLowerCase()) || pw.toLowerCase() === clean(username);
  const mixed = /[a-z]/i.test(pw) && /[^a-z]/i.test(pw);
  const score = pw.length < 4 ? 0 : common ? 1 : pw.length >= 10 && mixed ? 3 : pw.length >= 8 ? 2 : 1;
  const hint =
    pw.length === 0 ? "At least 4 characters. Longer is better."
      : pw.length < 4 ? `${4 - pw.length} more character${4 - pw.length === 1 ? "" : "s"} to go.`
        : common ? "That one is easy to guess. Try something less common."
          : score === 3 ? "Strong password." : score === 2 ? "Good. A number or symbol makes it stronger." : "Okay. Longer is safer.";
  const tone = common && pw.length >= 4 ? "down" : score === 3 ? "up" : "mute";

  return (
    <form className="flex flex-col" onSubmit={submit}>
      <Question htmlFor={id} title="Create a password" sub="It unlocks your encryption keys on this phone. Only a derived key is ever sent." />
      <input type="text" name="username" autoComplete="username" value={clean(username)} readOnly hidden />
      <div className="relative mt-7">
        <input
          id={id}
          type={show ? "text" : "password"}
          className={`${field} pr-20`}
          placeholder="Password"
          autoComplete="new-password"
          enterKeyHint="done"
          required
          minLength={4}
          autoFocus
          aria-describedby={hintId}
          value={pw}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-xl px-3 text-sm font-medium text-mute transition hover:text-white" aria-pressed={show}>
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${score >= i ? (score === 1 ? "bg-down/70" : score === 2 ? "bg-white/70" : "bg-up") : "bg-white/10"}`} />
        ))}
      </div>
      <Hint tone={tone} id={hintId}>{hint}</Hint>
      <ErrorLine err={/username/i.test(err) ? "" : err} />
      <button className={`${primary} mt-6`} disabled={busy || pw.length < 4}>{busy ? "Generating your keys…" : "Create account"}</button>
      <p className="mt-4 text-center text-xs leading-relaxed text-mute">You start with 500 coins and get 50 more each week. Play money only.</p>
    </form>
  );
}

function LoginStep({ username, setUsername, password, setPassword, busy, err, submit, toSignup }: AuthProps & { toSignup: () => void }) {
  const uid = useId();
  const pid = useId();
  const [show, setShow] = useState(false);
  return (
    <form className="flex flex-1 flex-col" onSubmit={submit}>
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Welcome back</h1>
      <p className="mt-2 text-[15px] text-mute">Log in to unlock your encrypted chats.</p>
      <label htmlFor={uid} className="mt-7 mb-1.5 text-sm font-medium text-white/80">Username</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-mute">@</span>
        <input id={uid} className={`${field} pl-9`} placeholder="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <label htmlFor={pid} className="mt-4 mb-1.5 text-sm font-medium text-white/80">Password</label>
      <div className="relative">
        <input id={pid} type={show ? "text" : "password"} className={`${field} pr-20`} placeholder="Password" autoComplete="current-password" enterKeyHint="go" required minLength={4} value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-xl px-3 text-sm font-medium text-mute transition hover:text-white" aria-pressed={show}>
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <ErrorLine err={err} />
      <button className={`${primary} mt-6`} disabled={busy}>{busy ? "Unlocking…" : "Log in"}</button>
      <button type="button" onClick={toSignup} className="mt-3 h-12 text-sm text-mute transition hover:text-white">New here? Create an account</button>
      <p className="mt-auto flex items-center justify-center gap-1.5 pt-10 text-center text-xs text-mute">
        <Lock size={12} /> Your password never leaves this device.
      </p>
    </form>
  );
}
