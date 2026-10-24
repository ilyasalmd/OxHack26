// The few questions a new account is asked so the AI has some context when a friend posts a
// situation about them. Every answer is optional. Answers go to the AI only, as context for odds
// about this person; they are never shown to other members.

export type ProfileQuestion = {
  id: string;
  question: string;
  /** One line on how the answer is used, shown under the question. */
  usedFor: string;
  placeholder?: string;
  choices?: string[];
};

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
  { id: "study", question: "What do you study or do, and which year?", usedFor: "Helps price exams, grades and deadlines about you.", placeholder: "Economics, 2nd year" },
  { id: "punctual", question: "How punctual are you, honestly?", usedFor: "Helps price “late to” situations.", choices: ["Always early", "On time", "Usually a bit late", "Famously late"] },
  { id: "active", question: "How active are you?", usedFor: "Helps price gym, running and sport situations.", choices: ["Most days", "A few times a week", "Now and then", "Rarely"] },
  { id: "goals", question: "One or two goals for this year?", usedFor: "Helps price long-term stocks about you.", placeholder: "Land a summer internship, run a half marathon" },
  { id: "fun", question: "What do you do for fun?", usedFor: "Helps with situations about your hobbies.", placeholder: "Football, gigs, cooking" },
  { id: "words", question: "Three words friends would use for you?", usedFor: "Sets the general tone of odds about you.", placeholder: "Chaotic, loyal, competitive" },
  { id: "relationship", question: "Relationship status, only if you want to share", usedFor: "Only for situations about dating. Skip it if you'd rather.", choices: ["Single", "Seeing someone", "In a relationship", "Engaged or married"] },
];

export const PROFILE_MAX = 140;

export type ProfileAnswers = Partial<Record<string, string>>;

/** The answers as a few lines for the AI prompt, or "" when there are none. */
export function profileForPrompt(a: ProfileAnswers | null | undefined) {
  if (!a) return "";
  return PROFILE_QUESTIONS.filter((q) => a[q.id]?.trim())
    .map((q) => `- ${q.question.replace(/, only if you want to share$/, "")} ${a[q.id]!.trim().slice(0, PROFILE_MAX)}`)
    .join("\n");
}
