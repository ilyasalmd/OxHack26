import { z } from "zod";

export const Situation = z.object({
  title: z.string().min(4).max(140),
  description: z.string().max(500).optional(),
  resolvesAt: z.string(),
  subjectUsername: z.string().nullish(),
  mood: z.number().min(-1).max(1).nullish(),
});
