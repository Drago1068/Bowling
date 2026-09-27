import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import {
  createSqliteLifecycleController,
  type ApplicationInitResult,
  type FailedInitResult,
  type MobileLifecycleEvent,
  type NetworkAvailability,
} from "../../src/portable.ts";
import { ensureMobileCrypto } from "./src/ensureCrypto.ts";
import {
  LoadingLaneArt,
  PageBackground,
  PinDownArt,
} from "./src/artwork.tsx";
import { openMobileDatabase } from "./src/openDatabase.ts";
import {
  runExpoSqliteConformance,
  type NativeValidationReport,
} from "./src/nativeValidation.ts";
import { ScoringPanel, NewGameConfirmBox, BottomTabBar, topNavSnapshotEqual, type AdvancedModel, type TopNavModel } from "./src/scoringPanel.tsx";

type ScreenState =
  | { phase: "loading"; note: string }
  | { phase: "ready"; result: ApplicationInitResult; note: string }
  | { phase: "failed"; result: ApplicationInitResult; note: string };

export default function App() {
  const networkRef = useRef<NetworkAvailability>("unavailable");
  const controllerRef = useRef(
    createSqliteLifecycleController({
      openSameDatabase: () => {
        ensureMobileCrypto();
        return openMobileDatabase();
      },
      openFreshSameDatabase: () => {
        ensureMobileCrypto();
        return openMobileDatabase({ freshNativeConnection: true });
      },
      getNetwork: () => networkRef.current,
    }),
  );
  const [network, setNetwork] = useState<NetworkAvailability>("unavailable");
  networkRef.current = network;
  const [screen, setScreen] = useState<ScreenState>({
    phase: "loading",
    note: "Opening local database…",
  });
  const [nativeReport, setNativeReport] = useState<NativeValidationReport | null>(
    null,
  );
  const [processGeneration, setProcessGeneration] = useState(0);
  const [recoveryLine, setRecoveryLine] = useState("none");
  const [faultArmed, setFaultArmed] = useState(false);
  const [topNav, setTopNav] = useState<TopNavModel | null>(null);
  const handleTopNav = useCallback((model: TopNavModel | null) => {
    setTopNav((prev) => (topNavSnapshotEqual(prev, model) ? prev : model));
  }, []);
  const scrollRef = useRef<ScrollView>(null);
  const currentScreen = topNav?.screen ?? null;
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [currentScreen]);
  const adapterLabel = Platform.OS === "web" ? "sql.js (web preview)" : "expo-sqlite (native)";

  const publishFailure = useCallback((result: FailedInitResult, note: string) => {
    setScreen({
      phase: "failed",
      result,
      note,
    });
  }, []);

  const runInit = useCallback(
    (
      event: MobileLifecycleEvent,
      note: string,
      remountPanel = false,
    ) => {
      if (remountPanel) {
        setProcessGeneration((n) => n + 1);
      }
      if (event === "launch" || remountPanel) {
        setScreen({
          phase: "loading",
          note,
        });
      }

      const outcome = controllerRef.current.run(event);
      setRecoveryLine(outcome.diagnosticLine);
      setFaultArmed(controllerRef.current.isPostProbeFaultArmed());
      console.log(`bowling.sqliteRecovery ${outcome.diagnosticLine}`);
      if (outcome.skipped) return;

      const result = outcome.init;
      if (outcome.published && result?.ok) {
        setScreen({ phase: "ready", result, note });
      } else if (outcome.published && result && !result.ok) {
        publishFailure(
          result,
          `${result.status}: ${result.message}. Existing database retained.`,
        );
      }
    },
    [publishFailure],
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

  const simulateProcessRestart = () => {
    runInit(
      "process_restart",
      "Process restart: reopened SQLite from durable storage",
      true,
    );
  };

  const runNativeConformance = () => {
    const report = runExpoSqliteConformance();
    setNativeReport(report);
  };

  /** One-way diagnostics snapshot for the panel's dedicated Advanced screen. */
  const readyResult =
    screen.phase === "ready" && screen.result.ok ? screen.result : null;
  const advancedModel: AdvancedModel = {
    available: readyResult !== null,
    adapter: adapterLabel,
    startup: readyResult ? readyResult.status : screen.phase,
    statuses: readyResult ? readyResult.statuses.join(", ") : "—",
    deviceId: readyResult ? readyResult.device.device_id : "—",
    schema: readyResult ? String(readyResult.schemaVersion) : "—",
    pendingOutbox: readyResult ? String(readyResult.pendingOutbox.length) : "—",
    localChanges: readyResult ? (readyResult.localChangesPending ? "yes" : "no") : "—",
    activeSession: readyResult
      ? readyResult.activeSession
        ? "recovered"
        : "none"
      : "—",
    sync: readyResult ? readyResult.presentation.label : "—",
    nasAccepted: readyResult ? (readyResult.presentation.nasAccepted ? "yes" : "no") : "—",
    network: readyResult ? readyResult.network : network,
    note: screen.note,
    recoveryLine,
    faultArmed,
    conformance: nativeReport
      ? {
          adapterName: nativeReport.adapterName,
          platform: nativeReport.platform,
          passed: nativeReport.passed,
          failed: nativeReport.failed,
          rows: nativeReport.results.map((row) => ({
            name: row.name,
            ok: row.ok,
            error: row.error,
          })),
        }
      : null,
    canRunConformance: Platform.OS !== "web",
    onRecover: () => runInit("foreground", "Manual recovery from persistence"),
    onArmTest: () => {
      controllerRef.current.armPostProbeFaultOnce();
      setFaultArmed(true);
    },
    onDisarmTest: () => {
      controllerRef.current.disarmPostProbeFault();
      setFaultArmed(false);
    },
    onToggleNetwork: () =>
      setNetwork((n) => (n === "unavailable" ? "available" : "unavailable")),
    onProcessRestart: () => simulateProcessRestart(),
    onRunConformance: () => runNativeConformance(),
  };

  /**
   * Closed-driver guard for the render path: getDriver() can throw when the
   * controller's driver closed mid cycle. Null degrades the panel to its
   * disabled state; the next published pass re-supplies the driver.
   */
  const panelDriver = (() => {
    if (screen.phase !== "ready" || !screen.result.ok) return null;
    try {
      return controllerRef.current.getDriver();
    } catch {
      return null;
    }
  })();

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.safe}>
      <View style={styles.background}>
        <PageBackground />
      </View>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            topNav && (topNav.screen === "landing" || topNav.screen === "game")
              ? styles.contentTight
              : null,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {screen.phase === "loading" ? (
            <View style={styles.loadingBox}>
              <LoadingLaneArt />
              <Text style={styles.loadingNote}>Loading — {screen.note}</Text>
            </View>
          ) : null}

          {screen.phase === "failed" ? (
            <View style={styles.failBox}>
              <View style={styles.failHead}>
                <PinDownArt size={56} />
                <Text style={styles.failTitle}>{screen.result.status}</Text>
              </View>
              <Text style={styles.body}>{screen.note}</Text>
              <Text style={styles.body}>{recoveryLine}</Text>
              <Text style={styles.body}>
                Existing bowling data was not dropped. Fix the database and retry;
                the app will not silently recreate it.
              </Text>
            </View>
          ) : null}

          <ScoringPanel
            key={processGeneration}
            driver={panelDriver}
            deviceId={
              screen.phase === "ready" && screen.result.ok
                ? screen.result.device.device_id
                : null
            }
            enabled={screen.phase === "ready" && screen.result.ok}
            reloadToken={screen.note}
            onTopNav={handleTopNav}
            advanced={advancedModel}
          />

          {screen.phase === "ready" && !screen.result.ok ? (
            <View style={styles.failBox}>
              <View style={styles.failHead}>
                <PinDownArt size={56} />
                <Text style={styles.failTitle}>{screen.result.status}</Text>
              </View>
              <Text style={styles.body}>{screen.note}</Text>
            </View>
          ) : null}

        </ScrollView>
        {topNav ? <NewGameConfirmBox model={topNav} /> : null}
        {topNav ? <BottomTabBar model={topNav} /> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f1ea" },
  background: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 120, gap: 12, flexGrow: 1 },
  contentTight: { paddingBottom: 8 },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#d9d1c3",
    shadowColor: "#1b1b1b",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  loadingNote: { flex: 1, fontSize: 15, color: "#1b1b1b" },
  failHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  disclosure: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#d9d1c3",
  },
  disclosureLabel: {
    color: "#6b6b6b",
    fontWeight: "600",
    textAlign: "center",
  },
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
    shadowColor: "#8a1f16",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
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
