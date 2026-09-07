import { useEffect, useState } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import {
  correctRoll,
  loadScoringView,
  recordRoll,
  startGame,
  type ScoringView,
  type SqliteDriver,
} from "../../../src/portable.ts";

const PIN_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function ScoringPanel(props: {
  driver: SqliteDriver | null;
  deviceId: string | null;
  enabled: boolean;
  reloadToken: string;
}) {
  const [view, setView] = useState<ScoringView | null>(null);
  const [selectedRollId, setSelectedRollId] = useState<string | null>(null);
  const [notice, setNotice] = useState("Create a game, then enter pinfall.");

  useEffect(() => {
    if (!props.driver || !props.enabled) return;
    setView(loadScoringView(props.driver, null));
  }, [props.driver, props.enabled, props.reloadToken]);

  const onNewGame = () => {
    if (!props.driver || !props.deviceId) return;
    const gameId = startGame(props.driver, props.deviceId);
    setSelectedRollId(null);
    setView(loadScoringView(props.driver, gameId));
    setNotice("Game created (NOT_STARTED until first roll).");
  };

  const onRecord = (pinfall: number) => {
    if (!props.driver || !props.deviceId || !view?.gameId) return;
    const result = recordRoll(props.driver, props.deviceId, view.gameId, pinfall);
    const next = loadScoringView(props.driver, view.gameId);
    setView(next);
    setNotice(result.ok ? `Recorded ${pinfall}.` : result.message);
  };

  const onCorrect = (pinfall: number) => {
    if (!props.driver || !props.deviceId || !selectedRollId || !view?.gameId) return;
    const result = correctRoll(props.driver, props.deviceId, selectedRollId, pinfall);
    const next = loadScoringView(props.driver, view.gameId);
    setView(next);
    setNotice(
      result.ok
        ? `Corrected roll to ${pinfall}. Re-derived ${next.sheet?.status ?? ""}.`
        : result.message,
    );
  };

  const disabled = !props.enabled || !props.driver || !props.deviceId;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Offline scoring</Text>
      <Text style={styles.note}>{notice}</Text>
      <Text style={styles.body}>
        Game: {view?.gameId ?? "none"} | corrections: {view?.correctionCount ?? 0}
      </Text>
      <Pressable
        style={[styles.button, disabled ? styles.buttonDisabled : null]}
        disabled={disabled}
        onPress={onNewGame}
      >
        <Text style={styles.buttonLabel}>New game</Text>
      </Pressable>
      <Text style={styles.label}>
        Enter roll
        {view?.next ? ` (F${view.next.frame_number} R${view.next.roll_number})` : " (none)"}
      </Text>
      <View style={styles.pinRow}>
        {PIN_VALUES.map((n) => (
          <Pressable
            key={`enter-${n}`}
            style={[
              styles.pin,
              disabled || !view?.canRecord ? styles.buttonDisabled : null,
            ]}
            disabled={disabled || !view?.canRecord}
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
              disabled || !selectedRollId ? styles.buttonDisabled : null,
            ]}
            disabled={disabled || !selectedRollId}
            onPress={() => onCorrect(n)}
          >
            <Text style={styles.pinLabel}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.footnote}>
        Scores are derived on each load. Restart recovers the same observations.
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
    paddingVertical: 8,
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
