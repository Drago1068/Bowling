# Bowling project status

This is the single authoritative repository status record.

```ini
PROJECT_NAME=Bowling
PRODUCT_CLASS=STANDALONE_PRODUCT
CANONICAL_REPOSITORY=Drago1068/Bowling
CANONICAL_LOCAL_PATH=C:\Users\Drago\Documents\Bowling
REMOTE_ORIGIN=https://github.com/Drago1068/Bowling.git
DEFAULT_BRANCH=arch/001-domain-sync-foundation
CURRENT_BRANCH=arch/001-domain-sync-foundation
REVIEWED_SOURCE_HEAD=4077c2bf10d883f64559e314f2a5d05fb1769b0f
REVIEWED_SOURCE_TREE=38095255d1d596f5a39f71768d77660c0ad4fa1d
REMEDIATION_HEAD=c04d46930b9644a05505615170892754830a0572
REMEDIATION_TREE=69f005eff08c8991bbc539e4c27c1a8c84b803b9
CURRENT_HEAD=c04d46930b9644a05505615170892754830a0572
TREE_HASH=69f005eff08c8991bbc539e4c27c1a8c84b803b9
CURRENT_ARCHITECTURE=ARCH-001
CURRENT_SLICE=ARCH-001_SLICE_4_DETERMINISTIC_OFFLINE_GAME_SCORING
CURRENT_GATE=ARCHITECTURE_ACCEPTANCE
GATE_STATUS=APPROVED_IMPLEMENTATION_UNAUTHORIZED
SLICE_4_SPEC=docs/adr/ADR-003-deterministic-offline-game-scoring.md
SLICE_4_IMPLEMENTATION_AUTHORIZED=false
PRODUCTION_IMPLEMENTATION_AUTHORIZED=false
DEVICE_ACCEPTANCE_REQUIRED=true
ARCHITECTURE_AUTHORITY_REVIEW=BOWLING_ARCH_001_SLICE_4
ARCHITECTURE_AUTHORITY_RESULT=APPROVED
DECISION_4-1_TEN_PIN_AUTHORITY=APPROVED
DECISION_4-4_CORRECTION_DEPENDENCY_POLICY=APPROVED
ARCHITECTURAL_DIRECTION=ACCEPTED
SLICE_4_REQUIREMENTS=ACCEPTED_AFTER_REQUIRED_CLARIFICATIONS
SLICE_4_ARCHITECTURE_ACCEPTED=true
TEN_PIN_RULE_AUTHORITY=USBC_PLAYING_RULES
RULE_AUTHORITY=UNITED_STATES_BOWLING_CONGRESS
RULE_SET=USBC_PLAYING_RULES
RULE_AUTHORITY_PINNED=true
RULE_EDITION=2026-2027
SCORING_DOMAIN=AMERICAN_TENPINS
RULE_REFERENCE_IMMUTABLE=true
RULE_REFERENCE_VERIFIED=true
RULE_REFERENCE_BLOCKER=CLOSED
RULE_PROVENANCE=docs/reference/usbc-playing-rules-2026-2027.provenance.md
SOURCE_SHA256=4cb44a2a9d62fdf18957da2db4646e05342eebdc308cc56711a6249ad2cdddec
ZERO_ROLL_STATE=NOT_STARTED
LIFECYCLE_PERSISTED=false
GOLDEN_VECTORS_PINNED=true
LAST_ACCEPTED_RELEASE=NOT_VERIFIED
LAST_ACCEPTED_COMMIT=c04d46930b9644a05505615170892754830a0572
TEST_STATUS=EXECUTABLE_GATES_PASS
SYNC_STATUS=CONFLICT_AND_ACCEPTED_LOCAL_WRITES_ATOMIC
MOBILE_STATUS=AUTHORITATIVE_TYPECHECK_PASS
DEPLOYMENT_STATUS=NOT_AUTHORIZED_NOT_PERFORMED
OPEN_P0=0_OBSERVED
OPEN_P1=0
OPEN_P2=0
CURRENT_BLOCKERS=NONE
NEXT_ACTION=RETURN_TO_ARCHITECTURE_AUTHORITY_FOR_SLICE_4_IMPLEMENTATION_AUTHORIZATION
NEXT_AGENT=ChatGPT_ARCHITECTURE_AND_RELEASE_AUTHORITY
LAST_UPDATED=2026-09-07_America/New_York
SLICE_3_ACCEPTED=true
INDEPENDENT_REVIEW_VERDICT=HOLD_NOT_CLEAN
FINDING_CLOSURE=THREE_RECORDED_FINDINGS_CLOSED
MERGE_COMMIT=c04d46930b9644a05505615170892754830a0572
MERGE_STYLE=FAST_FORWARD
INTEGRATION_BRANCH=arch/001-domain-sync-foundation
RELEASE_TAG=NOT_CREATED
POST_MERGE_SMOKE=PASS
BOWLING_NEXT_SLICE_PLAN=NOT_YET_ESTABLISHED
NEXT_SLICE_IMPLEMENTATION_AUTHORIZED=false
NAS_ACCESSED=false
OTHER_PROJECTS_ACCESSED=false
OTHER_PROJECTS_CHANGED=false
```

## Verified candidate and execution evidence

- Worked only in `C:\Users\Drago\Documents\Bowling`. Canonical origin `https://github.com/Drago1068/Bowling.git`.
- On resume the live origin source branch `arch/001-end-to-end-sync` was the expected reviewed candidate `4077c2bf10d883f64559e314f2a5d05fb1769b0f` (tree `38095255d1d596f5a39f71768d77660c0ad4fa1d`). Local checkout had been moved to `arch/001-mobile-persistence`; local `arch/001-end-to-end-sync` had an extra checkpoint `841929e` containing only this status file. The checkpoint was mixed-reset to origin, restoring HEAD `4077c2b` with `PROJECT_STATUS.md` untracked. No other unexpected application changes.
- Live origin default branch is `arch/001-domain-sync-foundation`. It was `d88d067bfa319aad3b31e38566b0433491e997c9` (ancestor of the candidate) before the authorized fast-forward merge. GitHub reports this as the default branch. No release tag was created.
- Node v24.19.0, npm 11.17.0. Existing root and `apps/mobile` lockfiles used; no `npm ci`, no new tooling in the repository, no unrelated upgrades. Server tests used only `postgresql://bowling:bowling@127.0.0.1:55433/bowling` (`bowling-pg-test`, user/database bowling). `--test-concurrency=1` is test isolation for shared-table truncation, not production concurrency proof. No overlapping test processes.

### Independent review (unchanged)

Exactly one independent review was launched against Slice 3 commit 4077c2b relative to parent 8af5a25. It covered only authorized sync/recovery concerns, made no changes, and stopped upon finding P1. Verdict: HOLD, not a completed clean review. This closure does not rewrite that verdict.

Recorded findings at review:

1. **P1: conflict recovery is not atomic** — `src/sync/coordinator.ts` persisted terminal CONFLICT before inserting its conflict record.
2. **P2: accepted state and receipt are not atomic** — ACCEPTED was persisted before its receipt; existing fault injection fired after both writes.
3. **P2: assertion failures leak E2E resources** — `server/test/e2e.sync.test.ts` closed mobiles/pools only on success; file cleanup did not always close handles first.

### Finding closure (subsequent bounded remediation)

Remediation commit `c04d46930b9644a05505615170892754830a0572` (tree `69f005eff08c8991bbc539e4c27c1a8c84b803b9`) is a child of the reviewed source `4077c2b`. Production persistence/outbox/correction/lifecycle/domain contracts were not broadened. Changes:

1. **P1 CLOSED** — CONFLICT outbox state and conflict row commit in one local SQLite transaction. Fault `afterConflictStateBeforeRecord` injects between the writes. Crash rolls back both; restart leaves the submission resumable (`SUBMITTED`); replay of the same submission id produces exactly one durable local conflict record; server still has one conflict row for that submission.
2. **P2 CLOSED** — ACCEPTED, server receipt, and last-server-cursor commit in one local transaction. Fault `afterAcceptedBeforeReceipt` injects between ACCEPTED and the receipt. Crash rolls back both; restart replay uses the same submission id, server returns `ALREADY_ACCEPTED`, then confirms without duplicate canonical/change-feed mutation. Existing post-receipt `afterServerResultBeforeConfirm` recovery remains.
3. **P2 CLOSED** — Slice 3 E2E tests register mobiles/application pools and close them in `finally`. SQLite handles close before deleting `-wal`/`-shm`/db files.

### Pre-merge gates (remediation candidate c04d469)

- Domain/mobile non-UI: `npm test` 98/98 PASS, exit 0.
- Server: `npm run test:server` `--test-concurrency=1` 39/39 PASS, exit 0 (includes 17 E2E tests).
- Shared/server typecheck: `npm run typecheck` PASS, exit 0.
- Mobile typecheck: `npm run typecheck:mobile` PASS, exit 0, against the existing locked mobile dependency installation.
- Lint: NOT_CONFIGURED in root/mobile scripts. No repository CI workflow.
- Five sequential E2E runs: `node --experimental-strip-types --test --test-concurrency=1 server/test/e2e.sync.test.ts` — 17/17 PASS each, 85 executions, 0 failures.
- Focused crash-boundary and cleanup tests: ACCEPTED receipt crash, conflict state crash, and server-restart cleanup path PASS.

### Merge and post-merge smoke

- Fast-forward `arch/001-domain-sync-foundation` to `c04d469` (same commit as the feature branch; no merge commit, reviewed ancestry preserved).
- Post-merge on default: domain 98/98 PASS; server 39/39 PASS; mobile typecheck PASS; E2E smoke 17/17 PASS.

## Forward planning boundary

`BOWLING_NEXT_SLICE_PLAN=ARCH-001_SLICE_4_DETERMINISTIC_OFFLINE_GAME_SCORING`. Slice 4
requirements were accepted by Architecture Authority after required clarifications.
The USBC 2026–2027 Playing Rules authority is pinned. No Slice 4 production
implementation is authorized until Architecture Authority opens a Slice 4
implementation authorization gate.

### Slice 4 architecture acceptance (APPROVED requirements; implementation unauthorized)

- **Specification**: `docs/adr/ADR-003-deterministic-offline-game-scoring.md`
  (Accepted requirements/design after required clarifications).
- **Work package**: `BOWLING_ARCH_001_SLICE_4_ARCHITECTURE_ACCEPTANCE_CLOSURE`.
- **Architecture Authority review**: `BOWLING_ARCH_001_SLICE_4` / `RESULT=APPROVED`.
- **Decision 4-1**: APPROVED — `RULE_AUTHORITY=USBC_PLAYING_RULES`,
  `RULE_EDITION=2026-2027`, `SCORING_DOMAIN=AMERICAN_TENPINS`. Official artifact
  from `https://bowl.com/rules` →
  `usbc-playing-rulebook-26-27.pdf`, SHA-256
  `4cb44a2a9d62fdf18957da2db4646e05342eebdc308cc56711a6249ad2cdddec`.
  Provenance: `docs/reference/usbc-playing-rules-2026-2027.provenance.md`.
  Publication not committed (USBC copyright). `RULE_REFERENCE_BLOCKER=CLOSED`.
  Future USBC editions do not mutate existing derived results.
- **Decision 4-4**: APPROVED —
  `CORRECTION_DEPENDENCY_POLICY=PRESERVE_FACTS_AND_EXPOSE_DOMAIN_INVALID_REQUIRING_REPAIR`.
- **Zero-roll lifecycle**: `GAME_IDENTITY_MAY_EXIST_WITH_ZERO_ROLL_FACTS=true`;
  zero-roll derived state is `NOT_STARTED`; first effective roll derives
  `IN_PROGRESS`; legally complete fact set derives `COMPLETED`;
  `LIFECYCLE_FIELD_PERSISTED=false`. No manufactured creation roll.
- **Golden vectors pinned** (totals unchanged): `PERFECT_GAME=300` sequence
  `10×12`; `ALL_SPARES=150` sequence `5×21`; `GUTTER_GAME=0` sequence `0×20`;
  `OPEN_FRAMES=80` sequence `(5,3)×10`; `MIXED_GAME=169` sequence
  `10,3,6,9,1,7,2,10,10,8,2,9,0,10,7,3,9`.
- **Scope preserved**: `OBSERVED_ROLL_FACTS=AUTHORITATIVE`,
  `DERIVED_SCORE=NON_AUTHORITATIVE`; frame identity authoritative / scoring
  semantics derived; existing append-only corrections; Slice 3 sync frozen.
- **Baseline unmodified**: these documentation changes do not touch the accepted
  application baseline `c04d469` bytes, migrations, dependencies, or sync
  contracts. Slice 3 independent review verdict (HOLD) and closure evidence are
  preserved exactly (unchanged, not rewritten).
- **Recorded against**: status-record commit `01145638f36066cbb62c0d729e1b2f0fb09319f1`
  plus this documentation acceptance commit.
- **Forbidden-change verification for this work package**: `PRODUCTION_CODE_CHANGED=false`,
  `MIGRATIONS_CHANGED=false`, `DEPENDENCIES_CHANGED=false`,
  `SYNC_CONTRACTS_CHANGED=false`, `NAS_ACCESSED=false`,
  `OTHER_PROJECTS_ACCESSED=false`, `OTHER_PROJECTS_CHANGED=false`.
- **Next action**: `RETURN_TO_ARCHITECTURE_AUTHORITY_FOR_SLICE_4_IMPLEMENTATION_AUTHORIZATION`.

### Slice 4 rule-authority pinning (CLOSED; implementation still unauthorized)

- **Work package**: `BOWLING_ARCH_001_SLICE_4_RULE_AUTHORITY_PINNING`.
- **Pinned edition**: USBC Playing Rules `2026-2027` (American Tenpins).
- **Authoritative source**: official BOWL.com 2026–2027 rulebook PDF.
- **SHA-256 verified** before commit:
  `4cb44a2a9d62fdf18957da2db4646e05342eebdc308cc56711a6249ad2cdddec`.
- **Recorded against**: Slice 4 architecture acceptance commit
  `67f91ebe864bdb5d5018e73f91809850272bd5b2` plus this pinning commit.
- **Forbidden-change verification for this work package**: `PRODUCTION_CODE_CHANGED=false`,
  `MIGRATIONS_CHANGED=false`, `DEPENDENCIES_CHANGED=false`,
  `SYNC_CONTRACTS_CHANGED=false`, `NAS_ACCESSED=false`,
  `OTHER_PROJECTS_ACCESSED=false`, `OTHER_PROJECTS_CHANGED=false`.
