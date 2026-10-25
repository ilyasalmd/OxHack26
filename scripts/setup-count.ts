// For npm run setup: how many people the database has (0 when it has no tables yet).
import { getDb } from "../lib/db";

getDb()
  .then((db) => db.query<{ n: number }>(`SELECT count(*)::int AS n FROM users`))
  .then(([r]) => console.log(`users=${r.n}`))
  .catch(() => console.log("users=0"))
  .finally(() => process.exit(0));
