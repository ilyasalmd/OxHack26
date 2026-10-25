"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/components/api";
import { Check, ChevronLeft, Key } from "@/components/icons";
import { BrandMark, Wordmark } from "./brand";
import { DotField } from "./dots";
import s from "./landing.module.css";

/**
 * Sign-in after Snapchat and Instagram: a lime brand screen with two big buttons on
 * the phone, a white card on the laptop, and one question per screen when signing up.
 * The real work (key derivation, encryption, the API calls) stays in the page's submit().
 */

type Screen = "welcome" | "name" | "username" | "password" | "login";
type Mode = "signup" | "login";
const STEPS: Screen[] = ["name", "username", "password"];
const USERNAME = /^[a-z0-9_]{3,20}$/;
const COMMON = new Set(["password", "12345678", "123456789", "qwerty", "qwertyuiop", "11111111", "abc12345", "iloveyou", "letmein", "password1", "00000000", "1234"]);
const LIME = "#c6ff3d";

export const TAGLINE = "aight bet...";

export type AuthProps = {
  username: string;
  setUsername: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  busy: boolean;
  err: string;
  setErr: (v: string) => void;
  submit: (e: React.FormEvent, mode: Mode) => void;
  /** Set right after sign-up: the recovery code to show once, then finish() moves on. */
  recovery: string | null;
  finish: () => void;
};

const field =
  "h-14 w-full rounded-2xl bg-[#f1f1ec] px-4 !text-[17px] text-black outline-none transition placeholder:text-black/35 focus:bg-white focus:shadow-[0_0_0_2px_#000] lg:h-[52px] lg:!text-base";
const primary =
  "flex h-14 w-full items-center justify-center rounded-full bg-black text-[17px] font-semibold text-white transition hover:bg-black/85 active:scale-[.98] disabled:bg-black/10 disabled:text-black/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black lg:h-[52px] lg:text-base";

const clean = (v: string) => v.trim().toLowerCase().replace(/^@/, "");

/** Screen state for one layout. Back steps slide the other way. */
function useScreens(initial: Screen, err: string, setErr: (v: string) => void) {
  const [screen, setScreen] = useState<Screen>(initial);
  const [back, setBack] = useState(false);
  const go = (to: Screen, isBack = false) => {
    setBack(isBack);
    setErr("");
    setScreen(to);
  };
  // A username problem from the server belongs on the username screen.
  useEffect(() => {
    if (screen === "password" && /username/i.test(err)) {
      setBack(true);
      setScreen("username");
    }
  }, [err, screen]);
  return { screen, go, anim: back ? s.stepBack : s.stepIn, step: STEPS.indexOf(screen) };
}

/** The phone: lime welcome, then full-screen white steps. */
export function PhoneAuth(p: AuthProps) {
  const { screen, go, anim, step } = useScreens("welcome", p.err, p.setErr);

  // Tint the browser chrome and overscroll to match the screen underneath.
  useEffect(() => {
    const color = matchMedia("(min-width: 1024px)").matches || screen === "welcome" ? LIME : "#ffffff";
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const was = meta?.content;
    meta?.setAttribute("content", color);
    document.documentElement.style.background = color;
    document.body.style.background = color;
    return () => {
      if (meta && was) meta.setAttribute("content", was);
      document.documentElement.style.background = "";
      document.body.style.background = "";
    };
  }, [screen]);

  if (screen === "welcome") {
    return (
      <div className="relative flex min-h-dvh flex-col overflow-hidden bg-brand px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] text-black">
        <DotField spacing={24} />
        <div className="relative flex flex-1 flex-col items-center justify-center py-10 text-center">
          <BrandMark size={104} />
          <Wordmark className="mt-7 text-[46px]" />
          <p className={`${s.rise} mt-3 text-[19px] font-medium text-black/70`} style={{ animationDelay: ".25s" }}>{TAGLINE}</p>
        </div>
        <div className={`relative space-y-3 ${s.rise}`} style={{ animationDelay: ".4s" }}>
          <button type="button" onClick={() => go("name")} className={primary}>Sign up</button>
          <button type="button" onClick={() => go("login")} className="flex h-14 w-full items-center justify-center rounded-full bg-white text-[17px] font-semibold text-black transition active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">
            Log in
          </button>
        </div>
      </div>
    );
  }

  if (p.recovery) {
    return (
      <div className={`flex min-h-dvh flex-col bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(3.5rem,env(safe-area-inset-top))] text-black ${s.stepIn}`}>
        <RecoveryStep code={p.recovery} onDone={p.finish} />
      </div>
    );
  }

  return (
    <div className={`flex min-h-dvh flex-col bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] text-black ${s.sheet}`}>
      <Header step={step} onBack={() => (step > 0 ? go(STEPS[step - 1], true) : go("welcome", true))} />
      <div key={screen} className={`flex flex-1 flex-col pt-8 ${anim}`}>
        <Body screen={screen} go={go} p={p} />
        {screen === "login" && (
          <button type="button" onClick={() => go("name")} className="mt-auto pt-10 text-center text-[15px] text-black/55">
            New here? <span className="font-semibold text-black">Sign up</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** The laptop: the same steps in a white card, with the switch box underneath. */
export function DeskAuth(p: AuthProps) {
  const { screen, go, anim, step } = useScreens("login", p.err, p.setErr);
  return (
    <div className="relative hidden min-h-dvh flex-col items-center justify-center overflow-hidden bg-brand px-6 py-10 text-black lg:flex [@media(max-height:820px)]:py-6">
      <DotField spacing={28} />
      <div className="relative flex w-full max-w-[400px] flex-col items-center">
        <BrandMark size={84} className="[@media(max-height:820px)]:![--s:60px]" />
        <Wordmark className="mt-6 text-[54px] [@media(max-height:820px)]:mt-4 [@media(max-height:820px)]:text-[44px]" />
        <p className={`${s.rise} mt-3 text-lg font-medium text-black/65 [@media(max-height:820px)]:mt-2`} style={{ animationDelay: ".25s" }}>{TAGLINE}</p>

        <div className={`${s.rise} mt-8 w-full [@media(max-height:820px)]:mt-5`} style={{ animationDelay: ".35s" }}>
          <div className="rounded-[28px] bg-white p-8 shadow-[0_30px_70px_-30px_rgba(0,0,0,.45)] [@media(max-height:820px)]:p-7">
            {p.recovery ? (
              <div className={s.stepIn}><RecoveryStep code={p.recovery} onDone={p.finish} /></div>
            ) : (
              <>
                {screen !== "login" && <Header step={step} onBack={() => (step > 0 ? go(STEPS[step - 1], true) : go("login", true))} />}
                <div key={screen} className={`flex flex-col ${screen !== "login" ? "pt-6" : ""} ${anim}`}>
                  <Body screen={screen} go={go} p={p} />
                </div>
              </>
            )}
          </div>
          <div className={`mt-3 rounded-[22px] bg-white py-4 text-center text-[15px] text-black/60 ${p.recovery ? "hidden" : ""}`}>
            {screen === "login" ? (
              <>Don&apos;t have an account? <button type="button" onClick={() => go("name")} className="font-semibold text-black hover:underline">Sign up</button></>
            ) : (
              <>Have an account? <button type="button" onClick={() => go("login", true)} className="font-semibold text-black hover:underline">Log in</button></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Header({ step, onBack }: { step: number; onBack: () => void }) {
  return (
    <div className="flex h-11 items-center gap-3">
      <button type="button" onClick={onBack} className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-black/70 transition hover:bg-black/5 active:bg-black/10 focus-visible:outline-2 focus-visible:outline-black" aria-label="Back">
        <ChevronLeft size={22} />
      </button>
      {step >= 0 && (
        <>
          <div className="flex flex-1 gap-1.5" role="progressbar" aria-label="Sign-up progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((x, i) => (
              <div key={x} className="h-1 flex-1 overflow-hidden rounded-full bg-black/10">
                <div className="h-full rounded-full bg-black transition-[width] duration-500 ease-out" style={{ width: i <= step ? "100%" : "0%" }} />
              </div>
            ))}
          </div>
          <span className="w-8 text-right text-xs text-black/40 tabular">{step + 1}/{STEPS.length}</span>
        </>
      )}
    </div>
  );
}

function Body({ screen, go, p }: { screen: Screen; go: (to: Screen, back?: boolean) => void; p: AuthProps }) {
  if (screen === "name") return <NameStep {...p} next={() => go("username")} />;
  if (screen === "username") return <UsernameStep {...p} next={() => go("password")} />;
  if (screen === "password") return <PasswordStep {...p} />;
  if (screen === "login") return <LoginStep {...p} />;
  return null;
}

function Question({ htmlFor, title, sub }: { htmlFor: string; title: string; sub: string }) {
  return (
    <>
      <label htmlFor={htmlFor} className="block text-[30px] font-bold leading-tight tracking-tight lg:text-[26px]">{title}</label>
      <p className="mt-2 text-[15px] leading-relaxed text-black/55">{sub}</p>
    </>
  );
}

function Hint({ tone = "mute", id, children }: { tone?: "mute" | "up" | "down"; id?: string; children: React.ReactNode }) {
  const c = { mute: "text-black/45", up: "text-[#0e8f4f]", down: "text-[#d92d2d]" }[tone];
  return <p id={id} className={`mt-2.5 flex min-h-5 items-center gap-1.5 text-sm ${c}`} aria-live="polite">{children}</p>;
}

function ErrorLine({ err }: { err: string }) {
  if (!err) return null;
  return <p role="alert" className="mt-3 rounded-xl bg-[#fff0f0] px-3.5 py-2.5 text-sm text-[#d92d2d]">{err}</p>;
}

function ShowToggle({ show, setShow }: { show: boolean; setShow: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-xl px-3 text-sm font-semibold text-black/50 transition hover:text-black" aria-pressed={show}>
      {show ? "Hide" : "Show"}
    </button>
  );
}

function NameStep({ displayName, setDisplayName, next }: AuthProps & { next: () => void }) {
  const id = useId();
  const ok = displayName.trim().length > 0;
  return (
    <form className="flex flex-col" onSubmit={(e) => { e.preventDefault(); if (ok) next(); }}>
      <Question htmlFor={id} title="What's your name?" sub="It's what your friends see next to your messages." />
      <input id={id} className={`${field} mt-7`} placeholder="First name" autoComplete="given-name" autoCapitalize="words" enterKeyHint="next" maxLength={30} autoFocus value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      <Hint>You can change it later.</Hint>
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

  // Ask the server whether the name is free, once typing pauses.
  const [check, setCheck] = useState<{ u: string; available: boolean; reason?: string } | null>(null);
  useEffect(() => {
    if (!ok) return;
    let live = true;
    const t = setTimeout(() => {
      api<{ available: boolean; reason?: string }>(`/api/account/username?check=${encodeURIComponent(u)}`)
        .then((r) => live && setCheck({ u, ...r }))
        .catch(() => {});
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [u, ok]);
  const taken = check?.u === u && !check.available;

  let hint: React.ReactNode = "3 to 20 letters, numbers or underscores.";
  let tone: "mute" | "up" | "down" = "mute";
  if (badChars) [hint, tone] = ["Only letters, numbers and underscores.", "down"];
  else if (u.length > 20) [hint, tone] = ["That is over 20 characters.", "down"];
  else if (taken) [hint, tone] = [check.reason ?? "That username is taken.", "down"];
  else if (ok && check?.u === u) [hint, tone] = [<><Check size={15} /> @{u} is yours. Friends will find you by it.</>, "up"];
  else if (ok) hint = "Checking…";
  else if (u.length > 0) hint = `${3 - u.length} more character${3 - u.length === 1 ? "" : "s"} to go.`;

  return (
    <form className="flex flex-col" onSubmit={(e) => { e.preventDefault(); if (ok && !taken) next(); }}>
      <Question htmlFor={id} title="Pick a username" sub="Friends use it to add you to groups." />
      <div className="relative mt-7">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[17px] font-semibold text-black/35">@</span>
        <input
          id={id}
          className={`${field} pl-9 ${userErr || badChars || taken ? "!shadow-[0_0_0_2px_#d92d2d]" : ""}`}
          placeholder="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          maxLength={24}
          autoFocus
          aria-describedby={hintId}
          aria-invalid={badChars || taken || !!userErr}
          value={username}
          onChange={(e) => { setUsername(e.target.value.replace(/\s/g, "")); if (userErr) setErr(""); }}
        />
      </div>
      <Hint tone={tone} id={hintId}>{hint}</Hint>
      {!u && suggestion.length >= 3 && (
        <button type="button" onClick={() => setUsername(suggestion)} className="mt-1 self-start rounded-full bg-[#f1f1ec] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#e8e8e2]">
          Use @{suggestion}
        </button>
      )}
      <ErrorLine err={userErr} />
      <button className={`${primary} mt-6`} disabled={!ok || taken}>Continue</button>
    </form>
  );
}

function PasswordStep({ username, password, setPassword, busy, err, submit }: AuthProps) {
  const id = useId();
  const hintId = useId();
  const [show, setShow] = useState(false);
  const [agreed, setAgreed] = useState(false);
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
    <form className="flex flex-col" onSubmit={(e) => submit(e, "signup")}>
      <Question htmlFor={id} title="Set a password" sub="It unlocks your encrypted chats and never leaves this device." />
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
        <ShowToggle show={show} setShow={setShow} />
      </div>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${score >= i ? (score === 1 ? "bg-[#d92d2d]" : score === 2 ? "bg-black/60" : "bg-[#0e8f4f]") : "bg-black/10"}`} />
        ))}
      </div>
      <Hint tone={tone} id={hintId}>{hint}</Hint>

      <ErrorLine err={/username/i.test(err) ? "" : err} />
      <p className="mt-6 text-left text-[13px] leading-relaxed text-black/60">Your chats are end-to-end encrypted: only the people in a chat can read it. Your password unlocks your keys, so keep it safe.</p>
      <label className="mt-4 flex items-start gap-3 text-left text-[13px] leading-relaxed text-black/60">
        <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-black" />
        <span>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className="font-semibold text-black/80 underline-offset-2 hover:underline">Terms</Link> and{" "}
          <Link href="/privacy" target="_blank" className="font-semibold text-black/80 underline-offset-2 hover:underline">Privacy notice</Link>, including that{" "}
          <Link href="/terms#ai" target="_blank" className="font-semibold text-black/80 underline-offset-2 hover:underline">the AI reads relevant chat</Link> to price stakes.
        </span>
      </label>
      <button className={`${primary} mt-5`} disabled={busy || pw.length < 4 || !agreed}>{busy ? "Setting up your keys…" : "Create account"}</button>
    </form>
  );
}

function LoginStep({ username, setUsername, password, setPassword, busy, err, submit }: AuthProps) {
  const uid = useId();
  const pid = useId();
  const [show, setShow] = useState(false);
  // Saved details may fill in the fields, but only your own press of Log in (or Return) signs in.
  // Safari can submit a login form by itself right after filling it; that submit is ignored.
  const pressed = useRef(0);
  const press = (e: React.SyntheticEvent) => {
    if (e.nativeEvent.isTrusted) pressed.current = Date.now();
  };
  return (
    <form
      className="flex flex-col"
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && press(e)}
      onSubmit={(e) => {
        if (Date.now() - pressed.current > 1500) return e.preventDefault();
        submit(e, "login");
      }}
    >
      <h2 className="text-[30px] font-bold leading-tight tracking-tight lg:text-[26px]">Welcome back</h2>
      <p className="mt-2 text-[15px] text-black/55">Log in to unlock your chats.</p>
      <div className="relative mt-7">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[17px] font-semibold text-black/35">@</span>
        <input id={uid} aria-label="Username" className={`${field} pl-9`} placeholder="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className="relative mt-3">
        <input id={pid} aria-label="Password" type={show ? "text" : "password"} className={`${field} pr-20`} placeholder="Password" autoComplete="current-password" enterKeyHint="go" required minLength={4} value={password} onChange={(e) => setPassword(e.target.value)} />
        <ShowToggle show={show} setShow={setShow} />
      </div>
      <ErrorLine err={err} />
      <button className={`${primary} mt-5`} disabled={busy} onPointerDown={press}>{busy ? "Unlocking…" : "Log in"}</button>
      <Link href={`/recover${username ? `?username=${encodeURIComponent(clean(username))}` : ""}`} className="mt-4 self-center text-sm font-semibold text-black/60 transition hover:text-black">Forgot password?</Link>
    </form>
  );
}

/** Shown once after sign-up: the only way back in if the password is forgotten. */
function RecoveryStep({ code, onDone }: { code: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }
  return (
    <div className="flex flex-col">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-black"><Key size={22} /></div>
      <h2 className="mt-5 text-[30px] font-bold leading-tight tracking-tight lg:text-[26px]">Save your recovery code</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-black/55">
        If you forget your password, this code is the only way back into your account and your encrypted chats. Nobody can reset it for you.
      </p>
      <div className="mt-6 rounded-2xl bg-[#f1f1ec] px-4 py-5 text-center">
        <code className="select-all font-mono text-lg font-semibold tracking-[0.08em] text-black" aria-label="Recovery code">{code}</code>
      </div>
      <button type="button" onClick={copy} className="mt-3 flex h-12 items-center justify-center gap-2 rounded-full border-2 border-black/10 text-[15px] font-semibold text-black transition hover:border-black/25 active:scale-[.98]">
        {copied ? <><Check size={16} /> Copied</> : "Copy code"}
      </button>
      <label className="mt-5 flex cursor-pointer items-center gap-3 text-[15px] text-black/70">
        <input type="checkbox" className="peer sr-only" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-2 border-black/25 text-white transition peer-checked:border-black peer-checked:bg-black peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-black">
          {saved && <Check size={14} />}
        </span>
        I&apos;ve saved it somewhere safe
      </label>
      <button type="button" className={`${primary} mt-6`} disabled={!saved} onClick={onDone}>Start chatting</button>
      <p className="mt-3 text-center text-xs text-black/45">This is the only time it will be shown.</p>
    </div>
  );
}
