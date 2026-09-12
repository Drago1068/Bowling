import test from "node:test";
import assert from "node:assert/strict";
import {
  createOutboxStore,
  createEntityStore,
  listGameHistory,
  loadScoringView,
  openDatabase,
  startGame,
} from "../src/index.ts";
import {
  INITIAL_SHELL_DISCLOSURES,
  selectionAfterDisclosure,
  toggleDisclosure,
} from "../src/shellPresentation.ts";
import { TEST_DEVICE_ID } from "./helpers.ts";

test("SHELL_DEFAULT: history and diagnostics start collapsed", () => {
  assert.equal(INITIAL_SHELL_DISCLOSURES.historyOpen, false);
  assert.equal(INITIAL_SHELL_DISCLOSURES.diagnosticsOpen, false);
});

test("DISCLOSURE: toggling history or diagnostics does not rewrite selection", () => {
  const selected = "01a00000-0000-7000-8000-000000000001";
  const afterHistory = toggleDisclosure(INITIAL_SHELL_DISCLOSURES, "historyOpen");
  assert.equal(afterHistory.historyOpen, true);
  assert.equal(afterHistory.diagnosticsOpen, false);
  assert.equal(selectionAfterDisclosure(selected, afterHistory), selected);

  const afterDiagnostics = toggleDisclosure(afterHistory, "diagnosticsOpen");
  assert.equal(afterDiagnostics.diagnosticsOpen, true);
  assert.equal(afterDiagnostics.historyOpen, true);
  assert.equal(selectionAfterDisclosure(selected, afterDiagnostics), selected);
  assert.equal(selectionAfterDisclosure(null, afterDiagnostics), null);
});

test("DISCLOSURE: listing after a toggle does not mutate facts or selection", () => {
  const db = openDatabase();
  const older = startGame(db, TEST_DEVICE_ID);
  const newer = startGame(db, TEST_DEVICE_ID);
  const beforeCanonical = JSON.stringify(
    db
      .prepare(
        "SELECT entity_type, id, entity_version, payload FROM canonical_entities ORDER BY entity_type, id",
      )
      .all(),
  );
  const beforeOutbox = createOutboxStore(db).pending().length;
  const selected = older;
  const disclosed = toggleDisclosure(INITIAL_SHELL_DISCLOSURES, "historyOpen");
  assert.equal(selectionAfterDisclosure(selected, disclosed), older);
  const history = listGameHistory(db);
  const view = loadScoringView(db, selected);
  assert.equal(view.gameId, older);
  assert.equal(view.gameMissing, false);
  assert.ok(history.some((row) => row.id === older));
  assert.ok(history.some((row) => row.id === newer));
  assert.equal(
    JSON.stringify(
      db
        .prepare(
          "SELECT entity_type, id, entity_version, payload FROM canonical_entities ORDER BY entity_type, id",
        )
        .all(),
    ),
    beforeCanonical,
  );
  assert.equal(createOutboxStore(db).pending().length, beforeOutbox);
  assert.equal(createEntityStore(db).list("Game").length, 2);
});
