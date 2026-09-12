import { useEffect, useState } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import {
  correctRoll,
  listGameHistory,
  loadScoringView,
  recordRoll,
  startGame,
  type GameHistoryEntry,
  type ScoringView,
  type SqliteDriver,
} from "../../../src/portable.ts";
import {
  INITIAL_SHELL_DISCLOSURES,
  selectionAfterDisclosure,
  toggleDisclosure,
} from "../../../src/shellPresentation.ts";

const PIN_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function ScoringPanel(props: {
  driver: SqliteDriver | null;
  deviceId: string | null;
  enabled: boolean;
  reloadToken: string;
}) {
  const [view, setView] = useState<ScoringView | null>(null);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [selectedRollId, setSelectedRollId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(
    INITIAL_SHELL_DISCLOSURES.historyOpen,
  );
  const [notice, setNotice] = useState("Create a game, then enter pinfall.");

  useEffect(() => {
    if (!props.driver || !props.enabled) return;
    const listed = listGameHistory(props.driver);
    setHistory(listed);
    if (!sessionReady) {
      const loaded = loadScoringView(props.driver, null);
      setView(loaded);
      setSelectedGameId(loaded.gameId);
      setSessionReady(true);
      if (!loaded.gameId) {
        setNotice("No games yet. Listing does not create a game.");
      }
      return;
    }
    const loaded = loadScoringView(props.driver, selectedGameId);
    setView(loaded);
    if (loaded.gameMissing) {
      setNotice("Selected game was not found. Another game was not opened in its place.");
    }
  }, [
    props.driver,
    props.enabled,
    props.reloadToken,
    sessionReady,
    selectedGameId,
  ]);

  const onToggleHistory = () => {
    const next = toggleDisclosure(
      { historyOpen, diagnosticsOpen: false },
      "historyOpen",
    );
    setHistoryOpen(next.historyOpen);
    setSelectedGameId((current) => selectionAfterDisclosure(current, next));
  };

  const onNewGame = () => {
    if (!props.driver || !props.deviceId) return;
    const gameId = startGame(props.driver, props.deviceId);
    setSelectedRollId(null);
    setSelectedGameId(gameId);
    setSessionReady(true);
    setHistory(listGameHistory(props.driver));
    setView(loadScoringView(props.driver, gameId));
    setNotice("Game created (NOT_STARTED until first roll).");
  };

  const onOpenGame = (gameId: string) => {
    if (!props.driver) return;
    setSelectedRollId(null);
    setSelectedGameId(gameId);
    const next = loadScoringView(props.driver, gameId);
    setView(next);
    setNotice(
      next.gameMissing
        ? "Selected game was not found. Another game was not opened in its place."
        : "Opened selected game.",
    );
  };

  const onRecord = (pinfall: number) => {
    if (!props.driver || !props.deviceId || !view?.gameId || view.gameMissing) return;
    const result = recordRoll(props.driver, props.deviceId, view.gameId, pinfall);
    const next = loadScoringView(props.driver, view.gameId);
    setView(next);
    setHistory(listGameHistory(props.driver));
    setNotice(result.ok ? `Recorded ${pinfall}.` : result.message);
  };

  const onCorrect = (pinfall: number) => {
    if (!props.driver || !props.deviceId || !selectedRollId || !view?.gameId || view.gameMissing) {
      return;
    }
    const result = correctRoll(props.driver, props.deviceId, selectedRollId, pinfall);
    const next = loadScoringView(props.driver, view.gameId);
    setView(next);
    setHistory(listGameHistory(props.driver));
    setNotice(
      result.ok
        ? `Corrected roll to ${pinfall}. Re-derived ${next.sheet?.status ?? ""}.`
        : result.message,
    );
  };

  const disabled = !props.enabled || !props.driver || !props.deviceId;
  const recordBlocked = disabled || !view?.canRecord || view?.gameMissing;
  const openLabel =
    history.find((entry) => entry.id === selectedGameId)?.label ?? null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Offline scoring</Text>
      <Text style={styles.note}>{notice}</Text>
      <Text style={styles.body}>
        Game: {view?.gameId ?? "none"}
        {view?.gameMissing ? " (not found)" : ""}
        {openLabel ? ` — ${openLabel}` : ""}
        {" | corrections: "}
        {view?.correctionCount ?? 0}
      </Text>
      {history.length === 0 ? (
        <Text style={styles.body}>No games yet. New game is not created by listing.</Text>
      ) : null}
      <View style={styles.actionRow}>
        <Pressable
          style={[styles.button, styles.actionButton, disabled ? styles.buttonDisabled : null]}
          disabled={disabled}
          onPress={onNewGame}
        >
          <Text style={styles.buttonLabel}>New game</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.actionButton, disabled ? styles.buttonDisabled : null]}
          disabled={disabled}
          onPress={onToggleHistory}
        >
          <Text style={styles.buttonLabel}>
            {historyOpen ? "Hide history" : "History"}
          </Text>
        </Pressable>
      </View>
      {historyOpen ? (
        <View style={styles.historyBox}>
          <Text style={styles.label}>Game history (newest first)</Text>
          {history.length === 0 ? (
            <Text style={styles.body}>No games yet. New game is not created by listing.</Text>
          ) : (
            history.map((entry) => (
              <Pressable
                key={entry.id}
                style={[
                  styles.roll,
                  selectedGameId === entry.id ? styles.rollSelected : null,
                ]}
                onPress={() => onOpenGame(entry.id)}
              >
                <Text style={styles.body}>
                  {entry.label}
                  {selectedGameId === entry.id ? "  (open)" : ""}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
      <Text style={styles.label}>
        Enter roll
        {view?.next ? ` (F${view.next.frame_number} R${view.next.roll_number})` : " (none)"}
      </Text>
      <View style={styles.pinRow}>
        {PIN_VALUES.map((n) => (
          <Pressable
            key={`enter-${n}`}
            style={[styles.pin, recordBlocked ? styles.buttonDisabled : null]}
            disabled={recordBlocked}
            onPress={() => onRecord(n)}
          >
            <Text style={styles.pinLabel}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Current derived sheet (non-authoritative)</Text>
      <Text style={styles.sheet} selectable>
        {view?.formatted ?? "—"}
      </Text>
      <Text style={styles.label}>Select a recorded roll, then correct pinfall</Text>
      {view?.rolls.length ? (
        view.rolls.map((r) => (
          <Pressable
            key={r.entity_id}
            style={[
              styles.roll,
              selectedRollId === r.entity_id ? styles.rollSelected : null,
            ]}
            onPress={() => setSelectedRollId(r.entity_id)}
          >
            <Text style={styles.body}>
              F{r.frame_number} R{r.roll_number} = {r.pinfall}
              {selectedRollId === r.entity_id ? "  (selected)" : ""}
            </Text>
          </Pressable>
        ))
      ) : (
        <Text style={styles.body}>No rolls yet.</Text>
      )}
      <View style={styles.pinRow}>
        {PIN_VALUES.map((n) => (
          <Pressable
            key={`fix-${n}`}
            style={[
              styles.pin,
              disabled || !selectedRollId || view?.gameMissing ? styles.buttonDisabled : null,
            ]}
            disabled={disabled || !selectedRollId || !!view?.gameMissing}
            onPress={() => onCorrect(n)}
          >
            <Text style={styles.pinLabel}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.footnote}>
        Scores are derived on each load. Restart recovers the newest persisted game.
        An opened game stays selected until you open another or create a new one.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#d9d1c3",
  },
  title: { fontSize: 16, fontWeight: "700", color: "#1b1b1b" },
  label: { fontSize: 11, textTransform: "uppercase", color: "#6b6b6b", marginTop: 4 },
  body: { fontSize: 14, color: "#1b1b1b" },
  note: { fontSize: 13, color: "#4a4a4a" },
  sheet: { fontSize: 13, color: "#1b1b1b", fontVariant: ["tabular-nums"] },
  footnote: { fontSize: 12, color: "#5c5c5c" },
  actionRow: { flexDirection: "row", gap: 8 },
  actionButton: { flex: 1 },
  historyBox: { gap: 8 },
  button: {
    backgroundColor: "#1f4d3a",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  buttonDisabled: { backgroundColor: "#9aa59f" },
  buttonLabel: { color: "#fff", fontWeight: "600", textAlign: "center" },
  pinRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pin: {
    backgroundColor: "#1f4d3a",
    borderRadius: 8,
    minWidth: 40,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  pinLabel: { color: "#fff", fontWeight: "600" },
  roll: {
    borderWidth: 1,
    borderColor: "#d9d1c3",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  rollSelected: { borderColor: "#1f4d3a", backgroundColor: "#e8f0ec" },
});
