/**
 * Three more sample chats with Ilyas in them, so the demo account has every kind of group:
 * a uni society committee, a couples chat and a siblings chat. Also puts Ilyas into the admin's
 * "Demo: punctuality" chat. Then run seed-rich.ts to fill them with settled stakes.
 *
 *   npx tsx --env-file=.env.local scripts/seed-chats.ts
 *
 * Additive: it makes the two new sample people (Nadia, Zayn) if they don't exist, skips any chat
 * that already exists, and writes twelve weeks of everyday chat into each new one.
 */
import bcrypt from "bcryptjs";
import { getDb } from "../lib/db";
import { credit } from "../lib/economy";
import { newWallet } from "../lib/solana";
import { creatorKey } from "../lib/demo";
import { createIdentity, deriveKeys, encryptMessage, importGroupKey, newGroupKey, randomSalt, unwrapGroupKey, wrapGroupKey } from "../lib/e2ee";
import { PASSWORD, PEOPLE, type Line } from "./seed-content";

const HOUR = 36e5;
const DAY = 24 * HOUR;
const DAYS = 84;

let seed = 9091;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const shuffle = <T,>(xs: T[]) => [...xs].sort(() => rnd() - 0.5);
const awake = (day: number) => day + (8 + Math.min(16.9, Math.abs(gauss()) * 6 + rnd() * 8)) * HOUR;

type Spec = { name: string; members: string[]; aiContext: string; activity: number; snippets: Line[][] };

export const CHATS: Spec[] = [
  {
    name: "Finance Soc Committee",
    members: ["ilyas", "zara", "omar", "aisha", "leo", "tom"],
    aiContext:
      "The Imperial Finance Society committee. Zara is president, Ilyas is treasurer, Omar runs events, Aisha writes the Monday newsletter, Leo does socials and the Instagram, Tom is secretary and takes minutes. Committee meeting every Wednesday at 6pm in Huxley 311. Citi sponsor talk on 5 November, autumn social on 14 November, the sponsorship invoices are due at the end of each month.",
    activity: 1.1,
    snippets: [
      [["zara", "committee meeting 6pm, please actually come"], ["leo", "is there pizza"], ["zara", "there is pizza if the treasurer approves it"], ["ilyas", "approved"]],
      [["aisha", "newsletter draft is in the drive, send me events by sunday"], ["omar", "will do"], ["aisha", "that's what you said last week omar"]],
      [["omar", "citi confirmed the 5th!! room needed for 80"], ["ilyas", "huxley 308 holds 90, booking it"], ["zara", "legend"]],
      [["tom", "minutes from wednesday are up"], ["leo", "did you write down that I was there"], ["tom", "you arrived at 6:50 so, sort of"]],
      [["leo", "the insta post did 140 likes"], ["aisha", "because it had omar's face on it"], ["omar", "the people have spoken"]],
      [["ilyas", "reminder the sponsorship invoice goes out friday, I need the logos"], ["zara", "sending now"]],
      [["$a", "anyone free to do the stall at the fair"], ["$b", "I can do 11 to 1"], ["$c", "I'll do 1 to 3 if there's coffee"]],
      [["zara", "can we start on time this week"], ["leo", "define on time"], ["zara", "6pm leo"]],
      [["omar", "speaker for the social is being weird about the date"], ["ilyas", "do we have a backup"], ["omar", "we have me"], ["aisha", "no"]],
      [["tom", "the room booking got cancelled, huxley is doing a thing"], ["ilyas", "moving to 311"], ["zara", "crisis averted"]],
      [["$a", "ticket sales at 34 for the social"], ["$b", "it's 3 weeks away relax"], ["$a", "last year we had 60 by now"]],
      [["aisha", "sent the newsletter 8:55, before 9 for once"], ["ilyas", "screenshot or it didn't happen"], ["aisha", "sent"]],
    ],
  },
  {
    name: "Nadia",
    members: ["ilyas", "nadia"],
    aiContext:
      "Ilyas and Nadia, together fourteen months. Nadia is a third-year medic at UCL and lives in Camden; Ilyas is at Imperial in South Kensington. Date night is Thursday, usually a film or dinner near Camden. Nadia's birthday is 2 December. They're saving for a weekend in Paris in November. Nadia's mum's birthday is 20 October.",
    activity: 2.6,
    snippets: [
      [["nadia", "morning x"], ["ilyas", "morning, how was the ward"], ["nadia", "8 hours on my feet, I'm dead"], ["ilyas", "thursday I'll cook"]],
      [["ilyas", "running 10 late, the district line"], ["nadia", "it's always the district line"], ["ilyas", "it is genuinely the district line"]],
      [["nadia", "what are we watching thursday"], ["ilyas", "you pick"], ["nadia", "I picked last time"], ["ilyas", "and it was a 3 hour film about a lighthouse"]],
      [["nadia", "anatomy mock on monday, don't text me after 9"], ["ilyas", "good luck, you've got this"]],
      [["ilyas", "paris flights are £49 each on the 14th"], ["nadia", "BOOK IT"], ["ilyas", "booking"], ["nadia", "wait which weekend"]],
      [["nadia", "did you remember my mum's birthday"], ["ilyas", "obviously"], ["ilyas", "what day is it again"]],
      [["nadia", "gym at 7am tomorrow, hold me to it"], ["ilyas", "I'll text you at 6:45"], ["nadia", "don't"]],
      [["ilyas", "made the pasta thing, come over"], ["nadia", "omw, 20 mins"], ["ilyas", "nadia 20 mins or ilyas 20 mins"]],
      [["nadia", "fell asleep in the film again didn't I"], ["ilyas", "15 minutes in"], ["nadia", "it was a slow start"]],
      [["$a", "love you x"], ["$b", "love you more x"]],
      [["nadia", "can you be at mine by 7 thursday, the booking is 7:30"], ["ilyas", "7 sharp"], ["nadia", "I'll believe it when I see it"]],
    ],
  },
  {
    name: "Siblings",
    members: ["ilyas", "yasmin", "zayn"],
    aiContext:
      "Ilyas, his younger sister Yasmin (17, Year 13, applying to study law, maths and history A-levels, learning to drive) and his older brother Zayn (24, junior engineer in Manchester, comes home to Harrow roughly one weekend a month, Manchester United fan while Ilyas supports Arsenal). Mum's birthday is 9 November. Sunday calls home are expected. Zayn's probation review at work was in September.",
    activity: 1.6,
    snippets: [
      [["zayn", "who's calling mum this sunday, I did last week"], ["ilyas", "yasmin lives there"], ["yasmin", "that doesn't count apparently"]],
      [["yasmin", "personal statement draft 4. someone read it"], ["ilyas", "send it"], ["zayn", "is it still 300 words over"], ["yasmin", "it's 40 over"]],
      [["zayn", "united were robbed"], ["ilyas", "united were 2-0 down at half time"], ["zayn", "robbed"]],
      [["yasmin", "failed my mock driving test, the instructor is a hater"], ["ilyas", "what did you do"], ["yasmin", "a tiny mount of the kerb"], ["zayn", "a kerb is a fail yas"]],
      [["ilyas", "zayn you still owe me for the tickets"], ["zayn", "payday is the 28th"], ["ilyas", "it was the 28th three days ago"]],
      [["zayn", "coming home the 18th, who's picking me up from euston"], ["ilyas", "the tube is picking you up"]],
      [["yasmin", "mum wants to know what you both want for dinner sunday"], ["zayn", "I'm not there"], ["yasmin", "she's planning for when you are"]],
      [["$a", "mum's birthday, what are we getting"], ["$b", "a weekend away?"], ["$c", "with what money"]],
      [["ilyas", "fifa tonight zayn"], ["zayn", "you'll lose"], ["yasmin", "can I play"], ["zayn", "you'll lose more"]],
      [["yasmin", "76 on the maths mock"], ["ilyas", "yas!!"], ["zayn", "the family brain"]],
      [["zayn", "probation signed off"], ["ilyas", "get in"], ["yasmin", "so you're rich now"], ["zayn", "no"]],
    ],
  },
];

async function main() {
  const db = await getDb();
  type U = { id: number; username: string; display_name: string; public_key: string; enc_private_key: string; key_salt: string };
  const users: Record<string, U> = {};
  const load = async (name: string) => (await db.query<U>(`SELECT id, username, display_name, public_key, enc_private_key, key_salt FROM users WHERE username = $1 AND deleted_at IS NULL`, [name]))[0];

  // The two people who only exist for these chats.
  for (const name of ["nadia", "zayn"]) {
    if (await load(name)) continue;
    const p = PEOPLE.find((x) => x.username === name)!;
    const salt = randomSalt();
    const { authKey, encKey } = await deriveKeys(PASSWORD, p.username, salt);
    const id = await createIdentity(encKey);
    const w = newWallet();
    const [u] = await db.query<{ id: number }>(
      `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt, wallet_pubkey, wallet_secret_enc)
       VALUES ($1,$2,$3,$4,0,$5,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [p.username, p.name, await bcrypt.hash(authKey, 10), p.color, new Date(Date.now() - (DAYS + 3) * DAY), id.publicKey, id.encPrivateKey, salt, w.pubkey, w.secretEnc]
    );
    await credit(db, u.id, 500, "Welcome bonus");
    console.log(`Made @${name}`);
  }
  for (const name of new Set([...CHATS.flatMap((c) => c.members), "priya"])) {
    users[name] = await load(name);
    if (!users[name]) throw new Error(`@${name} doesn't exist; run npm run seed first`);
  }

  const T = Date.now();
  const START = T - DAYS * DAY;
  for (const [i, spec] of CHATS.entries()) {
    const [exists] = await db.query(`SELECT 1 FROM groups WHERE name = $1`, [spec.name]);
    if (exists) {
      console.log(`"${spec.name}" already exists, skipped`);
      continue;
    }
    const creator = users[spec.members[0]];
    const priv = await creatorKey(creator);
    if (!priv) throw new Error(`Can't unlock @${creator.username}'s identity with the sample password`);
    const raw = newGroupKey();
    const key = await importGroupKey(raw);
    const born = START + (i + 1) * 1.3 * DAY + 20 * HOUR;
    const [grp] = await db.query<{ id: number }>(
      `INSERT INTO groups (name, emoji, invite_code, ai_context, created_by, created_at, ai_reads_chat) VALUES ($1,'',$2,$3,$4,$5,true) RETURNING id`,
      [spec.name, `${spec.name.toLowerCase().replace(/[^a-z0-9]/g, "")}-demo`, spec.aiContext, creator.id, new Date(born)]
    );
    for (const m of spec.members) {
      await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,$3)`, [grp.id, users[m].id, new Date(born)]);
      await db.query(`INSERT INTO group_keys (group_id, user_id, wrapped_key, wrapped_by) VALUES ($1,$2,$3,$4)`, [grp.id, users[m].id, await wrapGroupKey(raw, priv, users[m].public_key), creator.id]);
    }
    await db.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1,$2,'system',$3,$4)`, [grp.id, creator.id, `created ${spec.name}`, new Date(born)]);

    // Everyday chat, a snippet or two most days.
    let n = 0;
    for (let d = Math.ceil((born - START) / DAY); d < DAYS; d++) {
      const k = Math.floor(spec.activity + rnd());
      for (let j = 0; j < k; j++) {
        const others = shuffle(spec.members);
        const roles: Record<string, string> = { $a: others[0], $b: others[1] ?? others[0], $c: others[2] ?? others[0] };
        let ts = awake(START + d * DAY);
        for (const [who, text] of pick(spec.snippets)) {
          const u = users[roles[who] ?? who];
          if (!u) continue;
          const e = await encryptMessage(key, text);
          await db.query(`INSERT INTO messages (group_id, user_id, kind, ciphertext, iv, created_at) VALUES ($1,$2,'chat',$3,$4,$5)`, [grp.id, u.id, e.ciphertext, e.iv, new Date(Math.min(ts, T - 90e3))]);
          ts += (10 + rnd() * 150) * 1000 + text.length * 900;
          n++;
        }
      }
    }
    await db.query(`UPDATE group_members gm SET delivered_upto = x.m, read_upto = x.m FROM (SELECT max(id) AS m FROM messages WHERE group_id = $1) x WHERE gm.group_id = $1`, [grp.id]);
    console.log(`Made "${spec.name}" (group ${grp.id}) with ${n} messages`);
  }

  // Ilyas joins the admin's demo chat as one of its people (Priya hands out that chat's key).
  const [demo] = await db.query<{ id: number; created_at: Date }>(`SELECT id, created_at FROM groups WHERE name = 'Demo: punctuality'`);
  if (demo) {
    const [already] = await db.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [demo.id, users.ilyas.id]);
    if (!already) {
      const [pk] = await db.query<{ wrapped_key: string; wrapper_public_key: string }>(
        `SELECT gk.wrapped_key, w.public_key AS wrapper_public_key FROM group_keys gk JOIN users w ON w.id = gk.wrapped_by WHERE gk.group_id = $1 AND gk.user_id = $2`,
        [demo.id, users.priya.id]
      );
      const priyaPriv = await creatorKey(users.priya);
      if (!pk || !priyaPriv) throw new Error("Can't open the demo chat's key");
      const raw = await unwrapGroupKey(pk.wrapped_key, priyaPriv, pk.wrapper_public_key);
      await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,$3)`, [demo.id, users.ilyas.id, demo.created_at]);
      await db.query(`INSERT INTO group_keys (group_id, user_id, wrapped_key, wrapped_by) VALUES ($1,$2,$3,$4)`, [demo.id, users.ilyas.id, await wrapGroupKey(raw, priyaPriv, users.ilyas.public_key), users.priya.id]);
      await db.query(`UPDATE group_members SET delivered_upto = x.m, read_upto = x.m FROM (SELECT max(id) AS m FROM messages WHERE group_id = $1) x WHERE group_id = $1 AND user_id = $2`, [demo.id, users.ilyas.id]);
      console.log(`Added @ilyas to "Demo: punctuality"`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
