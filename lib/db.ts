import { Pool } from "pg";
import { loadServerConfig } from "./server-config";

let pool: Pool | undefined;

export function getDb(): Pool {
  pool ??= new Pool({
    connectionString: loadServerConfig().databaseUrl,
  });

  return pool;
}
