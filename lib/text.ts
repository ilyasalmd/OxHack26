// Pure text helpers shared by the server and the browser.
import { PLAYBOOKS, guessCategory } from "./categories";

export const CATEGORY_WORDS: Record<string, RegExp> = Object.fromEntries(PLAYBOOKS.map((p) => [p.id, p.words]));

export { guessCategory };

/** The AI's reasoning cut to its first sentence: what everyone but the admin sees of it. */
export function firstSentence(text: string) {
  const m = text.trim().match(/^.*?[.!?](?=\s|$)/s);
  return (m ? m[0] : text.trim()).slice(0, 220);
}
