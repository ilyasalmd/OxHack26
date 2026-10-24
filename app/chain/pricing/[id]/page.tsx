"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { api } from "@/components/api";
import { Badge, TopBar, pct } from "@/components/ui";
import { ArrowUpRight, Check, Copy } from "@/components/icons";

type Rec = { id: number; kind: "open" | "reprice"; sha256: string; createdAt: string; record: string };
type Data = {
  market: { id: number; title: string; kind: string; group: string; aiProb: number; openProb: number; source: string; createdAt: string };
  records: Rec[];
  anchor: { status: string; signature: string | null; memoHash: string | null } | null;
};
type Similar = { title: string; outcome: boolean; similarity: number };
type OpenRecord = {
  provider: string;
  model: string | null;
  ms: number;
  prompt: string | null;
  rawOutput: string | null;
  error: string | null;
  inputs: {
    situation: string;
    details: string;
    resolvesAt: string;
    subject: string | null;
    groupContext: string;
    chatMood: number | null;
    chatSnippets: { who: string; age: string; text: string }[];
    history: { baseRate: number | null; effectiveSamples: number; subjectRecord: string | null; similar: Similar[] };
    subjectProfile: { answers: number; digest: string } | null;
  };
  parsed: { probability: number; rationale: string; kind: string; resolutionRule: string; chatUsed: unknown[] };
  maths: { rule: string; aiProb: number; baseRate: number | null; effectiveSamples: number; weight: number; openProb: number };
};
type RepriceRecord = {
  provider: string;
  model: string | null;
  ms: number;
  prompt: string | null;
  rawOutput: string | null;
  maths: { rule: string; applied: { id: number; title: string; from: number; to: number; reason: string }[] };
};

async function sha256Hex(text: string) {
  if (!crypto?.subtle) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Admin demo view: exactly how the AI set one market's price, and proof the record wasn't changed. */
export default function PricingRecordPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Data>(`/api/chain/pricing/${id}`).then(setD).catch((e) => setErr((e as Error).message));
  }, [id]);
  if (!me) return null;
  if (!me.account.isAdmin) return <main className="p-10 text-center text-sm text-mute">Pricing records are for the app&apos;s admin.</main>;
  const opening = d?.records.find((r) => r.kind === "open");
  const remarks = d?.records.filter((r) => r.kind === "reprice") ?? [];

  return (
    <main className="flex min-h-dvh flex-col lg:min-h-full">
      <TopBar back="/chain" title="How the AI priced this" backOnDesktop />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 lg:px-8">
        {err && <p className="mt-8 text-sm text-down">{err}</p>}
        {!d && !err && <p className="mt-8 text-sm text-mute">Loading the record…</p>}
        {d && (
          <>
            <div className="mt-8 text-sm text-mute">{d.market.group} · {d.market.kind === "stock" ? "Stock" : "Bet"} #{d.market.id}</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{d.market.title}</h1>
            {!opening && (
              <p className="mt-6 rounded-2xl bg-panel p-4 text-sm text-mute">
                This market opened before pricing records existed, so there is no stored prompt or raw reply. It was priced by{" "}
                {d.market.source === "heuristic" ? "the stats model (no AI)" : "the AI"}: AI {pct(d.market.aiProb)}, opened at {pct(d.market.openProb)}.
              </p>
            )}
            {opening && <Opening rec={opening} anchor={d.anchor} />}
            {remarks.length > 0 && (
              <section className="mt-12">
                <h2 className="text-lg font-semibold tracking-tight">Re-marks since it opened</h2>
                {remarks.map((r) => <Remark key={r.id} rec={r} marketId={d.market.id} />)}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Opening({ rec, anchor }: { rec: Rec; anchor: Data["anchor"] }) {
  const r = JSON.parse(rec.record) as OpenRecord;
  const [local, setLocal] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    sha256Hex(rec.record).then(setLocal);
  }, [rec.record]);
  const h = r.inputs.history;
  const ai = r.provider === "heuristic" ? "Stats model (the AI didn't answer)" : `${r.model} via ${r.provider === "ollama" ? "Ollama on this Mac" : r.provider}`;

  return (
    <>
      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        <Stat label="AI said" value={pct(r.maths.aiProb, 1)} />
        <Stat label="History" value={r.maths.baseRate == null ? "none" : pct(r.maths.baseRate, 1)} />
        <Stat label="Opened at" value={pct(r.maths.openProb, 1)} tone="text-brand" />
      </div>

      <Block title="Proof the record hasn't changed">
        <Row label="SHA-256 of the stored record" value={rec.sha256} mono />
        <Check3 ok={local === rec.sha256} pending={local === undefined} text={local === null ? "This browser can't hash here (needs https or localhost)" : "Recomputed in your browser just now, and it matches"} />
        {anchor ? (
          <>
            <Check3 ok={anchor.memoHash === rec.sha256} text={anchor.memoHash ? "The same hash is in the market's on-chain memo" : "The on-chain memo has no hash (opened before records)"} />
            <div className="mt-2 text-sm text-mute">
              Memo {({ confirmed: "written to Solana", pending: "queued for Solana", skipped: "not sent, Solana is off", failed: "failed to send" } as Record<string, string>)[anchor.status] ?? anchor.status}.{" "}
              {anchor.signature && (
                <Link href={`/chain/${anchor.signature}`} className="inline-flex items-center gap-1 text-white hover:underline">
                  Open the transaction <ArrowUpRight size={13} />
                </Link>
              )}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-mute">No chain memo was queued for this market.</p>
        )}
      </Block>

      <Block title="What the AI was given">
        <Row label="Situation" value={r.inputs.situation + (r.inputs.details ? ` · ${r.inputs.details}` : "")} />
        <Row label="About" value={r.inputs.subject ?? "nobody specific"} />
        <Row label="Deadline" value={new Date(r.inputs.resolvesAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} />
        <Row label="Group context" value={r.inputs.groupContext || "none"} />
        <Row
          label="Past outcomes in this group"
          value={h.baseRate == null ? "Nothing similar enough yet" : `${pct(h.baseRate)} came true across ${h.effectiveSamples.toFixed(1)} effective samples`}
          sub={h.subjectRecord ?? undefined}
        />
        {h.similar.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {h.similar.map((s, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-white/[.04] px-3 py-2 text-sm">
                <span className={`w-8 font-semibold ${s.outcome ? "text-up" : "text-down"}`}>{s.outcome ? "YES" : "NO"}</span>
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <span className="tabular text-xs text-mute">match {pct(s.similarity)}</span>
              </div>
            ))}
          </div>
        )}
        <Row label="Chat messages shared" value={r.inputs.chatSnippets.length ? `${r.inputs.chatSnippets.length} anonymised snippets` : "None. Chat is only sent when someone posts from the app with chat reading on."} />
        <Row label="Chat mood" value={r.inputs.chatMood == null ? "Not sent" : r.inputs.chatMood.toFixed(2)} />
        <Row
          label="Subject's own profile"
          value={r.inputs.subjectProfile ? `${r.inputs.subjectProfile.answers} private answer${r.inputs.subjectProfile.answers === 1 ? "" : "s"} used, hidden even here` : "None given"}
          sub={r.inputs.subjectProfile ? `Keyed digest ${r.inputs.subjectProfile.digest.slice(0, 16)}… proves which answers were used without showing them` : undefined}
        />
      </Block>

      <Block title="What the AI said">
        <Row label="Model" value={ai} sub={r.ms ? `Answered in ${(r.ms / 1000).toFixed(1)}s` : undefined} />
        {r.error && <Row label="Error" value={r.error} />}
        <Row label="Probability" value={pct(r.parsed.probability, 1)} />
        <Row label="Its reasoning" value={r.parsed.rationale} />
        <Row label="Resolution rule" value={r.parsed.resolutionRule} />
        {r.rawOutput && <Pre title="Raw reply, exactly as returned" text={r.rawOutput} />}
      </Block>

      <Block title="How the opening price was set">
        <div className="rounded-xl bg-white/[.04] p-4 font-mono text-[13px] leading-relaxed">
          <div>weight = {r.maths.baseRate == null ? "0 (no history)" : `0.3 × min(1, ${r.maths.effectiveSamples.toFixed(2)} / 3) = ${r.maths.weight.toFixed(3)}`}</div>
          <div>
            open = {(1 - r.maths.weight).toFixed(3)} × {r.maths.aiProb.toFixed(3)} + {r.maths.weight.toFixed(3)} × {(r.maths.baseRate ?? 0).toFixed(3)} = <span className="text-brand">{r.maths.openProb.toFixed(4)}</span>
          </div>
        </div>
        <p className="mt-2 text-sm text-mute">The AI already sees the history in its prompt. This blend gives the history a direct vote too, so one odd answer can&apos;t move the price far.</p>
      </Block>

      {r.prompt && (
        <Block title="The full prompt">
          <Pre title="Sent to the model" text={r.prompt} />
        </Block>
      )}
      <Block title="The exact record">
        <Pre title="This text, byte for byte, is what the hash covers" text={rec.record} />
      </Block>
    </>
  );
}

function Remark({ rec, marketId }: { rec: Rec; marketId: number }) {
  const r = JSON.parse(rec.record) as RepriceRecord;
  const mine = r.maths.applied.find((a) => a.id === marketId);
  return (
    <div className="mt-4 rounded-2xl bg-panel p-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{new Date(rec.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        <Badge>{r.provider === "heuristic" ? "Stats model" : r.model}</Badge>
      </div>
      <p className="mt-2 text-sm">{mine ? `${pct(mine.from)} to ${pct(mine.to)}: ${mine.reason}` : "Price left as it was."}</p>
      <div className="mt-2 break-all font-mono text-xs text-mute">SHA-256 {rec.sha256}</div>
      {r.rawOutput && <Pre title="Raw reply" text={r.rawOutput} />}
      {r.prompt && <Pre title="Prompt" text={r.prompt} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-panel p-3">
      <div className="text-xs text-mute">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Row({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div className="mt-3">
      <div className="text-xs text-mute">{label}</div>
      <div className={`mt-0.5 break-words text-[15px] ${mono ? "break-all font-mono text-[13px]" : ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-mute">{sub}</div>}
    </div>
  );
}

function Check3({ ok, pending, text }: { ok: boolean; pending?: boolean; text: string }) {
  return (
    <div className={`mt-2 flex items-center gap-2 text-sm ${pending ? "text-mute" : ok ? "text-up" : "text-down"}`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full ${pending ? "bg-white/10" : ok ? "bg-up/20" : "bg-down/20"}`}>{ok && <Check size={12} />}</span>
      {pending ? "Checking…" : ok ? text : `Mismatch: ${text.toLowerCase()}`}
    </div>
  );
}

function Pre({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-line">
      <div className="flex items-center gap-2 bg-white/[.03] px-3 py-2 text-sm">
        <button type="button" onClick={() => setOpen(!open)} className="flex-1 text-left text-mute hover:text-white">{open ? "Hide" : "Show"} · {title}</button>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
          className="rounded-full p-1.5 text-mute hover:bg-white/10 hover:text-white"
          aria-label="Copy"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      {open && <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-relaxed text-white/80">{text}</pre>}
    </div>
  );
}
