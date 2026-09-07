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
  closeMobile,
  disposeTestResources,
  type MobileHandle,
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
  const mobiles: MobileHandle[] = [];
  try {
    const mobile = makeMobile();
    mobiles.push(mobile);
    const { submissionId } = recordRoll(mobile);

    assert.equal(mobile.stores.entities.list("Roll").length, 1);
    assert.equal(mobile.stores.outbox.get(submissionId)?.state, "QUEUED");

    let blocked = true;
    const report = await coordinatorFor(mobile, createInProcessTransport(app, { blocked: () => blocked })).syncOnce();
    assert.equal(report.pushed.confirmed, 0);
    assert.equal(report.pushed.retryableErrors, 1);
    assert.equal(mobile.stores.outbox.get(submissionId)?.state, "RETRYABLE_ERROR");

    const n = await query<{ n: string }>("SELECT count(*)::text AS n FROM canonical_entities");
    assert.equal(Number(n[0]!.n), 0);
  } finally {
    await disposeTestResources(mobiles);
  }
});

test("reconnect push: server accepts, outbox confirmed", async () => {
  const mobiles: MobileHandle[] = [];
  try {
    const mobile = makeMobile();
    mobiles.push(mobile);
    const { roll, submissionId } = recordRoll(mobile);
    const report = await coordinatorFor(mobile, createInProcessTransport(app)).syncOnce();
    assert.equal(report.pushed.confirmed, 1);
    assert.equal(mobile.stores.outbox.get(submissionId)?.state, "CONFIRMED");

    const row = await query<{ entity_version: number }>(
      "SELECT entity_version FROM canonical_entities WHERE entity_id = $1",
      [roll.id],
    );
    assert.equal(row[0]!.entity_version, 1);
  } finally {
    await disposeTestResources(mobiles);
  }
});

test("exact push retry is ALREADY_ACCEPTED with no duplicate", async () => {
  const mobiles: MobileHandle[] = [];
  try {
    const mobile = makeMobile();
    mobiles.push(mobile);
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
  } finally {
    await disposeTestResources(mobiles);
  }
});

test("network loss before server commit remains retryable, same submission id", async () => {
  const mobiles: MobileHandle[] = [];
  try {
    const mobile = makeMobile();
    mobiles.push(mobile);
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

    assert.deepEqual(receivedSubmissions, [submissionId, submissionId]);
  } finally {
    await disposeTestResources(mobiles);
  }
});

test("lost response after server commit converges via ALREADY_ACCEPTED (no duplicate)", async () => {
  const mobiles: MobileHandle[] = [];
  try {
    const mobile = makeMobile();
    mobiles.push(mobile);
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

    const report = await coordinator.syncOnce();
    assert.equal(report.pushed.retryableErrors, 1);
    assert.equal(mobile.stores.outbox.get(submissionId)?.state, "RETRYABLE_ERROR");

    assert.equal(serverResults[0]!.status, "ACCEPTED");
    const row = await query<{ entity_version: number }>(
      "SELECT entity_version FROM canonical_entities WHERE entity_id = $1",
      [roll.id],
    );
    assert.equal(row[0]!.entity_version, 1);

    lost = false;
    const report2 = await coordinator.syncOnce();
    assert.equal(report2.pushed.confirmed, 1);
    assert.equal(mobile.stores.outbox.get(submissionId)?.state, "CONFIRMED");

    assert.deepEqual(receivedSubmissions, [submissionId, submissionId]);
    assert.equal(serverResults[1]!.status, "ALREADY_ACCEPTED");
    assert.equal(serverResults[1]!.submission_id, submissionId);

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
  } finally {
    await disposeTestResources(mobiles);
  }
});

test("ACCEPTED recovery: durable receipt, explicit replay, no fake Synced", async () => {
  const path = join(tmpdir(), `bowling-accepted-${uuidv7()}.db`);
  const mobiles: MobileHandle[] = [];
  try {
    const mobile = makeMobile(path);
    mobiles.push(mobile);
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

    assert.equal(firstResults[0]!.status, "ACCEPTED");
    assert.equal(mobile.stores.outbox.get(submissionId)?.state, "ACCEPTED");

    assert.equal(mobile.stores.outbox.pending().length, 0);
    assert.equal(mobile.stores.outbox.resumable().length, 1);

    const raw = mobile.stores.checkpoint.get(serverReceiptKey(submissionId));
    assert.ok(raw, "server receipt persisted durably before CONFIRMED");
    const receipt: ServerReceipt = JSON.parse(raw!);
    assert.equal(receipt.entity_version, 1);
    assert.ok(receipt.server_change_cursor >= 1, "change cursor present");
    assert.match(receipt.server_committed_at, /^\d{4}-\d{2}-\d{2}T/);

    closeMobile(mobile);
    const mobile2 = makeMobile(path);
    mobiles.push(mobile2);

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
  } finally {
    await disposeTestResources(mobiles, { path });
  }
});

test("ACCEPTED receipt crash rolls back both writes; replay confirms once", async () => {
  const path = join(tmpdir(), `bowling-accepted-atomic-${uuidv7()}.db`);
  const mobiles: MobileHandle[] = [];
  try {
    const mobile = makeMobile(path);
    mobiles.push(mobile);
    const { roll, submissionId } = recordRoll(mobile);

    let fired = false;
    const firstResults: Array<{ status: string; submission_id: string }> = [];
    const coordinator = coordinatorFor(
      mobile,
      createInProcessTransport(app, { serverResults: firstResults }),
      {
        afterAcceptedBeforeReceipt: () => {
          if (!fired) {
            fired = true;
            throw new Error("simulated crash after ACCEPTED before receipt");
          }
        },
      },
    );
    await assert.rejects(coordinator.syncOnce());

    assert.equal(firstResults[0]!.status, "ACCEPTED");
    assert.equal(mobile.stores.outbox.get(submissionId)?.state, "SUBMITTED");
    assert.equal(mobile.stores.checkpoint.get(serverReceiptKey(submissionId)), null);
    assert.equal(mobile.stores.outbox.pending().length, 0);
    assert.equal(mobile.stores.outbox.resumable().length, 1);

    closeMobile(mobile);
    const mobile2 = makeMobile(path);
    mobiles.push(mobile2);
    assert.equal(mobile2.stores.outbox.get(submissionId)?.state, "SUBMITTED");
    assert.equal(mobile2.stores.checkpoint.get(serverReceiptKey(submissionId)), null);

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
    assert.ok(mobile2.stores.checkpoint.get(serverReceiptKey(submissionId)));

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
  } finally {
    await disposeTestResources(mobiles, { path });
  }
});

test("pull propagates canonical roll to a second device", async () => {
  const mobiles: MobileHandle[] = [];
  try {
    const { roll, seeder } = await seedCanonical(app, 10);
    mobiles.push(seeder);

    const deviceB = makeMobile();
    mobiles.push(deviceB);
    const report = await coordinatorFor(deviceB, createInProcessTransport(app)).pull();
    assert.equal(report.applied, 1);

    const local = deviceB.stores.entities.get("Roll", roll.id) as Roll | null;
    assert.ok(local);
    assert.equal(local.id, roll.id);
    assert.equal(local.entity_version, roll.entity_version);
    assert.equal(local.pinfall, roll.pinfall);
    assert.ok(Number(deviceB.stores.checkpoint.get("change_cursor")) > 0);
  } finally {
    await disposeTestResources(mobiles);
  }
});

test("duplicate pull page is idempotent", async () => {
  const mobiles: MobileHandle[] = [];
  try {
    const { roll, seeder } = await seedCanonical(app, 10);
    mobiles.push(seeder);

    const deviceB = makeMobile();
    mobiles.push(deviceB);
    const coordinator = coordinatorFor(deviceB, createInProcessTransport(app));

    assert.equal((await coordinator.pull()).applied, 1);
    const v1 = (deviceB.stores.entities.get("Roll", roll.id) as Roll).entity_version;

    deviceB.stores.checkpoint.set("change_cursor", "0");
    const second = await coordinator.pull();
    assert.equal(second.applied, 0);
    assert.equal((deviceB.stores.entities.get("Roll", roll.id) as Roll).entity_version, v1);
  } finally {
    await disposeTestResources(mobiles);
  }
});

test("pull crash before commit rolls back entity, applied-change, and checkpoint", async () => {
  const mobiles: MobileHandle[] = [];
  try {
    const { roll, seeder, serverCursor } = await seedCanonical(app, 10);
    mobiles.push(seeder);
    assert.ok(serverCursor >= 1, "seed cursor identifies the applied change");
    const changeId = String(serverCursor);

    const deviceB = makeMobile();
    mobiles.push(deviceB);
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

    assert.equal(deviceB.stores.entities.get("Roll", roll.id), null);
    assert.equal(deviceB.stores.applied.isApplied(changeId), false);
    assert.equal(deviceB.stores.checkpoint.get("change_cursor") ?? "0", "0");

    const report = await coordinatorFor(deviceB, createInProcessTransport(app)).pull();
    assert.equal(report.applied, 1);
    assert.ok(deviceB.stores.entities.get("Roll", roll.id));
    assert.equal(deviceB.stores.applied.isApplied(changeId), true);
    assert.ok(Number(deviceB.stores.checkpoint.get("change_cursor")) > 0);
  } finally {
    await disposeTestResources(mobiles);
  }
});

test("pull resume after commit: no duplicate apply", async () => {
  const mobiles: MobileHandle[] = [];
  try {
    const { roll, seeder } = await seedCanonical(app, 10);
    mobiles.push(seeder);

    const deviceB = makeMobile();
    mobiles.push(deviceB);
    const coordinator = coordinatorFor(deviceB, createInProcessTransport(app));
    assert.equal((await coordinator.pull()).applied, 1);
    const v = (deviceB.stores.entities.get("Roll", roll.id) as Roll).entity_version;

    const again = await coordinatorFor(deviceB, createInProcessTransport(app)).pull();
    assert.equal(again.applied, 0);
    assert.equal((deviceB.stores.entities.get("Roll", roll.id) as Roll).entity_version, v);
  } finally {
    await disposeTestResources(mobiles);
  }
});

test("two-device conflict: A-first and B-first", async () => {
  for (const order of ["A-first", "B-first"] as const) {
    const mobiles: MobileHandle[] = [];
    try {
      await truncateAll();
      const { roll, seeder } = await seedCanonical(app, 10);
      mobiles.push(seeder);

      const deviceA = makeMobile();
      const deviceB = makeMobile();
      mobiles.push(deviceA, deviceB);
      const cA = coordinatorFor(deviceA, createInProcessTransport(app));
      const cB = coordinatorFor(deviceB, createInProcessTransport(app));

      await cA.pull();
      await cB.pull();
      makeStaleUpdate(deviceA, 6);
      makeStaleUpdate(deviceB, 7);

      const firstCoord = order === "A-first" ? cA : cB;
      const secondCoord = order === "A-first" ? cB : cA;

      const first = await firstCoord.syncOnce();
      assert.equal(first.pushed.confirmed, 1, `${order}: first confirmed`);
      assert.equal(first.pushed.conflicts, 0, `${order}: first not conflict`);

      const second = await secondCoord.syncOnce();
      assert.equal(second.pushed.conflicts, 1, `${order}: second conflicts`);
      assert.equal(second.pushed.confirmed, 0, `${order}: second not confirmed`);

      const row = await query<{ entity_version: number; n: string }>(
        "SELECT entity_version, count(*)::text AS n FROM canonical_entities WHERE entity_id = $1 GROUP BY entity_version",
        [roll.id],
      );
      assert.equal(row[0]!.entity_version, 2, `${order}`);
      assert.equal(Number(row[0]!.n), 1, `${order}`);

      const loser = order === "A-first" ? deviceB : deviceA;
      assert.equal(loser.stores.conflicts.list().length, 1, `${order}`);
      const loserRoll = loser.stores.entities.get("Roll", roll.id) as Roll;
      const expectedLoserPinfall = order === "A-first" ? 7 : 6;
      assert.equal(loserRoll.pinfall, expectedLoserPinfall, `${order}: local observation preserved`);
      assert.equal(loserRoll.entity_version, 2, `${order}`);
    } finally {
      await disposeTestResources(mobiles);
    }
  }
});

test("conflict survives restart with real stale version", async () => {
  const path = join(tmpdir(), `bowling-conflict-${uuidv7()}.db`);
  const mobiles: MobileHandle[] = [];
  try {
    const { roll, seeder } = await seedCanonical(app, 10);
    mobiles.push(seeder);

    const deviceB = makeMobile(path);
    mobiles.push(deviceB);
    const cB = coordinatorFor(deviceB, createInProcessTransport(app));
    await cB.pull();
    const bUpdate = makeStaleUpdate(deviceB, 4);

    const deviceC = makeMobile();
    mobiles.push(deviceC);
    const cC = coordinatorFor(deviceC, createInProcessTransport(app));
    await cC.pull();
    makeStaleUpdate(deviceC, 5);
    const cReport = await cC.syncOnce();
    assert.equal(cReport.pushed.confirmed, 1);

    const bReport = await cB.syncOnce();
    assert.equal(bReport.pushed.conflicts, 1);
    assert.equal(deviceB.stores.conflicts.list().length, 1);
    const conflictId = deviceB.stores.conflicts.list()[0]!.conflict_id;
    assert.equal((deviceB.stores.entities.get("Roll", roll.id) as Roll).pinfall, 4);

    assert.equal(deviceB.stores.outbox.get(bUpdate.submissionId)?.state, "CONFLICT");

    closeMobile(deviceB);
    closeMobile(deviceC);

    const deviceB2 = makeMobile(path);
    mobiles.push(deviceB2);
    const conflicts = deviceB2.stores.conflicts.list();
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]!.conflict_id, conflictId);
    assert.equal((deviceB2.stores.entities.get("Roll", roll.id) as Roll).pinfall, 4);
    assert.equal(deviceB2.stores.outbox.get(bUpdate.submissionId)?.state, "CONFLICT");
    assert.equal(deviceB2.stores.outbox.pending().length, 0);
    assert.equal(deviceB2.stores.outbox.resumable().length, 0);
  } finally {
    await disposeTestResources(mobiles, { path });
  }
});

test("conflict state crash rolls back both writes; replay records once", async () => {
  const path = join(tmpdir(), `bowling-conflict-atomic-${uuidv7()}.db`);
  const mobiles: MobileHandle[] = [];
  try {
    const { roll, seeder } = await seedCanonical(app, 10);
    mobiles.push(seeder);

    const deviceB = makeMobile(path);
    mobiles.push(deviceB);
    const cB = coordinatorFor(deviceB, createInProcessTransport(app));
    await cB.pull();
    const bUpdate = makeStaleUpdate(deviceB, 4);

    const deviceC = makeMobile();
    mobiles.push(deviceC);
    const cC = coordinatorFor(deviceC, createInProcessTransport(app));
    await cC.pull();
    makeStaleUpdate(deviceC, 5);
    assert.equal((await cC.syncOnce()).pushed.confirmed, 1);

    let fired = false;
    const firstResults: Array<{ status: string; submission_id: string }> = [];
    const crashing = coordinatorFor(
      deviceB,
      createInProcessTransport(app, { serverResults: firstResults }),
      {
        afterConflictStateBeforeRecord: () => {
          if (!fired) {
            fired = true;
            throw new Error("simulated crash after CONFLICT state before record");
          }
        },
      },
    );
    await assert.rejects(crashing.syncOnce());

    assert.equal(firstResults[0]!.status, "CONFLICT");
    assert.equal(deviceB.stores.outbox.get(bUpdate.submissionId)?.state, "SUBMITTED");
    assert.equal(deviceB.stores.conflicts.list().length, 0);
    assert.equal(deviceB.stores.outbox.pending().length, 0);
    assert.equal(deviceB.stores.outbox.resumable().length, 1);
    assert.equal((deviceB.stores.entities.get("Roll", roll.id) as Roll).pinfall, 4);

    closeMobile(deviceB);
    const deviceB2 = makeMobile(path);
    mobiles.push(deviceB2);
    assert.equal(deviceB2.stores.outbox.get(bUpdate.submissionId)?.state, "SUBMITTED");
    assert.equal(deviceB2.stores.conflicts.list().length, 0);
    assert.equal(deviceB2.stores.outbox.resumable().length, 1);

    const received2: string[] = [];
    const results2: Array<{ status: string; submission_id: string }> = [];
    const recovered = await coordinatorFor(
      deviceB2,
      createInProcessTransport(app, { receivedSubmissions: received2, serverResults: results2 }),
    ).syncOnce();
    assert.equal(recovered.pushed.conflicts, 1);
    assert.equal(recovered.pushed.confirmed, 0);
    assert.deepEqual(received2, [bUpdate.submissionId]);
    assert.equal(results2[0]!.status, "CONFLICT");
    assert.equal(deviceB2.stores.outbox.get(bUpdate.submissionId)?.state, "CONFLICT");
    assert.equal(deviceB2.stores.conflicts.list().length, 1);
    const conflictId = deviceB2.stores.conflicts.list()[0]!.conflict_id;
    assert.equal(deviceB2.stores.conflicts.list()[0]!.submission_id, bUpdate.submissionId);

    const replay = await coordinatorFor(deviceB2, createInProcessTransport(app)).syncOnce();
    assert.equal(replay.pushed.conflicts, 0);
    assert.equal(deviceB2.stores.conflicts.list().length, 1);
    assert.equal(deviceB2.stores.conflicts.list()[0]!.conflict_id, conflictId);

    const serverConflicts = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM sync_conflicts WHERE submission_id = $1",
      [bUpdate.submissionId],
    );
    assert.equal(Number(serverConflicts[0]!.n), 1);
  } finally {
    await disposeTestResources(mobiles, { path });
  }
});

test("rejected mutation row persists across restart", async () => {
  const path = join(tmpdir(), `bowling-rejected-${uuidv7()}.db`);
  const mobiles: MobileHandle[] = [];
  try {
    const mobile = makeMobile(path);
    mobiles.push(mobile);
    const { submissionId } = recordRoll(mobile, 99);
    const report = await coordinatorFor(mobile, createInProcessTransport(app)).syncOnce();
    assert.equal(report.pushed.rejected, 1);

    const entry = mobile.stores.outbox.get(submissionId);
    assert.ok(entry);
    assert.equal(entry.state, "REJECTED");

    closeMobile(mobile);

    const mobile2 = makeMobile(path);
    mobiles.push(mobile2);
    const entry2 = mobile2.stores.outbox.get(submissionId);
    assert.ok(entry2);
    assert.equal(entry2.state, "REJECTED");
    assert.equal(entry2.envelope.submission_id, submissionId);
    assert.equal(mobile2.stores.outbox.pending().length, 0);
    assert.equal(mobile2.stores.outbox.resumable().length, 0);
  } finally {
    await disposeTestResources(mobiles, { path });
  }
});

test("multiple offline outbox submissions converge without duplication", async () => {
  const mobiles: MobileHandle[] = [];
  try {
    const mobile = makeMobile();
    mobiles.push(mobile);
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
  } finally {
    await disposeTestResources(mobiles);
  }
});

test("server restart with pending mobile outbox preserves data", async () => {
  const mobiles: MobileHandle[] = [];
  let app2: BowlingApplication | undefined;
  try {
    await truncateAll();
    app2 = buildApplication(testConfig(), nullLogger);
    await app2.initialize();

    const mobile = makeMobile();
    mobiles.push(mobile);
    const { roll, submissionId } = recordRoll(mobile);

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
  } finally {
    await disposeTestResources(mobiles, { app: app2 });
  }
});
