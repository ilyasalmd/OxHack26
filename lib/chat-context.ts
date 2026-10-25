// Runs in the browser, on already-decrypted messages. Whenever someone prices a stake, this
// picks the few messages that are actually about the situation, hides who's who and any
// personal details, and caps the count. Only the result ever leaves the device (lib/ai-disclosure.ts
// is the plain-words version of these rules that the app shows people).
import { CATEGORY_WORDS, guessCategory } from "./text";

export type Snippet = { who: string; text: string; age: string };
type Msg = { text: string; authorId: number | null; at: string };
type Person = { id: number; username: string; display_name: string };

export const MAX_SNIPPETS = 20;
export const MAX_LEN = 280;
const STOP = new Set("the a an is be will to of in on at by for and or does do did get gets before after this that it is was are you i he she they we me my his her their".split(" "));
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9@']+/).filter(Boolean);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function ageLabel(at: string, now: number) {
  const h = (now - new Date(at).getTime()) / 3600e3;
  if (h < 1) return "just now";
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Replace names with roles and strip contact details, links and long numbers. */
export function redact(text: string, members: Person[], subjectId: number | null, aliases: Map<number, string>) {
  let out = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[link]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]");
  for (const m of members) {
    const role = m.id === subjectId ? "[SUBJECT]" : alias(m.id, aliases);
    // A first name on its own ("Jake" for "Jake Thompson") identifies someone just as well.
    const first = m.display_name.trim().split(/\s+/)[0];
    const names = [`@${m.username}`, m.username, m.display_name];
    if (first.length >= 3 && !STOP.has(first.toLowerCase())) names.push(first);
    for (const n of names) {
      if (n.length < 2) continue;
      out = out.replace(new RegExp(`(^|[^\\w@])${escape(n)}(?![\\w])`, "gi"), `$1${role}`);
    }
  }
  return out.replace(/@\w+/g, "[someone]").slice(0, MAX_LEN);
}

function alias(id: number, aliases: Map<number, string>) {
  if (!aliases.has(id)) aliases.set(id, `Friend ${String.fromCharCode(65 + aliases.size)}`);
  return aliases.get(id)!;
}

export function selectSnippets(opts: { messages: Msg[]; members: Person[]; subjectId: number | null; title: string; now: string; limit?: number }): Snippet[] {
  const { messages, members, subjectId, title } = opts;
  const now = new Date(opts.now).getTime();
  const subject = members.find((m) => m.id === subjectId);
  const names = new Set(members.flatMap((m) => [m.username, `@${m.username}`, m.display_name.toLowerCase()]));
  const topic = new Set(words(title).filter((w) => w.length > 2 && !STOP.has(w) && !names.has(w)));
  const cat = guessCategory(title);
  const catRe = cat !== "other" ? CATEGORY_WORDS[cat] : null;

  const seen = new Set<string>();
  const scored = messages
    .filter((m) => m.text && m.text.trim().length >= 6)
    .filter((m) => !seen.has(m.text) && !!seen.add(m.text))
    .map((m) => {
      const ws = words(m.text);
      let s = 0;
      if (subject && ws.some((w) => w === subject.username || w === `@${subject.username}` || w === subject.display_name.toLowerCase())) s += 3;
      if (subject && m.authorId === subject.id) s += 1.5;
      s += ws.filter((w) => topic.has(w)).length;
      if (catRe?.test(m.text)) s += 1;
      const days = (now - new Date(m.at).getTime()) / 864e5;
      return { m, s: s * (1 + 0.5 * Math.exp(-days / 7)) };
    })
    .filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s)
    .slice(0, opts.limit ?? MAX_SNIPPETS)
    .sort((a, b) => new Date(a.m.at).getTime() - new Date(b.m.at).getTime());

  const aliases = new Map<number, string>();
  return scored.map(({ m }) => ({
    who: m.authorId == null ? "system" : m.authorId === subjectId ? "[SUBJECT]" : alias(m.authorId, aliases),
    text: redact(m.text, members, subjectId, aliases),
    age: ageLabel(m.at, now),
  }));
}
