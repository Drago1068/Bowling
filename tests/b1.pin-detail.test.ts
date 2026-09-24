/**
 * ADR-008 B1 pin-detail acceptance scenarios (local SQLite).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import {
  openSqlJsDatabase,
  removeSqlJsDatabase,
  loadSqlJs,
} from "./support/sqlJsDriver.ts";
import {
  applyMigrations,
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
} from "../src/persistence/sqlite/migrate.ts";
import { prepareDatabase } from "../src/persistence/sqlite/database.ts";
import { createNodeSqliteDriver } from "../src/index.ts";
import { createEntityStore } from "../src/persistence/sqlite/entityStore.ts";
import { createOutboxStore } from "../src/persistence/sqlite/outboxStore.ts";
import { injectedFailure } from "../src/persistence/sqlite/faults.ts";
import { newPinStateId, newRollId } from "../src/identity/ids.ts";
import {
  addPinDetail,
  correctPinDetail,
  correctRoll,
  loadScoringView,
  recordRoll,
  removePinDetail,
  readdPinDetail,
  startGame,
} from "../src/scoring/session.ts";
import { applyLocalMutations } from "../src/persistence/sqlite/localMutation.ts";
import { handlePinStatePullAssociation } from "../src/sync/coordinator.ts";
import { createConflictStore } from "../src/persistence/sqlite/conflictStore.ts";
import type { PinState } from "../src/entities.ts";
import { newEntityMetadata } from "../src/metadata.ts";
import { TEST_DEVICE_ID } from "./helpers.ts";

function tmpDb(label: string): string {
  return join(tmpdir(), `bowling-b1-${label}-${newRollId()}.db`);
}

describe("B1 pin detail", () => {
  it("migration success reaches schema v3", async () => {
    await loadSqlJs();
    const path = tmpDb("mig-ok");
    try {
      const db = await openSqlJsDatabase(path);
      assert.equal(CURRENT_SCHEMA_VERSION, 3);
      const v = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as {
        v: number;
      };
      assert.equal(Number(v.v), 3);
      db.close();
    } finally {
      removeSqlJsDatabase(path);
    }
  });

  it("migration precheck failure preserves duplicate rows", async () => {
    await loadSqlJs();
    const path = tmpDb("mig-fail");
    try {
      const upto2 = MIGRATIONS.filter((m) => m.version <= 2);
      const { createSqlJsDriver } = await import("../src/persistence/sqlite/sqlJsDriver.ts");
      const initSqlJs = (await import("sql.js")).default;
      const { readFileSync } = await import("node:fs");
      const { createRequire } = await import("node:module");
      const require = createRequire(import.meta.url);
      const wasmBinary = new Uint8Array(
        readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm")),
      ).buffer;
      const SQL = await initSqlJs({ wasmBinary });
      const raw = new SQL.Database();
      const d2 = createSqlJsDriver(raw, { persist: () => undefined });
      const ok2 = applyMigrations(d2, { migrations: upto2 });
      assert.equal(ok2.ok, true);
      const roll = "018f0000-0000-7000-8000-00000000aaaa";
      const payload = (id: string) =>
        JSON.stringify({
          id,
          entity_type: "PinState",
          roll_id: roll,
          standing_pins: [1],
          basis_roll_version: 1,
          entity_version: 1,
          schema_version: 1,
          data_quality: "UNKNOWN",
          origin_device_id: TEST_DEVICE_ID,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      for (const id of [
        "018f0000-0000-7000-8000-00000000bbb1",
        "018f0000-0000-7000-8000-00000000bbb2",
      ]) {
        d2.prepare(
          `INSERT INTO canonical_entities
            (id, entity_type, entity_version, schema_version, data_quality, origin_device_id, created_at, updated_at, archived, payload)
           VALUES (?, 'PinState', 1, 1, 'UNKNOWN', ?, datetime('now'), datetime('now'), 0, ?)`,
        ).run(id, TEST_DEVICE_ID, payload(id));
      }
      const fail = applyMigrations(d2, { migrations: MIGRATIONS });
      assert.equal(fail.ok, false);
      const count = d2
        .prepare(`SELECT COUNT(*) AS c FROM canonical_entities WHERE entity_type='PinState'`)
        .get() as { c: number };
      assert.equal(Number(count.c), 2);
      const ver = d2.prepare(`SELECT MAX(version) AS v FROM schema_migrations`).get() as {
        v: number;
      };
      assert.equal(Number(ver.v), 2);
      void path;
    } finally {
      removeSqlJsDatabase(path);
    }
  });

  it("pinfall-only save and unknown vs empty detail", async () => {
    await loadSqlJs();
    const path = tmpDb("pinfall");
    try {
      const db = await openSqlJsDatabase(path);
      const gameId = startGame(db, TEST_DEVICE_ID);
      assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 7).ok, true);
      let view = loadScoringView(db, gameId);
      assert.equal(view.rolls[0]!.pin_detail_status, "NOT_RECORDED");

      assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 2, { kind: "omit" }).ok, true);
      view = loadScoringView(db, gameId);
      assert.equal(view.rolls[1]!.pin_detail_status, "NOT_RECORDED");

      const g2 = startGame(db, TEST_DEVICE_ID);
      assert.equal(
        recordRoll(db, TEST_DEVICE_ID, g2, 10, { kind: "record", standing_pins: [] }).ok,
        true,
      );
      view = loadScoringView(db, g2);
      assert.equal(view.rolls[0]!.pin_detail_status, "EFFECTIVE");
      assert.deepEqual(view.rolls[0]!.standing_pins, []);
      db.close();
    } finally {
      removeSqlJsDatabase(path);
    }
  });

  it("atomic local save rollback", () => {
    const path = join(tmpdir(), `bowling-b1-atomic-node-${newRollId()}.db`);
    try {
      const db = createNodeSqliteDriver(path);
      const outcome = prepareDatabase(db);
      assert.equal(outcome.ok, true);
      const gameId = startGame(db, TEST_DEVICE_ID);
      const rollId = newRollId();
      const pinId = newPinStateId();
      const frame = createEntityStore(db)
        .list("Frame")
        .find(
          (f) =>
            (f as { game_id: string }).game_id === gameId &&
            (f as { frame_number: number }).frame_number === 1,
        ) as { id: string };
      assert.throws(() => {
        applyLocalMutations(
          db,
          [
            {
              deviceId: TEST_DEVICE_ID,
              operation: "CREATE",
              expectedEntityVersion: 0,
              entity: {
                ...newEntityMetadata({ id: rollId, origin_device_id: TEST_DEVICE_ID }),
                entity_type: "Roll",
                frame_id: frame.id,
                roll_number: 1,
                pinfall: 9,
              } as never,
            },
            {
              deviceId: TEST_DEVICE_ID,
              operation: "CREATE",
              expectedEntityVersion: 0,
              entity: {
                ...newEntityMetadata({ id: pinId, origin_device_id: TEST_DEVICE_ID }),
                entity_type: "PinState",
                roll_id: rollId,
                basis_roll_version: 1,
                standing_pins: [10],
              } as never,
            },
          ],
          { afterCanonicalWrite: () => { throw injectedFailure("after roll"); } },
        );
      });
      assert.equal(createEntityStore(db).get("Roll", rollId), null);
      assert.equal(createEntityStore(db).get("PinState", pinId), null);
      assert.equal(
        createOutboxStore(db)
          .pending()
          .filter((e) => e.envelope.entity_id === rollId || e.envelope.entity_id === pinId)
          .length,
        0,
      );
      db.close();
    } finally {
      for (const t of [path, `${path}-wal`, `${path}-shm`]) {
        try {
          rmSync(t, { force: true });
        } catch {
          /* ignore */
        }
      }
    }
  });

  it("add correct remove readd pin detail", async () => {
    await loadSqlJs();
    const path = tmpDb("crud");
    try {
      const db = await openSqlJsDatabase(path);
      const gameId = startGame(db, TEST_DEVICE_ID);
      assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 9).ok, true);
      const rollId = loadScoringView(db, gameId).rolls[0]!.entity_id;
      assert.equal(addPinDetail(db, TEST_DEVICE_ID, rollId, [10]).ok, true);
      let view = loadScoringView(db, gameId);
      assert.equal(view.rolls[0]!.pin_detail_status, "EFFECTIVE");
      const psId = view.rolls[0]!.pin_state_id!;
      assert.equal(correctPinDetail(db, TEST_DEVICE_ID, psId, [7, 10]).ok, false);
      assert.equal(removePinDetail(db, TEST_DEVICE_ID, rollId).ok, true);
      view = loadScoringView(db, gameId);
      assert.equal(view.rolls[0]!.pin_detail_status, "NOT_RECORDED");
      assert.equal(readdPinDetail(db, TEST_DEVICE_ID, rollId, [10]).ok, true);
      view = loadScoringView(db, gameId);
      assert.equal(view.rolls[0]!.pin_detail_status, "EFFECTIVE");
      assert.notEqual(view.rolls[0]!.pin_state_id, psId);
      db.close();
    } finally {
      removeSqlJsDatabase(path);
    }
  });

  it("tenth frame 10,9,1 remaining rack for detail", async () => {
    await loadSqlJs();
    const path = tmpDb("tenth");
    try {
      const db = await openSqlJsDatabase(path);
      const gameId = startGame(db, TEST_DEVICE_ID);
      for (let i = 0; i < 9; i++) {
        assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 10).ok, true);
      }
      assert.equal(
        recordRoll(db, TEST_DEVICE_ID, gameId, 10, { kind: "record", standing_pins: [] }).ok,
        true,
      );
      assert.equal(
        recordRoll(db, TEST_DEVICE_ID, gameId, 9, { kind: "record", standing_pins: [10] }).ok,
        true,
      );
      assert.equal(
        recordRoll(db, TEST_DEVICE_ID, gameId, 1, { kind: "record", standing_pins: [] }).ok,
        true,
      );
      const view = loadScoringView(db, gameId);
      const tenth = view.rolls.filter((r) => r.frame_number === 10);
      assert.equal(tenth.length, 3);
      assert.equal(tenth[2]!.pin_detail_status, "EFFECTIVE");
      db.close();
    } finally {
      removeSqlJsDatabase(path);
    }
  });

  it("roll correction leaves pin detail stale", async () => {
    await loadSqlJs();
    const path = tmpDb("stale");
    try {
      const db = await openSqlJsDatabase(path);
      const gameId = startGame(db, TEST_DEVICE_ID);
      assert.equal(
        recordRoll(db, TEST_DEVICE_ID, gameId, 8, {
          kind: "record",
          standing_pins: [9, 10],
        }).ok,
        true,
      );
      const rollId = loadScoringView(db, gameId).rolls[0]!.entity_id;
      assert.equal(correctRoll(db, TEST_DEVICE_ID, rollId, 7).ok, true);
      const view = loadScoringView(db, gameId);
      assert.equal(view.rolls[0]!.pin_detail_status, "STALE_DETAIL");
      db.close();
    } finally {
      removeSqlJsDatabase(path);
    }
  });

  it("pull association conflict keeps local and records remote", async () => {
    await loadSqlJs();
    const path = tmpDb("pull");
    try {
      const db = await openSqlJsDatabase(path);
      const gameId = startGame(db, TEST_DEVICE_ID);
      assert.equal(
        recordRoll(db, TEST_DEVICE_ID, gameId, 9, { kind: "record", standing_pins: [10] }).ok,
        true,
      );
      const local = loadScoringView(db, gameId).rolls[0]!;
      const remoteId = newPinStateId();
      const remote: PinState = {
        ...newEntityMetadata({ id: remoteId, origin_device_id: TEST_DEVICE_ID }),
        entity_type: "PinState",
        roll_id: local.entity_id as never,
        basis_roll_version: 1,
        standing_pins: [8],
      };
      const stores = {
        entities: createEntityStore(db),
        conflicts: createConflictStore(db),
      };
      const result = handlePinStatePullAssociation(
        stores,
        {
          change_seq: 42,
          entity_type: "PinState",
          entity_id: remoteId,
          entity_version: 1,
          payload: remote,
          origin_device_id: TEST_DEVICE_ID,
        } as never,
        new Date().toISOString(),
      );
      assert.equal(result, "association_conflict");
      assert.equal(stores.conflicts.list().length, 1);
      assert.equal((stores.conflicts.list()[0]!.local_payload as PinState).id, remoteId);
      assert.ok(stores.entities.get("PinState", local.pin_state_id!));
      assert.equal(stores.entities.get("PinState", remoteId), null);
      db.close();
    } finally {
      removeSqlJsDatabase(path);
    }
  });

  it("restart persistence of pin detail", async () => {
    await loadSqlJs();
    const path = tmpDb("restart");
    try {
      const db = await openSqlJsDatabase(path);
      const gameId = startGame(db, TEST_DEVICE_ID);
      recordRoll(db, TEST_DEVICE_ID, gameId, 6, {
        kind: "record",
        standing_pins: [7, 8, 9, 10],
      });
      db.close();
      const db2 = await openSqlJsDatabase(path);
      const view = loadScoringView(db2, gameId);
      assert.equal(view.rolls[0]!.pin_detail_status, "EFFECTIVE");
      assert.deepEqual(view.rolls[0]!.standing_pins, [7, 8, 9, 10]);
      db2.close();
    } finally {
      removeSqlJsDatabase(path);
    }
  });
});
