import { test } from "node:test";
import assert from "node:assert/strict";
import { selectSnippets } from "../lib/chat-context";

const members = [
  { id: 1, username: "jake", display_name: "Jake" },
  { id: 2, username: "priya", display_name: "Priya" },
  { id: 3, username: "sam", display_name: "Sam" },
];
const at = (h: number) => new Date(Date.parse("2026-10-24T12:00:00Z") - h * 3600e3).toISOString();
const messages = [
  { text: "who's cooking tonight", authorId: 2, at: at(3) },
  { text: "@jake where are you, dinner started 20 mins ago", authorId: 2, at: at(30) },
  { text: "omw 5 mins, call me on 07700 900123", authorId: 1, at: at(29) },
  { text: "classic Jake, always late. email him at jake.smith@gmail.com", authorId: 3, at: at(29) },
  { text: "lol", authorId: 3, at: at(2) },
];

test("keeps only messages about the subject or topic, oldest first", () => {
  const s = selectSnippets({ messages, members, subjectId: 1, title: "Jake is late to Friday dinner", now: at(0) });
  assert.equal(s.length, 3);
  assert.ok(!s.some((x) => x.text.includes("cooking")));
  assert.equal(s[0].age, "1d ago");
});

test("hides names, emails and phone numbers", () => {
  const s = selectSnippets({ messages, members, subjectId: 1, title: "Jake is late to Friday dinner", now: at(0) });
  const all = JSON.stringify(s);
  for (const leak of ["jake", "Jake", "Priya", "Sam", "07700", "gmail"]) assert.ok(!all.includes(leak), `leaked ${leak}: ${all}`);
  assert.ok(all.includes("[SUBJECT]") && all.includes("Friend A") && all.includes("[email]") && all.includes("[number]"));
});

test("caps the number of snippets", () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ text: `jake late again ${i}`, authorId: 2, at: at(i) }));
  assert.equal(selectSnippets({ messages: many, members, subjectId: 1, title: "Jake late", now: at(0), limit: 20 }).length, 20);
});
