import { useEffect, useState } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import {
  correctRoll,
  listGameHistory,
  loadScoringView,
  pinfallLegal,
  recordRoll,
  startGame,
  type FrameProjection,
  type GameHistoryEntry,
  type ScoringView,
  type SqliteDriver,
} from "../../../src/portable.ts";
import {
  INITIAL_SHELL_DISCLOSURES,
  STORAGE_UNAVAILABLE_NOTICE,
  ballCellMark,
  frameSlotCount,
  humanizeNextBallRejection,
  ordinalBall,
  scoringActionsAllowed,
  scoringPad,
  selectionAfterDisclosure,
  selectionAfterScoringMode,
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
  const [fixMode, setFixMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(
    INITIAL_SHELL_DISCLOSURES.historyOpen,
  );
  const [notice, setNotice] = useState("");

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
        setNotice("Score a ten-pin game. After each throw, tap how many pins fell.");
      } else if (loaded.gameMissing) {
        setNotice(
          "This game was not found. Another game was not opened in its place.",
        );
      } else {
        setNotice("");
      }
      return;
    }
    const loaded = loadScoringView(props.driver, selectedGameId);
    setView(loaded);
    if (loaded.gameMissing) {
      setNotice(
        "This game was not found. Another game was not opened in its place.",
      );
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
    if (next.historyOpen) {
      setFixMode(false);
      setSelectedRollId(null);
    }
    setSelectedGameId((current) => selectionAfterDisclosure(current, next));
  };

  const onNewGame = () => {
    if (!props.driver || !props.deviceId) return;
    const gameId = startGame(props.driver, props.deviceId);
    setSelectedRollId(null);
    setFixMode(false);
    setHistoryOpen(false);
    setSelectedGameId(gameId);
    setSessionReady(true);
    setHistory(listGameHistory(props.driver));
    setView(loadScoringView(props.driver, gameId));
    setNotice("After each throw, tap how many pins fell.");
  };

  const onOpenGame = (gameId: string) => {
    if (!props.driver) return;
    setSelectedRollId(null);
    setFixMode(false);
    setHistoryOpen(false);
    setSelectedGameId(gameId);
    const next = loadScoringView(props.driver, gameId);
    setView(next);
    setNotice(
      next.gameMissing
        ? "This game was not found. Another game was not opened in its place."
        : "",
    );
  };

  const onEnterFixMode = () => {
    setSelectedGameId((current) => selectionAfterScoringMode(current));
    setFixMode(true);
    setHistoryOpen(false);
    setSelectedRollId(null);
    setNotice("Choose the ball to change.");
  };

  const onCancelFix = () => {
    setSelectedGameId((current) => selectionAfterScoringMode(current));
    setFixMode(false);
    setSelectedRollId(null);
    setNotice("");
  };

  const onRecord = (pinfall: number) => {
    if (!props.driver || !props.deviceId || !view?.gameId || view.gameMissing) return;
    const slot = view.next;
    if (
      !slot ||
      !pinfallLegal(view.rolls, slot, pinfall)
    ) {
      setNotice(humanizeNextBallRejection("illegal"));
      return;
    }
    const result = recordRoll(props.driver, props.deviceId, view.gameId, pinfall);
    const next = loadScoringView(props.driver, view.gameId);
    setView(next);
    setHistory(listGameHistory(props.driver));
    if (result.ok) {
      setNotice(
        `Saved: Frame ${slot.frame_number}, ${ordinalBall(slot.roll_number)} ball = ${pinfall}`,
      );
    } else {
      setNotice(humanizeNextBallRejection(result.message));
    }
  };

  const onCorrect = (pinfall: number) => {
    if (!props.driver || !props.deviceId || !selectedRollId || !view?.gameId || view.gameMissing) {
      return;
    }
    const result = correctRoll(props.driver, props.deviceId, selectedRollId, pinfall);
    const next = loadScoringView(props.driver, view.gameId);
    setView(next);
    setHistory(listGameHistory(props.driver));
    if (!result.ok) {
      setNotice(result.message.replace(/\bpinfall\b/gi, "pins"));
      return;
    }
    setFixMode(false);
    setSelectedRollId(null);
    if (next.sheet?.status === "DOMAIN_INVALID_REQUIRING_REPAIR") {
      setNotice(
        "Saved. This game needs a later ball fixed before the score can be finished.",
      );
    } else {
      setNotice("Saved.");
    }
  };

  const storageAvailable = scoringActionsAllowed({
    storageAvailable: !!props.enabled && !!props.driver && !!props.deviceId,
  });
  const disabled = !storageAvailable;
  const leftoverUnavailable = disabled && (!!view?.gameId || history.length > 0);
  const pad = scoringPad({
    historyOpen,
    fixMode,
    canRecord: !!view?.canRecord,
    gameMissing: !!view?.gameMissing,
  });
  const openLabel =
    history.find((entry) => entry.id === selectedGameId)?.label ?? null;
  const completed =
    view?.sheet?.status === "COMPLETED" && view.sheet.finalTotal !== null;
  const needsRepair = view?.sheet?.status === "DOMAIN_INVALID_REQUIRING_REPAIR";
  const empty = !view?.gameId;
  const selectedRoll = view?.rolls.find((r) => r.entity_id === selectedRollId);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Bowling</Text>
      {empty ? (
        <Text style={styles.lead}>
          Score a ten-pin game. After each throw, tap how many pins fell.
        </Text>
      ) : (
        <Text style={styles.lead}>
          This game · {openLabel ?? "opened"}
          {view?.gameMissing ? " (not found)" : ""}
        </Text>
      )}
      {leftoverUnavailable ? (
        <Text style={styles.repair}>{STORAGE_UNAVAILABLE_NOTICE}</Text>
      ) : null}
      {notice && !leftoverUnavailable ? <Text style={styles.note}>{notice}</Text> : null}
      {needsRepair ? (
        <Text style={styles.repair}>
          This game needs a later ball fixed before the score can be finished.
        </Text>
      ) : null}
      {completed ? (
        <Text style={styles.complete}>
          Game finished. Final score {view?.sheet?.finalTotal}.
        </Text>
      ) : null}

      {pad === "nextBall" && view?.next ? (
        <View style={styles.block}>
          <Text style={styles.context}>
            Frame {view.next.frame_number} · {ordinalBall(view.next.roll_number)} ball
          </Text>
          <Text style={styles.prompt}>
            How many pins did you knock down on this ball?
          </Text>
          <PinPad
            prefix="enter"
            disabled={disabled}
            enabledValues={PIN_VALUES.filter((n) =>
              pinfallLegal(view.rolls, view.next!, n),
            )}
            onSelect={onRecord}
          />
        </View>
      ) : null}

      {view?.sheet && !empty && !historyOpen ? (
        <Scorecard frames={view.sheet.frames} runningTotals={view.sheet.runningTotals} />
      ) : null}

      {fixMode && !historyOpen ? (
        <View style={styles.block}>
          <Text style={styles.prompt}>Choose the ball to change.</Text>
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
                  Frame {r.frame_number}, {ordinalBall(r.roll_number)} ball = {r.pinfall}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.body}>No balls recorded yet.</Text>
          )}
          {selectedRoll ? (
            <>
              <Text style={styles.prompt}>
                Change Frame {selectedRoll.frame_number},{" "}
                {ordinalBall(selectedRoll.roll_number)} ball. It is now{" "}
                {selectedRoll.pinfall}. What did you actually knock down?
              </Text>
              <PinPad
                prefix="fix"
                disabled={disabled || !!view?.gameMissing}
                enabledValues={[...PIN_VALUES]}
                onSelect={onCorrect}
              />
            </>
          ) : null}
          <Pressable style={styles.secondary} onPress={onCancelFix}>
            <Text style={styles.secondaryLabel}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      {historyOpen ? (
        <View style={styles.historyBox}>
          <Text style={styles.body}>
            {leftoverUnavailable
              ? "Previous games below are a leftover view, not a live database read."
              : "These are your games. Tap one to open it. Starting a new game does not delete others."}
          </Text>
          <Pressable
            style={[styles.button, disabled ? styles.buttonDisabled : null]}
            disabled={disabled}
            onPress={onNewGame}
          >
            <Text style={styles.buttonLabel}>Start a new game</Text>
          </Pressable>
          {history.length === 0 ? (
            <Text style={styles.body}>No games yet. Listing does not create a game.</Text>
          ) : (
            history.map((entry) => (
              <Pressable
                key={entry.id}
                disabled={disabled}
                style={[
                  styles.roll,
                  selectedGameId === entry.id ? styles.rollSelected : null,
                  disabled ? styles.buttonDisabled : null,
                ]}
                onPress={() => onOpenGame(entry.id)}
              >
                <Text style={styles.body}>{entry.label}</Text>
                <Text style={styles.openAction}>Open</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      <View style={styles.actionColumn}>
        {empty ? (
          <Pressable
            style={[styles.button, disabled ? styles.buttonDisabled : null]}
            disabled={disabled}
            onPress={onNewGame}
          >
            <Text style={styles.buttonLabel}>Start a game</Text>
          </Pressable>
        ) : (
          <>
            {completed && !historyOpen ? (
              <Pressable
                style={[styles.button, disabled ? styles.buttonDisabled : null]}
                disabled={disabled}
                onPress={onNewGame}
              >
                <Text style={styles.buttonLabel}>Start a new game</Text>
              </Pressable>
            ) : null}
            {!fixMode && view?.rolls.length && !historyOpen ? (
              <Pressable
                style={styles.secondary}
                disabled={disabled || !!view?.gameMissing}
                onPress={onEnterFixMode}
              >
                <Text style={styles.secondaryLabel}>Fix a ball</Text>
              </Pressable>
            ) : null}
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.secondary, styles.actionButton, disabled ? styles.buttonDisabled : null]}
                disabled={disabled}
                onPress={onToggleHistory}
              >
                <Text style={styles.secondaryLabel}>
                  {historyOpen ? "Hide previous games" : "Previous games"}
                </Text>
              </Pressable>
              {!completed && !historyOpen ? (
                <Pressable
                  style={[styles.secondary, styles.actionButton, disabled ? styles.buttonDisabled : null]}
                  disabled={disabled}
                  onPress={onNewGame}
                >
                  <Text style={styles.secondaryLabel}>Start a new game</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function PinPad(props: {
  prefix: string;
  disabled: boolean;
  enabledValues: readonly number[];
  onSelect: (n: number) => void;
}) {
  return (
    <View style={styles.pinRow}>
      {PIN_VALUES.map((n) => {
        const allowed = !props.disabled && props.enabledValues.includes(n);
        return (
          <Pressable
            key={`${props.prefix}-${n}`}
            style={[styles.pin, allowed ? null : styles.buttonDisabled]}
            disabled={!allowed}
            onPress={() => props.onSelect(n)}
          >
            <Text style={styles.pinLabel}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Scorecard(props: {
  frames: readonly FrameProjection[];
  runningTotals: ReadonlyArray<number | null>;
}) {
  return (
    <View style={styles.scorecard}>
      {props.frames.map((frame, index) => (
        <FrameBox
          key={frame.frame_number}
          frame={frame}
          running={props.runningTotals[index] ?? null}
        />
      ))}
    </View>
  );
}

function FrameBox(props: { frame: FrameProjection; running: number | null }) {
  const slots = frameSlotCount(props.frame.frame_number);
  const marks = Array.from({ length: slots }, (_, i) =>
    ballCellMark({
      isStrike: props.frame.isStrike,
      isSpare: props.frame.isSpare,
      deliveryIndex: i,
      pinfall: props.frame.deliveries[i],
    }),
  );
  const pending = props.frame.awaitingBonus || props.running === null;
  const totalText =
    props.running === null ? (pending && props.frame.deliveries.length ? "…" : "") : String(props.running);
  return (
    <View
      style={[styles.frameBox, props.frame.frame_number === 10 ? styles.frameTen : null]}
      accessibilityLabel={`Frame ${props.frame.frame_number}`}
    >
      <Text style={styles.frameNum}>{props.frame.frame_number}</Text>
      <View style={styles.balls}>
        {marks.map((mark, i) => (
          <Text
            key={`${props.frame.frame_number}-${i}`}
            style={styles.ballMark}
            accessibilityLabel={
              mark === "unplayed"
                ? `Frame ${props.frame.frame_number} ball ${i + 1} not thrown`
                : `Frame ${props.frame.frame_number} ball ${i + 1} ${mark === "X" ? "strike" : mark === "/" ? "spare" : mark}`
            }
          >
            {mark === "unplayed" ? "·" : mark}
          </Text>
        ))}
      </View>
      <Text style={styles.frameTotal}>{totalText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#d9d1c3",
  },
  title: { fontSize: 22, fontWeight: "700", color: "#1b1b1b" },
  lead: { fontSize: 16, color: "#1b1b1b" },
  prompt: { fontSize: 16, color: "#1b1b1b", fontWeight: "600" },
  context: { fontSize: 18, fontWeight: "700", color: "#1b1b1b" },
  body: { fontSize: 15, color: "#1b1b1b" },
  note: { fontSize: 15, color: "#1f4d3a", fontWeight: "600" },
  repair: { fontSize: 15, color: "#8a1f16", fontWeight: "600" },
  complete: { fontSize: 18, fontWeight: "700", color: "#1b1b1b" },
  block: { gap: 8 },
  scorecard: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  frameBox: {
    width: "18%",
    minWidth: 56,
    borderWidth: 1,
    borderColor: "#d9d1c3",
    borderRadius: 6,
    padding: 6,
    gap: 4,
  },
  frameTen: { width: "31%", minWidth: 96 },
  frameNum: { fontSize: 11, color: "#6b6b6b" },
  balls: { flexDirection: "row", gap: 4, minHeight: 22 },
  ballMark: { fontSize: 16, fontWeight: "700", color: "#1b1b1b", minWidth: 14 },
  frameTotal: { fontSize: 14, color: "#1b1b1b", fontVariant: ["tabular-nums"] },
  actionColumn: { gap: 8, marginTop: 4 },
  actionRow: { flexDirection: "row", gap: 8 },
  actionButton: { flex: 1 },
  historyBox: { gap: 8 },
  button: {
    backgroundColor: "#1f4d3a",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  buttonDisabled: { backgroundColor: "#9aa59f" },
  buttonLabel: { color: "#fff", fontWeight: "600", textAlign: "center", fontSize: 16 },
  secondary: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#d9d1c3",
  },
  secondaryLabel: {
    color: "#1f4d3a",
    fontWeight: "600",
    textAlign: "center",
    fontSize: 15,
  },
  pinRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pin: {
    backgroundColor: "#1f4d3a",
    borderRadius: 8,
    minWidth: 48,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pinLabel: { color: "#fff", fontWeight: "700", fontSize: 16 },
  roll: {
    borderWidth: 1,
    borderColor: "#d9d1c3",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  rollSelected: { borderColor: "#1f4d3a", backgroundColor: "#e8f0ec" },
  openAction: { fontSize: 15, fontWeight: "700", color: "#1f4d3a" },
});
