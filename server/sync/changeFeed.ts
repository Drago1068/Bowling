import type { Pool } from "pg";
import { changeFeedRepo } from "../persistence/postgres/repositories.ts";

export interface PullChange {
  change_seq: number;
  entity_type: string;
  entity_id: string;
  entity_version: number;
  operation: string;
  submission_id: string;
  committed_at: string;
}

export interface PullChangesResult {
  changes: PullChange[];
  next_cursor: number;
  has_more: boolean;
}

export async function pullChanges(
  pool: Pool,
  afterCursor: number,
  limit: number,
): Promise<PullChangesResult> {
  const rows = await changeFeedRepo.listAfter(pool, afterCursor, limit);
  const changes: PullChange[] = rows.map((r) => ({
    change_seq: Number(r.change_seq),
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    entity_version: r.entity_version,
    operation: r.operation,
    submission_id: r.submission_id,
    committed_at: r.committed_at.toISOString(),
  }));
  const next_cursor = changes.length > 0 ? changes[changes.length - 1]!.change_seq : afterCursor;
  let has_more = false;
  if (changes.length === limit) {
    const remaining = await changeFeedRepo.countAfter(pool, next_cursor);
    has_more = remaining > 0;
  }
  return { changes, next_cursor, has_more };
}