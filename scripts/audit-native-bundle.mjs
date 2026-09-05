#!/usr/bin/env node
/**
 * Audit an Expo native JS bundle for Node-only modules, sql.js, and WASM.
 * Usage: node scripts/audit-native-bundle.mjs <export-dir>
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("usage: node scripts/audit-native-bundle.mjs <export-dir>");
  process.exit(2);
}

const FORBIDDEN = [
  { id: "NODE_SQLITE_NATIVE_RUNTIME", pattern: /node:sqlite/ },
  { id: "NODE_FS_NATIVE_RUNTIME", pattern: /node:fs/ },
  { id: "NODE_PATH_NATIVE_RUNTIME", pattern: /node:path/ },
  { id: "SQLJS_NATIVE_RUNTIME", pattern: /from ["']sql\.js["']|require\(["']sql\.js["']\)/ },
  { id: "SQL_WASM_NATIVE_RUNTIME", pattern: /sql-wasm/i },
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

const files = walk(root);
const hits = [];
for (const file of files) {
  if (extname(file) === ".wasm") {
    hits.push(`SQL_WASM_NATIVE_RUNTIME in ${file}`);
    continue;
  }
  if (![".js", ".hbc", ".json", ".html", ".txt", ".map"].includes(extname(file))) {
    continue;
  }
  const source = readFileSync(file, "utf8");
  for (const rule of FORBIDDEN) {
    if (rule.pattern.test(source)) {
      hits.push(`${rule.id} in ${file}`);
    }
  }
}

if (hits.length > 0) {
  console.error("NATIVE_BUNDLE_AUDIT=FAIL");
  for (const hit of hits) console.error(hit);
  process.exit(1);
}

console.log("NATIVE_BUNDLE_AUDIT=PASS");
console.log(`scanned ${files.length} files under ${root}`);
