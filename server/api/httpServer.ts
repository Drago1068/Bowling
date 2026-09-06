import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { BowlingApplication } from "../application/app.ts";
import type { PushResult } from "../domain/outcomes.ts";
import type { Logger } from "../observability/logger.ts";
import { nullLogger } from "../observability/logger.ts";

function statusFor(result: PushResult): number {
  switch (result.status) {
    case "ACCEPTED":
    case "ALREADY_ACCEPTED":
      return 200;
    case "CONFLICT":
      return 409;
    case "REJECTED":
      return 400;
    case "UNSUPPORTED_PROTOCOL":
      return 400;
    case "UNSUPPORTED_SCHEMA":
      return 422;
    default:
      return 500;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export function createHttpServer(app: BowlingApplication, logger: Logger = nullLogger) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/health/live") {
        return sendJson(res, 200, { status: "ok" });
      }
      if (req.method === "GET" && url.pathname === "/health/ready") {
        const ready = await app.checkReady();
        return sendJson(res, ready ? 200 : 503, { status: ready ? "ready" : "not_ready" });
      }
      if (req.method === "POST" && url.pathname === "/api/v1/sync/push") {
        const body = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          return sendJson(res, 400, { status: "REJECTED", reason_code: "MALFORMED_PAYLOAD", message: "invalid JSON", submission_id: null });
        }
        const result = await app.push(parsed);
        logger.info("push_request", { outcome: result.status });
        return sendJson(res, statusFor(result), result);
      }
      if (req.method === "GET" && url.pathname === "/api/v1/sync/changes") {
        const after = Number(url.searchParams.get("after") ?? "0");
        const limit = Number(url.searchParams.get("limit") ?? "200");
        const result = await app.pull(Number.isFinite(after) ? after : 0, Number.isFinite(limit) ? limit : 200);
        return sendJson(res, 200, result);
      }
      return sendJson(res, 404, { status: "REJECTED", reason_code: "NOT_FOUND", message: "not found", submission_id: null });
    } catch (err) {
      logger.error("request_error", { error: err instanceof Error ? err.message : String(err) });
      return sendJson(res, 500, { status: "REJECTED", reason_code: "INTERNAL_ERROR", message: "internal error", submission_id: null });
    }
  });
}