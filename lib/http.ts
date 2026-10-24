import { NextRequest } from "next/server";
import { z } from "zod";
import { HttpError } from "./auth";

export async function body<T extends z.ZodTypeAny>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  const json = await req.json().catch(() => {
    throw new HttpError(400, "Expected JSON");
  });
  const r = schema.safeParse(json);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

export type IdCtx = { params: Promise<{ id: string }> };
export async function idParam(ctx: IdCtx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) throw new HttpError(400, "Bad id");
  return id;
}
