import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN = [
  "node:sqlite",
  "node:crypto",
  "node:fs",
  "node:path",
  "node:os",
  "node:buffer",
  "node:child_process",
];

const IMPORT_RE =
  /(?:from|import)\s+["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;

function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = join(dirname(fromFile), spec);
  const candidates = [
    base,
    base.replace(/\.ts$/, ""),
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && !candidate.endsWith("/")) {
      try {
        const st = readFileSync(candidate, "utf8");
        if (st !== undefined) return candidate;
      } catch {
        continue;
      }
    }
  }
  return existsSync(base) ? base : null;
}

function walk(entry: string, seen: Set<string>, forbiddenHits: string[]): void {
  const file = entry;
  if (seen.has(file)) return;
  seen.add(file);
  if (!existsSync(file)) return;
  if (![".ts", ".tsx", ".js", ".jsx"].includes(extname(file))) return;
  const source = readFileSync(file, "utf8");
  for (const banned of FORBIDDEN) {
    if (source.includes(`"${banned}"`) || source.includes(`'${banned}'`)) {
      forbiddenHits.push(`${file} imports ${banned}`);
    }
  }
  IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMPORT_RE.exec(source)) !== null) {
    const spec = match[1] ?? match[2];
    if (!spec) continue;
    const resolved = resolveImport(file, spec);
    if (resolved) walk(resolved, seen, forbiddenHits);
  }
}

test("portable domain graph does not import Node-only modules", () => {
  const hits: string[] = [];
  walk(join(ROOT, "src/portable.ts"), new Set(), hits);
  assert.deepEqual(hits, []);
});

test("mobile adapter module does not import Node-only modules", () => {
  const hits: string[] = [];
  walk(join(ROOT, "src/persistence/sqlite/mobileDriver.ts"), new Set(), hits);
  assert.deepEqual(hits, []);
});

test("native application graph does not import Node-only modules or sql.js", () => {
  const hits: string[] = [];
  const seen = new Set<string>();
  const entries = [
    join(ROOT, "apps/mobile/App.tsx"),
    join(ROOT, "apps/mobile/index.ts"),
    join(ROOT, "apps/mobile/src/openDatabase.ts"),
    join(ROOT, "apps/mobile/src/expoSqlite.ts"),
    join(ROOT, "apps/mobile/src/nativeValidation.ts"),
  ];
  for (const entry of entries) {
    if (existsSync(entry)) walk(entry, seen, hits);
  }
  assert.deepEqual(hits, []);
  for (const file of seen) {
    assert.equal(file.includes("webSqlJs.ts"), false, file);
    assert.equal(file.includes("openDatabase.web.ts"), false, file);
    assert.equal(file.includes("sqlJsDriver.ts"), false, file);
  }
});

test("native source does not import sql.js or WASM assets", () => {
  const nativeFiles = [
    join(ROOT, "apps/mobile/App.tsx"),
    join(ROOT, "apps/mobile/src/openDatabase.ts"),
    join(ROOT, "apps/mobile/src/expoSqlite.ts"),
    join(ROOT, "apps/mobile/src/nativeValidation.ts"),
    join(ROOT, "apps/mobile/src/ensureCrypto.ts"),
  ];
  for (const file of nativeFiles) {
    const source = readFileSync(file, "utf8");
    assert.equal(/from\s+["']sql\.js["']/.test(source), false, file);
    assert.equal(source.includes("sql-wasm"), false, file);
    assert.equal(source.includes("webSqlJs"), false, file);
  }
});

test("metro config blocks Node builtins and native sql.js", () => {
  const metro = readFileSync(join(ROOT, "apps/mobile/metro.config.js"), "utf8");
  assert.match(metro, /Blocked Node-only import/);
  assert.match(metro, /platform !== ["']web["']/);
  assert.match(metro, /sql\.js is approved for the web preview harness only/);
  assert.match(metro, /openDatabase\.web\.ts/);
  assert.match(metro, /Blocked web-only module in native bundle/);
});

test("sqlite barrel and portable entry do not export the sql.js adapter", () => {
  const barrel = readFileSync(join(ROOT, "src/persistence/sqlite/index.ts"), "utf8");
  const portable = readFileSync(join(ROOT, "src/portable.ts"), "utf8");
  assert.equal(barrel.includes("sqlJsDriver"), false);
  assert.equal(portable.includes("sqlJsDriver"), false);
  assert.equal(portable.includes("sql.js"), false);
});

test("web nativeValidation shim does not import expo-sqlite or sql.js", () => {
  const source = readFileSync(
    join(ROOT, "apps/mobile/src/nativeValidation.web.ts"),
    "utf8",
  );
  assert.equal(/from\s+["']expo-sqlite["']/.test(source), false);
  assert.equal(/from\s+["']sql\.js["']/.test(source), false);
  assert.equal(source.includes("sql-wasm"), false);
});

test("uuidv7 and hashing modules are free of node:crypto", () => {
  const uuid = readFileSync(join(ROOT, "src/identity/uuidv7.ts"), "utf8");
  const hashing = readFileSync(join(ROOT, "src/sync/hashing.ts"), "utf8");
  assert.equal(uuid.includes("node:crypto"), false);
  assert.equal(hashing.includes("node:crypto"), false);
  assert.equal(uuid.includes("Buffer"), false);
  assert.equal(hashing.includes("Buffer"), false);
});
