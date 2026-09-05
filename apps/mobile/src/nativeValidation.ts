import { Platform } from "react-native";
import { prepareDatabase } from "../../../src/persistence/sqlite/database.ts";
import {
  runSqliteConformance,
  type ConformanceReport,
} from "../../../src/persistence/sqlite/conformance.ts";
import { uuidv7 } from "../../../src/portable.ts";
import {
  deleteExpoSqliteDatabase,
  openExpoSqliteDriver,
} from "./expoSqlite.ts";

export type NativeValidationReport = ConformanceReport & {
  platform: string;
  executedOn: "native-expo-sqlite" | "unsupported-web";
};

/**
 * Execute the shared SqliteDriver suite against real expo-sqlite.
 * Web must not call this; sql.js has its own Node/web runners.
 */
export function runExpoSqliteConformance(): NativeValidationReport {
  if (Platform.OS === "web") {
    return {
      adapterName: "expo-sqlite",
      platform: Platform.OS,
      executedOn: "unsupported-web",
      passed: 0,
      failed: 1,
      results: [
        {
          name: "expo-sqlite native runtime",
          ok: false,
          error: "expo-sqlite conformance is native-only; web uses sql.js",
        },
      ],
    };
  }

  const report = runSqliteConformance({
    adapterName: "expo-sqlite",
    open(filename) {
      const ephemeral = filename === ":memory:";
      const name = ephemeral
        ? `bowling-mem-${uuidv7()}.db`
        : filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const driver = openExpoSqliteDriver(name);
      const outcome = prepareDatabase(driver);
      if (!outcome.ok) {
        driver.close();
        throw new Error(`${outcome.code}: ${outcome.message}`);
      }
      if (!ephemeral) return driver;
      return {
        exec: (sql) => driver.exec(sql),
        prepare: (sql) => driver.prepare(sql),
        close() {
          driver.close();
          deleteExpoSqliteDatabase(name);
        },
      };
    },
    remove(filename) {
      const name =
        filename === ":memory:"
          ? filename
          : filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      if (name !== ":memory:") deleteExpoSqliteDatabase(name);
    },
  });

  return {
    ...report,
    platform: Platform.OS,
    executedOn: "native-expo-sqlite",
  };
}
