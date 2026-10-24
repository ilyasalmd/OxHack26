"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { ChevronLeft } from "@/components/icons";
import { ProfilePhoto } from "@/components/profile-photo";
import { PROFILE_MAX, PROFILE_QUESTIONS } from "@/lib/profile-questions";

/**
 * A few optional questions right after sign-up, one per screen. The answers give the AI some
 * context when friends post situations about this person. Everything can be skipped and edited
 * later in Settings, and no other member ever sees the answers.
 */
export default function Welcome() {
  const { me, loading, refresh } = useSession();
  const router = useRouter();
  const [i, setI] = useState(-1); // -1 = intro
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!loading && !me) router.replace("/");
  }, [loading, me, router]);

  async function finish(save: boolean) {
    setBusy(true);
    setErr("");
    try {
      await api("/api/profile", { method: "PUT", body: { answers: save ? answers : {}, done: true } });
      await refresh();
      router.replace("/chats");
    } catch (e) {
      setErr((e as Error).message || "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  if (!me) return null;
  const q = PROFILE_QUESTIONS[i];
  const total = PROFILE_QUESTIONS.length;
  const value = q ? (answers[q.id] ?? "") : "";
  const next = () => (i + 1 < total ? setI(i + 1) : finish(true));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))]">
      <div className="flex h-11 items-center gap-3">
        {i >= 0 ? (
          <button type="button" onClick={() => setI(i - 1)} className="-ml-2 rounded-full p-2 text-mute hover:text-white" aria-label="Back"><ChevronLeft size={22} /></button>
        ) : (
          <span className="w-9" />
        )}
        <div className="flex flex-1 gap-1.5" aria-hidden>
          {PROFILE_QUESTIONS.map((x, k) => (
            <div key={x.id} className={`h-1 flex-1 rounded-full transition-colors ${k <= i ? "bg-brand" : "bg-white/10"}`} />
          ))}
        </div>
        <button type="button" onClick={() => finish(true)} disabled={busy} className="text-sm text-mute hover:text-white">{i < 0 ? "Not now" : "Done"}</button>
      </div>

      {i < 0 ? (
        <section key="intro" className="pop flex flex-1 flex-col">
          <h1 className="mt-14 text-[32px] font-bold leading-tight tracking-tight">A few quick ones about you</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-white/70">
            When a friend posts a stake about you, the AI that sets the odds reads these to get them closer to right.
          </p>
          <ul className="mt-8 space-y-3 text-[15px] text-white/80">
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />Every question is optional. Skip any of them.</li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />Only the AI reads your answers. Friends never see them.</li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />Change or delete them any time in Settings.</li>
          </ul>
          <div className="mt-8">
            <ProfilePhoto size={56} withHelp />
          </div>
          <button type="button" onClick={() => setI(0)} className="mt-auto h-14 w-full rounded-full bg-brand text-[17px] font-semibold text-black transition active:scale-[.98]">Start</button>
        </section>
      ) : (
        <form
          key={q.id}
          className="pop flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
        >
          <div className="mt-12 text-sm tabular text-mute">{i + 1} of {total}</div>
          <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight">{q.question}</h1>
          <p className="mt-2 text-[15px] text-white/55">{q.usedFor}</p>
          {q.choices ? (
            <div className="mt-8 grid gap-2.5">
              {q.choices.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setAnswers((a) => ({ ...a, [q.id]: a[q.id] === c ? "" : c }));
                    if (answers[q.id] !== c) setTimeout(next, 180);
                  }}
                  aria-pressed={value === c}
                  className={`h-14 rounded-2xl px-5 text-left text-[17px] font-medium transition ${value === c ? "bg-brand text-black" : "bg-white/[.06] text-white hover:bg-white/10"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : (
            <input
              autoFocus
              autoComplete="off"
              value={value}
              maxLength={PROFILE_MAX}
              placeholder={q.placeholder}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              enterKeyHint={i + 1 < total ? "next" : "done"}
              className="mt-8 h-14 w-full rounded-2xl bg-white/[.06] px-5 text-[17px] outline-none placeholder:text-white/30 focus:bg-white/[.09]"
            />
          )}
          {err && <p role="alert" className="mt-6 text-sm text-down">{err}</p>}
          <div className="mt-auto grid grid-cols-[auto_1fr] gap-3 pt-8">
            <button type="button" onClick={() => { setAnswers((a) => ({ ...a, [q.id]: "" })); next(); }} className="h-14 rounded-full px-6 text-[17px] font-medium text-mute hover:text-white">Skip</button>
            <button disabled={busy} className="h-14 rounded-full bg-brand text-[17px] font-semibold text-black transition active:scale-[.98] disabled:opacity-50">{i + 1 < total ? "Next" : "Finish"}</button>
          </div>
        </form>
      )}
    </main>
  );
}
