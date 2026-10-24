"use client";
import { useState } from "react";
import { api } from "./api";
import { Badge, Button, Input, Sheet, pct } from "./ui";
import type { Member } from "@/app/g/[id]/page";
import type { Snippet } from "@/lib/chat-context";

type Preview = {
  analysis: { title: string; kind: "bet" | "stock"; decay: string; category: string; probability: number; rationale: string; resolutionRule: string; source: string; chatUsed: (Snippet & { why: string })[] };
  chatShared: Snippet[];
  openProb: number;
  baseRate: number | null;
  baseRateN: number;
  similar: { id: number; title: string; outcome: boolean; summary: string; similarity: number; created_at: string }[];
};

function localInput(d: Date) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
}

export function NewSituation({ open, onClose, groupId, members, now, aiContext, aiReadsChat, chatSnippets, moods, onCreated }: { open: boolean; onClose: () => void; groupId: number; members: Member[]; now: string; aiContext: string; aiReadsChat: boolean; chatSnippets: (subjectId: number | null, title: string) => Snippet[]; moods: () => Record<string, number>; onCreated: (id: number) => void }) {
  const base = new Date(now);
  const presets: [string, Date][] = [
    ["Tonight", new Date(new Date(base).setHours(23, 0, 0, 0) <= base.getTime() ? base.getTime() + 3 * 3600e3 : new Date(base).setHours(23, 0, 0, 0))],
    ["Tomorrow", new Date(base.getTime() + 864e5)],
    ["1 week", new Date(base.getTime() + 7 * 864e5)],
    ["3 months", new Date(base.getTime() + 90 * 864e5)],
    ["1 year", new Date(base.getTime() + 365 * 864e5)],
  ];
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [when, setWhen] = useState(localInput(presets[1][1]));
  const [details, setDetails] = useState("");
  const [useMood, setUseMood] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const payload = () => {
    const s = members.find((m) => m.username === subject);
    const mood = useMood && s ? (moods()[s.id] ?? 0) : null;
    const snippets = aiReadsChat ? chatSnippets(s?.id ?? null, `${title} ${details}`) : [];
    return { title, description: details, resolvesAt: new Date(when).toISOString(), subjectUsername: subject || null, mood, chatSnippets: snippets.length ? snippets : undefined };
  };

  async function getOdds(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      setPreview(await api<Preview>(`/api/groups/${groupId}/preview`, { body: payload() }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function list() {
    setBusy(true);
    try {
      const { id } = await api<{ id: number }>(`/api/groups/${groupId}/markets`, { body: payload() });
      setPreview(null);
      setTitle("");
      setDetails("");
      onCreated(id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="New situation">
      {!preview ? (
        <form onSubmit={getOdds} className="space-y-3">
          <Input placeholder="What's the situation? e.g. Jake is late to dinner" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required minLength={4} />
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            <button type="button" onClick={() => setSubject("")} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${!subject ? "bg-white text-black" : "bg-white/5"}`}>Nobody</button>
            {members.map((m) => (
              <button type="button" key={m.id} onClick={() => setSubject(m.username)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${subject === m.username ? "bg-white text-black" : "bg-white/5"}`}>
                {m.display_name}
              </button>
            ))}
          </div>
          <div>
            <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto">
              {presets.map(([l, d]) => (
                <button type="button" key={l} onClick={() => setWhen(localInput(d))} className="shrink-0 rounded-full bg-white/5 px-3 py-1.5 text-sm">{l}</button>
              ))}
            </div>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
          </div>
          <Input placeholder="Details (optional): where, what counts…" value={details} onChange={(e) => setDetails(e.target.value)} />
          {subject && (
            <label className="flex items-start gap-2 text-sm text-mute">
              <input type="checkbox" checked={useMood} onChange={(e) => setUseMood(e.target.checked)} className="mt-1" />
              <span>Let the AI use a mood score for {subject} worked out on this phone from the chat. Only a single number is shared, never messages.</span>
            </label>
          )}
          {!aiContext && <p className="text-xs text-mute">Tip: add term dates or fixtures in group settings so the AI can use them.</p>}
          {aiReadsChat && <p className="text-xs text-mute">🤖 This group lets the AI read relevant chat. You&apos;ll see exactly which messages were shared on the next screen.</p>}
          {err && <p className="text-sm text-down">{err}</p>}
          <Button className="w-full" disabled={busy}>{busy ? "Pricing…" : "Get AI odds"}</Button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone={preview.analysis.kind === "stock" ? "brand" : "mute"}>{preview.analysis.kind === "stock" ? "📈 STOCK · long-term" : "🎲 BET · short-term"}</Badge>
            <Badge>{preview.analysis.category}</Badge>
            {preview.analysis.decay === "hazard" && <Badge tone="down">⏳ decays over time</Badge>}
          </div>
          <div className="text-xl font-semibold">{preview.analysis.title}</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-black/40 p-3">
              <div className="text-xs text-mute">Opens at</div>
              <div className="text-2xl font-bold tabular">{pct(preview.openProb)}</div>
            </div>
            <div className="rounded-2xl bg-black/40 p-3">
              <div className="text-xs text-mute">{preview.analysis.source === "gemini" ? "Gemini" : "Model"}</div>
              <div className="text-2xl font-bold tabular">{pct(preview.analysis.probability)}</div>
            </div>
            <div className="rounded-2xl bg-black/40 p-3">
              <div className="text-xs text-mute">History (n≈{preview.baseRateN.toFixed(0)})</div>
              <div className="text-2xl font-bold tabular">{preview.baseRate == null ? "–" : pct(preview.baseRate)}</div>
            </div>
          </div>
          <p className="text-sm text-mute">{preview.analysis.rationale}</p>
          <div className="rounded-2xl border border-line p-3 text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-mute">Resolution rule</div>
            {preview.analysis.resolutionRule}
          </div>
          {preview.chatShared.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">💬 What the AI saw from the chat ({preview.chatShared.length})</div>
              <div className="space-y-1.5">
                {preview.chatShared.map((s, i) => {
                  const used = preview.analysis.chatUsed.find((u) => u.text === s.text && u.who === s.who);
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
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">📚 Past data from this group</div>
              <div className="space-y-2">
                {preview.similar.map((s) => (
                  <div key={s.id} className="rounded-2xl bg-black/40 p-3 text-sm">
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
            <Button variant="ghost" className="flex-1" onClick={() => setPreview(null)}>Edit</Button>
            <Button className="flex-[2]" onClick={list} disabled={busy}>{busy ? "Listing…" : `List ${preview.analysis.kind}`}</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
