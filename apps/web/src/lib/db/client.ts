import { AsyncLocalStorage } from "node:async_hooks";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (url && !/^postgres(ql)?:\/\//.test(url)) throw new Error("This backend branch requires PostgreSQL; do not deploy it over the SQLite service.");
// Lazy pool: builds never connect or migrate. Deployment applies migrations explicitly.
export const pool = new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000 });
const root = drizzle(pool, { schema });
type Database = NodePgDatabase<typeof schema>;
const transactions = new AsyncLocalStorage<Database>();
export const db = new Proxy(root, { get(_target, key) {
  const active = transactions.getStore() || root;
  const value = Reflect.get(active, key);
  return typeof value === "function" ? value.bind(active) : value;
}});
export async function atomic<T>(work: () => Promise<T>): Promise<T> {
  if (transactions.getStore()) return work();
  return root.transaction(tx => transactions.run(tx, work));
}
