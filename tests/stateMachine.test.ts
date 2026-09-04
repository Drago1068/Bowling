import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  InvalidStateTransitionError,
  isTerminal,
  transition,
  type SyncState,
} from "../src/index.ts";

const VALID: Array<[SyncState, SyncState]> = [
  ["LOCAL_ONLY", "QUEUED"],
  ["LOCAL_ONLY", "REJECTED"],
  ["QUEUED", "SUBMITTED"],
  ["QUEUED", "REJECTED"],
  ["SUBMITTED", "ACCEPTED"],
  ["SUBMITTED", "RETRYABLE_ERROR"],
  ["SUBMITTED", "CONFLICT"],
  ["SUBMITTED", "REJECTED"],
  ["ACCEPTED", "CONFIRMED"],
  ["ACCEPTED", "RETRYABLE_ERROR"],
  ["RETRYABLE_ERROR", "QUEUED"],
  ["RETRYABLE_ERROR", "REJECTED"],
  ["CONFLICT", "QUEUED"],
  ["CONFLICT", "REJECTED"],
];

const INVALID: Array<[SyncState, SyncState]> = [
  ["LOCAL_ONLY", "SUBMITTED"],
  ["QUEUED", "ACCEPTED"],
  ["SUBMITTED", "QUEUED"],
  ["ACCEPTED", "SUBMITTED"],
  ["ACCEPTED", "CONFLICT"],
  ["CONFIRMED", "QUEUED"],
  ["CONFIRMED", "REJECTED"],
  ["CONFIRMED", "CONFIRMED"],
  ["REJECTED", "QUEUED"],
  ["REJECTED", "SUBMITTED"],
];

test("valid transitions are accepted", () => {
  for (const [from, to] of VALID) {
    assert.equal(canTransition(from, to), true, `${from} -> ${to}`);
    assert.equal(transition(from, to), to);
  }
});

test("invalid transitions are rejected", () => {
  for (const [from, to] of INVALID) {
    assert.equal(canTransition(from, to), false, `${from} -> ${to}`);
    assert.throws(
      () => transition(from, to),
      InvalidStateTransitionError,
      `${from} -> ${to}`,
    );
  }
});

test("terminal states are CONFIRMED and REJECTED", () => {
  assert.equal(isTerminal("CONFIRMED"), true);
  assert.equal(isTerminal("REJECTED"), true);
  assert.equal(isTerminal("CONFLICT"), false);
  assert.equal(isTerminal("SUBMITTED"), false);
});