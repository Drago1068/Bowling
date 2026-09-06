export interface ServerConfig {
  databaseUrl: string;
  host: string;
  port: number;
  /** Sync protocol version the server accepts. */
  syncProtocolVersion: number;
  /** Canonical entity representation schema versions the server accepts. */
  supportedSchemaVersions: number[];
}

const DEFAULT_DATABASE_URL = "postgresql://bowling:bowling@127.0.0.1:55433/bowling";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.BOWLING_PORT ?? 8080);
  return {
    databaseUrl: env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    host: env.BOWLING_HOST ?? "127.0.0.1",
    port: Number.isFinite(port) ? port : 8080,
    syncProtocolVersion: 1,
    supportedSchemaVersions: [1],
  };
}