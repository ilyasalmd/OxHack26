// Pure text helpers shared by the server and the browser.
import { PLAYBOOKS, guessCategory } from "./categories";

export const CATEGORY_WORDS: Record<string, RegExp> = Object.fromEntries(PLAYBOOKS.map((p) => [p.id, p.words]));

export { guessCategory };
