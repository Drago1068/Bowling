import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import {
  correctRollWithStanding,
  listGameHistoryDetailed,
  loadScoringView,
  pinfallLegal,
  recordRoll,
  remainingCountBeforeRoll,
  resolveCaptureRack,
  startGame,
  type FrameProjection,
  type GameHistoryDetail,
  type ScoringView,
  type SqliteDriver,
} from "../../../src/portable.ts";
import {
  INITIAL_SHELL_DISCLOSURES,
  METRIC_RANGE_OPTIONS,
  METRICS_INSUFFICIENT,
  STORAGE_UNAVAILABLE_NOTICE,
  ballCellMark,
  computeHomeMetrics,
  defaultFixRollId,
  fixModeLayout,
  frameSlotCount,
  groupHistoryByDate,
  humanizeNextBallRejection,
  ordinalBall,
  scoringActionsAllowed,
  scoringPad,
  selectionAfterDisclosure,
  selectionAfterScoringMode,
  spareControlEnabled,
  strikeControlEnabled,
  toggleDisclosure,
  type MetricRangeId,
} from "../../../src/shellPresentation.ts";

const PIN_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const RACK_ROWS = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]] as const;

export function ScoringPanel(props: {
  driver: SqliteDriver | null;
  deviceId: string | null;
  enabled: boolean;
  reloadToken: string;
}) {
  const [view, setView] = useState<ScoringView | null>(null);
  const [history, setHistory] = useState<GameHistoryDetail[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [homeOpen, setHomeOpen] = useState(true);
  const [selectedRollId, setSelectedRollId] = useState<string | null>(null);
  const [fixMode, setFixMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(
    INITIAL_SHELL_DISCLOSURES.historyOpen,
  );
  const [metricsRange, setMetricsRange] = useState<MetricRangeId>("all");
  const [notice, setNotice] = useState("");
  const [draftStanding, setDraftStanding] = useState<number[]>([]);
  const [standingTouched, setStandingTouched] = useState(false);
  const [draftPinfall, setDraftPinfall] = useState<number | null>(null);

  const refresh = (gameId: string | null) => {
    if (!props.driver) return;
    setHistory(listGameHistoryDetailed(props.driver));
    const loaded = loadScoringView(props.driver, gameId);
    setView(loaded);
    setSelectedGameId(loaded.gameId);
  };

  useEffect(() => {
    if (!props.driver || !props.enabled) return;
    const listed = listGameHistoryDetailed(props.driver);
    setHistory(listed);
    if (!sessionReady) {
      setSessionReady(true);
      setHomeOpen(true);
      setView(null);
      setSelectedGameId(null);
      setNotice("");
      return;
    }
    if (homeOpen) return;
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
    homeOpen,
  ]);

  const clearDraft = () => {
    setDraftStanding([]);
    setStandingTouched(false);
    setDraftPinfall(null);
  };

  const onGoHome = () => {
    setHomeOpen(true);
    setFixMode(false);
    setSelectedRollId(null);
    setHistoryOpen(false);
    clearDraft();
    if (props.driver) setHistory(listGameHistoryDetailed(props.driver));
    setNotice("");
  };

  const onToggleHistory = () => {
    const next = toggleDisclosure(
      { historyOpen, diagnosticsOpen: false },
      "historyOpen",
    );
    setHistoryOpen(next.historyOpen);
    if (next.historyOpen) {
      setFixMode(false);
      setSelectedRollId(null);
      clearDraft();
    }
    setSelectedGameId((current) => selectionAfterDisclosure(current, next));
  };

  const onNewGame = () => {
    if (!props.driver || !props.deviceId) return;
    const gameId = startGame(props.driver, props.deviceId);
    setSelectedRollId(null);
    setFixMode(false);
    clearDraft();
    setHistoryOpen(false);
    setHomeOpen(false);
    setSelectedGameId(gameId);
    setSessionReady(true);
    refresh(gameId);
    setNotice("Tap standing pins, then ✓ — or use X / G / / when legal.");
  };

  const onOpenGame = (gameId: string) => {
    if (!props.driver) return;
    setSelectedRollId(null);
    setFixMode(false);
    clearDraft();
    setHistoryOpen(false);
    setHomeOpen(false);
    setSelectedGameId(gameId);
    const next = loadScoringView(props.driver, gameId);
    setView(next);
    setHistory(listGameHistoryDetailed(props.driver));
    setNotice(
      next.gameMissing
        ? "This game was not found. Another game was not opened in its place."
        : next.sheet?.status === "COMPLETED"
          ? "Game complete — Start New Game or Done for the Day."
          : "Tap standing pins, then ✓ — or use X / G / / when legal.",
    );
  };

  const onEnterFixMode = () => {
    setSelectedGameId((current) => selectionAfterScoringMode(current));
    setFixMode(true);
    setHistoryOpen(false);
    setSelectedRollId(null);
    clearDraft();
    setNotice("Tap a frame on the scorecard, or choose a ball below.");
  };

  const onCancelFix = () => {
    setSelectedGameId((current) => selectionAfterScoringMode(current));
    setFixMode(false);
    setSelectedRollId(null);
    clearDraft();
    setNotice("");
  };

  const captureFacts = useMemo(
    () =>
      (view?.rolls ?? []).map((r) => ({
        frame_number: r.frame_number,
        roll_number: r.roll_number,
        pinfall: r.pinfall,
        standing_pins: r.standing_pins,
        pin_detail_status: r.pin_detail_status,
      })),
    [view?.rolls],
  );

  const activeSlot = fixMode && selectedRollId
    ? (() => {
        const roll = view?.rolls.find((r) => r.entity_id === selectedRollId);
        return roll
          ? { frame_number: roll.frame_number, roll_number: roll.roll_number }
          : null;
      })()
    : view?.next ?? null;

  const rack = useMemo(() => {
    if (!activeSlot) return null;
    return resolveCaptureRack(
      captureFacts,
      activeSlot.frame_number,
      activeSlot.roll_number,
    );
  }, [activeSlot, captureFacts]);

  const remainingCount = useMemo(() => {
    if (!activeSlot) return null;
    return remainingCountBeforeRoll(
      captureFacts.map((f, i) => ({
        entity_id: `f-${i}`,
        frame_number: f.frame_number,
        roll_number: f.roll_number,
        pinfall: f.pinfall,
        entity_version: 1,
      })),
      activeSlot.frame_number,
      activeSlot.roll_number,
    );
  }, [activeSlot, captureFacts]);

  const toggleStandingPin = (pin: number) => {
    if (!rack || !rack.includes(pin)) return;
    setStandingTouched(true);
    setDraftStanding((current) =>
      current.includes(pin)
        ? current.filter((p) => p !== pin)
        : [...current, pin].sort((a, b) => a - b),
    );
  };

  const tenthB1 = view?.rolls.find((r) => r.frame_number === 10 && r.roll_number === 1);
  const tenthB2 = view?.rolls.find((r) => r.frame_number === 10 && r.roll_number === 2);
  const canStrike =
    !!rack &&
    !!activeSlot &&
    strikeControlEnabled({
      rackLength: rack.length,
      frameNumber: activeSlot.frame_number,
      rollNumber: activeSlot.roll_number,
      tenthBall1Pinfall: tenthB1?.pinfall ?? null,
      tenthBall2Pinfall: tenthB2?.pinfall ?? null,
    });
  const canGutter = !!rack && rack.length > 0;
  const canSpare =
    !!rack &&
    !!activeSlot &&
    spareControlEnabled({
      rackLength: rack.length,
      frameNumber: activeSlot.frame_number,
      rollNumber: activeSlot.roll_number,
      tenthBall1Pinfall: tenthB1?.pinfall ?? null,
      tenthBall2Pinfall: tenthB2?.pinfall ?? null,
    });

  const selectFixRoll = (roll: {
    entity_id: string;
    frame_number: number;
    roll_number: number;
    standing_pins: number[] | null;
  }) => {
    setFixMode(true);
    setSelectedRollId(roll.entity_id);
    setDraftStanding(roll.standing_pins ? [...roll.standing_pins] : []);
    setStandingTouched(!!roll.standing_pins);
    setNotice(
      `Correct Frame ${roll.frame_number} · ${ordinalBall(roll.roll_number)} ball. Edit standing, then ✓.`,
    );
  };

  const saveDelivery = (pinfall: number, standing: number[]) => {
    if (!props.driver || !props.deviceId || !view?.gameId || view.gameMissing) return;
    if (fixMode && selectedRollId) {
      const result = correctRollWithStanding(
        props.driver,
        props.deviceId,
        selectedRollId,
        pinfall,
        standing,
      );
      const next = loadScoringView(props.driver, view.gameId);
      setView(next);
      setHistory(listGameHistoryDetailed(props.driver));
      if (!result.ok) {
        setNotice(result.message.replace(/\bpinfall\b/gi, "pins"));
        return;
      }
      clearDraft();
      setFixMode(false);
      setSelectedRollId(null);
      setNotice(
        next.sheet?.status === "DOMAIN_INVALID_REQUIRING_REPAIR"
          ? "Saved. A later ball may need repair."
          : `Saved correction. Standing ${standing.length ? standing.join(", ") : "none"}; pins ${pinfall}.`,
      );
      return;
    }
    const slot = view.next;
    if (slot == null) return;
    if (!pinfallLegal(view.rolls, slot, pinfall)) {
      setNotice(humanizeNextBallRejection("illegal"));
      return;
    }
    const result = recordRoll(props.driver, props.deviceId, view.gameId, pinfall, {
      kind: "record",
      standing_pins: standing,
    });
    const next = loadScoringView(props.driver, view.gameId);
    setView(next);
    setHistory(listGameHistoryDetailed(props.driver));
    if (result.ok) {
      clearDraft();
      const done =
        next.sheet?.status === "COMPLETED" && next.sheet.finalTotal != null;
      setNotice(
        done
          ? `Saved. Game complete · ${next.sheet!.finalTotal}.`
          : `Saved: pins ${pinfall}; standing ${
              standing.length ? standing.join(", ") : "none"
            }. Next: Frame ${next.next?.frame_number ?? "—"} · ${
              next.next ? ordinalBall(next.next.roll_number) : ""
            } ball.`,
      );
    } else {
      setNotice(humanizeNextBallRejection(result.message));
    }
  };

  const onImmediateStrike = () => {
    if (!canStrike || !rack) return;
    saveDelivery(rack.length, []);
  };
  const onImmediateGutter = () => {
    if (!canGutter || !rack) return;
    saveDelivery(0, rack.slice());
  };
  const onImmediateSpare = () => {
    if (!canSpare || !rack) return;
    saveDelivery(rack.length, []);
  };
  const onConfirmStanding = () => {
    if (!rack) return;
    if (!fixMode && !standingTouched) {
      setNotice(
        "Nothing saved. Tap standing pins, then ✓ — or use X / G / / when legal.",
      );
      return;
    }
    const standing = draftStanding.filter((p) => rack.includes(p));
    const pinfall = rack.length - standing.length;
    saveDelivery(pinfall, standing);
  };

  const onPickCountOnlyPinfall = (pinfall: number) => {
    setDraftPinfall(pinfall);
    setNotice(`Pins knocked down: ${pinfall}. Tap Save (standing identities unknown).`);
  };

  const onSaveCountOnly = () => {
    if (draftPinfall == null || !props.driver || !props.deviceId || !view?.gameId) return;
    const slot = view.next;
    if (!slot || !pinfallLegal(view.rolls, slot, draftPinfall)) {
      setNotice(humanizeNextBallRejection("illegal"));
      return;
    }
    const result = recordRoll(props.driver, props.deviceId, view.gameId, draftPinfall, {
      kind: "omit",
    });
    const next = loadScoringView(props.driver, view.gameId);
    setView(next);
    setHistory(listGameHistoryDetailed(props.driver));
    if (result.ok) {
      clearDraft();
      setNotice(`Saved: pins ${draftPinfall}. Pin detail not recorded (prior rack unknown).`);
    } else {
      setNotice(humanizeNextBallRejection(result.message));
    }
  };

  const onFrameTap = (frameNumber: number) => {
    if (!view?.rolls.length || homeOpen) return;
    const inFrame = view.rolls
      .filter((r) => r.frame_number === frameNumber)
      .slice()
      .sort((a, b) => a.roll_number - b.roll_number);
    if (!inFrame.length) {
      if (view.next?.frame_number === frameNumber) {
        setFixMode(false);
        setSelectedRollId(null);
        clearDraft();
        setNotice(`Frame ${frameNumber} — enter the next ball.`);
      }
      return;
    }
    const firstId = defaultFixRollId(inFrame);
    const target = inFrame.find((r) => r.entity_id === firstId) ?? inFrame[0]!;
    selectFixRoll(target);
  };

  const storageAvailable = scoringActionsAllowed({
    storageAvailable: !!props.enabled && !!props.driver && !!props.deviceId,
  });
  const disabled = !storageAvailable;
  const leftoverUnavailable = disabled && (history.length > 0 || !!view?.gameId);
  const pad = scoringPad({
    historyOpen: homeOpen || historyOpen,
    fixMode,
    canRecord: !!view?.canRecord,
    gameMissing: !!view?.gameMissing,
  });
  const openLabel =
    history.find((entry) => entry.id === selectedGameId)?.label ?? null;
  const completed =
    view?.sheet?.status === "COMPLETED" && view.sheet.finalTotal !== null;
  const needsRepair = view?.sheet?.status === "DOMAIN_INVALID_REQUIRING_REPAIR";
  const empty = !view?.gameId && !homeOpen;
  const selectedRoll = view?.rolls.find((r) => r.entity_id === selectedRollId);
  const fixLayout = fixModeLayout(selectedRollId);
  const fixRollsInFrame = selectedRoll
    ? view?.rolls
        .filter((r) => r.frame_number === selectedRoll.frame_number)
        .slice()
        .sort((a, b) => a.roll_number - b.roll_number) ?? []
    : [];
  const metrics = computeHomeMetrics(history, metricsRange);
  const dateGroups = groupHistoryByDate(history, metricsRange);

  if (homeOpen) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Bowling</Text>
        <Text style={styles.lead}>
          Score history by date. Opening a game does not create a new one.
        </Text>
        {leftoverUnavailable ? (
          <Text style={styles.repair}>{STORAGE_UNAVAILABLE_NOTICE}</Text>
        ) : null}
        {notice && !leftoverUnavailable ? (
          <Text style={styles.note}>{notice}</Text>
        ) : null}

        <View style={styles.metricsCard}>
          <View style={styles.rangeBar}>
            {METRIC_RANGE_OPTIONS.map((r) => (
              <Pressable
                key={r.id}
                style={[
                  styles.rangeBtn,
                  metricsRange === r.id ? styles.rangeBtnActive : null,
                ]}
                onPress={() => setMetricsRange(r.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: metricsRange === r.id }}
              >
                <Text
                  style={[
                    styles.rangeBtnLabel,
                    metricsRange === r.id ? styles.rangeBtnLabelActive : null,
                  ]}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.metricsTitle}>Your metrics</Text>
          <MetricRow
            label="Overall Average"
            value={
              metrics.enough && metrics.overallAverage != null
                ? String(metrics.overallAverage)
                : METRICS_INSUFFICIENT
            }
          />
          <MetricRow
            label="Average by Date"
            value={
              metrics.enough
                ? `${metrics.averageByDateRows.length} date(s)`
                : METRICS_INSUFFICIENT
            }
          />
          {metrics.averageByDateRows.length > 0 ? (
            <View style={styles.abdBox}>
              {metrics.averageByDateRows.map((row) => (
                <Text key={row.date} style={styles.abdRow}>
                  {row.date} — Average score:{" "}
                  <Text style={styles.bold}>
                    {row.average != null ? row.average : METRICS_INSUFFICIENT}
                  </Text>
                  {" — Week average: "}
                  <Text style={styles.bold}>
                    {row.weekAverage != null ? row.weekAverage : METRICS_INSUFFICIENT}
                  </Text>
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.abdRow}>
              Average score: <Text style={styles.bold}>{METRICS_INSUFFICIENT}</Text>
            </Text>
          )}
          <MetricRow
            label="Rolling Average"
            value={
              metrics.enough && metrics.rollingAverage != null
                ? String(metrics.rollingAverage)
                : METRICS_INSUFFICIENT
            }
          />
          <MetricRow label="PBA Handicap Score" value={metrics.pbaDisplay} />
          <MetricRow label="Qualifying Games" value={String(metrics.qualifyingGames)} />
          <Text style={styles.hint}>
            Based on completed games in the selected range. PBA handicap formula
            not defined.
          </Text>
        </View>

        {dateGroups.map((group) => (
          <View key={group.date} style={styles.dateGroup}>
            <View style={styles.dateHeader}>
              <Text style={styles.dateLabel}>{group.date}</Text>
              <Text style={styles.dateAvg}>
                Average:{" "}
                <Text style={styles.bold}>
                  {group.average != null ? group.average : METRICS_INSUFFICIENT}
                </Text>
              </Text>
            </View>
            {group.games.map((g) => (
              <Pressable
                key={g.id}
                style={[styles.gameRow, disabled ? styles.buttonDisabled : null]}
                disabled={disabled}
                onPress={() => onOpenGame(g.id)}
              >
                <View>
                  <Text style={styles.body}>Game {g.gameNumber}</Text>
                  <Text style={styles.meta}>
                    {g.status === "complete"
                      ? "Complete"
                      : g.status === "repair"
                        ? "Needs repair"
                        : "Active"}
                  </Text>
                </View>
                <Text style={styles.gameScore}>
                  {g.status === "complete" && g.finalTotal != null
                    ? g.finalTotal
                    : "…"}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}

        {dateGroups.length === 0 ? (
          <Text style={styles.body}>No games yet in this range.</Text>
        ) : null}

        <Pressable
          style={[styles.button, disabled ? styles.buttonDisabled : null]}
          disabled={disabled}
          onPress={onNewGame}
        >
          <Text style={styles.buttonLabel}>Start New Game</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Bowling</Text>
      {empty ? (
        <Text style={styles.lead}>
          Tap standing pins still up, then ✓. X, G, and / save immediately when
          legal.
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

      {view?.sheet && !historyOpen ? (
        <Scorecard
          frames={view.sheet.frames}
          runningTotals={view.sheet.runningTotals}
          onFramePress={onFrameTap}
          highlightFrame={
            fixMode && selectedRoll
              ? selectedRoll.frame_number
              : view.next?.frame_number ?? null
          }
        />
      ) : null}

      {(pad === "nextBall" || (fixMode && fixLayout.showEditor)) &&
      activeSlot &&
      !completed ? (
        <View style={styles.block}>
          <Text style={styles.context}>
            Frame {activeSlot.frame_number} · {ordinalBall(activeSlot.roll_number)}{" "}
            ball
            {fixMode ? " · correcting" : ""}
          </Text>
          {fixMode && fixRollsInFrame.length > 1 ? (
            <View style={styles.ballSwitchRow}>
              {fixRollsInFrame.map((r) => (
                <Pressable
                  key={r.entity_id}
                  style={[
                    styles.ballSwitchBtn,
                    selectedRollId === r.entity_id ? styles.ballSwitchBtnActive : null,
                  ]}
                  onPress={() => selectFixRoll(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${ordinalBall(r.roll_number)} ball`}
                >
                  <Text
                    style={[
                      styles.ballSwitchLabel,
                      selectedRollId === r.entity_id
                        ? styles.ballSwitchLabelActive
                        : null,
                    ]}
                  >
                    {ordinalBall(r.roll_number)} throw
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {rack ? (
            <>
              <Text style={styles.prompt}>Tap the pins still standing.</Text>
              <StandingRack
                rack={rack}
                selected={draftStanding}
                onToggle={toggleStandingPin}
                disabled={disabled || !!view?.gameMissing}
              />
              <View style={styles.cornerRow}>
                <CornerButton
                  label="X"
                  disabled={disabled || !canStrike}
                  onPress={onImmediateStrike}
                  accessibilityLabel="X — save strike immediately"
                />
                <CornerButton
                  label="G"
                  disabled={disabled || !canGutter}
                  onPress={onImmediateGutter}
                  accessibilityLabel="Gutter — save zero immediately"
                />
                <CornerButton
                  label="✓"
                  disabled={disabled || (!fixMode && !standingTouched)}
                  onPress={onConfirmStanding}
                  accessibilityLabel="Confirm standing pins"
                  primary
                />
                <CornerButton
                  label="/"
                  disabled={disabled || !canSpare}
                  onPress={onImmediateSpare}
                  accessibilityLabel="Slash — save spare immediately"
                />
              </View>
              {fixMode ? (
                <Pressable style={styles.secondary} onPress={onCancelFix}>
                  <Text style={styles.secondaryLabel}>Cancel</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.prompt}>
                Prior pin identities unknown — enter pins knocked down (
                {remainingCount ?? "?"} remaining).
              </Text>
              <PinPad
                prefix="count"
                disabled={disabled}
                enabledValues={PIN_VALUES.filter((n) =>
                  view?.next ? pinfallLegal(view.rolls, view.next, n) : false,
                )}
                onSelect={onPickCountOnlyPinfall}
              />
              {draftPinfall != null ? (
                <Pressable
                  style={[styles.button, disabled ? styles.buttonDisabled : null]}
                  disabled={disabled}
                  onPress={onSaveCountOnly}
                >
                  <Text style={styles.buttonLabel}>Save</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {fixMode && fixLayout.showRollChooser && !historyOpen ? (
        <View style={styles.block}>
          <Text style={styles.prompt}>Choose the ball to change.</Text>
          <Pressable style={styles.secondary} onPress={onCancelFix}>
            <Text style={styles.secondaryLabel}>Cancel</Text>
          </Pressable>
          <ScrollView
            style={styles.fixRollList}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {view?.rolls.map((r) => (
              <Pressable
                key={r.entity_id}
                style={[
                  styles.roll,
                  selectedRollId === r.entity_id ? styles.rollSelected : null,
                ]}
                onPress={() => selectFixRoll(r)}
              >
                <Text style={styles.body}>
                  Frame {r.frame_number}, {ordinalBall(r.roll_number)} ball ={" "}
                  {r.pinfall}
                  {r.standing_pins
                    ? ` · standing ${r.standing_pins.join(",") || "none"}`
                    : " · detail not recorded"}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {historyOpen ? (
        <View style={styles.historyBox}>
          <Text style={styles.body}>
            These are your games. Tap one to open it.
          </Text>
          <Pressable
            style={[styles.button, disabled ? styles.buttonDisabled : null]}
            disabled={disabled}
            onPress={onNewGame}
          >
            <Text style={styles.buttonLabel}>Start a new game</Text>
          </Pressable>
          {history.map((entry) => (
            <Pressable
              key={entry.id}
              disabled={disabled}
              style={[
                styles.roll,
                selectedGameId === entry.id ? styles.rollSelected : null,
              ]}
              onPress={() => onOpenGame(entry.id)}
            >
              <Text style={styles.body}>{entry.label}</Text>
              <Text style={styles.openAction}>Open</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.actionColumn}>
        {completed && !historyOpen ? (
          <>
            <Pressable
              style={[styles.button, disabled ? styles.buttonDisabled : null]}
              disabled={disabled}
              onPress={onNewGame}
            >
              <Text style={styles.buttonLabel}>Start New Game</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={onGoHome}>
              <Text style={styles.secondaryLabel}>Done for the Day</Text>
            </Pressable>
          </>
        ) : null}
        {!fixMode && view?.rolls.length && !historyOpen && !completed ? (
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
            style={[styles.secondary, styles.actionButton]}
            disabled={disabled}
            onPress={onGoHome}
          >
            <Text style={styles.secondaryLabel}>Home</Text>
          </Pressable>
          <Pressable
            style={[styles.secondary, styles.actionButton]}
            disabled={disabled}
            onPress={onToggleHistory}
          >
            <Text style={styles.secondaryLabel}>
              {historyOpen ? "Hide previous games" : "Previous games"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function MetricRow(props: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{props.label}</Text>
      <Text style={styles.metricValue}>{props.value}</Text>
    </View>
  );
}

function CornerButton(props: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[
        styles.cornerBtn,
        props.primary ? styles.cornerBtnPrimary : null,
        props.disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.cornerBtnLabel,
          props.primary ? styles.cornerBtnLabelPrimary : null,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function StandingRack(props: {
  rack: number[];
  selected: number[];
  onToggle: (pin: number) => void;
  disabled?: boolean;
}) {
  const available = new Set(props.rack);
  return (
    <View style={styles.rack} accessibilityLabel="Standing pin rack">
      {RACK_ROWS.map((row) => (
        <View key={row.join("-")} style={styles.rackRow}>
          {row.map((pin) => {
            if (!available.has(pin)) {
              return <View key={pin} style={styles.pinGhost} />;
            }
            const on = props.selected.includes(pin);
            return (
              <Pressable
                key={pin}
                disabled={props.disabled}
                onPress={() => props.onToggle(pin)}
                style={[
                  styles.pin,
                  on ? styles.pinStanding : styles.pinDown,
                  props.disabled ? styles.buttonDisabled : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={
                  on ? `Pin ${pin} standing` : `Pin ${pin} down`
                }
              >
                <Text style={styles.pinLabel}>{pin}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function PinPad(props: {
  prefix: string;
  disabled: boolean;
  enabledValues: readonly number[];
  onSelect: (n: number) => void;
}) {
  const enabled = new Set(props.enabledValues);
  return (
    <View style={styles.pad}>
      {PIN_VALUES.map((n) => {
        const on = enabled.has(n);
        return (
          <Pressable
            key={`${props.prefix}-${n}`}
            disabled={props.disabled || !on}
            onPress={() => props.onSelect(n)}
            style={[
              styles.padBtn,
              !on || props.disabled ? styles.buttonDisabled : null,
            ]}
          >
            <Text style={styles.padLabel}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Scorecard(props: {
  frames: readonly FrameProjection[];
  runningTotals: ReadonlyArray<number | null>;
  onFramePress?: (frameNumber: number) => void;
  highlightFrame?: number | null;
}) {
  return (
    <View style={styles.scorecard}>
      {props.frames.map((frame, index) => (
        <FrameBox
          key={frame.frame_number}
          frame={frame}
          running={props.runningTotals[index] ?? null}
          onPress={props.onFramePress}
          highlighted={props.highlightFrame === frame.frame_number}
        />
      ))}
    </View>
  );
}

function FrameBox(props: {
  frame: FrameProjection;
  running: number | null;
  onPress?: (frameNumber: number) => void;
  highlighted?: boolean;
}) {
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
    props.running === null
      ? pending && props.frame.deliveries.length
        ? "…"
        : ""
      : String(props.running);
  return (
    <Pressable
      onPress={() => props.onPress?.(props.frame.frame_number)}
      style={[
        styles.frameBox,
        props.frame.frame_number === 10 ? styles.frameTen : null,
        props.highlighted ? styles.frameHighlight : null,
      ]}
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
                : `Frame ${props.frame.frame_number} ball ${i + 1} ${
                    mark === "X" ? "strike" : mark === "/" ? "spare" : mark
                  }`
            }
          >
            {mark === "unplayed" ? "·" : mark}
          </Text>
        ))}
      </View>
      <Text style={styles.frameTotal}>{totalText}</Text>
    </Pressable>
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
  meta: { fontSize: 13, color: "#5c564c" },
  note: { fontSize: 15, color: "#1f4d3a", fontWeight: "600" },
  repair: { fontSize: 15, color: "#8a1f16", fontWeight: "600" },
  complete: { fontSize: 18, fontWeight: "700", color: "#1b1b1b" },
  hint: { fontSize: 12, color: "#5c564c", marginTop: 4 },
  bold: { fontWeight: "800", color: "#1b1b1b" },
  block: { gap: 10 },
  metricsCard: {
    borderWidth: 1,
    borderColor: "#d9d1c3",
    borderRadius: 10,
    padding: 12,
    gap: 6,
    backgroundColor: "#faf8f4",
  },
  metricsTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 2,
  },
  metricLabel: { fontSize: 14, color: "#5c564c", flex: 1 },
  metricValue: { fontSize: 14, fontWeight: "700", color: "#1b1b1b" },
  rangeBar: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  rangeBtn: {
    flexGrow: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cfc6b8",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  rangeBtnActive: { backgroundColor: "#1f4d3a", borderColor: "#1f4d3a" },
  rangeBtnLabel: { fontSize: 13, fontWeight: "600", color: "#1b1b1b" },
  rangeBtnLabelActive: { color: "#fff" },
  abdBox: {
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#cfc6b8",
    borderRadius: 8,
    padding: 8,
    gap: 4,
  },
  abdRow: { fontSize: 13, fontWeight: "600", color: "#1b1b1b" },
  dateGroup: { marginBottom: 8, gap: 6 },
  dateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5c564c",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  dateAvg: { fontSize: 13, fontWeight: "700", color: "#1b1b1b" },
  gameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d9d1c3",
    backgroundColor: "#fff",
  },
  gameScore: { fontSize: 20, fontWeight: "800", color: "#1b1b1b" },
  rack: { gap: 8, alignItems: "center", paddingVertical: 8 },
  rackRow: { flexDirection: "row", gap: 8, justifyContent: "center" },
  pin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  pinStanding: { backgroundColor: "#fff", borderColor: "#1f4d3a" },
  pinDown: { backgroundColor: "#e8e2d8", borderColor: "#cfc6b8", opacity: 0.55 },
  pinGhost: { width: 44, height: 44 },
  pinLabel: { fontSize: 16, fontWeight: "800", color: "#1b1b1b" },
  cornerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  cornerBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cfc6b8",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  cornerBtnPrimary: { backgroundColor: "#1f4d3a", borderColor: "#1f4d3a" },
  cornerBtnLabel: { fontSize: 22, fontWeight: "800", color: "#1b1b1b" },
  cornerBtnLabelPrimary: { color: "#fff" },
  ballSwitchRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ballSwitchBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cfc6b8",
    backgroundColor: "#fff",
  },
  ballSwitchBtnActive: { backgroundColor: "#1f4d3a", borderColor: "#1f4d3a" },
  ballSwitchLabel: { fontSize: 14, fontWeight: "700", color: "#1b1b1b" },
  ballSwitchLabelActive: { color: "#fff" },
  pad: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  padBtn: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cfc6b8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  padLabel: { fontSize: 18, fontWeight: "700" },
  button: {
    backgroundColor: "#1f4d3a",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondary: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cfc6b8",
    backgroundColor: "#fff",
  },
  secondaryLabel: { color: "#1b1b1b", fontWeight: "600", fontSize: 15 },
  actionColumn: { gap: 8 },
  actionRow: { flexDirection: "row", gap: 8 },
  actionButton: { flex: 1 },
  historyBox: { gap: 8 },
  roll: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d9d1c3",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rollSelected: { borderColor: "#1f4d3a", backgroundColor: "#eef6f1" },
  openAction: { fontWeight: "700", color: "#1f4d3a" },
  fixRollList: { maxHeight: 220 },
  scorecard: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  frameBox: {
    width: "18%",
    minWidth: 56,
    borderWidth: 1,
    borderColor: "#cfc6b8",
    borderRadius: 6,
    padding: 4,
    backgroundColor: "#fff",
  },
  frameTen: { width: "22%", minWidth: 68 },
  frameHighlight: { borderColor: "#1f4d3a", borderWidth: 2 },
  frameNum: { fontSize: 11, fontWeight: "700", color: "#5c564c" },
  balls: { flexDirection: "row", gap: 2, minHeight: 20 },
  ballMark: { fontSize: 14, fontWeight: "800", minWidth: 14 },
  frameTotal: { fontSize: 13, fontWeight: "700", marginTop: 2 },
});
