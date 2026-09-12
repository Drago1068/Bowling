# Bowling — ARCH-001 domain, scoring, and mobile persistence

Offline-first bowling domain foundations, accepted Slice 4 deterministic
offline scoring, and the ARCH-001 mobile persistence diagnostic shell.

This repository is **not** a production product release. NAS sync,
authentication, analytics, and coaching are not provided. Slice 5 (offline
game history and resume) is formally closed on
`arch/001-domain-sync-foundation` at `e45358d` / `v0.5.0-arch001-slice5`.
The local `assembleRelease` APK is an acceptance artifact, not a production
store release. Slice 6 (scoring-first device shell) is locally closed on
`codex/arch-001-slice-6-scoring-first-shell` (parent `e45358d`). Integration
and publication are pending. Physical and offline device acceptance passed
after a historical locked-install HOLD. Not a production release.

## What is here

- Canonical identity (UUIDv7), entity versioning, corrections, mutation envelopes, payload hashing, and the sync state machine
- Portable `SqliteDriver` contract with three adapters:
  - `node:sqlite` — Node tests and reference
  - `sql.js` — web diagnostic preview only
  - `expo-sqlite` — native iOS/Android
- Shared SQLite conformance suite (`src/persistence/sqlite/conformance.ts`) run against each adapter with the same expectations
- Explicit mobile initialization, non-destructive migrations, durable device identity, transactional outbox, crash-window rollback, and lifecycle recovery from SQLite (not React state)
- Accepted Slice 4: one-bowler offline ten-pin scoring (USBC Playing Rules 2026–2027), derived non-authoritative sheet, corrections, and file-backed recovery, exercised on the diagnostic Expo shell (debug Android path; not a production release)
- Accepted Slice 5: list and open persisted games by local creation date/time, resume or correct under Slice 4 rules, start a new game without deleting others, and open the newest persisted game after process restart
- Accepted Slice 6 (locally closed; integration pending): scoring-first device shell — current game and scoring first, History on demand, diagnostics collapsed by default but not removed
- A diagnostic Expo shell that also proves persistence and recovery behaviors

```
Portable SqliteDriver contract
        ↓
 ┌───────────────┬────────────────┬─────────────────┐
 │ Node adapter  │ sql.js adapter │ expo-sqlite     │
 │ tests/ref     │ web preview    │ native mobile   │
 └───────────────┴────────────────┴─────────────────┘
```

The mobile runtime imports `src/portable.ts` and must not import `node:sqlite`, `node:fs`, or `node:path`. Native Metro resolution uses `apps/mobile/src/openDatabase.ts` (`expo-sqlite`). Web Metro uses `openDatabase.web.ts` (`sql.js`). Native must not bundle sql.js or `/sql-wasm.wasm`.

## Requirements

- Node.js >= 22.5 (type stripping + `node:sqlite` for tests)
- For the device shell: Expo SDK 57 / a phone with Expo Go, or Xcode/Android Studio for native builds

## Domain tests

```bash
npm ci
npm test
npm run typecheck
npm run test:conformance
npm run typecheck:mobile
```

Existing OpenCode tests remain at `openDatabase()` (the public Node abstraction). Additional suites cover driver parity, migrations, crash windows A–E, airplane-mode local operation, Node vs sql.js conformance, and Node-only import isolation.

`EXPO_SQLITE_CONFORMANCE` is the same suite, executed on a device or emulator from the diagnostic app (**Run expo-sqlite conformance**). It is native-only; the web preview refuses that button path.

## Mobile diagnostic shell

```bash
cd apps/mobile
npm ci
npx expo start
```

Then open iOS, Android, or web from the Expo CLI. Slice 6 puts current-game
scoring first, opens History on demand, and collapses diagnostics by default
without removing recovery, simulated
network, process-restart, or expo-sqlite conformance controls. It will not mark records
**Synced** because NAS push/pull is not live. Airplane mode / no network is
**Saved locally / Waiting to sync**, never data loss. Restart opens the newest
persisted game; an in-session open stays selected until the user opens another
game or creates a new one.

On native devices the harness uses a file-backed `expo-sqlite` database. The web diagnostic uses sql.js because Expo’s web synchronous API requires SharedArrayBuffer and a Metro worker.

Native JS bundle (no Android SDK required):

```bash
cd apps/mobile
npm run export:android
```

`expo export` copies `public/sql-wasm.wasm` (web preview only) into the output folder. The export script deletes that file and audits the remaining Android Hermes bundle so native artifacts do not ship sql.js or WASM.

## Architecture constraints

- Do not change UUIDv7, versioning, correction, outbox, canonicalization, SHA-256, or data-quality semantics
- Do not drop-and-recreate the database on migration failure
- Do not fake a NAS success path
- `sql.js` is preview-only; native uses `expo-sqlite`
- Slice 6 implementation is not authorized (`SLICE_6_IMPLEMENTATION_AUTHORIZED=false`)
