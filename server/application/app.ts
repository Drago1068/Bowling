import type { Pool } from "pg";
import type { ServerConfig } from "../config.ts";
import { createPool } from "../persistence/postgres/pool.ts";
import { runMigrations } from "../persistence/postgres/migrations.ts";
import { validatePushRequest } from "../validation/validate.ts";
import { executePush } from "../sync/pushPipeline.ts";
import { pullChanges, type PullChangesResult } from "../sync/changeFeed.ts";
import type { PushResult } from "../domain/outcomes.ts";
import type { Logger } from "../observability/logger.ts";
import { consoleLogger } from "../observability/logger.ts";

export interface BowlingApplication {
  initialize(): Promise<void>;
  push(rawRequest: unknown): Promise<PushResult>;
  pull(afterCursor?: number, limit?: number): Promise<PullChangesResult>;
  checkReady(): Promise<boolean>;
  close(): Promise<void>;
}

export function buildApplication(
  config: ServerConfig,
  logger: Logger = consoleLogger,
): BowlingApplication {
  const pool: Pool = createPool(config);
  let initialized = false;

  return {
    async initialize(): Promise<void> {
      await runMigrations(pool);
      initialized = true;
      logger.info("database_ready");
    },

    async push(rawRequest: unknown): Promise<PushResult> {
      if (!initialized) throw new Error("application not initialized");
      const outcome = validatePushRequest(rawRequest);
      if (!outcome.ok) {
        if (outcome.kind === "unsupported_protocol") {
          return { status: "UNSUPPORTED_PROTOCOL", supported: outcome.supported, received: outcome.received };
        }
        if (outcome.kind === "unsupported_schema") {
          return { status: "UNSUPPORTED_SCHEMA", entity_type: outcome.entity_type, supported: outcome.supported, received: outcome.received };
        }
        return { status: "REJECTED", reason_code: outcome.reason_code, message: outcome.message, submission_id: outcome.submission_id };
      }
      return executePush({ pool, logger }, outcome.request);
    },

    async pull(afterCursor = 0, limit = 200): Promise<PullChangesResult> {
      if (!initialized) throw new Error("application not initialized");
      return pullChanges(pool, afterCursor, limit);
    },

    async checkReady(): Promise<boolean> {
      try {
        await pool.query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}