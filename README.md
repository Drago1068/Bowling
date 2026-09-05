# Bowling — ARCH-001 domain and mobile persistence

Offline-first bowling domain foundations plus the ARCH-001 Cursor mobile persistence slice.

This repository is **not** a product app. Feature development is **not authorized**. There is no scoring UI, NAS sync, authentication, analytics, or coaching.

## What is here

- Canonical identity (UUIDv7), entity versioning, corrections, mutation envelopes, payload hashing, and the sync state machine
- Portable `SqliteDriver` contract with three adapters:
  - `node:sqlite` — Node tests and reference
  - `sql.js` — web diagnostic preview only
  - `expo-sqlite` — native iOS/Android
- Shared SQLite conformance suite (`src/persistence/sqlite/conformance.ts`) run against each adapter with the same expectations
- Explicit mobile initialization, non-destructive migrations, durable device identity, transactional outbox, crash-window rollback, and lifecycle recovery from SQLite (not React state)
- A diagnostic Expo shell that proves those behaviors

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

Then open iOS, Android, or web from the Expo CLI. The screen is a test harness: device ID, schema version, outbox, recovery status, record local roll, simulate process restart, and (native only) the shared expo-sqlite conformance runner. It will not mark records **Synced** because NAS push/pull is not in this slice. Airplane mode / no network is **Saved locally / Waiting to sync**, never data loss.

On native devices the harness uses a file-backed `expo-sqlite` database. The web diagnostic uses sql.js because Expo’s web synchronous API requires SharedArrayBuffer and a Metro worker.

Native JS bundle (no Android SDK required):

```bash
cd apps/mobile
npm run export:android
```

`expo export` copies `public/sql-wasm.wasm` (web preview only) into the output folder. The export script deletes that file and audits the remaining Android Hermes bundle so native artifacts do not ship sql.js or WASM.

## Architecture constraints (this slice)

- Do not change UUIDv7, versioning, correction, outbox, canonicalization, SHA-256, or data-quality semantics
- Do not drop-and-recreate the database on migration failure
- Do not fake a NAS success path
- `sql.js` is preview-only; native uses `expo-sqlite`
- `FEATURE_DEVELOPMENT_AUTHORIZED=false`
