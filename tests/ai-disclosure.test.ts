import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_CHAT, STOCK_SNIPPETS } from "../lib/ai-disclosure";
import { MAX_LEN, MAX_SNIPPETS, redact, selectSnippets } from "../lib/chat-context";

const all = [AI_CHAT.title, AI_CHAT.status, AI_CHAT.short, ...AI_CHAT.points.flatMap((p) => [p.head, p.body])].join("\n");

test("the notice says it is always on and quotes the real caps", () => {
  assert.match(AI_CHAT.status, /always on/i);
  assert.ok(all.includes(`${MAX_SNIPPETS} `), "per-stake cap missing");
  assert.ok(all.includes(`${STOCK_SNIPPETS} per stock`), "per-stock cap missing");
  assert.ok(all.includes(`${MAX_LEN} characters`), "length cap missing");
  assert.doesNotMatch(all, /opt[- ]in|off by default|turn(ed)? (it )?off|switch(ed)? (it )?off/i);
});

test("the notice covers what is picked, removed, where it goes, what is kept and the limits", () => {
  const heads = AI_CHAT.points.map((p) => p.head.toLowerCase());
  for (const h of ["what is picked", "what is removed", "where it goes", "what is kept", "limits"]) assert.ok(heads.some((x) => x.startsWith(h)), `missing section: ${h}`);
  assert.match(all, /Gemma/);
  assert.match(all, /No outside AI company/);
  assert.match(all, /pricing record/);
  assert.match(all, /stake page/);
  assert.match(all, /\[SUBJECT\]/);
  assert.match(all, /Friend A/);
  assert.match(all, /can't catch everything/);
});

test("the code enforces the caps the notice promises", () => {
  const members = [{ id: 1, username: "jake", display_name: "Jake Thompson" }];
  const at = (h: number) => new Date(Date.parse("2026-10-24T12:00:00Z") - h * 3600e3).toISOString();
  const messages = Array.from({ length: MAX_SNIPPETS + 15 }, (_, i) => ({ text: `jake is late to dinner again number ${i}`, authorId: 1, at: at(i) }));
  const s = selectSnippets({ messages, members, subjectId: 1, title: "Jake is late to dinner", now: at(0) });
  assert.equal(s.length, MAX_SNIPPETS);
  const long = "x".repeat(MAX_LEN + 50);
  assert.equal(redact(long, members, 1, new Map()).length, MAX_LEN);
  assert.ok(s.every((x) => x.who === "[SUBJECT]" && !x.text.toLowerCase().includes("jake")));
});

test("there is no per-group switch left on the server", () => {
  const markets = readFileSync(new URL("../lib/markets.ts", import.meta.url), "utf8");
  const groupRoute = readFileSync(new URL("../app/api/groups/[id]/route.ts", import.meta.url), "utf8");
  assert.ok(!markets.includes("ai_reads_chat"), "lib/markets.ts still gates snippets on a group flag");
  assert.ok(!groupRoute.includes("aiReadsChat"), "the group PATCH still accepts a toggle");
});
