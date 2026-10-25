"use client";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { SafetySettings } from "@/components/safety-settings";
import { Section, SettingsPage } from "@/components/settings";
import { Button } from "@/components/ui";
import { PROFILE_MAX, PROFILE_QUESTIONS } from "@/lib/profile-questions";

const small = "!px-3.5 !py-1.5 text-sm";

/** Who can post stakes about you, and what the AI knows about you when it prices them. */
export default function PrivacyPage() {
  return (
    <SettingsPage title="Privacy">
      <Section title="Stakes about you">
        <SafetySettings />
      </Section>
      <Section title="What the AI knows about you" note="Only the AI reads these, as context when it sets odds about you. Friends never see them.">
        <AboutYou />
      </Section>
    </SettingsPage>
  );
}

/** The sign-up questions, editable. Saved to the account; read only by the AI pricing situations about you. */
function AboutYou() {
  const [saved, setSaved] = useState<Record<string, string> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    api<{ answers: Record<string, string> }>("/api/profile").then((r) => { setSaved(r.answers); setDraft(r.answers); }).catch(() => setSaved({}));
  }, []);
  if (!saved) return <p className="text-sm text-mute">Loading…</p>;
  const ids = PROFILE_QUESTIONS.map((q) => q.id);
  const dirty = ids.some((k) => (draft[k] ?? "").trim() !== (saved[k] ?? ""));
  const any = ids.some((k) => saved[k]);
  async function save() {
    setBusy(true);
    setNote("");
    try {
      const body = Object.fromEntries(ids.map((k) => [k, draft[k] ?? ""]));
      const r = await api<{ answers: Record<string, string> }>("/api/profile", { method: "PUT", body: { answers: body, done: true } });
      setSaved(r.answers);
      setDraft(r.answers);
      setNote("Saved");
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function wipe() {
    if (!confirm("Delete all your answers? The AI will stop using them straight away.")) return;
    setBusy(true);
    try {
      await api("/api/profile", { method: "DELETE" });
      setSaved({});
      setDraft({});
      setNote("Deleted");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-2xl bg-panel p-4 lg:p-6">
      <div className="space-y-5">
        {PROFILE_QUESTIONS.map((q) => {
          const v = draft[q.id] ?? "";
          return (
            <div key={q.id}>
              <span className="block text-[15px] font-medium">{q.question}</span>
              <span className="mt-0.5 block text-xs text-mute">{q.usedFor}</span>
              {q.choices ? (
                <span className="mt-2 flex flex-wrap gap-2">
                  {q.choices.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={v === c}
                      onClick={() => setDraft((d) => ({ ...d, [q.id]: v === c ? "" : c }))}
                      className={`rounded-full px-3.5 py-1.5 text-sm transition ${v === c ? "bg-brand text-black" : "bg-white/[.06] text-white/80 hover:bg-white/10"}`}
                    >
                      {c}
                    </button>
                  ))}
                </span>
              ) : (
                <input
                  autoComplete="off"
                  value={v}
                  maxLength={PROFILE_MAX}
                  placeholder={q.placeholder}
                  aria-label={q.question}
                  onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value }))}
                  className="mt-2 h-11 w-full rounded-xl bg-white/[.06] px-3.5 !text-[15px] outline-none placeholder:text-white/30 focus:bg-white/[.09]"
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="button" className={small} disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
        {any && <Button type="button" variant="ghost" className={`${small} !text-down`} disabled={busy} onClick={wipe}>Delete my answers</Button>}
        {note && <span className="text-sm text-mute">{note}</span>}
      </div>
    </div>
  );
}
