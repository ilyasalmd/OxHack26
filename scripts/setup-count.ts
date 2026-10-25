// For npm run setup: how many people the database has. A database it can't reach says so, rather
// than looking empty, so setup never seeds (and wipes) one it couldn't read.
import { getDb } from "../lib/db";

getDb()
  .then((db) => db.query<{ n: number }>(`SELECT count(*)::int AS n FROM users`))
  .then(([r]) => console.log(`users=${r.n}`))
  .catch((e) => console.log(`users=unreachable ${(e as Error).message}`))
  .finally(() => process.exit(0));
