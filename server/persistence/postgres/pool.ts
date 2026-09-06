import { Pool } from "pg";
import type { ServerConfig } from "../../config.ts";

export function createPool(config: ServerConfig): Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
  });
}

export type Db = Pool | import("pg").PoolClient;