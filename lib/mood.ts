// Tiny on-device sentiment lexicon. Runs on decrypted messages in the browser and
// produces one number per member; the text itself never leaves the device.
const POS = "great good love win won smashed nailed proud happy yes lets amazing offer passed first congrats congratulations sorted easy gym early ontime fire goat legend top improved finished date".split(" ");
const NEG = "bad hate lost lose fail failed late sad no never stressed stress dumped single quit tired skipped missed rejected behind broke ill sick hungover cancelled worried panic".split(" ");

export function moodScores(messages: { text: string; authorId: number | null }[], members: { id: number; username: string; display_name: string }[]) {
  const sums: Record<number, { s: number; n: number }> = {};
  for (const m of messages) {
    const words = m.text.toLowerCase().split(/[^a-z0-9@]+/);
    const score = words.reduce((s, w) => s + (POS.includes(w) ? 1 : NEG.includes(w) ? -1 : 0), 0);
    if (!score) continue;
    // Attribute to anyone mentioned, else to the author talking about themselves.
    const mentioned = members.filter((u) => words.includes(`@${u.username}`) || words.includes(u.display_name.toLowerCase()));
    const targets = mentioned.length ? mentioned.map((u) => u.id) : m.authorId ? [m.authorId] : [];
    for (const t of targets) {
      sums[t] ??= { s: 0, n: 0 };
      sums[t].s += Math.sign(score);
      sums[t].n++;
    }
  }
  const out: Record<string, number> = {};
  for (const [id, { s, n }] of Object.entries(sums)) out[id] = Math.max(-1, Math.min(1, s / (n + 2)));
  return out;
}
