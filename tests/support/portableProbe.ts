/**
 * Mobile-style probe: imports ONLY from the portable surface (src/portable.ts)
 * so that tests can prove the scoring primitives are reachable without any
 * Node-only dependency (no node:sqlite, node:fs, node:path, node:crypto).
 */
export { deriveGame, loadGameFacts, validateNextRoll } from "../../src/portable.ts";
