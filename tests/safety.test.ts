import { test } from "node:test";
import assert from "node:assert/strict";
import { bannedTopic, topicProblem, KIND_TOPIC_MESSAGE } from "../lib/safety";

test("situations about people's choices are allowed", () => {
  for (const t of [
    "Jake is late to Friday dinner",
    "Sam gets a 2:1 in his exams",
    "Maya runs a sub-25 5k",
    "Priya books her spring week interview",
    "Dan benches 100kg this month",
    "Jake's phone dies before midnight",
    "Omar finishes the race in under an hour",
    "Christian turns up on time",
    "Leo passes his driving test",
    "Zara hits her deadline",
    "Tom orders a six pack of cans for pres",
    "Chloe wins the F1 prediction league",
    "Jake gets a fat chance of an offer",
    "Aisha moves into the new flat by Sunday",
  ])
    assert.equal(bannedTopic(t), null, t);
});

test("each banned topic is caught, with a kind message", () => {
  const cases: [string, string][] = [
    ["Sam gets diagnosed with something", "health conditions"],
    ["Is Priya pregnant by spring", "pregnancy"],
    ["Jake dies before 30", "death or self-harm"],
    ["Dan will kill himself", "death or self-harm"],
    ["Leo comes out as gay", "sexuality"],
    ["Maya loses weight before the wedding", "weight or body"],
    ["Omar is more than 90 kg on the scales and weighs in Friday", "weight or body"],
    ["Zara goes to church every Sunday", "religion"],
    ["Tom talks about his ethnicity at dinner", "ethnicity"],
  ];
  for (const [t, topic] of cases) {
    assert.equal(bannedTopic(t), topic, t);
    const msg = topicProblem(t);
    assert.ok(msg?.startsWith(KIND_TOPIC_MESSAGE), msg ?? "no message");
  }
});

test("matching is on whole words only", () => {
  for (const t of ["Jake assesses the situation", "Sam is a mastermind", "Maya reads about Essex", "Dan is a dedicated gamer", "Leo has a deadline"]) assert.equal(bannedTopic(t), null, t);
});

test("the description is checked too, and simple obfuscation does not slip through", () => {
  assert.ok(topicProblem("Jake is late", "because of his cancer"));
  assert.ok(topicProblem("Is Priya pr3gnant"));
  assert.ok(topicProblem("Is Priya PREGNANT?!"));
  assert.ok(topicProblem("Jake d​ies"));
  assert.equal(topicProblem("Jake is late", ""), null);
  assert.equal(topicProblem("Jake is late", undefined), null);
});
