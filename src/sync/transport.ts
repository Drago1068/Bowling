import type { EntityType } from "../entities.ts";
import type { MutationEnvelope, OperationType } from "./envelope.ts";

/**
 * Client-side shape of a Bowling API push result. Mirrors the server's JSON;
 * parsed locally from an HTTP response, does not import server code.
 */
export type PushServerStatus =
  | "ACCEPTED"
  | "ALREADY_ACCEPTED"
  | "CONFLICT"
  | "REJECTED"
  | "UNSUPPORTED_PROTOCOL"
  | "UNSUPPORTED_SCHEMA";

export interface PushAcceptedResult {
  status: "ACCEPTED" | "ALREADY_ACCEPTED";
  submission_id: string;
  entity_id: string;
  entity_version: number;
  server_change_cursor: number;
  server_committed_at: string;
}

export interface PushConflictResult {
  status: "CONFLICT";
  conflict_id: string;
  submission_id: string;
  entity_id: string;
  canonical_entity_version: number;
  expected_entity_version: number;
}

export interface PushRejectedResult {
  status: "REJECTED";
  reason_code: string;
  message: string;
  submission_id: string | null;
}

export interface PushUnsupportedResult {
  status: "UNSUPPORTED_PROTOCOL" | "UNSUPPORTED_SCHEMA";
}

export type PushTransportResult =
  | PushAcceptedResult
  | PushConflictResult
  | PushRejectedResult
  | PushUnsupportedResult;

/**
 * A push attempt outcome. "retryable" is a transport-level failure (network,
 * timeout, 5xx, non-JSON) that must NOT mutate the submission id; "result" is a
 * durable server answer to classify.
 */
export type PushOutcome =
  | { outcome: "result"; result: PushTransportResult }
  | { outcome: "retryable"; reason: string };

export interface PullChange {
  change_seq: number;
  entity_type: EntityType;
  entity_id: string;
  entity_version: number;
  operation: OperationType;
  submission_id: string;
  committed_at: string;
  /** Canonical entity representation at/after this change, if carried by the API. */
  payload?: unknown;
  origin_device_id?: string;
}

export interface PullPage {
  changes: PullChange[];
  next_cursor: number;
  has_more: boolean;
}

export type PullOutcome =
  | { outcome: "page"; page: PullPage }
  | { outcome: "retryable"; reason: string };

/**
 * Transport seam between the sync coordinator and the Bowling API. Production
 * uses HttpSyncTransport; tests use an in-process transport against the real
 * server application layer.
 */
export interface SyncTransport {
  push(envelope: MutationEnvelope): Promise<PushOutcome>;
  pull(afterCursor: number, limit: number): Promise<PullOutcome>;
}

export interface HttpSyncTransportOptions {
  baseUrl: string;
  /** Fetch-compatible implementation; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * HTTP transport. Network failures, timeouts, HTTP 5xx, and non-JSON bodies are
 * classified as "retryable" (never a fresh submission id). HTTP 4xx with a JSON
 * result body is classified as a server result.
 */
export function createHttpSyncTransport(options: HttpSyncTransportOptions): SyncTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 10000;

  async function request(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, { ...init, signal: controller.signal });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async push(envelope: MutationEnvelope): Promise<PushOutcome> {
      let resp: { status: number; body: unknown };
      try {
        resp = await request("/api/v1/sync/push", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            protocol_version: envelope.protocol_version,
            submission_id: envelope.submission_id,
            device_id: envelope.device_id,
            entity_type: envelope.entity_type,
            entity_id: envelope.entity_id,
            operation_type: envelope.operation_type,
            expected_entity_version: envelope.expected_entity_version,
            payload: envelope.payload,
            payload_hash: envelope.payload_hash,
          }),
        });
      } catch (err) {
        return { outcome: "retryable", reason: err instanceof Error ? err.message : "network failure" };
      }

      if (resp.status >= 500) {
        return { outcome: "retryable", reason: `server error ${resp.status}` };
      }
      if (resp.status !== 200 && resp.status !== 409 && resp.status !== 400 && resp.status !== 422) {
        return { outcome: "retryable", reason: `unexpected status ${resp.status}` };
      }
      if (typeof resp.body !== "object" || resp.body === null) {
        return { outcome: "retryable", reason: "non-JSON response" };
      }
      return { outcome: "result", result: resp.body as PushTransportResult };
    },

    async pull(afterCursor: number, limit: number): Promise<PullOutcome> {
      let resp: { status: number; body: unknown };
      try {
        resp = await request(`/api/v1/sync/changes?after=${afterCursor}&limit=${limit}`);
      } catch (err) {
        return { outcome: "retryable", reason: err instanceof Error ? err.message : "network failure" };
      }
      if (resp.status >= 500) {
        return { outcome: "retryable", reason: `server error ${resp.status}` };
      }
      if (typeof resp.body !== "object" || resp.body === null) {
        return { outcome: "retryable", reason: "non-JSON response" };
      }
      const body = resp.body as { changes?: unknown; next_cursor?: unknown; has_more?: unknown };
      if (!Array.isArray(body.changes) || typeof body.next_cursor !== "number") {
        return { outcome: "retryable", reason: "malformed pull response" };
      }
      return {
        outcome: "page",
        page: {
          changes: body.changes as PullChange[],
          next_cursor: body.next_cursor,
          has_more: body.has_more === true,
        },
      };
    },
  };
}