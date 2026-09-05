/**
 * Adapter-neutral SQLite conformance suite.
 *
 * One set of expectations, executed against Node, sql.js, and expo-sqlite
 * factories. Failures throw. The runner records pass/fail per case.
 */
import {
  DuplicateCorrectionError,
  TargetEntityNotFoundError,
} from "../../correction.ts";
import { StaleEntityVersionError } from "../../versioning.ts";
import { createCorrection } from "../../correction.ts";
import { newEntityMetadata } from "../../metadata.ts";
import { newFrameId, newRollId } from "../../identity/ids.ts";
import { isUuidv7, uuidv7 } from "../../identity/uuidv7.ts";
import { assertSecureRandomAvailable } from "../../platform/random.ts";
import { assertUuidv7RuntimeSupport } from "../../identity/runtime.ts";
import { canonicalize, hashPayload } from "../../sync/hashing.ts";
import { sha256Utf8Hex } from "../../platform/sha256.ts";
import { deriveSyncPresentation } from "../../sync/presentation.ts";
import type { Roll } from "../../entities.ts";
import type { SqliteDriver } from "./driver.ts";
import { applyMigrations, CURRENT_SCHEMA_VERSION } from "./migrate.ts";
import { MIGRATIONS } from "./migrations.ts";
import { prepareDatabase } from "./database.ts";
import { applyLocalMutation } from "./localMutation.ts";
import { applyCorrection } from "./applyCorrection.ts";
import { injectedFailure } from "./faults.ts";
import { createEntityStore } from "./entityStore.ts";
import { createOutboxStore } from "./outboxStore.ts";
import { createDeviceStore } from "./deviceStore.ts";
import { createCheckpointStore } from "./checkpointStore.ts";
import { createCorrectionStore } from "./correctionStore.ts";
import { initializeApplication } from "../startup.ts";
import { recoverAfterLifecycle } from "../lifecycle.ts";

export interface ConformanceFactory {
  adapterName: string;
  open: (filename: string) => SqliteDriver;
  remove?: (filename: string) => void;
}

export interface ConformanceCaseResult {
  name: string;
  ok: boolean;
  error?: string;
}

export interface ConformanceReport {
  adapterName: string;
  passed: number;
  failed: number;
  results: ConformanceCaseResult[];
}

const DEVICE = "device-conformance-0001";

function makeRoll(overrides: Partial<Roll> = {}): Roll {
  const base: Roll = {
    ...newEntityMetadata({ id: newRollId(), origin_device_id: DEVICE }),
    entity_type: "Roll",
    frame_id: newFrameId(),
    roll_number: 1,
    pinfall: 10,
  };
  return { ...base, ...overrides };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function eq(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function withDb(factory: ConformanceFactory, filename: string, fn: (db: SqliteDriver) => void): void {
  const db = factory.open(filename);
  try {
    fn(db);
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}

function uniqueFile(prefix: string): string {
  return `${prefix}-${uuidv7()}.db`;
}

type Case = { name: string; run: (factory: ConformanceFactory) => void };

function cases(): Case[] {
  return [
    {
      name: "schema creation and version",
      run(factory) {
        withDb(factory, ":memory:", (db) => {
          const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get();
          eq(Number(row?.v), CURRENT_SCHEMA_VERSION, "schema version");
        });
      },
    },
    {
      name: "canonical entity insert/read",
      run(factory) {
        withDb(factory, ":memory:", (db) => {
          const roll = makeRoll();
          applyLocalMutation(db, {
            deviceId: DEVICE,
            operation: "CREATE",
            entity: roll,
            expectedEntityVersion: 0,
          });
          const stored = createEntityStore(db).get("Roll", roll.id);
          assert(stored, "entity missing");
          eq(stored.entity_version, 1, "entity_version");
        });
      },
    },
    {
      name: "transaction commit writes entity and outbox",
      run(factory) {
        withDb(factory, ":memory:", (db) => {
          const roll = makeRoll();
          const result = applyLocalMutation(db, {
            deviceId: DEVICE,
            operation: "CREATE",
            entity: roll,
            expectedEntityVersion: 0,
          });
          const entry = createOutboxStore(db).get(result.envelope.submission_id);
          assert(entry, "outbox missing");
          eq(entry.state, "QUEUED", "outbox state");
          eq(entry.envelope.operation_type, "CREATE", "operation");
        });
      },
    },
    {
      name: "crash window A: failure before BEGIN writes nothing",
      run(factory) {
        withDb(factory, ":memory:", (db) => {
          const roll = makeRoll();
          let threw = false;
          try {
            applyLocalMutation(
              db,
              {
                deviceId: DEVICE,
                operation: "CREATE",
                entity: roll,
                expectedEntityVersion: 0,
              },
              { beforeBegin: () => { throw injectedFailure("before_begin"); } },
            );
          } catch {
            threw = true;
          }
          assert(threw, "expected injected failure");
          eq(createEntityStore(db).get("Roll", roll.id), null, "canonical");
          eq(createOutboxStore(db).pending().length, 0, "outbox");
        });
      },
    },
    {
      name: "crash window B: failure after canonical rolls back both",
      run(factory) {
        withDb(factory, ":memory:", (db) => {
          const roll = makeRoll();
          let threw = false;
          try {
            applyLocalMutation(
              db,
              {
                deviceId: DEVICE,
                operation: "CREATE",
                entity: roll,
                expectedEntityVersion: 0,
              },
              { afterCanonicalWrite: () => { throw injectedFailure("after_canonical"); } },
            );
          } catch {
            threw = true;
          }
          assert(threw, "expected injected failure");
          eq(createEntityStore(db).get("Roll", roll.id), null, "canonical");
          eq(createOutboxStore(db).pending().length, 0, "outbox");
        });
      },
    },
    {
      name: "crash window C: failure after outbox rolls back both",
      run(factory) {
        withDb(factory, ":memory:", (db) => {
          const roll = makeRoll();
          let threw = false;
          try {
            applyLocalMutation(
              db,
              {
                deviceId: DEVICE,
                operation: "CREATE",
                entity: roll,
                expectedEntityVersion: 0,
              },
              { afterOutboxInsert: () => { throw injectedFailure("after_outbox"); } },
            );
          } catch {
            threw = true;
          }
          assert(threw, "expected injected failure");
          eq(createEntityStore(db).get("Roll", roll.id), null, "canonical");
          eq(createOutboxStore(db).pending().length, 0, "outbox");
        });
      },
    },
    {
      name: "crash window D: commit then reopen keeps entity, outbox, submission id",
      run(factory) {
        const file = uniqueFile("cw-d");
        try {
          let submissionId = "";
          let entityId = "";
          withDb(factory, file, (db) => {
            const roll = makeRoll();
            entityId = roll.id;
            const result = applyLocalMutation(db, {
              deviceId: DEVICE,
              operation: "CREATE",
              entity: roll,
              expectedEntityVersion: 0,
            });
            submissionId = result.envelope.submission_id;
          });
          withDb(factory, file, (db) => {
            assert(createEntityStore(db).get("Roll", entityId), "entity after reopen");
            const entry = createOutboxStore(db).get(submissionId);
            assert(entry, "outbox after reopen");
            eq(entry.envelope.submission_id, submissionId, "submission id");
          });
        } finally {
          factory.remove?.(file);
        }
      },
    },
    {
      name: "crash window E: correction audit failure rolls back everything",
      run(factory) {
        withDb(factory, ":memory:", (db) => {
          const roll = makeRoll();
          applyLocalMutation(db, {
            deviceId: DEVICE,
            operation: "CREATE",
            entity: roll,
            expectedEntityVersion: 0,
          });
          const before = createEntityStore(db).get("Roll", roll.id);
          assert(before, "seed");
          const pendingBefore = createOutboxStore(db).pending().length;
          const correction = createCorrection({
            target_entity_type: "Roll",
            target_entity_id: roll.id,
            prior_entity_version: 1,
            corrected_representation: { pinfall: 3 },
            reason: "injected",
            actor: "suite",
            origin_device_id: DEVICE,
          });
          let threw = false;
          try {
            applyCorrection(
              db,
              { correction, deviceId: DEVICE },
              { afterCorrectionRecord: () => { throw injectedFailure("after_correction"); } },
            );
          } catch {
            threw = true;
          }
          assert(threw, "expected injected failure");
          eq(createCorrectionStore(db).get(correction.id), null, "correction audit");
          const after = createEntityStore(db).get("Roll", roll.id);
          eq(after?.entity_version, before.entity_version, "target version");
          eq(createOutboxStore(db).pending().length, pendingBefore, "outbox");
        });
      },
    },
    {
      name: "correction success: version, quality, audit, CORRECT outbox",
      run(factory) {
        withDb(factory, ":memory:", (db) => {
          const roll = makeRoll();
          applyLocalMutation(db, {
            deviceId: DEVICE,
            operation: "CREATE",
            entity: roll,
            expectedEntityVersion: 0,
          });
          const correction = createCorrection({
            target_entity_type: "Roll",
            target_entity_id: roll.id,
            prior_entity_version: 1,
            corrected_representation: { pinfall: 7 },
            reason: "recount",
            actor: "suite",
            origin_device_id: DEVICE,
          });
          const result = applyCorrection(db, { correction, deviceId: DEVICE });
          const updated = createEntityStore(db).get("Roll", roll.id) as Roll | null;
          eq(updated?.pinfall, 7, "pinfall");
          eq(updated?.entity_version, 2, "version");
          eq(updated?.data_quality, "CORRECTED", "quality");
          eq(updated?.id, roll.id, "immutable id");
          eq(updated?.origin_device_id, roll.origin_device_id, "immutable origin");
          assert(createCorrectionStore(db).get(correction.id), "audit");
          eq(
            createOutboxStore(db).get(result.envelope.submission_id)?.envelope.operation_type,
            "CORRECT",
            "outbox op",
          );
        });
      },
    },
    {
      name: "correction rejects stale, missing, and duplicate",
      run(factory) {
        withDb(factory, ":memory:", (db) => {
          const roll = makeRoll();
          applyLocalMutation(db, {
            deviceId: DEVICE,
            operation: "CREATE",
            entity: roll,
            expectedEntityVersion: 0,
          });
          const good = createCorrection({
            target_entity_type: "Roll",
            target_entity_id: roll.id,
            prior_entity_version: 1,
            corrected_representation: { pinfall: 6 },
            reason: "ok",
            actor: "suite",
            origin_device_id: DEVICE,
          });
          applyCorrection(db, { correction: good, deviceId: DEVICE });

          const stale = createCorrection({
            target_entity_type: "Roll",
            target_entity_id: roll.id,
            prior_entity_version: 1,
            corrected_representation: { pinfall: 5 },
            reason: "stale",
            actor: "suite",
            origin_device_id: DEVICE,
          });
          let staleThrew = false;
          try {
            applyCorrection(db, { correction: stale, deviceId: DEVICE });
          } catch (err) {
            staleThrew = err instanceof StaleEntityVersionError;
          }
          assert(staleThrew, "stale");

          let dupThrew = false;
          try {
            applyCorrection(db, { correction: good, deviceId: DEVICE });
          } catch (err) {
            dupThrew = err instanceof DuplicateCorrectionError;
          }
          assert(dupThrew, "duplicate");

          const missing = createCorrection({
            target_entity_type: "Roll",
            target_entity_id: uuidv7(),
            prior_entity_version: 1,
            corrected_representation: { pinfall: 1 },
            reason: "missing",
            actor: "suite",
            origin_device_id: DEVICE,
          });
          let missingThrew = false;
          try {
            applyCorrection(db, { correction: missing, deviceId: DEVICE });
          } catch (err) {
            missingThrew = err instanceof TargetEntityNotFoundError;
          }
          assert(missingThrew, "missing target");
        });
      },
    },
    {
      name: "device identity, checkpoint, and reopen persistence",
      run(factory) {
        const file = uniqueFile("reopen");
        try {
          let deviceId = "";
          let entityId = "";
          withDb(factory, file, (db) => {
            const identity = createDeviceStore(db).getOrCreate();
            deviceId = identity.device_id;
            assert(isUuidv7(deviceId), "device id is UUIDv7");
            const roll = makeRoll();
            entityId = roll.id;
            applyLocalMutation(db, {
              deviceId,
              operation: "CREATE",
              entity: roll,
              expectedEntityVersion: 0,
            });
            createCheckpointStore(db).set("last_pull_cursor", "cursor-native-1");
          });
          withDb(factory, file, (db) => {
            eq(createDeviceStore(db).getOrCreate().device_id, deviceId, "device id");
            assert(createEntityStore(db).get("Roll", entityId), "entity");
            eq(createOutboxStore(db).pending().length, 1, "outbox");
            eq(createCheckpointStore(db).get("last_pull_cursor"), "cursor-native-1", "checkpoint");
          });
        } finally {
          factory.remove?.(file);
        }
      },
    },
    {
      name: "initialization sequence and lifecycle recovery from persistence",
      run(factory) {
        const file = uniqueFile("init");
        try {
          const first = factory.open(file);
          const launched = initializeApplication({
            openDriver: () => first,
            network: "unavailable",
          });
          assert(launched.ok, launched.ok ? "ok" : launched.message);
          if (!launched.ok) throw new Error("init failed");
          eq(launched.schemaVersion, CURRENT_SCHEMA_VERSION, "schema");
          const roll = makeRoll();
          applyLocalMutation(first, {
            deviceId: launched.device.device_id,
            operation: "CREATE",
            entity: roll,
            expectedEntityVersion: 0,
          });
          first.close();

          const second = factory.open(file);
          const recovered = recoverAfterLifecycle("process_restart", {
            openDriver: () => second,
            network: "unavailable",
          });
          assert(recovered.ok, recovered.ok ? "ok" : recovered.message);
          if (!recovered.ok) throw new Error("recover failed");
          eq(recovered.device.device_id, launched.device.device_id, "device id");
          assert(recovered.localChangesPending, "pending");
          eq(recovered.presentation.nasAccepted, false, "no fake sync");
          assert(
            recovered.presentation.headline !== "synced",
            "must not present Synced without NAS",
          );

          const foreground = recoverAfterLifecycle("foreground", {
            openDriver: () => second,
            openDriverIfAlive: () => second,
            network: "unavailable",
          });
          assert(foreground.ok, "foreground");
          if (!foreground.ok) throw new Error("foreground recover failed");
          eq(foreground.device.device_id, launched.device.device_id, "fg device");

          const background = recoverAfterLifecycle("background", {
            openDriver: () => second,
            openDriverIfAlive: () => second,
            network: "unavailable",
          });
          assert(background.ok, "background");
          if (!background.ok) throw new Error("background recover failed");
          eq(background.device.device_id, launched.device.device_id, "bg device");
          second.close();
        } finally {
          factory.remove?.(file);
        }
      },
    },
    {
      name: "airplane / network-unavailable local operation is not data loss",
      run(factory) {
        const file = uniqueFile("air");
        try {
          const first = factory.open(file);
          const launched = initializeApplication({
            openDriver: () => first,
            network: "unavailable",
          });
          assert(launched.ok, "init");
          if (!launched.ok) throw new Error("init failed");
          applyLocalMutation(first, {
            deviceId: launched.device.device_id,
            operation: "CREATE",
            entity: makeRoll(),
            expectedEntityVersion: 0,
          });
          first.close();
          const second = factory.open(file);
          const reopened = initializeApplication({
            openDriver: () => second,
            network: "unavailable",
          });
          assert(reopened.ok, "reopen");
          if (!reopened.ok) throw new Error("reopen failed");
          eq(reopened.device.device_id, launched.device.device_id, "device");
          assert(reopened.localChangesPending, "outbox");
          eq(reopened.presentation.headline, "sync_temporarily_unavailable", "headline");
          assert(!reopened.presentation.label.toLowerCase().includes("lost"), "no data-lost copy");
          eq(reopened.presentation.nasAccepted, false, "not synced");
          second.close();
        } finally {
          factory.remove?.(file);
        }
      },
    },
    {
      name: "sync presentation enumerations and fake-sync prohibition",
      run() {
        const labels = deriveSyncPresentation([], { network: "available" });
        eq(labels.headline, "saved_locally", "empty");
        eq(labels.nasAccepted, false, "nas");
        const queued = deriveSyncPresentation(
          [
            {
              seq: 1,
              envelope: {
                protocol_version: 1,
                submission_id: "s",
                device_id: "d",
                entity_type: "Roll",
                entity_id: "e",
                operation_type: "CREATE",
                expected_entity_version: 0,
                payload: {},
                payload_hash: "h",
                created_at: "2026-01-01T00:00:00.000Z",
              },
              state: "QUEUED",
              submitted_at: null,
              last_error: null,
              retry_count: 0,
            },
          ],
          { network: "available" },
        );
        eq(queued.headline, "waiting_to_sync", "waiting");
        const synced = deriveSyncPresentation([], { nasAccepted: true });
        eq(synced.headline, "synced", "only with nasAccepted");
      },
    },
    {
      name: "UUIDv7 runtime: BigInt, CSPRNG, format, uniqueness",
      run() {
        assertUuidv7RuntimeSupport();
        assertSecureRandomAvailable();
        const ids = new Set<string>();
        for (let i = 0; i < 200; i += 1) {
          const id = uuidv7();
          assert(isUuidv7(id), `invalid ${id}`);
          ids.add(id);
        }
        eq(ids.size, 200, "unique");
      },
    },
    {
      name: "payload hash parity vectors",
      run() {
        eq(
          sha256Utf8Hex(""),
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "empty",
        );
        eq(
          sha256Utf8Hex("abc"),
          "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
          "abc",
        );
        eq(
          hashPayload({ y: [1, 2], x: 1 }),
          hashPayload({ x: 1, y: [1, 2] }),
          "key order",
        );
        eq(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}', "canonical");
      },
    },
    {
      name: "migration failure retains existing data and does not recreate",
      run(factory) {
        const file = uniqueFile("migfail");
        try {
          withDb(factory, file, (db) => {
            const roll = makeRoll();
            applyLocalMutation(db, {
              deviceId: DEVICE,
              operation: "CREATE",
              entity: roll,
              expectedEntityVersion: 0,
            });
            const failing = [
              ...MIGRATIONS,
              {
                version: CURRENT_SCHEMA_VERSION + 99,
                name: "boom",
                sql: "THIS IS NOT SQL;",
              },
            ];
            const outcome = applyMigrations(db, { migrations: failing });
            assert(!outcome.ok, "expected migration failure");
            if (outcome.ok) throw new Error("migration should have failed");
            eq(outcome.retainedExistingDatabase, true, "retained");
            eq(outcome.code, "DATABASE_MIGRATION_FAILED", "code");
            assert(createEntityStore(db).get("Roll", roll.id), "entity retained");
            eq(
              Number(db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get()?.v),
              CURRENT_SCHEMA_VERSION,
              "schema version unchanged",
            );
          });
        } finally {
          factory.remove?.(file);
        }
      },
    },
    {
      name: "prepareDatabase initializes empty schema once",
      run(factory) {
        const db = factory.open(":memory:");
        try {
          const again = prepareDatabase(db);
          assert(again.ok, again.ok ? "ok" : again.message);
          if (again.ok) eq(again.schemaVersion, CURRENT_SCHEMA_VERSION, "version");
        } finally {
          db.close();
        }
      },
    },
  ];
}

export function runSqliteConformance(factory: ConformanceFactory): ConformanceReport {
  const results: ConformanceCaseResult[] = [];
  for (const testCase of cases()) {
    try {
      testCase.run(factory);
      results.push({ name: testCase.name, ok: true });
    } catch (err) {
      results.push({
        name: testCase.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return {
    adapterName: factory.adapterName,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export const SQLITE_CONFORMANCE_CASE_COUNT = cases().length;
