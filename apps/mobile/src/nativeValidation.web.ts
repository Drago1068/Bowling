import { Platform } from "react-native";
import type { ConformanceReport } from "../../../src/persistence/sqlite/conformance.ts";

export type NativeValidationReport = ConformanceReport & {
  platform: string;
  executedOn: "native-expo-sqlite" | "unsupported-web";
};

/**
 * Web Metro resolution of `nativeValidation.ts`. Must not import expo-sqlite
 * or sql.js; native conformance is executed only on iOS/Android.
 */
export function runExpoSqliteConformance(): NativeValidationReport {
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
