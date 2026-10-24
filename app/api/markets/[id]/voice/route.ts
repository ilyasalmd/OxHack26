import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { HttpError, requireMember, route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";
import { getMarket, price } from "@/lib/markets";
import { CURRENCY } from "@/lib/config";

// "Market recap" read out like a trading-floor announcer, via ElevenLabs.
// Without a key the client falls back to the browser's built-in speech.
export const GET = route<IdCtx>(async (_req, user, ctx) => {
  const id = await idParam(ctx);
  const db = await getDb();
  const m = await getMarket(db, id);
  await requireMember(m.group_id, user.id);
  const [mem] = await db.query<{ summary: string }>(`SELECT summary FROM memories WHERE market_id = $1`, [id]);
  const pct = Math.round(price(m) * 100);
  const text =
    m.status === "resolved"
      ? `Final bell on "${m.title}". It resolved ${m.outcome ? "yes" : "no"}. ${mem?.summary ?? ""}`
      : `Market update. "${m.title}" is trading at ${pct} percent, with ${Math.round(m.volume)} ${CURRENCY.name} traded so far. ${m.ai_rationale}`;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ text, audio: false });
  const voice = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL ?? "eleven_flash_v2_5" }),
  });
  if (!r.ok) throw new HttpError(502, `ElevenLabs error ${r.status}`);
  return new NextResponse(r.body, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=300" } });
});
