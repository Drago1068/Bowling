import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  applyLocalMutation,
  initializeApplication,
  newEntityMetadata,
  newFrameId,
  newRollId,
  recoverAfterLifecycle,
  type ApplicationInitResult,
  type NetworkAvailability,
  type Roll,
  type SqliteDriver,
} from "../../src/portable.ts";
import { ensureMobileCrypto } from "./src/ensureCrypto.ts";
import { openMobileDatabase } from "./src/openDatabase.ts";
import {
  runExpoSqliteConformance,
  type NativeValidationReport,
} from "./src/nativeValidation.ts";
import {
  buildScoreSheet,
  demoMixedGameFacts,
  formatScoreSheet,
} from "./src/scoreSheet.ts";

type ScreenState =
  | { phase: "loading"; note: string }
  | { phase: "ready"; result: ApplicationInitResult; note: string }
  | { phase: "failed"; result: ApplicationInitResult; note: string };

function makeDiagnosticRoll(deviceId: string): Roll {
  return {
    ...newEntityMetadata({ id: newRollId(), origin_device_id: deviceId }),
    entity_type: "Roll",
    frame_id: newFrameId(),
    roll_number: 1,
    pinfall: 10,
  };
}

function openPreparedDriver(): Promise<SqliteDriver> {
  ensureMobileCrypto();
  return openMobileDatabase();
}

export default function App() {
  const driverRef = useRef<SqliteDriver | null>(null);
  const [network, setNetwork] = useState<NetworkAvailability>("unavailable");
  const [screen, setScreen] = useState<ScreenState>({
    phase: "loading",
    note: "Opening local database…",
  });
  const [nativeReport, setNativeReport] = useState<NativeValidationReport | null>(
    null,
  );
  const [demoSheet, setDemoSheet] = useState<string | null>(null);
  const adapterLabel = Platform.OS === "web" ? "sql.js (web preview)" : "expo-sqlite (native)";

  const runInit = useCallback(
    (event: "launch" | "foreground" | "lock_resume", note: string) => {
      void (async () => {
        try {
          if (!driverRef.current) {
            driverRef.current = await openPreparedDriver();
          }
          const result =
            event === "launch"
              ? initializeApplication({
                  openDriver: () => driverRef.current as SqliteDriver,
                  network,
                })
              : recoverAfterLifecycle(event, {
                  openDriver: () => driverRef.current as SqliteDriver,
                  openDriverIfAlive: () => driverRef.current as SqliteDriver,
                  network,
                });
          if (result.ok) {
            setScreen({ phase: "ready", result, note });
          } else {
            setScreen({
              phase: "failed",
              result,
              note: `${result.status}: ${result.message}. Existing database retained.`,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setScreen({
            phase: "failed",
            result: {
              ok: false,
              status: "DATABASE_OPEN_FAILED",
              statuses: ["DATABASE_OPEN_FAILED"],
              message,
              retainedExistingDatabase: true,
              schemaVersion: null,
            },
            note: `Open failed: ${message}. The database file was not recreated.`,
          });
        }
      })();
    },
    [network],
  );

  useEffect(() => {
    runInit("launch", "Launch recovery from persistence");
  }, [runInit]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        runInit("foreground", "Foreground recovery from persistence");
      }
    });
    return () => sub.remove();
  }, [runInit]);

  const recordLocalMutation = () => {
    const current = screen.phase === "ready" ? screen.result : null;
    if (!current || !current.ok || !driverRef.current) return;
    try {
      applyLocalMutation(driverRef.current, {
        deviceId: current.device.device_id,
        operation: "CREATE",
        entity: makeDiagnosticRoll(current.device.device_id),
        expectedEntityVersion: 0,
      });
      runInit("foreground", "Local mutation committed; waiting to sync");
    } catch (err) {
      setScreen({
        phase: "ready",
        result: current,
        note: `Mutation rolled back: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const simulateProcessRestart = () => {
    try {
      driverRef.current?.close();
    } catch {
      // Already closed.
    }
    driverRef.current = null;
    runInit("launch", "Process restart: reopened SQLite from durable storage");
  };

  const runNativeConformance = () => {
    const report = runExpoSqliteConformance();
    setNativeReport(report);
  };

  const renderDemoScoreSheet = () => {
    // Thin offline score-sheet projection: derived solely from the demo game's
    // observed roll facts (deterministic, non-authoritative).
    setDemoSheet(formatScoreSheet(buildScoreSheet(demoMixedGameFacts())));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>ARCH-001 diagnostic harness</Text>
        <Text style={styles.subtitle}>
          Persistence, device identity, outbox, recovery, and a thin offline
          score-sheet projection.
        </Text>

        {screen.phase === "loading" ? (
          <Text style={styles.banner}>Loading — {screen.note}</Text>
        ) : null}

        {screen.phase === "failed" ? (
          <View style={styles.failBox}>
            <Text style={styles.failTitle}>{screen.result.status}</Text>
            <Text style={styles.body}>{screen.note}</Text>
            <Text style={styles.body}>
              Existing bowling data was not dropped. Fix the database and retry;
              the app will not silently recreate it.
            </Text>
          </View>
        ) : null}

        {screen.phase === "ready" && screen.result.ok ? (
          <View style={styles.card}>
            <Row label="Adapter" value={adapterLabel} />
            <Row label="Startup" value={screen.result.status} />
            <Row label="Statuses" value={screen.result.statuses.join(", ")} />
            <Row label="Device ID" value={screen.result.device.device_id} />
            <Row label="Schema" value={String(screen.result.schemaVersion)} />
            <Row
              label="Pending outbox"
              value={String(screen.result.pendingOutbox.length)}
            />
            <Row
              label="Local changes"
              value={screen.result.localChangesPending ? "yes" : "no"}
            />
            <Row
              label="Active session"
              value={screen.result.activeSession ? "recovered" : "none"}
            />
            <Row label="Sync" value={screen.result.presentation.label} />
            <Row
              label="NAS accepted"
              value={screen.result.presentation.nasAccepted ? "yes" : "no"}
            />
            <Row label="Network" value={screen.result.network} />
            <Text style={styles.note}>{screen.note}</Text>
          </View>
        ) : null}

        {screen.phase === "ready" && !screen.result.ok ? (
          <View style={styles.failBox}>
            <Text style={styles.failTitle}>{screen.result.status}</Text>
            <Text style={styles.body}>{screen.note}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="Record local roll"
            onPress={recordLocalMutation}
            disabled={screen.phase !== "ready" || !screen.result.ok}
          />
          <Button
            label="Recover from database"
            onPress={() => runInit("foreground", "Manual recovery from persistence")}
          />
          <Button
            label={
              network === "unavailable"
                ? "Simulated network: unavailable"
                : "Simulated network: available"
            }
            onPress={() =>
              setNetwork((n) => (n === "unavailable" ? "available" : "unavailable"))
            }
          />
          <Button
            label="Simulate process restart"
            onPress={simulateProcessRestart}
          />
          <Button
            label="Show demo score sheet"
            onPress={renderDemoScoreSheet}
          />
          {Platform.OS !== "web" ? (
            <Button
              label="Run expo-sqlite conformance"
              onPress={runNativeConformance}
            />
          ) : (
            <Text style={styles.footnote}>
              expo-sqlite conformance is native-only. Web preview uses sql.js.
            </Text>
          )}
        </View>
        {nativeReport ? (
          <View style={nativeReport.failed === 0 ? styles.card : styles.failBox}>
            <Text style={styles.failTitle}>
              {nativeReport.adapterName} on {nativeReport.platform}:{" "}
              {nativeReport.passed} passed, {nativeReport.failed} failed
            </Text>
            {nativeReport.results.map((row) => (
              <Text key={row.name} style={styles.body}>
                {row.ok ? "PASS" : "FAIL"} — {row.name}
                {row.error ? `: ${row.error}` : ""}
              </Text>
            ))}
          </View>
        ) : null}
        {demoSheet ? (
          <View style={styles.card}>
            <Text style={styles.label}>Derived score sheet (offline, non-authoritative)</Text>
            <Text style={styles.value} selectable>
              {demoSheet}
            </Text>
          </View>
        ) : null}
        <Text style={styles.footnote}>
          Network unavailable is not data loss. Until NAS sync exists, records stay
          Saved locally / Waiting to sync. Synced is never faked.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row(props: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{props.label}</Text>
      <Text style={styles.value} selectable>
        {props.value}
      </Text>
    </View>
  );
}

function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.button,
        props.disabled ? styles.buttonDisabled : null,
        pressed ? styles.buttonPressed : null,
      ]}
    >
      <Text style={styles.buttonLabel}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f1ea" },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", color: "#1b1b1b" },
  subtitle: { fontSize: 14, color: "#4a4a4a", marginBottom: 8 },
  banner: { fontSize: 15, color: "#1b1b1b" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#d9d1c3",
  },
  failBox: {
    backgroundColor: "#fdecea",
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#c4564a",
  },
  failTitle: { fontSize: 16, fontWeight: "700", color: "#8a1f16" },
  row: { gap: 2 },
  label: { fontSize: 11, textTransform: "uppercase", color: "#6b6b6b" },
  value: { fontSize: 14, color: "#1b1b1b" },
  body: { fontSize: 14, color: "#1b1b1b" },
  note: { marginTop: 8, fontSize: 13, color: "#4a4a4a" },
  actions: { gap: 8, marginTop: 8 },
  button: {
    backgroundColor: "#1f4d3a",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { backgroundColor: "#9aa59f" },
  buttonLabel: { color: "#fff", fontWeight: "600", textAlign: "center" },
  footnote: { fontSize: 12, color: "#5c5c5c", marginTop: 8 },
});
