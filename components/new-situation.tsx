"use client";
import { useMemo, useState } from "react";
import { api } from "./api";
import { Avatar, Badge, Button, Input, Sheet, pct } from "./ui";
import { Book, Chat, Check, Hourglass, Sparkle, Timer, TrendUp } from "./icons";
import type { Member } from "@/app/g/[id]/page";
import { MAX_SNIPPETS, type Snippet } from "@/lib/chat-context";
import { fmtLine, sides, typeLabel } from "@/lib/labels";

type Analysis = {
  title: string;
  kind: "bet" | "stock";
  answer: "yesno" | "number";
  line: number | null;
  unit: string;
  decay: string;
  category: string;
  probability: number;
  rationale: string;
  resolutionRule: string;
  source: string;
  chatUsed: (Snippet & { why: string })[];
};
type Preview = {
  analysis: Analysis;
  chatShared: Snippet[];
  openProb: number;
  baseRate: number | null;
  baseRateN: number;
  similar: { id: number; title: string; outcome: boolean; summary: string; similarity: number; created_at: string }[];
  /** The admin sees the AI's full reasoning, its working and the past results; everyone else a one-line reason. */
  full: boolean;
};

/** How the poster wants it settled. "auto" leaves the choice to the AI, which is the default. */
type Answer = "auto" | "yesno" | "number" | "stock";
const ANSWERS: { k: Answer; label: string; blurb: string; icon: React.ReactNode }[] = [
  { k: "auto", label: "Let the AI decide", blurb: "It reads the stake and picks the type that fits.", icon: <Sparkle size={16} /> },
  { k: "yesno", label: "Yes or no", blurb: "Did it happen? Settles on the deadline.", icon: <Check size={16} /> },
  { k: "number", label: "A number", blurb: "How many, how late, what mark. Bet over or under a line.", icon: <Timer size={16} /> },
  { k: "stock", label: "Long-term stock", blurb: "Months away. The price moves as news comes in.", icon: <TrendUp size={16} /> },
];
// Example stakes, written around the people in this chat ({a}, {b}: two of them, never the poster)
// and the kind of chat it is, read from its name. Anything unmatched gets the everyday set.
const FLAVOURS: [RegExp, string[]][] = [
  [/flat|house|halls|home/i, ["{a} does the washing up before Sunday", "{a} is late to dinner again", "How many times {b} hits snooze tomorrow"]],
  [/math|econ|uni|course|study|lecture|revision|y\d/i, ["{a} gets above 70 on the next problem sheet", "{b} starts revision before reading week", "{a} makes the 9am lecture on Monday"]],
  [/league|football|five|5-a-side|team|fc\b/i, ["{a} scores on Sunday", "{b} turns up for the warm-up", "How many goals {a} gets this season"]],
  [/spring|week|grind|intern|careers|finance|soc|committee/i, ["{a} gets a first-round invite this month", "{b} hears back before half term", "{a} finishes the cover letter by Friday"]],
  [/run|gym|club|fitness|climb/i, ["{a} makes Tuesday's 7am run", "{b} breaks 50 minutes for 10k", "{a} goes to the gym before work all week"]],
  [/family|siblings|mum|dad|cousins/i, ["{a} comes home for Sunday lunch", "{b} replies to Mum within an hour", "{a} remembers the birthday without a reminder"]],
  [/dinner|crew|friday|pub|drinks/i, ["{a} is more than 20 minutes late on Friday", "{b} picks the restaurant this week", "How many pints {a} has on Friday"]],
];
const EVERYDAY = ["{a} is late to dinner again", "How many pints {b} has on Friday", "{a} replies within an hour"];

function examplesFor(groupName: string, members: Member[], meId: number) {
  const pool = FLAVOURS.find(([re]) => re.test(groupName))?.[1] ?? EVERYDAY;
  // People who turned off stakes about them aren't suggested.
  const others = members.filter((m) => m.id !== meId && m.subject_policy !== "nobody").map((m) => m.display_name.split(" ")[0]);
  // A different pair each time the sheet opens; a one-to-one chat only has one other person.
  const i = Math.floor(Math.random() * Math.max(1, others.length));
  const a = others[i] ?? "Sam";
  const b = others[(i + 1) % Math.max(1, others.length)] ?? a;
  return pool.map((x) => x.replace("{a}", a).replace("{b}", b));
}

function localInput(d: Date) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
}

export function NewSituation({ open, onClose, groupId, groupName, members, meId, now, aiContext, chatSnippets, moods, onCreated }: { open: boolean; onClose: () => void; groupId: number; groupName: string; members: Member[]; meId: number; now: string; aiContext: string; chatSnippets: (subjectId: number | null, title: string) => Snippet[]; moods: () => Record<string, number>; onCreated: (id: number) => void }) {
  const base = new Date(now);
  const presets: [string, Date][] = [
    ["Tonight", new Date(new Date(base).setHours(23, 0, 0, 0) <= base.getTime() ? base.getTime() + 3 * 3600e3 : new Date(base).setHours(23, 0, 0, 0))],
    ["Tomorrow", new Date(base.getTime() + 864e5)],
    ["This week", new Date(base.getTime() + 7 * 864e5)],
    ["3 months", new Date(base.getTime() + 90 * 864e5)],
    ["1 year", new Date(base.getTime() + 365 * 864e5)],
  ];
  // Picked once per opening of the sheet, not on every keystroke.
  const examples = useMemo(() => examplesFor(groupName, members, meId), [open, groupName, meId, members.length]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [answer, setAnswer] = useState<Answer>("auto");
  const [line, setLine] = useState("");
  const [when, setWhen] = useState(localInput(presets[1][1]));
  const [details, setDetails] = useState("");
  const [useMood, setUseMood] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  // On the preview the poster can still change the type or move the line; both re-price.
  const [override, setOverride] = useState<{ answer: Answer; line: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const payload = (o?: { answer: Answer; line: string }) => {
    const s = members.find((m) => m.username === subject);
    const mood = useMood && s ? (moods()[s.id] ?? 0) : null;
    const snippets = chatSnippets(s?.id ?? null, `${title} ${details}`);
    const a = o?.answer ?? answer;
    const rawLine = o?.line ?? line;
    const l = Number(rawLine.replace(",", "."));
    return {
      title,
      description: details,
      resolvesAt: new Date(when).toISOString(),
      subjectUsername: subject || null,
      mood,
      chatSnippets: snippets.length ? snippets : undefined,
      kind: a === "stock" ? "stock" : a === "auto" ? "auto" : "bet",
      answer: a === "number" ? "number" : a === "yesno" || a === "stock" ? "yesno" : "auto",
      line: a === "number" && rawLine !== "" && Number.isFinite(l) ? l : undefined,
    } as const;
  };

  async function price(o?: { answer: Answer; line: string }) {
    setBusy(true);
    setErr("");
    try {
      const p = await api<Preview>(`/api/groups/${groupId}/preview`, { body: payload(o) });
      setPreview(p);
      setOverride(o ?? null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function getOdds(e: React.FormEvent) {
    e.preventDefault();
    await price();
  }
  async function list() {
    setBusy(true);
    try {
      const { id } = await api<{ id: number }>(`/api/groups/${groupId}/markets`, { body: payload(override ?? undefined) });
      setPreview(null);
      setOverride(null);
      setTitle("");
      setDetails("");
      setLine("");
      setAnswer("auto");
      onCreated(id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const who = members.find((m) => m.username === subject);
  const whenDate = new Date(when);
  const whenLabel = Number.isNaN(whenDate.getTime()) ? "" : whenDate.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <Sheet open={open} onClose={onClose} title={preview ? "Check the odds" : "New stake"}>
      {!preview ? (
        <form onSubmit={getOdds} className="space-y-6">
          <Field n={1} label="What's the stake?">
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
              autoFocus
              required
              minLength={4}
              maxLength={140}
              rows={2}
              placeholder="Say it the way you'd say it in the chat"
              className="w-full resize-none rounded-2xl border border-line bg-ink px-4 py-3 !text-[18px] font-medium leading-snug outline-none placeholder:text-white/25 focus:border-white/30"
            />
            {!title && (
              <div className="no-scrollbar -mx-1 mt-2 flex gap-2 overflow-x-auto px-1">
                {examples.map((x) => (
                  <button type="button" key={x} onClick={() => setTitle(x)} className="shrink-0 rounded-full bg-white/[.05] px-3 py-1.5 text-[13px] text-mute hover:text-white">{x}</button>
                ))}
              </div>
            )}
          </Field>

          <Field n={2} label="Who's it about?" hint="Optional. Their past record feeds the odds, and they can call it off.">
            <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              <Person on={!subject} label="Nobody" onClick={() => setSubject("")} />
              {members.map((m) => {
                // People who turned off situations about them are greyed out (you can always pick yourself).
                const off = m.subject_policy === "nobody" && m.id !== meId;
                return <Person key={m.id} on={subject === m.username} off={off} label={m.id === meId ? "Me" : m.display_name} avatar={<Avatar id={m.id} name={m.display_name} color={m.color} size={44} />} onClick={() => !off && setSubject(m.username)} />;
              })}
            </div>
          </Field>

          <Field n={3} label="How does it settle?">
            <div className="grid grid-cols-2 gap-2">
              {ANSWERS.map((a) => (
                <button type="button" key={a.k} onClick={() => setAnswer(a.k)} aria-pressed={answer === a.k} className={`rounded-2xl border p-3 text-left transition ${answer === a.k ? "border-white bg-white/[.08]" : "border-line bg-ink hover:border-white/25"}`}>
                  <div className={`flex items-center gap-1.5 text-[14px] font-semibold ${answer === a.k ? "" : "text-white/85"}`}>{a.icon}{a.label}</div>
                  <div className="mt-1 text-[12px] leading-snug text-mute">{a.blurb}</div>
                </button>
              ))}
            </div>
            {answer === "number" && (
              <div className="mt-2 rounded-2xl border border-line bg-ink p-3">
                <div className="text-[13px] font-medium">The line</div>
                <div className="mt-1 flex items-center gap-2">
                  <input autoComplete="off" inputMode="decimal" value={line} onChange={(e) => setLine(e.target.value.replace(/[^0-9.,-]/g, ""))} placeholder="AI picks" aria-label="Line" className="w-28 rounded-xl bg-white/[.06] px-3 py-2 !text-[17px] font-semibold tabular outline-none placeholder:font-normal placeholder:text-white/25" />
                  <span className="text-sm text-mute">Leave it blank and the AI sets a line that makes it a fair 50/50.</span>
                </div>
              </div>
            )}
          </Field>

          <Field n={4} label="When do we find out?">
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
              {presets.map(([l, d]) => (
                <button type="button" key={l} onClick={() => setWhen(localInput(d))} className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium ${when === localInput(d) ? "bg-white text-black" : "bg-white/[.06] hover:bg-white/10"}`}>{l}</button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required className="flex-1" />
              {whenLabel && <span className="shrink-0 text-xs text-mute">{whenLabel}</span>}
            </div>
          </Field>

          <details className="group rounded-2xl border border-line">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-mute group-open:text-white">Details and what counts <span className="font-normal">(optional)</span></summary>
            <div className="space-y-3 px-4 pb-4">
              <Input placeholder="Where, what counts, any rule you want" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} />
              {who && (
                <label className="flex items-start gap-2 text-sm text-mute">
                  <input type="checkbox" checked={useMood} onChange={(e) => setUseMood(e.target.checked)} className="mt-1" />
                  <span>Let the AI use a mood score for {who.display_name} worked out on this phone from the chat. Only a single number is shared, never messages.</span>
                </label>
              )}
              {!aiContext && <p className="text-xs text-mute">Tip: add term dates or fixtures in group settings so the AI can use them.</p>}
              <p className="flex items-start gap-1.5 text-xs text-mute"><Sparkle size={13} className="mt-px" /> The AI reads relevant chat: this phone picks up to {MAX_SNIPPETS} anonymised messages about this stake. You&apos;ll see exactly which ones were sent, and which the AI used, on the next screen.</p>
            </div>
          </details>

          {err && <p className="text-sm text-down">{err}</p>}
          <Button className="w-full !py-3.5 text-[17px]" disabled={busy || title.trim().length < 4}>{busy ? "Working out the odds…" : "Get the odds"}</Button>
          <p className="text-center text-xs text-mute">Nothing is posted yet. You check the odds first.</p>
        </form>
      ) : (
        <PreviewPane
          key={`${preview.analysis.answer}-${preview.analysis.line}-${preview.analysis.kind}`}
          preview={preview}
          busy={busy}
          err={err}
          who={who}
          whenLabel={whenLabel}
          chosen={override?.answer ?? answer}
          onType={(a) => price({ answer: a, line: a === "number" ? (override?.line ?? line) : "" })}
          onLine={(l) => price({ answer: "number", line: l })}
          onEdit={() => { setPreview(null); setOverride(null); }}
          onList={list}
        />
      )}
    </Sheet>
  );
}

function Field({ n, label, hint, children }: { n: number; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[.08] text-[11px] font-semibold tabular text-mute">{n}</span>
        <h3 className="text-[15px] font-semibold">{label}</h3>
      </div>
      {children}
      {hint && <p className="mt-1.5 text-xs text-mute">{hint}</p>}
    </section>
  );
}

function Person({ on, off, label, avatar, onClick }: { on: boolean; off?: boolean; label: string; avatar?: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={off} aria-pressed={on} title={off ? `${label} has turned off stakes about them` : undefined} className={`flex w-16 shrink-0 flex-col items-center gap-1.5 ${off ? "cursor-not-allowed opacity-30" : ""}`}>
      <span className={`rounded-full p-[2px] ring-2 transition ${on ? "ring-white" : "ring-transparent"}`}>
        {avatar ?? <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[.06] text-mute"><Check size={16} className={on ? "" : "opacity-0"} /></span>}
      </span>
      <span className={`w-full truncate text-center text-[12px] ${on ? "font-semibold" : "text-mute"}`}>{label}</span>
    </button>
  );
}

/** The second screen: what the AI made of it, the opening odds, and the chance to change the type or line before listing. */
function PreviewPane({ preview, busy, err, who, whenLabel, chosen, onType, onLine, onEdit, onList }: { preview: Preview; busy: boolean; err: string; who?: Member; whenLabel: string; chosen: Answer; onType: (a: Answer) => void; onLine: (l: string) => void; onEdit: () => void; onList: () => void }) {
  const a = preview.analysis;
  const isNumber = a.answer === "number" && a.line != null;
  const lbl = sides(a);
  const [lineDraft, setLineDraft] = useState(isNumber ? String(a.line) : "");
  const current: Answer = a.kind === "stock" ? "stock" : isNumber ? "number" : "yesno";
  const stock = a.kind === "stock";
  const show = (p: number) => (stock && !isNumber ? (p * 100).toFixed(1) : pct(p));
  const draftMoved = lineDraft !== "" && Number(lineDraft.replace(",", ".")) !== a.line;
  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={stock ? "brand" : "mute"}>{typeLabel(a)}</Badge>
          <Badge>{a.category}</Badge>
          {a.decay === "hazard" && <Badge tone="down"><span className="inline-flex items-center gap-1"><Hourglass size={11} /> decays over time</span></Badge>}
        </div>
        <div className="mt-2 text-[20px] font-semibold leading-snug">{a.title}</div>
        <div className="mt-1 text-sm text-mute">{who ? `About ${who.display_name} · ` : ""}{stock ? "matures" : "settles"} {whenLabel}</div>
      </div>

      <div className={`grid grid-cols-2 gap-2 ${busy ? "opacity-50" : ""}`}>
        <div className="rounded-2xl border border-up/40 bg-up/10 p-3">
          <div className="text-sm font-semibold text-up">{lbl.yes}</div>
          <div className="mt-0.5 text-3xl font-semibold tracking-tight tabular">{show(preview.openProb)}</div>
          <div className="text-[11px] text-mute">{isNumber ? "chance it goes over" : stock ? "opening price" : "chance it happens"}</div>
        </div>
        <div className="rounded-2xl border border-down/40 bg-down/10 p-3">
          <div className="text-sm font-semibold text-down">{lbl.no}</div>
          <div className="mt-0.5 text-3xl font-semibold tracking-tight tabular">{show(1 - preview.openProb)}</div>
          <div className="text-[11px] text-mute">{isNumber ? "chance it stays under" : stock ? "if it doesn't happen" : "chance it doesn't"}</div>
        </div>
      </div>

      {isNumber && (
        <div className="rounded-2xl border border-line bg-ink p-3">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-medium">The line: {fmtLine(a.line!, a.unit)}</div>
            <span className="text-xs text-mute">{chosen === "number" && preview.analysis.line != null && !draftMoved ? "" : "AI's median guess"}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input autoComplete="off" inputMode="decimal" value={lineDraft} onChange={(e) => setLineDraft(e.target.value.replace(/[^0-9.,-]/g, ""))} aria-label="Line" className="w-28 rounded-xl bg-white/[.06] px-3 py-2 !text-[17px] font-semibold tabular outline-none" />
            {a.unit && <span className="text-sm text-mute">{a.unit}</span>}
            <Button variant="ghost" className="ml-auto" disabled={busy || !draftMoved} onClick={() => onLine(lineDraft)}>Move the line</Button>
          </div>
          <p className="mt-2 text-xs text-mute">Moving the line changes the odds. Over the line pays {lbl.yesShort.toLowerCase()}, on or under pays {lbl.noShort.toLowerCase()}.</p>
        </div>
      )}

      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-mute">Settle it as</div>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {ANSWERS.filter((x) => x.k !== "auto").map((x) => (
            <button type="button" key={x.k} disabled={busy} onClick={() => current !== x.k && onType(x.k)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${current === x.k ? "bg-white text-black" : "bg-white/[.06] hover:bg-white/10"}`}>{x.label}</button>
          ))}
        </div>
        {chosen === "auto" && <p className="mt-1.5 text-xs text-mute">The AI picked {ANSWERS.find((x) => x.k === current)?.label.toLowerCase()}. Tap another to change it.</p>}
        {chosen === "number" && !isNumber && (
          <div className="mt-2 rounded-2xl border border-line bg-ink p-3">
            <div className="text-[13px] font-medium">Set the line yourself</div>
            <div className="mt-2 flex items-center gap-2">
              <input autoComplete="off" inputMode="decimal" value={lineDraft} onChange={(e) => setLineDraft(e.target.value.replace(/[^0-9.,-]/g, ""))} placeholder="e.g. 15" aria-label="Line" className="w-28 rounded-xl bg-white/[.06] px-3 py-2 !text-[17px] font-semibold tabular outline-none placeholder:font-normal placeholder:text-white/25" />
              <Button variant="ghost" className="ml-auto" disabled={busy || lineDraft === ""} onClick={() => onLine(lineDraft)}>Price it</Button>
            </div>
          </div>
        )}
      </div>

      {preview.full ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Opens at" value={show(preview.openProb)} />
          <Stat label={a.source === "heuristic" ? "Stats model" : "Gemma"} value={show(a.probability)} />
          <Stat label={`History (n≈${preview.baseRateN.toFixed(0)})`} value={preview.baseRate == null ? "–" : show(preview.baseRate)} />
        </div>
      ) : (
        <div className="text-center"><Stat label="Opens at" value={show(preview.openProb)} /></div>
      )}
      <p className="text-sm text-mute">{a.rationale}</p>
      <div className="rounded-2xl border border-line p-3 text-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-mute">How it&apos;s settled</div>
        {a.resolutionRule}
      </div>
      {preview.chatShared.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-mute"><Chat size={12} /> What the AI saw from the chat ({preview.chatShared.length})</div>
          <div className="space-y-1.5">
            {preview.chatShared.map((s, i) => {
              const used = a.chatUsed.find((u) => u.text === s.text && u.who === s.who);
              return (
                <div key={i} className={`rounded-2xl p-2.5 text-sm ${used ? "bg-brand/10" : "bg-black/40 opacity-60"}`}>
                  <div className="text-xs text-mute">{s.who} · {s.age} · {used ? <span className="text-brand">used: {used.why}</span> : "ignored as not relevant"}</div>
                  <div>{s.text}</div>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-mute">Names, emails, phone numbers and links were removed on your phone before sending.</p>
        </div>
      )}
      {preview.similar.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-mute"><Book size={12} /> Past data from this group</div>
          <div className="space-y-2">
            {preview.similar.map((s) => (
              <div key={s.id} className="rounded-xl bg-ink p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className={s.outcome ? "text-up" : "text-down"}>{s.outcome ? "YES" : "NO"}</span>
                  <span className="flex-1 truncate font-medium">{s.title}</span>
                  <span className="text-xs text-mute">{Math.round(s.similarity * 100)}% match</span>
                </div>
                <div className="mt-1 text-mute">{s.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {err && <p className="text-sm text-down">{err}</p>}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onEdit} disabled={busy}>Edit</Button>
        <Button className="flex-[2] !py-3.5 text-[17px]" onClick={onList} disabled={busy}>{busy ? "…" : stock && !isNumber ? "List the stock" : "Post the bet"}</Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink p-3">
      <div className="text-xs text-mute">{label}</div>
      <div className="text-xl font-bold tabular">{value}</div>
    </div>
  );
}
