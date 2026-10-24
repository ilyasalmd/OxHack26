/**
 * Walk-forward test of the pricing AI on the seeded history.
 *
 *   npm run ai:eval -- ollama:gemma4:12b      # one model; writes .data/ai-eval/<model>.json
 *   npm run ai:eval -- gemini:gemini-2.5-flash
 *   npm run ai:eval -- report                 # table of every model run so far
 *
 * For each settled situation, oldest first, the model sees exactly what the app would have
 * shown it when the situation was posted: the title and details, who it's about, the group's
 * AI context and the group's history up to that moment (memories created later are hidden).
 * Its opening probability is then scored against what actually happened.
 *
 * Caveat: the seeded outcomes come from the seed's own odds per template and per person, so
 * this measures how well a model reads that synthetic world, not the real one.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { analyzeSituation, heuristicAnalysis } from "../lib/ai";
import { evidenceFor } from "../lib/memory";
import { MARKET } from "../lib/config";
import type { Q } from "../lib/db";

const OUT = ".data/ai-eval";
const SOURCE = process.env.SEED_PGLITE_DIR ?? ".data/seed-pglite";
const LIMIT = Number(process.env.EVAL_LIMIT ?? 0);

type Row = { id: number; group_id: number; title: string; description: string; kind: string; subject_id: number | null; subject: string | null; created_at: Date; resolves_at: Date; outcome: boolean; ai_context: string; crowd: number | null };
type Result = { id: number; outcome: boolean; p: number | null; open: number | null; stats: number; crowd: number | null; kind: string | null; seededKind: string; ms: number; ok: boolean };

const brier = (rs: { p: number; y: boolean }[]) => rs.reduce((s, r) => s + (r.p - +r.y) ** 2, 0) / rs.length;
const logLoss = (rs: { p: number; y: boolean }[]) => -rs.reduce((s, r) => s + Math.log(Math.min(0.99, Math.max(0.01, r.y ? r.p : 1 - r.p))), 0) / rs.length;
const acc = (rs: { p: number; y: boolean }[]) => rs.filter((r) => r.p > 0.5 === r.y).length / rs.length;
const fileFor = (model: string) => path.join(OUT, `${model.replace(/[^a-z0-9.]+/gi, "_")}.json`);

/** The database as it looked at time t, for memory lookups. */
const asOf = (q: Q, t: Date): Q => ({
  query: (sql, params) => q.query(sql.replace(/FROM memories WHERE group_id = \$1/g, `FROM memories WHERE created_at < '${t.toISOString()}' AND group_id = $1`), params),
});

async function load(db: PGlite) {
  const rows = (
    await db.query<Row>(
      `SELECT m.id, m.group_id, m.title, m.description, m.kind, m.subject_id, u.display_name AS subject, m.created_at, m.resolves_at, m.outcome, g.ai_context, mem.crowd_prob AS crowd
         FROM markets m JOIN groups g ON g.id = m.group_id LEFT JOIN users u ON u.id = m.subject_id
         LEFT JOIN memories mem ON mem.market_id = m.id
        WHERE m.status = 'resolved' ORDER BY m.created_at`
    )
  ).rows;
  return LIMIT ? rows.slice(0, LIMIT) : rows;
}

async function run(spec: string) {
  const [provider, ...rest] = spec.split(":");
  const model = rest.join(":");
  if (provider !== "ollama" && provider !== "gemini") throw new Error(`Use ollama:<model> or gemini:<model>, not ${spec}`);
  process.env.AI_PROVIDER = provider;
  if (provider === "ollama") process.env.OLLAMA_MODEL = model;
  else process.env.GEMINI_MODEL = model;
  // Gemini's free tier allows about 10 requests a minute.
  const gap = provider === "gemini" ? Number(process.env.EVAL_GAP_MS ?? 6500) : 0;

  const db = await PGlite.create(SOURCE);
  const q: Q = { query: async (sql, params) => (await db.query(sql, params as unknown[])).rows as never[] };
  const rows = await load(db);
  const results: Result[] = [];
  for (const [i, m] of rows.entries()) {
    const now = new Date(m.created_at);
    const { history } = await evidenceFor(asOf(q, now), m.group_id, m.title, m.subject_id);
    const days = (new Date(m.resolves_at).getTime() - now.getTime()) / 86400000;
    const stats = heuristicAnalysis(m.title, days, history).probability;
    const t = Date.now();
    const a = await analyzeSituation({ title: m.title, description: m.description, resolvesAt: new Date(m.resolves_at), now, subjectName: m.subject, groupContext: m.ai_context, mood: null, history });
    const ms = Date.now() - t;
    const ok = a.source !== "heuristic";
    // The same blend the app applies before listing.
    const w = history.baseRate == null ? 0 : MARKET.historyWeight * Math.min(1, history.n / 3);
    const open = ok ? (1 - w) * a.probability + w * (history.baseRate ?? 0) : null;
    results.push({ id: m.id, outcome: m.outcome, p: ok ? a.probability : null, open, stats, crowd: m.crowd, kind: ok ? a.kind : null, seededKind: m.kind, ms, ok });
    process.stdout.write(`\r${spec}: ${i + 1}/${rows.length}${ok ? "" : " (fallback)"}   `);
    if (gap) await new Promise((r) => setTimeout(r, gap));
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(fileFor(spec), JSON.stringify({ spec, at: new Date().toISOString(), results }, null, 1));
  console.log(`\nWrote ${fileFor(spec)}`);
  if (provider === "ollama") {
    // Free the memory for the next model.
    await fetch(`${process.env.OLLAMA_URL ?? "http://127.0.0.1:11434"}/api/generate`, { method: "POST", body: JSON.stringify({ model, keep_alive: 0 }) }).catch(() => {});
  }
  await db.close();
}

function report() {
  const runs = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"))) : [];
  if (!runs.length) return console.log("No runs yet.");
  const base: Result[] = runs[0].results;
  const line = (name: string, rs: { p: number; y: boolean }[], extra = "") =>
    `| ${name} | ${brier(rs).toFixed(3)} | ${logLoss(rs).toFixed(3)} | ${(acc(rs) * 100).toFixed(0)}% | ${extra}`;
  const out = ["| Model | Brier (lower is better) | Log loss | Called right | Answered | Bet or stock right | Median time |", "|---|---|---|---|---|---|---|"];
  out.push(line("Coin flip (50%)", base.map((r) => ({ p: 0.5, y: r.outcome })), `${base.length} situations | | |`));
  out.push(line("Stats model (no AI)", base.map((r) => ({ p: r.stats, y: r.outcome })), "every one | n/a | instant |"));
  for (const run of runs) {
    const rs: Result[] = run.results;
    const ok = rs.filter((r) => r.ok);
    // Situations the model failed to answer are scored at the stats model's number, as in the app.
    const scored = rs.map((r) => ({ p: r.open ?? r.stats, y: r.outcome }));
    const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
    const kinds = ok.filter((r) => r.kind === r.seededKind).length;
    out.push(line(run.spec, scored, `${ok.length}/${rs.length} | ${ok.length ? Math.round((kinds / ok.length) * 100) : 0}% | ${ms.length ? (ms[Math.floor(ms.length / 2)] / 1000).toFixed(1) + "s" : "-"} |`));
  }
  const crowd = base.filter((r) => r.crowd != null);
  if (crowd.length) out.push(line("Crowd at close (hindsight, for reference)", crowd.map((r) => ({ p: r.crowd!, y: r.outcome })), `${crowd.length} situations | | |`));
  console.log(out.join("\n"));
}

const arg = process.argv[2];
(arg === "report" || !arg ? Promise.resolve(report()) : run(arg))
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
