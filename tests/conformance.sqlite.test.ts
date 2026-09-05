import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runSqliteConformance,
  SQLITE_CONFORMANCE_CASE_COUNT,
} from "../src/persistence/sqlite/conformance.ts";
import { openDatabase } from "../src/index.ts";
import { openMobileAdapterDatabase } from "./support/nodeExpoBinding.ts";
import {
  loadSqlJs,
  openSqlJsDatabaseSync,
  removeSqlJsDatabase,
} from "./support/sqlJsDriver.ts";

function fileInTmp(filename: string): string {
  if (filename === ":memory:") return filename;
  return join(tmpdir(), filename);
}

function assertReport(
  label: string,
  report: ReturnType<typeof runSqliteConformance>,
): void {
  const failures = report.results.filter((r) => !r.ok);
  assert.equal(
    report.failed,
    0,
    `${label} failures:\n${failures.map((f) => `- ${f.name}: ${f.error}`).join("\n")}`,
  );
  assert.equal(report.passed, SQLITE_CONFORMANCE_CASE_COUNT);
}

test("NODE_SQLITE_CONFORMANCE", () => {
  const report = runSqliteConformance({
    adapterName: "node:sqlite",
    open: (filename) => openDatabase(fileInTmp(filename)),
    remove: (filename) => {
      const path = fileInTmp(filename);
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    },
  });
  assertReport("node:sqlite", report);
});

test("SQLJS_CONFORMANCE", async () => {
  await loadSqlJs();
  const report = runSqliteConformance({
    adapterName: "sql.js",
    open: (filename) => openSqlJsDatabaseSync(fileInTmp(filename)),
    remove: (filename) => removeSqlJsDatabase(fileInTmp(filename)),
  });
  assertReport("sql.js", report);
});

test("expo-sqlite binding shape over node:sqlite still matches the suite", () => {
  const report = runSqliteConformance({
    adapterName: "expo-binding-over-node",
    open: (filename) => openMobileAdapterDatabase(fileInTmp(filename)),
    remove: (filename) => {
      const path = fileInTmp(filename);
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    },
  });
  assertReport("expo-binding-over-node", report);
});
