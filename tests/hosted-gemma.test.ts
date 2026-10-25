import { test } from "node:test";
import assert from "node:assert/strict";
import { AI } from "../lib/config";
import { askJson, embed, rateLimit, type Trace } from "../lib/ai";
import { aiChatNotice } from "../lib/ai-disclosure";

// Gemma on the Gemini API, for teammates without Ollama. Every call here goes to a fake fetch.
type Call = { url: string; headers: Record<string, string>; body: any };
const realFetch = globalThis.fetch;
function fake(...replies: (((c: Call) => Response) | Error)[]) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const c = { url: String(url), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
    calls.push(c);
    const r = replies.shift();
    if (!r) throw new Error("unexpected call");
    if (r instanceof Error) throw r;
    return r(c);
  }) as typeof fetch;
  return calls;
}
const json = (body: object, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const answer = (text: string) => json({ candidates: [{ content: { parts: [{ text: "weighing it up", thought: true }, { text }] }, finishReason: "STOP" }] });
const schema = { type: "object", properties: { p: { type: "number" } }, required: ["p"] };
const env = (vars: Record<string, string | undefined>) => {
  for (const k of ["AI_PROVIDER", "OLLAMA_MODEL", "GEMMA_API_KEY", "GEMMA_API_MODEL"]) delete process.env[k];
  Object.assign(process.env, vars);
};
const trace = (): Trace => ({ provider: "none", model: "", prompt: "", raw: null, ms: 0 });

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("a key alone turns Gemma on through Google; Ollama falls back to it; none means none", () => {
  env({});
  assert.deepEqual(AI.chain, []);
  env({ GEMMA_API_KEY: "k" });
  assert.equal(AI.provider, "google");
  assert.deepEqual(AI.chain, ["google"]);
  env({ OLLAMA_MODEL: "gemma4:12b", GEMMA_API_KEY: "k" });
  assert.deepEqual(AI.chain, ["ollama", "google"]);
  env({ AI_PROVIDER: "ollama" });
  assert.deepEqual(AI.chain, ["ollama"]);
  env({ AI_PROVIDER: "google" });
  assert.deepEqual(AI.chain, [], "google without a key can't run");
  env({ AI_PROVIDER: "none", GEMMA_API_KEY: "k" });
  assert.deepEqual(AI.chain, []);
});

test("a shared Ollama behind a proxy gets its bearer token", async () => {
  env({ AI_PROVIDER: "ollama", OLLAMA_MODEL: "gemma4:12b" });
  process.env.OLLAMA_API_KEY = "tok";
  process.env.OLLAMA_URL = "https://gpu.example";
  const calls = fake(json({ message: { content: '{"p": 0.3}' } }));
  try {
    assert.deepEqual(await askJson("How likely?", schema, 5000), { p: 0.3 });
    assert.equal(calls[0].url, "https://gpu.example/api/chat");
    assert.equal(calls[0].headers.authorization, "Bearer tok");
  } finally {
    delete process.env.OLLAMA_API_KEY;
    delete process.env.OLLAMA_URL;
  }
});

test("asks Gemma on the Gemini API with the key in a header and the schema as JSON mode", async () => {
  env({ GEMMA_API_KEY: "secret", GEMMA_API_MODEL: "gemma-a" });
  const calls = fake(answer('{"p": 0.4}'));
  const t = trace();
  assert.deepEqual(await askJson<{ p: number }>("How likely?", schema, 5000, t), { p: 0.4 });
  assert.match(calls[0].url, /\/models\/gemma-a:generateContent$/);
  assert.ok(!calls[0].url.includes("secret"), "the key must not be in the URL");
  assert.equal(calls[0].headers["x-goog-api-key"], "secret");
  assert.equal(calls[0].body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(calls[0].body.generationConfig.responseJsonSchema, schema);
  assert.equal(calls[0].body.contents[0].parts[0].text, "How likely?");
  assert.equal(t.provider, "google");
  assert.equal(t.model, "gemma-a");
  assert.equal(t.raw, '{"p": 0.4}', "thought parts are left out");
});

test("a model that refuses JSON mode gets the schema in the prompt, and fenced JSON still parses", async () => {
  env({ GEMMA_API_KEY: "k", GEMMA_API_MODEL: "gemma-b" });
  const calls = fake(json({ error: { code: 400, message: "JSON mode is not enabled for models/gemma-b" } }, 400), answer('```json\n{"p": 0.7}\n```'));
  assert.deepEqual(await askJson("How likely?", schema, 5000), { p: 0.7 });
  assert.equal(calls[1].body.generationConfig.responseMimeType, undefined);
  assert.match(calls[1].body.contents[0].parts[0].text, /matches this JSON Schema/);
  // Remembered for the next call.
  const again = fake(answer('{"p": 0.5}'));
  await askJson("Again?", schema, 5000);
  assert.equal(again[0].body.generationConfig.responseMimeType, undefined);
});

test("a per-minute limit waits as Google asks, once, then answers", async () => {
  env({ GEMMA_API_KEY: "k", GEMMA_API_MODEL: "gemma-c" });
  const limited = { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] }, { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "0.05s" }] } };
  const calls = fake(json(limited, 429), answer('{"p": 0.2}'));
  assert.deepEqual(await askJson("How likely?", schema, 5000), { p: 0.2 });
  assert.equal(calls.length, 2);
});

test("reads the wait and the daily quota out of a 429", () => {
  assert.deepEqual(rateLimit({ message: "x", details: [{ retryDelay: "37s" }] }), { waitMs: 37000, daily: false });
  assert.equal(rateLimit({ details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] }).daily, true);
});

test("when Ollama isn't running, the same question goes to Google", async () => {
  env({ OLLAMA_MODEL: "gemma4:12b", GEMMA_API_KEY: "k", GEMMA_API_MODEL: "gemma-d" });
  const calls = fake(new TypeError("fetch failed"), answer('{"p": 0.6}'));
  const t = trace();
  assert.deepEqual(await askJson("How likely?", schema, 5000, t), { p: 0.6 });
  assert.match(calls[0].url, /11434\/api\/chat$/);
  assert.match(calls[1].url, /generativelanguage\.googleapis\.com/);
  assert.equal(t.provider, "google");
  assert.equal(t.error, undefined);
});

test("unredacted chat (localOnly) never goes to Google", async () => {
  env({ GEMMA_API_KEY: "k" });
  const calls = fake();
  assert.equal(await askJson("the whole chat", schema, 5000, undefined, { localOnly: true }), null);
  assert.equal(calls.length, 0);
});

test("embeddings come from Google's embedding model", async () => {
  env({ GEMMA_API_KEY: "k" });
  const calls = fake(json({ embedding: { values: [0.1, 0.2, 0.3] } }));
  assert.deepEqual(await embed("Jake is late"), [0.1, 0.2, 0.3]);
  assert.match(calls[0].url, /\/models\/gemini-embedding-001:embedContent$/);
});

test("the daily limit falls back to the stats model at once and stops asking for a while", async () => {
  env({ GEMMA_API_KEY: "k", GEMMA_API_MODEL: "gemma-e" });
  const daily = { error: { code: 429, message: "Quota exceeded", details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }, { retryDelay: "2s" }] } };
  const calls = fake(json(daily, 429));
  const t = trace();
  assert.equal(await askJson("How likely?", schema, 5000, t), null);
  assert.match(t.error ?? "", /daily limit/);
  assert.equal(await askJson("And now?", schema, 5000), null);
  assert.equal(calls.length, 1, "paused after the daily limit");
});

test("the Terms say where the snippets go, from the same setting", () => {
  const where = (n: ReturnType<typeof aiChatNotice>) => n.points.find((p) => p.head === "Where it goes")!.body;
  assert.match(where(aiChatNotice(false, true)), /No outside AI company/);
  assert.match(where(aiChatNotice(true, false)), /Google's servers through the Gemini API/);
  assert.doesNotMatch(where(aiChatNotice(true, false)), /No outside AI company/);
  assert.match(where(aiChatNotice(true, true)), /through Ollama when it can, and otherwise on Google's servers/);
});

test("a project out of prepaid credit (402) says so and stops asking for a while", async () => {
  env({ GEMMA_API_KEY: "k" });
  const calls = fake(json({ error: { code: 402, message: "Your prepayment credits are depleted." } }, 402));
  const warn = console.warn;
  const said: string[] = [];
  console.warn = (...a: unknown[]) => void said.push(a.join(" "));
  try {
    assert.equal(await embed("Jake is late"), null);
    assert.equal(await embed("Still late"), null);
  } finally {
    console.warn = warn;
  }
  assert.equal(calls.length, 1, "paused after the 402");
  assert.match(said.join("\n"), /no prepaid credit left/);
});
