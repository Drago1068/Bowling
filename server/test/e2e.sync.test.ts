import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { uuidv7 } from "../../src/identity/uuidv7.ts";
import type { Roll } from "../../src/entities.ts";
import { serverReceiptKey, type ServerReceipt } from "../../src/index.ts";
import { buildApplication, type BowlingApplication } from "../application/app.ts";
import { nullLogger } from "../observability/logger.ts";
import {
  makeMobile,
  recordRoll,
  makeStaleUpdate,
  seedCanonical,
  createInProcessTransport,
  coordinatorFor,
  deleteSqliteFiles,
  closeMobile,
} from "./e2e.helpers.ts";
import { testConfig, truncateAll, query } from "./helpers.ts";

let app: BowlingApplication;

before(async () => {
  app = buildApplication(testConfig(), nullLogger);
  await app.initialize();
});

beforeEach(async () => {
  await truncateAll();
});

after(async () => {
  if (app) await app.close();
});

test("offline create: local write, queued, not synced", async () => {
  const mobile = makeMobile();
  const { submissionId } = recordRoll(mobile);

  assert.equal(mobile.stores.entities.list("Roll").length, 1);
  assert.equal(mobile.stores.outbox.get(submissionId)?.state, "QUEUED");

  let blocked = true;
  const report = await coordinatorFor(mobile, createInProcessTransport(app, { blocked: () => blocked })).syncOnce();
  assert.equal(report.pushed.confirmed, 0);
  assert.equal(report.pushed.retryableErrors, 1);
  assert.equal(mobile.stores.outbox.get(submissionId)?.state, "RETRYABLE_ERROR");

  // Nothing reached the server.
  const n = await query<{ n: string }>("SELECT count(*)::text AS n FROM canonical_entities");
  assert.equal(Number(n[0]!.n), 0);
  closeMobile(mobile);
});

test("reconnect push: server accepts, outbox confirmed", async () => {
  const mobile = makeMobile();
  const { roll, submissionId } = recordRoll(mobile);
  const report = await coordinatorFor(mobile, createInProcessTransport(app)).syncOnce();
  assert.equal(report.pushed.confirmed, 1);
  assert.equal(mobile.stores.outbox.get(submissionId)?.state, "CONFIRMED");

  const row = await query<{ entity_version: number }>(
    "SELECT entity_version FROM canonical_entities WHERE entity_id = $1",
    [roll.id],
  );
  assert.equal(row[0]!.entity_version, 1);
  closeMobile(mobile);
});

test("exact push retry is ALREADY_ACCEPTED with no duplicate", async () => {
  const mobile = makeMobile();
  const { roll, submissionId } = recordRoll(mobile);
  await coordinatorFor(mobile, createInProcessTransport(app)).syncOnce();
  assert.equal(mobile.stores.outbox.get(submissionId)?.state, "CONFIRMED");

  const entry = mobile.stores.outbox.get(submissionId)!;
  const outcome = await createInProcessTransport(app).push(entry.envelope);
  assert.equal(outcome.outcome, "result");
  if (outcome.outcome === "result") assert.equal(outcome.result.status, "ALREADY_ACCEPTED");

  const row = await query<{ entity_version: number; n: string }>(
    "SELECT entity_version, count(*)::text AS n FROM canonical_entities WHERE entity_id = $1 GROUP BY entity_version",
    [roll.id],
  );
  assert.equal(row.length, 1);
  assert.equal(row[0]!.entity_version, 1);
  closeMobile(mobile);
});

test("network loss before server commit remains retryable, same submission id", async () => {
  const mobile = makeMobile();
  const { submissionId } = recordRoll(mobile);

  const receivedSubmissions: string[] = [];
  let blocked = true;
  const coordinator = coordinatorFor(
    mobile,
    createInProcessTransport(app, { blocked: () => blocked, receivedSubmissions }),
  );
  assert.equal((await coordinator.syncOnce()).pushed.retryableErrors, 1);
  assert.equal(mobile.stores.outbox.get(submissionId)?.state, "RETRYABLE_ERROR");

  blocked = false;
  assert.equal((await coordinator.syncOnce()).pushed.confirmed, 1);
  assert.equal(mobile.stores.outbox.get(submissionId)?.state, "CONFIRMED");

  // Same submission id replayed on retry, not a fresh one.
  assert.deepEqual(receivedSubmissions, [submissionId, submissionId]);
  closeMobile(mobile);
});

test("lost response after server commit converges via ALREADY_ACCEPTED (no duplicate)", async () => {
  const mobile = makeMobile();
  const { roll, submissionId } = recordRoll(mobile);

  let lost = true;
  const receivedSubmissions: string[] = [];
  const serverResults: Array<{ status: string; submission_id: string }> = [];
  const transport = createInProcessTransport(app, {
    loseResponse: () => lost,
    receivedSubmissions,
    serverResults,
  });
  const coordinator = coordinatorFor(mobile, transport);

  // Server commits; response lost; client stays unconfirmed/retryable.
  const report = await coordinator.syncOnce();
  assert.equal(report.pushed.retryableErrors, 1);
  assert.equal(mobile.stores.outbox.get(submissionId)?.state, "RETRYABLE_ERROR");

  // Direct proof the first server result was ACCEPTED (server committed).
  assert.equal(serverResults[0]!.status, "ACCEPTED");
  const row = await query<{ entity_version: number }>(
    "SELECT entity_version FROM canonical_entities WHERE entity_id = $1",
    [roll.id],
  );
  assert.equal(row[0]!.entity_version, 1);

  // Recover: retry same submission id.
  lost = false;
  const report2 = await coordinator.syncOnce();
  assert.equal(report2.pushed.confirmed, 1);
  assert.equal(mobile.stores.outbox.get(submissionId)?.state, "CONFIRMED");

  // Direct proof: same submission id reused, server replays ALREADY_ACCEPTED.
  assert.deepEqual(receivedSubmissions, [submissionId, submissionId]);
  assert.equal(serverResults[1]!.status, "ALREADY_ACCEPTED");
  assert.equal(serverResults[1]!.submission_id, submissionId);

  // No duplicate: still version 1, a single change-feed semantic mutation.
  const row2 = await query<{ entity_version: number; n: string }>(
    "SELECT entity_version, count(*)::text AS n FROM canonical_entities WHERE entity_id = $1 GROUP BY entity_version",
    [roll.id],
  );
  assert.equal(row2.length, 1);
  assert.equal(row2[0]!.entity_version, 1);
  const feed = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM change_feed WHERE entity_id = $1",
    [roll.id],
  );
  assert.equal(Number(feed[0]!.n), 1);
  closeMobile(mobile);
});

test("ACCEPTED recovery: durable receipt, explicit replay, no fake Synced", async () => {
  const path = join(tmpdir(), `bowling-accepted-${uuidv7()}.db`);
  try {
    const mobile = makeMobile(path);
    const { roll, submissionId } = recordRoll(mobile);

    let fired = false;
    const firstResults: Array<{ status: string; submission_id: string }> = [];
    const coordinator = coordinatorFor(
      mobile,
      createInProcessTransport(app, { serverResults: firstResults }),
      {
        afterServerResultBeforeConfirm: () => {
          if (!fired) {
            fired = true;
            throw new Error("simulated crash after server result before confirm");
          }
        },
      },
    );
    await assert.rejects(coordinator.syncOnce());

    // Server accepted (proven directly); crash happened before local CONFIRMED.
    assert.equal(firstResults[0]!.status, "ACCEPTED");
    assert.equal(mobile.stores.outbox.get(submissionId)?.state, "ACCEPTED");

    // ACCEPTED is terminal-until-acknowledged: durable, in resumable, never a fake Synced.
    assert.equal(mobile.stores.outbox.pending().length, 0);
    assert.equal(mobile.stores.outbox.resumable().length, 1);

    // The ACCEPTED state carries a durable authoritative receipt: server entity
    // version, change cursor, and committed timestamp.
    const raw = mobile.stores.checkpoint.get(serverReceiptKey(submissionId));
    assert.ok(raw, "server receipt persisted durably before CONFIRMED");
    const receipt: ServerReceipt = JSON.parse(raw!);
    assert.equal(receipt.entity_version, 1);
    assert.ok(receipt.server_change_cursor >= 1, "change cursor present");
    assert.match(receipt.server_committed_at, /^\d{4}-\d{2}-\d{2}T/);

    // Crash / process death: close and reopen the same SQLite file.
    closeMobile(mobile);
    const mobile2 = makeMobile(path);

    // Recovery contract: EXPLICIT REPLAY of the same submission_id. The server's
    // durable idempotency record answers ALREADY_ACCEPTED; the client then
    // confirms. No separate "Synced" fiction; the transition is ACCEPTED -> CONFIRMED.
    const received2: string[] = [];
    const results2: Array<{ status: string; submission_id: string }> = [];
    const report = await coordinatorFor(
      mobile2,
      createInProcessTransport(app, { receivedSubmissions: received2, serverResults: results2 }),
    ).syncOnce();
    assert.equal(report.pushed.confirmed, 1);
    assert.equal(mobile2.stores.outbox.get(submissionId)?.state, "CONFIRMED");
    assert.deepEqual(received2, [submissionId]);
    assert.equal(results2[0]!.status, "ALREADY_ACCEPTED");

    // No duplicate server mutation after recovery.
    const row = await query<{ entity_version: number; n: string }>(
      "SELECT entity_version, count(*)::text AS n FROM canonical_entities WHERE entity_id = $1 GROUP BY entity_version",
      [roll.id],
    );
    assert.equal(row.length, 1);
    assert.equal(row[0]!.entity_version, 1);
    const feed = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM change_feed WHERE entity_id = $1",
      [roll.id],
    );
    assert.equal(Number(feed[0]!.n), 1);

    closeMobile(mobile2);
  } finally {
    await deleteSqliteFiles(path);
  }
});

test("pull propagates canonical roll to a second device", async () => {
  const { roll, seeder } = await seedCanonical(app, 10);

  const deviceB = makeMobile();
  const report = await coordinatorFor(deviceB, createInProcessTransport(app)).pull();
  assert.equal(report.applied, 1);

  const local = deviceB.stores.entities.get("Roll", roll.id) as Roll | null;
  assert.ok(local);
  assert.equal(local.id, roll.id);
  assert.equal(local.entity_version, roll.entity_version);
  assert.equal(local.pinfall, roll.pinfall);
  assert.ok(Number(deviceB.stores.checkpoint.get("change_cursor")) > 0);

  closeMobile(seeder);
  closeMobile(deviceB);
});

test("duplicate pull page is idempotent", async () => {
  const { roll, seeder } = await seedCanonical(app, 10);

  const deviceB = makeMobile();
  const coordinator = coordinatorFor(deviceB, createInProcessTransport(app));

  assert.equal((await coordinator.pull()).applied, 1);
  const v1 = (deviceB.stores.entities.get("Roll", roll.id) as Roll).entity_version;

  deviceB.stores.checkpoint.set("change_cursor", "0");
  const second = await coordinator.pull();
  assert.equal(second.applied, 0);
  assert.equal((deviceB.stores.entities.get("Roll", roll.id) as Roll).entity_version, v1);

  closeMobile(seeder);
  closeMobile(deviceB);
});

test("pull crash before commit rolls back entity, applied-change, and checkpoint", async () => {
  const { roll, seeder, serverCursor } = await seedCanonical(app, 10);
  assert.ok(serverCursor >= 1, "seed cursor identifies the applied change");
  const changeId = String(serverCursor);

  const deviceB = makeMobile();
  let fired = false;
  const coordinator = coordinatorFor(deviceB, createInProcessTransport(app), {
    duringApplyBeforeCommit: () => {
      if (!fired) {
        fired = true;
        throw new Error("crash during apply before commit");
      }
    },
  });

  await assert.rejects(coordinator.pull());

  // All three rolled back together: remote entity absent, applied marker
  // absent for the ACTUAL change id, checkpoint unchanged.
  assert.equal(deviceB.stores.entities.get("Roll", roll.id), null);
  assert.equal(deviceB.stores.applied.isApplied(changeId), false);
  assert.equal(deviceB.stores.checkpoint.get("change_cursor") ?? "0", "0");

  // Restart: same page pulled, applied once, marker recorded once, checkpoint advanced.
  const report = await coordinatorFor(deviceB, createInProcessTransport(app)).pull();
  assert.equal(report.applied, 1);
  assert.ok(deviceB.stores.entities.get("Roll", roll.id));
  assert.equal(deviceB.stores.applied.isApplied(changeId), true);
  assert.ok(Number(deviceB.stores.checkpoint.get("change_cursor")) > 0);

  closeMobile(seeder);
  closeMobile(deviceB);
});

test("pull resume after commit: no duplicate apply", async () => {
  const { roll, seeder } = await seedCanonical(app, 10);

  const deviceB = makeMobile();
  const coordinator = coordinatorFor(deviceB, createInProcessTransport(app));
  assert.equal((await coordinator.pull()).applied, 1);
  const v = (deviceB.stores.entities.get("Roll", roll.id) as Roll).entity_version;

  // Simulate "restart" (new coordinator, same stores) and pull again from committed cursor.
  const again = await coordinatorFor(deviceB, createInProcessTransport(app)).pull();
  assert.equal(again.applied, 0);
  assert.equal((deviceB.stores.entities.get("Roll", roll.id) as Roll).entity_version, v);

  closeMobile(seeder);
  closeMobile(deviceB);
});

test("two-device conflict: A-first and B-first", async () => {
  for (const order of ["A-first", "B-first"] as const) {
    await truncateAll();
    const { roll, seeder } = await seedCanonical(app, 10);

    const deviceA = makeMobile();
    const deviceB = makeMobile();
    const cA = coordinatorFor(deviceA, createInProcessTransport(app));
    const cB = coordinatorFor(deviceB, createInProcessTransport(app));

    await cA.pull();
    await cB.pull();
    const aUpdate = makeStaleUpdate(deviceA, 6);
    const bUpdate = makeStaleUpdate(deviceB, 7);

    const firstCoord = order === "A-first" ? cA : cB;
    const secondCoord = order === "A-first" ? cB : cA;

    const first = await firstCoord.syncOnce();
    assert.equal(first.pushed.confirmed, 1, `${order}: first confirmed`);
    assert.equal(first.pushed.conflicts, 0, `${order}: first not conflict`);

    const second = await secondCoord.syncOnce();
    assert.equal(second.pushed.conflicts, 1, `${order}: second conflicts`);
    assert.equal(second.pushed.confirmed, 0, `${order}: second not confirmed`);

    // Server canonical version = 2, single canonical row.
    const row = await query<{ entity_version: number; n: string }>(
      "SELECT entity_version, count(*)::text AS n FROM canonical_entities WHERE entity_id = $1 GROUP BY entity_version",
      [roll.id],
    );
    assert.equal(row[0]!.entity_version, 2, `${order}`);
    assert.equal(Number(row[0]!.n), 1, `${order}`);

    // Loser persists a conflict; local observation preserved (not overwritten).
    const loser = order === "A-first" ? deviceB : deviceA;
    assert.equal(loser.stores.conflicts.list().length, 1, `${order}`);
    const loserRoll = loser.stores.entities.get("Roll", roll.id) as Roll;
    const expectedLoserPinfall = order === "A-first" ? 7 : 6;
    assert.equal(loserRoll.pinfall, expectedLoserPinfall, `${order}: local observation preserved`);
    assert.equal(loserRoll.entity_version, 2, `${order}`);

    closeMobile(seeder);
    closeMobile(deviceA);
    closeMobile(deviceB);
  }
});

test("conflict survives restart with real stale version", async () => {
  const path = join(tmpdir(), `bowling-conflict-${uuidv7()}.db`);
  try {
    const { roll, seeder } = await seedCanonical(app, 10);

    // Device B pulls v1, edits offline (expected=1).
    const deviceB = makeMobile(path);
    const cB = coordinatorFor(deviceB, createInProcessTransport(app));
    await cB.pull();
    const bUpdate = makeStaleUpdate(deviceB, 4);

    // Another device advances server v1 -> v2.
    const deviceC = makeMobile();
    const cC = coordinatorFor(deviceC, createInProcessTransport(app));
    await cC.pull();
    makeStaleUpdate(deviceC, 5);
    const cReport = await cC.syncOnce();
    assert.equal(cReport.pushed.confirmed, 1);

    // B syncs stale v1 -> CONFLICT.
    const bReport = await cB.syncOnce();
    assert.equal(bReport.pushed.conflicts, 1);
    assert.equal(deviceB.stores.conflicts.list().length, 1);
    const conflictId = deviceB.stores.conflicts.list()[0]!.conflict_id;
    assert.equal((deviceB.stores.entities.get("Roll", roll.id) as Roll).pinfall, 4);

    // B's submission was not confirmed under a new id.
    assert.equal(deviceB.stores.outbox.get(bUpdate.submissionId)?.state, "CONFLICT");

    closeMobile(deviceB);
    closeMobile(deviceC);

    // Restart: reopen same file.
    const deviceB2 = makeMobile(path);
    const conflicts = deviceB2.stores.conflicts.list();
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]!.conflict_id, conflictId);
    // Local observation still present (not replaced by server v2).
    assert.equal((deviceB2.stores.entities.get("Roll", roll.id) as Roll).pinfall, 4);
    assert.equal(deviceB2.stores.outbox.get(bUpdate.submissionId)?.state, "CONFLICT");
    assert.equal(deviceB2.stores.outbox.pending().length, 0);
    assert.equal(deviceB2.stores.outbox.resumable().length, 0);

    closeMobile(deviceB2);
    closeMobile(seeder);
  } finally {
    await deleteSqliteFiles(path);
  }
});

test("rejected mutation row persists across restart", async () => {
  const path = join(tmpdir(), `bowling-rejected-${uuidv7()}.db`);
  try {
    const mobile = makeMobile(path);
    const { submissionId } = recordRoll(mobile, 99); // pinfall 99 -> deterministic rejection
    const report = await coordinatorFor(mobile, createInProcessTransport(app)).syncOnce();
    assert.equal(report.pushed.rejected, 1);

    const entry = mobile.stores.outbox.get(submissionId);
    assert.ok(entry);
    assert.equal(entry.state, "REJECTED");

    closeMobile(mobile);

    // Restart: same submission id retained, still REJECTED, not requeued.
    const mobile2 = makeMobile(path);
    const entry2 = mobile2.stores.outbox.get(submissionId);
    assert.ok(entry2);
    assert.equal(entry2.state, "REJECTED");
    assert.equal(entry2.envelope.submission_id, submissionId);
    assert.equal(mobile2.stores.outbox.pending().length, 0);
    assert.equal(mobile2.stores.outbox.resumable().length, 0);

    closeMobile(mobile2);
  } finally {
    await deleteSqliteFiles(path);
  }
});

test("multiple offline outbox submissions converge without duplication", async () => {
  const mobile = makeMobile();
  let blocked = true;
  const coordinator = coordinatorFor(mobile, createInProcessTransport(app, { blocked: () => blocked }));

  recordRoll(mobile, 1);
  recordRoll(mobile, 2);
  recordRoll(mobile, 3);
  assert.equal(mobile.stores.outbox.pending().length, 3);

  blocked = false;
  const report = await coordinator.syncOnce();
  assert.equal(report.pushed.confirmed, 3);
  assert.equal(report.pushed.conflicts, 0);

  const n = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM canonical_entities WHERE entity_type = 'Roll'",
  );
  assert.equal(Number(n[0]!.n), 3);
  closeMobile(mobile);
});

test("server restart with pending mobile outbox preserves data", async () => {
  await truncateAll();
  let app2 = buildApplication(testConfig(), nullLogger);
  await app2.initialize();

  const mobile = makeMobile();
  const { roll, submissionId } = recordRoll(mobile);

  // Restart server application (fresh pool).
  await app2.close();
  app2 = buildApplication(testConfig(), nullLogger);
  await app2.initialize();

  const report = await coordinatorFor(mobile, createInProcessTransport(app2)).syncOnce();
  assert.equal(report.pushed.confirmed, 1);
  assert.equal(mobile.stores.outbox.get(submissionId)?.state, "CONFIRMED");

  const row = await query<{ entity_version: number }>(
    "SELECT entity_version FROM canonical_entities WHERE entity_id = $1",
    [roll.id],
  );
  assert.equal(row[0]!.entity_version, 1);
  closeMobile(mobile);
  await app2.close();
});