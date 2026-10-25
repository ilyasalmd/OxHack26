/**
 * One command for a working copy: every demo account (Ilyas, Aariz, Durukan, Barkin, the sample
 * people, the Harrow friends and the admin) and every sample chat, the same as the live app.
 *
 *   npm run setup             fill an empty database, or top up one that is missing pieces
 *   npm run setup -- --fresh  start the local database (PGlite in .data/) again from nothing
 *
 * It never wipes a server named by DATABASE_URL: there it only adds what is missing. Each step
 * below skips what is already there, so it is safe to run again after a pull. A copy with no
 * .env.local gets one from .env.example, and with no ADMIN_PASSWORD gets a random one written
 * into .env.local (which git ignores), so the admin's password is never in the repo.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const ENV = path.join(ROOT, ".env.local");
const TSX = path.join(ROOT, "node_modules", ".bin", "tsx");

/** The steps after the base seed, in the order the live app had them. */
const STEPS: [script: string, why: string][] = [
  ["seed-admin", "the admin account"],
  ["seed-demo", "the admin's Friday Dinner Crew chat"],
  ["seed-chats", "three more chats with Ilyas in them"],
  ["seed-rich", "twelve weeks of settled stakes"],
  ["reorder-sample-chats", "chat history in date order"],
  ["apply-avatars", "profile photos"],
  ["seed-humans", "Aariz, Durukan and Barkin"],
  ["seed-open-stakes", "live stakes in the newer chats"],
  ["seed-friend-bets", "friend bets"],
  ["reorder-sample-chats", "chat history in date order"],
  ["seed-bios", "bios"],
  ["seed-group-photos", "group pictures"],
  ["seed-newcomers", "Kofi, Hana, Theo, Ruby and Harrow Sixth Form"],
  ["demo-join", "every real account in every sample chat"],
];
// A step that stops because its work is already done says so in one of these ways.
const DONE = /already|Already seeded|Every account is already/;

function readEnv() {
  if (!fs.existsSync(ENV)) {
    fs.copyFileSync(path.join(ROOT, ".env.example"), ENV);
    console.log("Made .env.local from .env.example");
  }
  return fs.readFileSync(ENV, "utf8");
}

function run(script: string, extra: Record<string, string> = {}) {
  const r = spawnSync(TSX, ["--env-file-if-exists=.env.local", `scripts/${script}.ts`], { cwd: ROOT, env: { ...process.env, ...extra }, encoding: "utf8" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

function main() {
  const fresh = process.argv.includes("--fresh");
  let env = readEnv();
  const url = process.env.DATABASE_URL ?? env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
  const remote = !!url && url !== "pglite";
  if (fresh && remote) throw new Error("--fresh only starts the local database again; DATABASE_URL names a server, which setup never wipes");

  if (!/^ADMIN_PASSWORD=\S/m.test(env) && !process.env.ADMIN_PASSWORD) {
    if (remote) console.log("No ADMIN_PASSWORD in .env.local, so the admin account and its chat are skipped.");
    else {
      env = `${env.trimEnd()}\n\n# The admin's password for this copy only (made by npm run setup; .env.local is never committed).\nADMIN_PASSWORD=${crypto.randomBytes(12).toString("base64url")}\n`;
      fs.writeFileSync(ENV, env);
      console.log("Gave the admin a random password: ADMIN_PASSWORD in .env.local");
    }
  }

  const dir = process.env.PGLITE_DIR ?? path.join(ROOT, ".data", "pglite");
  if (fresh) fs.rmSync(dir, { recursive: true, force: true });
  const count = run("setup-count").out;
  if (!/users=\d/.test(count)) throw new Error(`Couldn't read the database, so nothing was changed: ${count}`);
  const empty = /users=0\b/.test(count);
  if (empty) {
    console.log("Empty database: writing three months of sample history (a few minutes)...");
    const r = run("seed");
    if (!r.ok) throw new Error(`The base seed failed:\n${r.out}`);
  } else console.log("The database already has people in it: adding only what's missing.");

  for (const [script, why] of STEPS) {
    const r = run(script);
    const last = r.out.split("\n").filter(Boolean).pop() ?? "";
    if (r.ok) console.log(`  ok    ${why}${last ? `: ${last.slice(0, 100)}` : ""}`);
    else if (DONE.test(r.out)) console.log(`  had   ${why}`);
    else {
      console.log(`  FAIL  ${why}\n${r.out.split("\n").slice(-8).join("\n")}`);
      process.exitCode = 1;
    }
  }
  console.log(process.exitCode ? "\nSome steps failed (above)." : "\nDone. npm run dev, then log in as ilyas, aariz, kofi or any sample person with demo1234.");
}

main();
