import { z } from "zod";

export const ChatSnippet = z.object({ who: z.string().max(20), text: z.string().max(300), age: z.string().max(20) });

export const Situation = z.object({
  title: z.string().min(4).max(140),
  description: z.string().max(500).optional(),
  resolvesAt: z.string(),
  subjectUsername: z.string().nullish(),
  mood: z.number().min(-1).max(1).nullish(),
  // The poster can force how it's listed; "auto" (the default) lets the AI decide.
  kind: z.enum(["auto", "bet", "stock"]).optional(),
  answer: z.enum(["auto", "yesno", "number"]).optional(),
  // For a number question: the over/under line, if the poster wants their own instead of the AI's.
  line: z.number().finite().optional(),
  // Only used when the group has opted in; picked and redacted on the device.
  chatSnippets: z.array(ChatSnippet).max(20).optional(),
});
