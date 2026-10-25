import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, guessCategory, playbook, PLAYBOOKS } from "../lib/categories";
import { heuristicAnalysis } from "../lib/ai";
import { PROFILE_QUESTIONS } from "../lib/profile-questions";

test("each kind of stake is recognised from its words", () => {
  const cases: [string, string][] = [
    ["Jake is late to Friday dinner", "punctuality"],
    ["Sam sleeps through his 9am on Monday", "punctuality"],
    ["Yasmin gets engaged before her 25th", "relationships"],
    ["Sam gets a second date with the Hinge girl", "relationships"],
    ["Aisha gets 70 or more on the econometrics assignment", "uni"],
    ["Zara hears back from UBS by Wednesday", "work"],
    ["Chloe gets a good rating at her mock interview", "work"],
    ["Omar scores in Sunday's five-a-side", "football"],
    ["Maya hits 25 km for the week", "fitness"],
    ["Chloe completes her first 10k without stopping", "fitness"],
    ["Jake pays back the broadband money by the end of September", "money"],
    ["Dad falls asleep in front of the telly before 9pm", "family"],
    ["Somebody forgets the bins this week", "home"],
    ["The Lisbon trip is booked before Christmas", "travel"],
    ["Leo only has one pint on Thursday", "social"],
    ["Chloe keeps her Duolingo streak to 100 days", "habits"],
    ["Something nobody has a word for", "other"],
  ];
  for (const [title, cat] of cases) assert.equal(guessCategory(title), cat, title);
});

test("every playbook is complete and points at real profile questions", () => {
  const ids = new Set(PROFILE_QUESTIONS.map((q) => q.id));
  assert.equal(new Set(CATEGORIES).size, CATEGORIES.length);
  for (const p of PLAYBOOKS) {
    assert.ok(p.weigh.length > 40 && p.everyday.length > 20 && p.context.length, p.id);
    for (const q of p.profile) assert.ok(ids.has(q), `${p.id} uses unknown profile question ${q}`);
    for (const e of p.examples) assert.equal(guessCategory(e), p.id, `${p.id} example "${e}"`);
    assert.ok(p.prior.bet > 0 && p.prior.bet < 1 && p.prior.stock > 0 && p.prior.stock < 1);
  }
  assert.equal(playbook("nonsense").id, "other");
});

test("with no AI and no history, a stake opens at its kind's usual odds", () => {
  const empty = { baseRate: null, n: 0, examples: [] };
  assert.equal(heuristicAnalysis("Yasmin gets engaged before her 25th", 200, empty).probability, playbook("relationships").prior.stock);
  assert.equal(heuristicAnalysis("Somebody forgets the bins this week", 3, empty).probability, playbook("home").prior.bet);
});
