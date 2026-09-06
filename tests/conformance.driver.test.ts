import test from "node:test";
import assert from "node:assert/strict";
import { createNodeSqliteDriver, prepareDatabase, CURRENT_SCHEMA_VERSION } from "../src/index.ts";

test("raw node driver + prepareDatabase is equivalent to openDatabase", () => {
  const driver = createNodeSqliteDriver(":memory:");
  const outcome = prepareDatabase(driver);
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(outcome.initializedEmptySchema, true);
  }
  driver.close();
});
