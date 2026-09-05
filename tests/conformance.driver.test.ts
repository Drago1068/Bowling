import test from "node:test";
import assert from "node:assert/strict";
import { createNodeSqliteDriver, prepareDatabase } from "../src/index.ts";

test("raw node driver + prepareDatabase is equivalent to openDatabase", () => {
  const driver = createNodeSqliteDriver(":memory:");
  const outcome = prepareDatabase(driver);
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.schemaVersion, 1);
    assert.equal(outcome.initializedEmptySchema, true);
  }
  driver.close();
});
