import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { uuidv7 } from "../../src/identity/uuidv7.ts";
import { hashPayload } from "../../src/sync/hashing.ts";
import { buildApplication, type BowlingApplication } from "../application/app.ts";
import { nullLogger } from "../observability/logger.ts";
import {
  makeApp,
  makeRollCreate,
  makeRollUpdate,
  makeCorrection,
  makeArchive,
  makeFrameCreate,
  rollPayload,
  testConfig,
  truncateAll,
  query,
} from "./helpers.ts";
import { withTransaction } from "../persistence/postgres/migrations.ts";
import {
  auditRepo,
  changeFeedRepo,
  entityRepo,
  idempotencyRepo,
} from "../persistence/postgres/repositories.ts";
import { createPool } from "../persistence/postgres/pool.ts";

let app: BowlingApplication;

beforeEach(async () => {
  app = await makeApp();
  await truncateAll();
});

after(async () => {
  if (app) await app.close();
});

test("migration up, write, read back, reopen retains data", async () => {
  const r = makeRollCreate();
  const result = await app.push(r.request);
  assert.equal(result.status, "ACCEPTED");
  if (result.status !== "ACCEPTED") return;

  const rows = await query<{ entity_version: number; entity_type: string; entity_id: string }>(
    "SELECT entity_version, entity_type, entity_id FROM canonical_entities WHERE entity_id = $1",
    [r.entity_id],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.entity_version, 1);

  // Reopen application (simulates process restart): migration is a no-op, data retained.
  await app.close();
  app = await makeApp();
  const after = await query<{ entity_version: number }>(
    "SELECT entity_version FROM canonical_entities WHERE entity_id = $1",
    [r.entity_id],
  );
  assert.equal(after.length, 1);
  assert.equal(after[0]!.entity_version, 1);
});

test("CREATE happy path", async () => {
  const r = makeRollCreate();
  const result = await app.push(r.request);
  assert.equal(result.status, "ACCEPTED");
  if (result.status !== "ACCEPTED") return;
  assert.equal(result.entity_version, 1);
  assert.equal(result.entity_id, r.entity_id);
  assert.ok(result.server_change_cursor >= 1);

  const idem = await query<{ result_status: string }>(
    "SELECT result_status FROM submission_idempotency WHERE submission_id = $1",
    [r.submission_id],
  );
  assert.equal(idem.length, 1);

  const audit = await query<{ outcome: string }>(
    "SELECT outcome FROM audit_log WHERE submission_id = $1",
    [r.submission_id],
  );
  assert.equal(audit.length, 1);
  assert.equal(audit[0]!.outcome, "ACCEPTED");

  const feed = await query<{ operation: string }>(
    "SELECT operation FROM change_feed WHERE submission_id = $1",
    [r.submission_id],
  );
  assert.equal(feed.length, 1);
});

test("exact retry returns ALREADY_ACCEPTED without duplicate mutation", async () => {
  const r = makeRollCreate();
  const first = await app.push(r.request);
  assert.equal(first.status, "ACCEPTED");

  const second = await app.push(r.request);
  assert.equal(second.status, "ALREADY_ACCEPTED");

  const rows = await query<{ entity_version: number }>(
    "SELECT entity_version FROM canonical_entities WHERE entity_id = $1",
    [r.entity_id],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.entity_version, 1);

  const feed = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM change_feed WHERE entity_id = $1",
    [r.entity_id],
  );
  assert.equal(Number(feed[0]!.n), 1);
});

test("submission id collision (same id, different payload) rejected", async () => {
  const r = makeRollCreate();
  assert.equal((await app.push(r.request)).status, "ACCEPTED");

  const tampered = { ...r.request, payload: { ...(r.request.payload as object), pinfall: 0 } };
  const colliding = { ...tampered, payload_hash: hashPayload(tampered.payload) };
  const result = await app.push(colliding);
  assert.equal(result.status, "REJECTED");
  if (result.status === "REJECTED") assert.equal(result.reason_code, "SUBMISSION_ID_COLLISION");

  const rows = await query<{ pinfall: string }>(
    "SELECT payload ->> 'pinfall' AS pinfall FROM canonical_entities WHERE entity_id = $1",
    [r.entity_id],
  );
  assert.equal(Number(rows[0]!.pinfall), 10);
});

test("UPDATE happy path increments version exactly once", async () => {
  const r = makeRollCreate();
  await app.push(r.request);

  const update = makeRollUpdate(r.entity_id, r.device_id, r.created_at, r.device_id, 7, 1);
  const result = await app.push(update);
  assert.equal(result.status, "ACCEPTED");
  if (result.status !== "ACCEPTED") return;
  assert.equal(result.entity_version, 2);

  const rows = await query<{ entity_version: number; pinfall: string }>(
    "SELECT entity_version, payload ->> 'pinfall' AS pinfall FROM canonical_entities WHERE entity_id = $1",
    [r.entity_id],
  );
  assert.equal(rows[0]!.entity_version, 2);
  assert.equal(rows[0]!.pinfall, "7");
});

test("stale update produces conflict and preserves incoming observation", async () => {
  const r = makeRollCreate();
  await app.push(r.request);
  // Advance canonical to v2.
  await app.push(makeRollUpdate(r.entity_id, r.device_id, r.created_at, r.device_id, 8, 1));

  // Stale: expected 1 but canonical is 2.
  const stale = makeRollUpdate(r.entity_id, r.device_id, r.created_at, r.device_id, 7, 1);
  const result = await app.push(stale);
  assert.equal(result.status, "CONFLICT");

  // Canonical entity unchanged at v2 / pinfall 8.
  const rows = await query<{ entity_version: number; pinfall: string }>(
    "SELECT entity_version, payload ->> 'pinfall' AS pinfall FROM canonical_entities WHERE entity_id = $1",
    [r.entity_id],
  );
  assert.equal(rows[0]!.entity_version, 2);
  assert.equal(rows[0]!.pinfall, "8");

  // Conflict artifact persisted with incoming payload preserved.
  const conflicts = await query<{ incoming_payload: Record<string, unknown> }>(
    "SELECT incoming_payload FROM sync_conflicts WHERE entity_id = $1",
    [r.entity_id],
  );
  assert.equal(conflicts.length, 1);
  assert.equal(
    (conflicts[0]!.incoming_payload as { pinfall: number }).pinfall,
    7,
  );
});

test("two-device conflict: A wins, B preserved (and reverse order)", async () => {
  for (const order of ["A-first", "B-first"] as const) {
    await truncateAll();
    app = await makeApp();

    const creator = makeRollCreate();
    await app.push(creator.request);

    const aSub = uuidv7();
    const bSub = uuidv7();
    const updateA = makeRollUpdate(creator.entity_id, creator.device_id, creator.created_at, uuidv7(), 6, 1, aSub);
    const updateB = makeRollUpdate(creator.entity_id, creator.device_id, creator.created_at, uuidv7(), 4, 1, bSub);

    const firstReq = order === "A-first" ? updateA : updateB;
    const secondReq = order === "A-first" ? updateB : updateA;

    const first = await app.push(firstReq);
    assert.equal(first.status, "ACCEPTED", `${order}: first should be accepted`);

    const second = await app.push(secondReq);
    assert.equal(second.status, "CONFLICT", `${order}: second should conflict`);

    // Canonical remains at v2 (no duplicate/loss).
    const rows = await query<{ entity_version: number; pinfall: string }>(
      "SELECT entity_version, payload ->> 'pinfall' AS pinfall FROM canonical_entities WHERE entity_id = $1",
      [creator.entity_id],
    );
    assert.equal(rows[0]!.entity_version, 2, `${order}`);
    const expectedPinfall = order === "A-first" ? "6" : "4";
    assert.equal(rows[0]!.pinfall, expectedPinfall, `${order}`);

    // One conflict preserved (the loser).
    const conflicts = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM sync_conflicts WHERE entity_id = $1",
      [creator.entity_id],
    );
    assert.equal(Number(conflicts[0]!.n), 1, `${order}`);
  }
});

test("CORRECT advances version and is idempotent", async () => {
  const r = makeRollCreate();
  await app.push(r.request);

  const correction = makeCorrection(r.entity_id, 1, r.device_id, 7);
  const result = await app.push(correction);
  assert.equal(result.status, "ACCEPTED");
  if (result.status !== "ACCEPTED") assert.fail("correction should be accepted");

  const rows = await query<{ entity_version: number; data_quality: string; pinfall: string }>(
    "SELECT entity_version, data_quality, payload ->> 'pinfall' AS pinfall FROM canonical_entities WHERE entity_id = $1",
    [r.entity_id],
  );
  assert.equal(rows[0]!.entity_version, 2);
  assert.equal(rows[0]!.data_quality, "CORRECTED");
  assert.equal(rows[0]!.pinfall, "7");

  // Repeat same correction submission id -> idempotent.
  const again = await app.push(correction);
  assert.equal(again.status, "ALREADY_ACCEPTED");

  const audit = await query<{ action: string }>(
    "SELECT action FROM audit_log WHERE submission_id = $1 AND action = 'CORRECT'",
    [correction.submission_id as string],
  );
  assert.equal(audit.length, 1);
});

test("transaction rollback leaves no partial accepted state", async () => {
  const pool = createPool(testConfig());
  const step = async (failAfter: number) => {
    const entityId = uuidv7();
    const deviceId = uuidv7();
    const submissionId = uuidv7();
    let counter = 0;
    await assert.rejects(
      withTransaction(pool, async (tx) => {
        await entityRepo.insert(tx, {
          entity_type: "Roll",
          entity_id: entityId,
          schema_version: 1,
          entity_version: 1,
          origin_device_id: deviceId,
          data_quality: "COMPLETE",
          created_at: new Date(),
          updated_at: new Date(),
          archived: false,
          payload: { id: entityId },
          payload_hash: hashPayload({ id: entityId }),
        });
        if (failAfter === ++counter) throw new Error("injected");
        await idempotencyRepo.insert(tx, {
          submission_id: submissionId,
          device_id: deviceId,
          payload_hash: "h",
          operation_type: "CREATE",
          entity_type: "Roll",
          entity_id: entityId,
          received_at: new Date(),
          result_status: "ACCEPTED",
          result_entity_version: 1,
          result_change_cursor: null,
          result_committed_at: new Date(),
          result_payload: null,
        });
        if (failAfter === ++counter) throw new Error("injected");
        await auditRepo.insert(tx, {
          audit_id: uuidv7(), happened_at: new Date(), actor: deviceId, action: "push",
          entity_type: "Roll", entity_id: entityId, submission_id: submissionId,
          outcome: "ACCEPTED", prior_version: null, result_version: 1, metadata: null,
        });
        if (failAfter === ++counter) throw new Error("injected");
        await changeFeedRepo.insert(tx, {
          entity_type: "Roll", entity_id: entityId, entity_version: 1,
          operation: "CREATE", submission_id: submissionId, committed_at: new Date(),
        });
        if (failAfter === ++counter) throw new Error("injected");
      }),
    );
    const rows = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM canonical_entities WHERE entity_id = $1",
      [entityId],
    );
    return Number(rows[0]!.n);
  };

  // Fail after canonical write, after idempotency, after audit, before commit.
  for (const failAfter of [1, 2, 3, 4]) {
    assert.equal(await step(failAfter), 0, `no canonical row after failure at step ${failAfter}`);
  }
  await pool.end();
});

test("pull after cursor is repeatable and ordered", async () => {
  const ids: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const r = makeRollCreate();
    await app.push(r.request);
    ids.push(r.entity_id);
  }

  const first = await app.pull(0, 100);
  assert.equal(first.changes.length, 3);
  assert.equal(first.has_more, false);
  const seqs = first.changes.map((c) => c.change_seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));

  const second = await app.pull(0, 100);
  assert.deepEqual(second.changes.map((c) => c.change_seq), seqs);

  const afterAll = await app.pull(first.next_cursor, 100);
  assert.equal(afterAll.changes.length, 0);
  assert.equal(afterAll.next_cursor, first.next_cursor);

  // Pagination: limit 1 returns has_more only if more remain.
  const page1 = await app.pull(0, 1);
  assert.equal(page1.changes.length, 1);
  assert.equal(page1.has_more, true);
});

test("server restart: prior accepted submission replays ALREADY_ACCEPTED", async () => {
  const r = makeRollCreate();
  const first = await app.push(r.request);
  assert.equal(first.status, "ACCEPTED");

  await app.close();
  app = await makeApp();

  const replay = await app.push(r.request);
  assert.equal(replay.status, "ALREADY_ACCEPTED");
  if (replay.status === "ALREADY_ACCEPTED") {
    assert.equal(replay.entity_version, 1);
    assert.equal(replay.entity_id, r.entity_id);
  }
});

test("invalid client input is rejected without corrupting state", async () => {
  const cases: Array<[string, unknown, string | null]> = [
    ["malformed uuid", { ...makeRollCreate().request, submission_id: "not-a-uuid" }, "INVALID_UUID"],
    ["unknown entity type", { ...makeRollCreate().request, entity_type: "Nope" }, "UNKNOWN_ENTITY_TYPE"],
    ["unknown operation", { ...makeRollCreate().request, operation_type: "FROB" }, "UNKNOWN_OPERATION"],
    ["negative expected version", { ...makeRollCreate().request, expected_entity_version: -1 }, "INVALID_EXPECTED_VERSION"],
    ["payload hash mismatch", (() => { const r = makeRollCreate().request; return { ...r, payload_hash: "deadbeef" }; })(), "PAYLOAD_HASH_MISMATCH"],
    ["bad bowling fact", (() => {
      const c = makeRollCreate();
      const payload = { ...c.request.payload, pinfall: 99 };
      return { ...c.request, payload, payload_hash: hashPayload(payload) };
    })(), "INVALID_BOWLING_FACTS"],
    ["unsupported protocol", { ...makeRollCreate().request, protocol_version: 999 }, null],
  ];

  for (const [name, body, reason] of cases) {
    const result = await app.push(body);
    if (name === "unsupported protocol") {
      assert.equal(result.status, "UNSUPPORTED_PROTOCOL", name);
    } else {
      assert.equal(result.status, "REJECTED", name);
      if (result.status === "REJECTED") assert.equal(result.reason_code, reason, name);
    }
  }
});

test("CREATE conflict is idempotent: replay same conflict id, no duplicates", async () => {
  const original = makeRollCreate();
  assert.equal((await app.push(original.request)).status, "ACCEPTED");

  const conflictingPayload = { ...(original.request.payload as object), pinfall: 3 };
  const conflicting = {
    protocol_version: 1,
    submission_id: uuidv7(),
    device_id: uuidv7(),
    entity_type: "Roll",
    entity_id: original.entity_id,
    operation_type: "CREATE",
    expected_entity_version: 0,
    payload: conflictingPayload,
    payload_hash: hashPayload(conflictingPayload),
  };

  const result1 = await app.push(conflicting);
  assert.equal(result1.status, "CONFLICT");
  if (result1.status !== "CONFLICT") return;

  const result2 = await app.push(conflicting);
  assert.equal(result2.status, "CONFLICT");
  if (result2.status === "CONFLICT") {
    assert.equal(result2.conflict_id, result1.conflict_id);
  }

  const conflictRows = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM sync_conflicts WHERE submission_id = $1",
    [conflicting.submission_id],
  );
  assert.equal(Number(conflictRows[0]!.n), 1);

  const canonical = await query<{ entity_version: number }>(
    "SELECT entity_version FROM canonical_entities WHERE entity_id = $1",
    [original.entity_id],
  );
  assert.equal(canonical[0]!.entity_version, 1);
});

test("CREATE conflict: same submission id + changed payload -> SUBMISSION_ID_COLLISION", async () => {
  const original = makeRollCreate();
  await app.push(original.request);

  const sid = uuidv7();
  const mk = (pinfall: number) => {
    const payload = { ...(original.request.payload as object), pinfall };
    return {
      protocol_version: 1,
      submission_id: sid,
      device_id: uuidv7(),
      entity_type: "Roll",
      entity_id: original.entity_id,
      operation_type: "CREATE",
      expected_entity_version: 0,
      payload,
      payload_hash: hashPayload(payload),
    };
  };

  assert.equal((await app.push(mk(3))).status, "CONFLICT");
  const result = await app.push(mk(4));
  assert.equal(result.status, "REJECTED");
  if (result.status === "REJECTED") assert.equal(result.reason_code, "SUBMISSION_ID_COLLISION");
});

test("ARCHIVE produces self-consistent canonical payload", async () => {
  const r = makeRollCreate();
  await app.push(r.request);

  const archive = makeArchive(r.entity_id, r.device_id, 1);
  const result = await app.push(archive);
  assert.equal(result.status, "ACCEPTED");

  const rows = await query<{
    entity_version: number;
    archived: boolean;
    payload_hash: string;
    payload: Record<string, unknown>;
    updated_at: Date;
  }>(
    "SELECT entity_version, archived, payload_hash, payload, updated_at FROM canonical_entities WHERE entity_id = $1",
    [r.entity_id],
  );
  const row = rows[0]!;
  assert.equal(row.entity_version, 2);
  assert.equal((row.payload as { entity_version: number }).entity_version, row.entity_version);
  assert.equal(row.archived, true);
  assert.equal((row.payload as { deleted: boolean }).deleted, true);
  assert.equal(row.payload_hash, hashPayload(row.payload));
  assert.equal(
    (row.payload as { updated_at: string }).updated_at,
    row.updated_at.toISOString(),
  );

  // change_feed version matches the canonical version.
  const feed = await query<{ entity_version: number }>(
    "SELECT entity_version FROM change_feed WHERE submission_id = $1",
    [archive.submission_id as string],
  );
  assert.equal(feed[0]!.entity_version, 2);
});

test("ARCHIVE exact retry is idempotent", async () => {
  const r = makeRollCreate();
  await app.push(r.request);
  const archive = makeArchive(r.entity_id, r.device_id, 1);

  assert.equal((await app.push(archive)).status, "ACCEPTED");
  assert.equal((await app.push(archive)).status, "ALREADY_ACCEPTED");

  const rows = await query<{ entity_version: number }>(
    "SELECT entity_version FROM canonical_entities WHERE entity_id = $1",
    [r.entity_id],
  );
  assert.equal(rows[0]!.entity_version, 2);

  const feed = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM change_feed WHERE entity_id = $1 AND operation = 'DELETE'",
    [r.entity_id],
  );
  assert.equal(Number(feed[0]!.n), 1);
});

test("ARCHIVE stale version -> CONFLICT and preserved", async () => {
  const r = makeRollCreate();
  await app.push(r.request);
  await app.push(makeRollUpdate(r.entity_id, r.device_id, r.created_at, r.device_id, 7, 1));

  const staleArchive = makeArchive(r.entity_id, r.device_id, 1);
  const result = await app.push(staleArchive);
  assert.equal(result.status, "CONFLICT");

  const rows = await query<{ entity_version: number; archived: boolean }>(
    "SELECT entity_version, archived FROM canonical_entities WHERE entity_id = $1",
    [r.entity_id],
  );
  assert.equal(rows[0]!.entity_version, 2);
  assert.equal(rows[0]!.archived, false);

  const conflicts = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM sync_conflicts WHERE entity_id = $1",
    [r.entity_id],
  );
  assert.equal(Number(conflicts[0]!.n), 1);
});

test("Frame.frame_number validation: 1..10 accepted, 0/11/12 rejected", async () => {
  for (const valid of [1, 10]) {
    const result = await app.push(makeFrameCreate(valid));
    assert.equal(result.status, "ACCEPTED", `frame ${valid} should pass`);
  }
  for (const invalid of [0, 11, 12]) {
    const result = await app.push(makeFrameCreate(invalid));
    assert.equal(result.status, "REJECTED", `frame ${invalid} should be rejected`);
    if (result.status === "REJECTED") {
      assert.equal(result.reason_code, "INVALID_BOWLING_FACTS");
    }
  }
});

test("missing-target UPDATE rejection replays after target appears", async () => {
  const targetId = uuidv7();
  const submitDevice = uuidv7();
  const createdAt = new Date().toISOString();
  const sid = uuidv7();

  const updateReq = makeRollUpdate(targetId, uuidv7(), createdAt, submitDevice, 6, 1, sid);

  const first = await app.push(updateReq);
  assert.equal(first.status, "REJECTED");
  if (first.status === "REJECTED") assert.equal(first.reason_code, "ENTITY_NOT_FOUND");

  // Target appears via a separate submission.
  const createPayload = rollPayload(targetId, submitDevice);
  const createReq = {
    protocol_version: 1,
    submission_id: uuidv7(),
    device_id: submitDevice,
    entity_type: "Roll",
    entity_id: targetId,
    operation_type: "CREATE",
    expected_entity_version: 0,
    payload: createPayload,
    payload_hash: hashPayload(createPayload),
  };
  assert.equal((await app.push(createReq)).status, "ACCEPTED");

  // Retry exact same UPDATE S -> must replay original rejection.
  const retry = await app.push(updateReq);
  assert.equal(retry.status, "REJECTED");
  if (retry.status === "REJECTED") assert.equal(retry.reason_code, "ENTITY_NOT_FOUND");

  // Canonical X unchanged by retry (still v1, pinfall 10).
  const rows = await query<{ entity_version: number; pinfall: string }>(
    "SELECT entity_version, payload ->> 'pinfall' AS pinfall FROM canonical_entities WHERE entity_id = $1",
    [targetId],
  );
  assert.equal(rows[0]!.entity_version, 1);
  assert.equal(rows[0]!.pinfall, "10");

  // Single semantic rejection audit for S.
  const audits = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM audit_log WHERE submission_id = $1 AND outcome = 'REJECTED'",
    [sid],
  );
  assert.equal(Number(audits[0]!.n), 1);
});

test("missing-target UPDATE: same submission id + changed payload -> SUBMISSION_ID_COLLISION", async () => {
  const targetId = uuidv7();
  const sid = uuidv7();
  const createdAt = new Date().toISOString();
  const device = uuidv7();

  const a = makeRollUpdate(targetId, uuidv7(), createdAt, device, 6, 1, sid);
  const b = makeRollUpdate(targetId, uuidv7(), createdAt, device, 7, 1, sid);

  assert.equal((await app.push(a)).status, "REJECTED");
  const result = await app.push(b);
  assert.equal(result.status, "REJECTED");
  if (result.status === "REJECTED") assert.equal(result.reason_code, "SUBMISSION_ID_COLLISION");
});

test("immutable-field rejection is idempotent", async () => {
  const r = makeRollCreate();
  await app.push(r.request);

  const sid = uuidv7();
  // Tamper origin_device_id (different device).
  const tamperedPayload = rollPayload(r.entity_id, uuidv7(), { created_at: r.created_at });
  const tampered = {
    protocol_version: 1,
    submission_id: sid,
    device_id: uuidv7(),
    entity_type: "Roll",
    entity_id: r.entity_id,
    operation_type: "UPDATE",
    expected_entity_version: 1,
    payload: tamperedPayload,
    payload_hash: hashPayload(tamperedPayload),
  };

  const first = await app.push(tampered);
  assert.equal(first.status, "REJECTED");
  if (first.status === "REJECTED") assert.equal(first.reason_code, "IMMUTABLE_FIELD_CHANGED");

  const retry = await app.push(tampered);
  assert.equal(retry.status, "REJECTED");
  if (retry.status === "REJECTED") assert.equal(retry.reason_code, "IMMUTABLE_FIELD_CHANGED");

  // No duplicate semantic mutation/audit: entity still v1, single rejection audit.
  const rows = await query<{ entity_version: number }>(
    "SELECT entity_version FROM canonical_entities WHERE entity_id = $1",
    [r.entity_id],
  );
  assert.equal(rows[0]!.entity_version, 1);

  const audits = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM audit_log WHERE submission_id = $1 AND outcome = 'REJECTED'",
    [sid],
  );
  assert.equal(Number(audits[0]!.n), 1);
});

test("DELETE payload identity must match envelope", async () => {
  const created = makeRollCreate();
  await app.push(created.request);

  const del = (payload: Record<string, unknown>, entityId = created.entity_id) => ({
    protocol_version: 1,
    submission_id: uuidv7(),
    device_id: uuidv7(),
    entity_type: "Roll",
    entity_id: entityId,
    operation_type: "DELETE",
    expected_entity_version: 1,
    payload,
    payload_hash: hashPayload(payload),
  });

  // Matching identity -> accepted (archives created entity).
  const ok = await app.push(del({ entity_type: "Roll", entity_id: created.entity_id }));
  assert.equal(ok.status, "ACCEPTED");

  const rejected = async (body: unknown) => {
    const res = await app.push(body);
    assert.equal(res.status, "REJECTED");
    return res as Extract<Awaited<ReturnType<typeof app.push>>, { status: "REJECTED" }>;
  };

  // missing entity_type
  assert.equal((await rejected(del({ entity_id: uuidv7() }))).reason_code, "MISSING_METADATA");
  // missing entity_id
  assert.equal((await rejected(del({ entity_type: "Roll" }))).reason_code, "MISSING_METADATA");
  // entity_type mismatch
  assert.equal((await rejected(del({ entity_type: "Game", entity_id: created.entity_id }))).reason_code, "ENTITY_TYPE_MISMATCH");
  // entity_id mismatch
  assert.equal((await rejected(del({ entity_type: "Roll", entity_id: uuidv7() }))).reason_code, "ENTITY_ID_MISMATCH");
  // malformed entity_id
  assert.equal((await rejected(del({ entity_type: "Roll", entity_id: "not-a-uuid" }))).reason_code, "INVALID_UUID");
});