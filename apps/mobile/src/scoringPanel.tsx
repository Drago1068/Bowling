import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import {
  ART,
  AverageTrendBars,
  BallGlyphSvg,
  EmptyStateArt,
  FinalTotalsBars,
  HeroArtSvg,
  LaneRunSvg,
  RackPinSvg,
  SectionBanner,
  SectionGlyphSvg,
  StrikeBadge,
  TrophySvg,
  type SectionGlyphKind,
} from "./artwork.tsx";
import { loadHandicapSettings, saveHandicapSettings } from "../../../src/localAppSettings.ts";
import {
  analyzeScoringView,
  correctRollWithStanding,
  discardEmptyGame,
  leaveRows,
  listGameHistoryDetailed,
  loadScoringView,
  pinfallLegal,
  recordRoll,
  remainingCountBeforeRoll,
  resolveCaptureRack,
  sparePinSplit,
  startGame,
  type FrameProjection,
  type GameAnalysis,
  type GameHistoryDetail,
  type ScoringView,
  type SqliteDriver,
} from "../../../src/portable.ts";
import {
  ANALYSIS_B3_PENDING_COPY,
  INITIAL_SHELL_DISCLOSURES,
  METRIC_RANGE_OPTIONS,
  METRICS_INSUFFICIENT,
  STORAGE_UNAVAILABLE_NOTICE,
  ballCellMark,
  ballSaveQuip,
  completedSaveBanner,
  completedSaveNotice,
  gameCompleteQuip,
  strikeStreakCount,
  averageTrendGranularity,
  computeAverageTrend,
  computeFocusAnalysis,
  computeGameSetSummary,
  computeHandicap,
  computeHomeMetrics,
  customTrendGranularity,
  defaultFixRollId,
  discardableGame,
  fixModeLayout,
  formatLocalTodayKey,
  frameSlotCount,
  gameDateInMetricRange,
  groupHistoryByDate,
  humanizeNextBallRejection,
  isQualifyingCompletedGame,
  isValidDateKey,
  newGameConfirmNotice,
  ordinalBall,
  scoringActionsAllowed,
  scoringPad,
  selectionAfterDisclosure,
  selectionAfterScoringMode,
  spareControlEnabled,
  strikeControlEnabled,
  toggleDisclosure,
  topNavActions,
  type AppScreen,
  type FocusAnalysis,
  type GameSetSummary,
  type Handedness,
  type HandicapSettings,
  type MetricRangeId,
  type TopNavActionId,
} from "../../../src/shellPresentation.ts";

const PIN_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const RACK_ROWS = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]] as const;

/** Snapshot driving the bottom menu (tabs + confirm sheet, rendered below the scroll content). */
export type TopNavModel = {
  actions: TopNavActionId[];
  screen: AppScreen;
  homeOpen: boolean;
  historyOpen: boolean;
  confirmNewGame: boolean;
  confirmNotice: string;
  disabled: boolean;
  /** True when a game is loaded (Resume is offered off the game screen). */
  gameOpen: boolean;
  onGoHome: () => void;
  onNavigate: (target: AppScreen) => void;
  onResumeGame: () => void;
  onToggleHistory: () => void;
  onRequestNewGame: () => void;
  onConfirmNewGame: () => void;
  onCancelNewGame: () => void;
};

export function topNavSnapshotEqual(a: TopNavModel | null, b: TopNavModel | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.actions.join(",") === b.actions.join(",") &&
    a.screen === b.screen &&
    a.homeOpen === b.homeOpen &&
    a.historyOpen === b.historyOpen &&
    a.confirmNewGame === b.confirmNewGame &&
    a.confirmNotice === b.confirmNotice &&
    a.gameOpen === b.gameOpen &&
    a.disabled === b.disabled
  );
}

/** Base pressable styles plus a pressed feedback state. */
function pressStyles(...parts: Array<StyleProp<ViewStyle>>) {
  return ({ pressed }: { pressed: boolean }): StyleProp<ViewStyle> => [
    ...parts,
    pressed ? styles.pressed : null,
  ];
}

export function ScoringPanel(props: {
  driver: SqliteDriver | null;
  deviceId: string | null;
  enabled: boolean;
  reloadToken: string;
  /** When provided, the host renders the bottom menu and receives this model. */
  onTopNav?: (model: TopNavModel | null) => void;
  /** Live diagnostics snapshot for the dedicated Advanced screen (one-way). */
  advanced?: AdvancedModel | null;
}) {
  const [view, setView] = useState<ScoringView | null>(null);
  const [history, setHistory] = useState<GameHistoryDetail[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [homeOpen, setHomeOpen] = useState(true);
  const [homeSection, setHomeSection] = useState<
    "landing" | "history" | "analysis" | "advanced"
  >("landing");
  const [handedness, setHandedness] = useState<Handedness>("right");
  const [selectedRollId, setSelectedRollId] = useState<string | null>(null);
  const [fixMode, setFixMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(
    INITIAL_SHELL_DISCLOSURES.historyOpen,
  );
  const [metricsRange, setMetricsRange] = useState<MetricRangeId>("all");
  /** Custom period chip: committed window while active (null keeps last valid). */
  const [customActive, setCustomActive] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [customWindow, setCustomWindow] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  /** Handicap league inputs (saved via appSettings) + form fields. */
  const [handicapSettings, setHandicapSettings] =
    useState<HandicapSettings | null>(null);
  const [handicapForm, setHandicapForm] = useState({
    basis: "",
    pct: "",
    note: "",
    noteError: false,
  });
  const handicapLoadedRef = useRef<SqliteDriver | null>(null);
  const [notice, setNotice] = useState("");
  const [confirmNewGame, setConfirmNewGame] = useState(false);
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  /**
   * Done-for-the-day game set summary (today's completed games + roll stats).
   * Presentation only — cleared by any navigation or when a game starts.
   */
  const [gameSet, setGameSet] = useState<{
    summary: GameSetSummary;
    focus: FocusAnalysis;
  } | null>(null);
  /**
   * The frozen host bar keeps the latest published snapshot; callbacks below
   * read through this ref so they never act on stale rendered state.
   */
  const liveStateRef = useRef({ history, historyOpen });
  liveStateRef.current = { history, historyOpen };
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
    try {
      const listed = listGameHistoryDetailed(props.driver);
      setHistory(listed);
      if (!sessionReady) {
        setSessionReady(true);
        setHomeOpen(true);
        setHomeSection("landing");
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
    } catch {
      // The driver can close mid Fast Refresh / recovery cycle — nothing was
      // written, and the next driver pass re-lists.
    }
  }, [
    props.driver,
    props.enabled,
    props.reloadToken,
    sessionReady,
    selectedGameId,
    homeOpen,
  ]);

  /** Load saved handicap league inputs once per driver (app-local, never synced). */
  useEffect(() => {
    if (!props.driver || !props.enabled) return;
    if (handicapLoadedRef.current === props.driver) return;
    handicapLoadedRef.current = props.driver;
    try {
      const stored = loadHandicapSettings(props.driver);
      if (stored) {
        setHandicapSettings(stored);
        setHandicapForm((f) => ({
          ...f,
          basis: String(stored.basisScore),
          pct: String(stored.percentage),
        }));
      }
    } catch {
      // Same closed-driver window as above — inputs stay empty until next save.
    }
  }, [props.driver, props.enabled]);

  const clearDraft = () => {
    setDraftStanding([]);
    setStandingTouched(false);
    setDraftPinfall(null);
  };

  const onGoHome = () => {
    setHomeOpen(true);
    setHomeSection("landing");
    setFixMode(false);
    setSelectedRollId(null);
    setHistoryOpen(false);
    setConfirmNewGame(false);
    setConfirmDiscardId(null);
    setSavedAt(null);
    setGameSet(null);
    clearDraft();
    if (props.driver) setHistory(listGameHistoryDetailed(props.driver));
    setNotice("");
  };

  /** Jump back into the loaded game from any other page. */
  const onResumeGame = () => {
    if (!view?.gameId && !selectedGameId) return;
    setHomeOpen(false);
    setHistoryOpen(false);
    setFixMode(false);
    setSelectedRollId(null);
    setConfirmNewGame(false);
    setConfirmDiscardId(null);
    setSavedAt(null);
    setGameSet(null);
    clearDraft();
    setNotice("");
  };

  /** Every page can reach every other page (used by header + tab bar). */
  const onNavigate = (target: AppScreen) => {
    if (target === "game") {
      onResumeGame();
      return;
    }
    onGoHome();
    if (target !== "landing") setHomeSection(target);
  };

  const onToggleHistory = () => {
    const next = toggleDisclosure(
      {
        historyOpen: liveStateRef.current.historyOpen,
        diagnosticsOpen: false,
      },
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

  const onRequestNewGame = () => {
    if (!props.driver || !props.deviceId) return;
    setConfirmDiscardId(null);
    setConfirmNewGame(true);
    const activeCount = liveStateRef.current.history.filter(
      (g) => g.status === "active",
    ).length;
    setNotice(newGameConfirmNotice(activeCount));
  };

  const startFreshGame = () => {
    if (!props.driver || !props.deviceId) return;
    const gameId = startGame(props.driver, props.deviceId);
    setSelectedRollId(null);
    setFixMode(false);
    clearDraft();
    setHistoryOpen(false);
    setHomeOpen(false);
    setSelectedGameId(gameId);
    setSessionReady(true);
    setConfirmNewGame(false);
    setSavedAt(null);
    setGameSet(null);
    refresh(gameId);
    setNotice("Tap standing pins, then ✓ — or use X / G / / when legal.");
  };

  const onConfirmNewGame = () => {
    startFreshGame();
  };

  /** Post-save primary: jump straight into the next game (no second confirm). */
  const onNextGame = () => {
    startFreshGame();
  };

  const onCancelNewGame = () => {
    setConfirmNewGame(false);
    setNotice("");
  };

  /**
   * Completed-game Save: reassurance, not a write. Every ball already
   * persists offline at save time, so this only refreshes the finished view,
   * reports the final, and stays inside the game. No canonical/outbox writes.
   */
  const onSaveGame = () => {
    if (!props.driver || !view?.gameId) return;
    const next = loadScoringView(props.driver, view.gameId);
    setView(next);
    setHistory(listGameHistoryDetailed(props.driver));
    const finalTotal = next.sheet?.finalTotal ?? null;
    setSavedAt(
      new Date().toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }),
    );
    setNotice(completedSaveNotice(finalTotal));
  };
  const savedBanner =
    savedAt !== null
      ? completedSaveBanner(view?.sheet?.finalTotal ?? null, savedAt)
      : null;

  /**
   * Post-save secondary: close the day with a set summary of every game
   * completed today (scores + roll stats), presented as its own view.
   */
  const onDoneForDay = () => {
    if (!props.driver) return;
    const driver = props.driver;
    const setKey = formatLocalTodayKey();
    const summary = computeGameSetSummary(history, setKey);
    const setViews = history
      .filter((h) => h.dateKey === setKey && isQualifyingCompletedGame(h))
      .map((h) => loadScoringView(driver, h.id))
      .filter((v) => v.gameId !== null);
    setGameSet({
      summary,
      focus: computeFocusAnalysis(setViews, handedness),
    });
    setNotice("");
  };

  const onRequestDiscard = (gameId: string) => {
    setConfirmNewGame(false);
    setConfirmDiscardId(gameId);
    setNotice("Discard this empty game? It holds no recorded balls.");
  };

  const onCancelDiscard = () => {
    setConfirmDiscardId(null);
    setNotice("");
  };

  const onConfirmDiscard = (gameId: string) => {
    if (!props.driver || !props.deviceId) return;
    const result = discardEmptyGame(props.driver, props.deviceId, gameId);
    setConfirmDiscardId(null);
    if (!result.ok) {
      setNotice(`Could not discard: ${result.message}.`);
      return;
    }
    if (selectedGameId === gameId) {
      setSelectedGameId(null);
      setView(null);
      setHomeOpen(true);
    }
    setHistory(listGameHistoryDetailed(props.driver));
    setNotice("Empty game discarded. Recorded balls were not touched.");
  };

  const onOpenGame = (gameId: string) => {
    if (!props.driver) return;
    setSelectedRollId(null);
    setFixMode(false);
    clearDraft();
    setHistoryOpen(false);
    setHomeOpen(false);
    setConfirmNewGame(false);
    setConfirmDiscardId(null);
    setSavedAt(null);
    setGameSet(null);
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
      const firstBall =
        slot.roll_number === 2
          ? (view.rolls.find(
              (r) => r.frame_number === slot.frame_number && r.roll_number === 1,
            )?.pinfall ?? null)
          : null;
      const streak =
        slot.frame_number < 10 && slot.roll_number === 1 && pinfall === 10
          ? strikeStreakCount(
              (next.sheet?.frames ?? []).map((f) => ({
                frameNumber: f.frame_number,
                isStrike: f.isStrike,
              })),
              slot.frame_number,
            )
          : 0;
      const quip = ballSaveQuip({
        frameNumber: slot.frame_number,
        rollNumber: slot.roll_number,
        pinfall,
        firstBallPinfall: firstBall,
        strikeStreak: streak,
        standingPins: standing,
      });
      const base = done
        ? `Saved. Game complete · ${next.sheet!.finalTotal}.`
        : `Saved: pins ${pinfall}; standing ${
            standing.length ? standing.join(", ") : "none"
          }. Next: Frame ${next.next?.frame_number ?? "—"} · ${
            next.next ? ordinalBall(next.next.roll_number) : ""
          } ball.`;
      setNotice(quip ? `${base} ${quip}` : base);
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
      const firstBall =
        slot.roll_number === 2
          ? (view.rolls.find(
              (r) => r.frame_number === slot.frame_number && r.roll_number === 1,
            )?.pinfall ?? null)
          : null;
      const streak =
        slot.frame_number < 10 && slot.roll_number === 1 && draftPinfall === 10
          ? strikeStreakCount(
              (next.sheet?.frames ?? []).map((f) => ({
                frameNumber: f.frame_number,
                isStrike: f.isStrike,
              })),
              slot.frame_number,
            )
          : 0;
      const quip = ballSaveQuip({
        frameNumber: slot.frame_number,
        rollNumber: slot.roll_number,
        pinfall: draftPinfall,
        firstBallPinfall: firstBall,
        strikeStreak: streak,
        standingPins: [],
      });
      const base = `Saved: pins ${draftPinfall}. Pin detail not recorded (prior rack unknown).`;
      setNotice(quip ? `${base} ${quip}` : base);
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
  const completeQuip = completed
    ? gameCompleteQuip(view?.sheet?.finalTotal ?? null)
    : null;
  const gameAnalysis = completed ? analyzeScoringView(view) : null;
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
  /**
   * Custom period scoping: while the Custom chip is active every Analysis
   * metric, focus stat, chart, and total uses only games inside the committed
   * window (date keys compare lexicographically — both sides are YYYY-MM-DD).
   */
  const effectiveRange: MetricRangeId = customActive ? "all" : metricsRange;
  const scopedHistory = useMemo(
    () =>
      customActive && customWindow
        ? history.filter(
            (g) => g.dateKey >= customWindow.from && g.dateKey <= customWindow.to,
          )
        : history,
    [history, customActive, customWindow],
  );
  const metrics = useMemo(
    () => computeHomeMetrics(scopedHistory, effectiveRange),
    [scopedHistory, effectiveRange],
  );
  /** Landing always shows the all-time overall, never the Analysis chip range. */
  const overallMetrics = useMemo(
    () => computeHomeMetrics(history, "all"),
    [history],
  );
  /** History has no range chips — every game, grouped by date. */
  const dateGroups = useMemo(() => groupHistoryByDate(history, "all"), [history]);
  /** Completed, in-range games loaded once per (history, range) — Analysis only. */
  const focusViews = useMemo(() => {
    if (homeSection !== "analysis" || !props.driver) return [];
    const driver = props.driver;
    return scopedHistory
      .filter(
        (h) =>
          isQualifyingCompletedGame(h) &&
          gameDateInMetricRange(h.dateKey, effectiveRange),
      )
      .map((h) => loadScoringView(driver, h.id))
      .filter((v) => v.gameId !== null);
  }, [homeSection, scopedHistory, effectiveRange, props.driver]);
  const focus = useMemo(
    () => computeFocusAnalysis(focusViews, handedness),
    [focusViews, handedness],
  );
  /** Bucket size for the trend chart — custom windows size by span, not chip. */
  const trendGran =
    customActive && customWindow
      ? customTrendGranularity(customWindow.from, customWindow.to)
      : averageTrendGranularity(metricsRange);
  /** Average-per-period trend for the selected range — Analysis chart only. */
  const averageTrend = useMemo(() => {
    if (homeSection !== "analysis") return [];
    const games = scopedHistory.filter(
      (g) =>
        isQualifyingCompletedGame(g) &&
        gameDateInMetricRange(g.dateKey, effectiveRange),
    );
    return computeAverageTrend(games, trendGran);
  }, [homeSection, scopedHistory, effectiveRange, trendGran]);
  const analysisExcluded = scopedHistory.filter(
    (h) => h.status !== "complete",
  ).length;

  const screen: AppScreen = !homeOpen ? "game" : homeSection;
  const topNavModel = useMemo<TopNavModel>(
    () => ({
      actions: topNavActions({
        screen,
        historyOpen,
        completed,
      }),
      screen,
      homeOpen,
      historyOpen,
      confirmNewGame,
      confirmNotice: notice,
      disabled,
      gameOpen: !!view?.gameId,
      onGoHome,
      onNavigate,
      onResumeGame,
      onToggleHistory,
      onRequestNewGame,
      onConfirmNewGame,
      onCancelNewGame,
    }),
    [
      screen,
      homeOpen,
      historyOpen,
      completed,
      confirmNewGame,
      notice,
      disabled,
      view,
      onGoHome,
      onNavigate,
      onResumeGame,
      onToggleHistory,
      onRequestNewGame,
      onConfirmNewGame,
      onCancelNewGame,
    ],
  );

  useEffect(() => {
    props.onTopNav?.(topNavModel);
  }, [props.onTopNav, topNavModel]);

  useEffect(() => () => props.onTopNav?.(null), [props.onTopNav]);

  /** Active range chip label — "Week" / "Month" / "Year" / "All time" / "Custom". */
  const rangeLabel = customActive
    ? "Custom"
    : (METRIC_RANGE_OPTIONS.find((r) => r.id === metricsRange)?.label ??
      "Overall");

  /** Commit a custom window from the From/To inputs; invalid text keeps the last valid window. */
  const applyCustomInput = (field: "from" | "to", value: string) => {
    const from = field === "from" ? value : customFrom;
    const to = field === "to" ? value : customTo;
    setCustomFrom(from);
    setCustomTo(to);
    const f = from.trim();
    const t = to.trim();
    if (f === "" || t === "") {
      setCustomError(null);
      return;
    }
    if (!isValidDateKey(f) || !isValidDateKey(t)) {
      setCustomError("Use dates like 2026-09-20.");
      return;
    }
    if (f > t) {
      setCustomError("From must be on or before To.");
      return;
    }
    setCustomError(null);
    setCustomWindow({ from: f, to: t });
  };

  /** Quick custom windows: last N days ending today. */
  const applyCustomQuick = (days: number) => {
    const to = formatLocalTodayKey();
    const from = formatLocalTodayKey(
      new Date(Date.now() - (days - 1) * 86_400_000),
    );
    setCustomFrom(from);
    setCustomTo(to);
    setCustomWindow({ from, to });
    setCustomError(null);
  };

  const activateCustom = () => {
    setCustomActive(true);
    applyCustomQuick(7);
  };

  const rangeChips = (
    <View style={styles.rangeBar}>
      {[...METRIC_RANGE_OPTIONS, { id: "custom", label: "Custom" }].map(
        (r) => {
          const isCustom = r.id === "custom";
          const active = isCustom
            ? customActive
            : !customActive && metricsRange === r.id;
          return (
            <Pressable
              key={r.id}
              style={({ pressed }) => [
                styles.rangeBtn,
                active ? styles.rangeBtnActive : null,
                pressed ? styles.pressed : null,
              ]}
              onPress={() => {
                if (isCustom) activateCustom();
                else {
                  setCustomActive(false);
                  setCustomError(null);
                  setMetricsRange(r.id as MetricRangeId);
                }
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.rangeBtnLabel,
                  active ? styles.rangeBtnLabelActive : null,
                ]}
              >
                {r.label}
              </Text>
            </Pressable>
          );
        },
      )}
    </View>
  );

  /** Custom period inputs — sits under the chips while the Custom chip is active. */
  const customPeriodCard = customActive ? (
    <View style={styles.metricsCard}>
      <Text style={styles.metricsTitle}>Custom period</Text>
      <View style={styles.customDateRow}>
        <View style={styles.customField}>
          <Text style={styles.customFieldLabel}>From</Text>
          <TextInput
            style={styles.boxedInput}
            value={customFrom}
            onChangeText={(v) => applyCustomInput("from", v)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9a9488"
            keyboardType="decimal-pad"
            maxLength={10}
            editable={!disabled}
            accessibilityLabel="Custom period start date"
          />
        </View>
        <View style={styles.customField}>
          <Text style={styles.customFieldLabel}>To</Text>
          <TextInput
            style={styles.boxedInput}
            value={customTo}
            onChangeText={(v) => applyCustomInput("to", v)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9a9488"
            keyboardType="decimal-pad"
            maxLength={10}
            editable={!disabled}
            accessibilityLabel="Custom period end date"
          />
        </View>
      </View>
      <View style={styles.customQuickRow}>
        <Pressable
          style={({ pressed }) => [
            styles.secondary,
            styles.grow,
            pressed ? styles.pressed : null,
          ]}
          onPress={() => applyCustomQuick(7)}
          accessibilityRole="button"
          accessibilityLabel="Custom period: last 7 days"
        >
          <Text style={styles.secondaryLabel}>Last 7 days</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.secondary,
            styles.grow,
            pressed ? styles.pressed : null,
          ]}
          onPress={() => applyCustomQuick(30)}
          accessibilityRole="button"
          accessibilityLabel="Custom period: last 30 days"
        >
          <Text style={styles.secondaryLabel}>Last 30 days</Text>
        </Pressable>
      </View>
      {customError ? <Text style={styles.customError}>{customError}</Text> : null}
      <Text style={styles.hint}>
        Averages, metrics, and charts use only games in this window.
      </Text>
    </View>
  ) : null;

  /** Final totals for the chart — visual only, never a per-game list. */
  const chartTotals = scopedHistory
    .filter(
      (g) =>
        isQualifyingCompletedGame(g) &&
        gameDateInMetricRange(g.dateKey, effectiveRange),
    )
    .map((g) => ({ label: g.label, total: g.finalTotal }))
    .filter((g): g is { label: string; total: number } =>
      typeof g.total === "number",
    );

  const focusCards = focus.games > 0 ? (
    <>
      <FocusCard
        index={1}
        title="First Ball Average & Pocket %"
        value={focus.firstBall.averagePinfall != null ? String(focus.firstBall.averagePinfall) : "—"}
        caption={`avg first-ball pins · strikes ${focus.firstBall.hits}/${focus.firstBall.chances}${pctSuffix(focus.firstBall.rate)}`}
        lines={[
          `Pocket ${focus.pocket.hits}/${focus.pocket.chances}${pctSuffix(focus.pocket.rate)}${
            focus.pocket.chances > 0
              ? ` — headpin and ${handedness === "right" ? "3" : "2"} pin down together`
              : ""
          }`,
        ]}
        copy="Meaningful analysis starts with the very first roll. Your pocket percentage tells you how often your ball hits the ideal space between the headpin and the adjacent pin (1-3 pocket for righties, 1-2 for lefties)."
      >
        <View style={styles.focusChips}>
          {(["right", "left"] as const).map((h) => (
            <Pressable
              key={h}
              style={pressStyles(
                styles.focusChip,
                handedness === h ? styles.focusChipActive : null,
              )}
              onPress={() => setHandedness(h)}
              accessibilityRole="button"
              accessibilityState={{ selected: handedness === h }}
              accessibilityLabel={h === "right" ? "Right-handed" : "Left-handed"}
            >
              <Text
                style={[
                  styles.focusChipLabel,
                  handedness === h ? styles.focusChipLabelActive : null,
                ]}
              >
                {h === "right" ? "Right-handed" : "Left-handed"}
              </Text>
            </Pressable>
          ))}
        </View>
      </FocusCard>
      <FocusCard
        index={2}
        title="Strike-on-Strike (Double) %"
        value={pctText(focus.doubles.rate)}
        caption={`${focus.doubles.hits} of ${focus.doubles.chances} strike frames doubled`}
        copy="Getting a single strike increases your score, but stringing strikes together multiplies your points. A high strike percentage but low double percentage means you lack stringing capability — often mental fatigue or an inability to adjust to changing lanes."
      />
      <FocusCard
        index={3}
        title="Spare Conversion Rate"
        value={pctText(focus.spares.rate)}
        caption={`${focus.spares.hits}/${focus.spares.chances} opportunities converted`}
        lines={[
          `Single-pin spares: ${focus.spares.singlePin.hits}/${focus.spares.singlePin.chances}${pctSuffix(focus.spares.singlePin.rate)}`,
          `Multi-pin spares: ${focus.spares.multiPin.hits}/${focus.spares.multiPin.chances}${pctSuffix(focus.spares.multiPin.rate)}`,
        ]}
        copy="This determines your scoring floor. Separate single-pin spares from multi-pin combinations: missing single pins is an execution or alignment issue; leaving complex multi-pin splits indicates a poor first-ball entry angle."
      />
      <FocusCard
        index={4}
        title="Frame Fill %"
        value={pctText(focus.fill.rate)}
        caption={`${focus.fill.hits} of ${focus.fill.chances} frames finished without an open frame`}
        copy="Frame fill is the percentage of frames where you do not leave an open frame — you got a strike or a spare. Elite league bowlers aim for an 80-90% fill rate to keep their averages high."
      />
    </>
  ) : null;

  /** Range-chip companion chart: average grouped by day/week/month/year. */
  const trendBest = averageTrend.reduce(
    (best, t) => Math.max(best, t.average),
    Number.NEGATIVE_INFINITY,
  );
  const trendWord =
    trendGran === "day"
      ? "Daily"
      : trendGran === "week"
        ? "Weekly"
        : trendGran === "month"
          ? "Monthly"
          : "Yearly";
  const trendWindow = customActive
    ? "custom period"
    : metricsRange === "week"
      ? "this week"
      : metricsRange === "month"
        ? "this month"
        : metricsRange === "year"
          ? "this year"
          : "all time";
  /** League handicap for the selected range: (Basis − Average) × Percentage. */
  const handicapValue =
    metrics.overallAverage != null
      ? computeHandicap(metrics.overallAverage, handicapSettings)
      : null;
  const averageTrendCard =
    averageTrend.length > 0 ? (
      <View style={styles.trendCard}>
        <View style={styles.sectionTitleRow}>
          <SectionGlyphSvg kind="analysis" size={18} color={ART.green} />
          <Text style={styles.metricsTitle}>
            {trendWord} average — {trendWindow}
          </Text>
        </View>
        <View style={styles.avgStatsRow}>
          <View>
            <Text style={styles.avgStatLabel}>{rangeLabel} average</Text>
            <Text style={styles.avgStatValue}>
              {metrics.overallAverage != null ? metrics.overallAverage : "—"}
            </Text>
          </View>
          <View style={styles.avgStatSide}>
            <Text style={styles.avgStatSideText}>
              {`${metrics.qualifyingGames} game${metrics.qualifyingGames === 1 ? "" : "s"}`}
            </Text>
            <Text style={styles.avgStatBest}>
              {`best ${Math.round(trendBest)}`}
            </Text>
            <Text style={styles.avgStatHcp}>
              {handicapValue != null ? `hcp ${handicapValue}` : "hcp —"}
            </Text>
          </View>
        </View>
        <AverageTrendBars
          items={averageTrend}
          average={metrics.overallAverage}
        />
        <Text style={styles.hint}>
          {handicapSettings &&
          metrics.overallAverage != null &&
          handicapValue != null
            ? `Handicap: (${handicapSettings.basisScore} − ${metrics.overallAverage}) × ${handicapSettings.percentage}% = ${handicapValue}`
            : "Set Basis Score and Percentage under Advanced to show handicap here."}
        </Text>
      </View>
    ) : null;

  /** Save validated handicap inputs to local storage (app_settings). */
  const saveHandicap = () => {
    if (!props.driver || !props.enabled) {
      setHandicapForm((f) => ({
        ...f,
        note: "Database not ready yet.",
        noteError: true,
      }));
      return;
    }
    const basisRaw = handicapForm.basis.trim();
    const pctRaw = handicapForm.pct.trim();
    const basis = Number(basisRaw);
    const pct = Number(pctRaw);
    if (
      basisRaw === "" ||
      pctRaw === "" ||
      !Number.isFinite(basis) ||
      !Number.isFinite(pct) ||
      basis <= 0 ||
      pct < 0 ||
      pct > 100
    ) {
      setHandicapForm((f) => ({
        ...f,
        note: "Enter a Basis Score above 0 and a Percentage from 0 to 100.",
        noteError: true,
      }));
      return;
    }
    const settings = { basisScore: basis, percentage: pct };
    try {
      saveHandicapSettings(props.driver, settings);
    } catch {
      setHandicapForm((f) => ({
        ...f,
        note: "Could not save — the database is busy. Try again.",
        noteError: true,
      }));
      return;
    }
    setHandicapSettings(settings);
    setHandicapForm((f) => ({
      ...f,
      basis: String(basis),
      pct: String(pct),
      note: "Saved.",
      noteError: false,
    }));
  };

  const handicapUi: HandicapUiModel = {
    basis: handicapForm.basis,
    pct: handicapForm.pct,
    note: handicapForm.note,
    noteError: handicapForm.noteError,
    disabled: disabled,
    average: metrics.overallAverage,
    onChangeBasis: (v: string) =>
      setHandicapForm((f) => ({ ...f, basis: v, note: "", noteError: false })),
    onChangePct: (v: string) =>
      setHandicapForm((f) => ({ ...f, pct: v, note: "", noteError: false })),
    onSave: saveHandicap,
  };

  if (homeOpen && homeSection === "landing") {
    return (
      <View style={[styles.card, styles.landingCard]}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Bowling</Text>
          <HeroArtSvg />
          <Text style={styles.heroTag}>Score at the lane. Offline first.</Text>
          {overallMetrics.enough && overallMetrics.overallAverage != null ? (
            <Text style={styles.heroStats}>
              Overall {overallMetrics.overallAverage} ·{" "}
              {overallMetrics.qualifyingGames} qualifying
            </Text>
          ) : null}
        </View>
        {leftoverUnavailable ? (
          <Text style={styles.repair}>{STORAGE_UNAVAILABLE_NOTICE}</Text>
        ) : null}
        {notice && !confirmNewGame && !leftoverUnavailable ? (
          <Text style={styles.note}>{notice}</Text>
        ) : null}
        <Pressable
          style={pressStyles(styles.button, disabled ? styles.buttonDisabled : null)}
          disabled={disabled}
          onPress={onRequestNewGame}
          accessibilityRole="button"
          accessibilityLabel="Start a new game"
        >
          <SectionGlyphSvg kind="newGame" size={22} color="#ffffff" />
          <Text style={styles.buttonLabel}>New Game</Text>
        </Pressable>
        <Text style={styles.hint}>
          Opening a game does not create a new one.
        </Text>
      </View>
    );
  }

  if (homeOpen) {
    const isHistory = homeSection === "history";
    const isAnalysis = homeSection === "analysis";
    const sectionTitle = isHistory ? "History" : isAnalysis ? "Analysis" : "Advanced";
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{sectionTitle}</Text>
        <Text style={styles.lead}>
          {isHistory
            ? "Score history by date. Opening a game does not create a new one."
            : isAnalysis
              ? "Four focus areas: first ball & pocket, doubles, spares, frame fill."
              : "Diagnostics and recovery. Everyday scoring stays clean."}
        </Text>
        <SectionBanner
          kind={isHistory ? "history" : isAnalysis ? "analysis" : "advanced"}
        />
        {leftoverUnavailable ? (
          <Text style={styles.repair}>{STORAGE_UNAVAILABLE_NOTICE}</Text>
        ) : null}
        {notice && !confirmNewGame && !leftoverUnavailable ? (
          <Text style={styles.note}>{notice}</Text>
        ) : null}

        {isHistory ? (
          <>
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
              <View key={g.id}>
                <Pressable
                  style={pressStyles(styles.gameRow, disabled ? styles.buttonDisabled : null)}
                  disabled={disabled}
                  onPress={() => onOpenGame(g.id)}
                >
                  <View style={styles.gameRowLead}>
                    <BallGlyphSvg
                      size={30}
                      color={
                        g.status === "complete"
                          ? ART.green
                          : g.status === "repair"
                            ? ART.red
                            : ART.laneEdge
                      }
                    />
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
                  </View>
                  <Text style={styles.gameScore}>
                    {g.status === "complete" && g.finalTotal != null
                      ? g.finalTotal
                      : "…"}
                  </Text>
                </Pressable>
                {discardableGame(g) ? (
                  confirmDiscardId === g.id ? (
                    <View style={styles.topNavRow}>
                      <Pressable
                        style={pressStyles(styles.button, styles.topNavBtn)}
                        disabled={disabled}
                        onPress={() => onConfirmDiscard(g.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Confirm discard Game ${g.gameNumber}`}
                      >
                        <Text style={styles.buttonLabel}>Confirm discard</Text>
                      </Pressable>
                      <Pressable
                        style={pressStyles(styles.secondary, styles.topNavBtn)}
                        onPress={onCancelDiscard}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel discard"
                      >
                        <Text style={styles.secondaryLabel}>Cancel</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.secondary}
                      disabled={disabled}
                      onPress={() => onRequestDiscard(g.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Discard empty Game ${g.gameNumber}`}
                    >
                      <Text style={styles.secondaryLabel}>
                        Discard empty game
                      </Text>
                    </Pressable>
                  )
                ) : null}
              </View>
            ))}
          </View>
        ))}

        {dateGroups.length === 0 ? (
          <View style={styles.emptyState}>
            <EmptyStateArt kind="history" />
            <Text style={styles.body}>No games yet.</Text>
          </View>
        ) : null}
        <Text style={styles.hint}>
          Games with recorded balls cannot be discarded — open one to resume it.
        </Text>
          </>
        ) : isAnalysis ? (
          <View style={styles.analysisCard}>
            {rangeChips}
            {customPeriodCard}
            {averageTrendCard}
            {focusCards ?? (
              <View style={styles.emptyState}>
                <EmptyStateArt kind="analysis" />
                <Text style={styles.body}>
                  No completed games in this range yet.
                </Text>
              </View>
            )}
            {chartTotals.length > 1 ? (
              <FinalTotalsBars items={chartTotals} />
            ) : null}
            {analysisExcluded > 0 ? (
              <Text style={styles.hint}>
                {analysisExcluded} game(s) excluded (incomplete or needs
                repair) — still in History.
              </Text>
            ) : null}
            <Text style={styles.hint}>{ANALYSIS_B3_PENDING_COPY}</Text>
          </View>
        ) : (
          <AdvancedScreen model={props.advanced} handicap={handicapUi} />
        )}
      </View>
    );
  }

  if (gameSet) {
    const { summary, focus } = gameSet;
    return (
      <View style={styles.card} accessibilityLabel="Game set summary">
        <Text style={styles.lead}>Done for the day · {summary.label}</Text>
        <Text style={styles.title}>Game set summary</Text>
        <View style={styles.metricsCard}>
          <View style={styles.sectionTitleRow}>
            <TrophySvg size={22} />
            <Text style={styles.metricsTitle}>Today's games</Text>
          </View>
          <MetricRow label="Games" value={String(summary.games)} />
          <MetricRow label="Total pins" value={String(summary.totalPins)} />
          <MetricRow
            label="Average"
            value={
              summary.average != null
                ? String(summary.average)
                : METRICS_INSUFFICIENT
            }
          />
          <MetricRow
            label="High game"
            value={
              summary.high
                ? `Game ${summary.high.gameNumber} · ${summary.high.total}`
                : "—"
            }
          />
          <MetricRow
            label="Low game"
            value={
              summary.low
                ? `Game ${summary.low.gameNumber} · ${summary.low.total}`
                : "—"
            }
          />
          {summary.entries.map((entry) => (
            <Text key={entry.gameNumber} style={styles.abdRow}>
              Game {entry.gameNumber}:{" "}
              <Text style={styles.bold}>{entry.total}</Text>
            </Text>
          ))}
        </View>
        {focus.games > 0 ? (
          <View style={styles.metricsCard}>
            <View style={styles.sectionTitleRow}>
              <SectionGlyphSvg kind="analysis" size={18} color={ART.green} />
              <Text style={styles.metricsTitle}>Set stats</Text>
            </View>
            <MetricRow
              label="First ball"
              value={
                focus.firstBall.averagePinfall != null
                  ? `${focus.firstBall.averagePinfall} avg pins · struck ${focus.firstBall.hits}/${focus.firstBall.chances}`
                  : "—"
              }
            />
            <MetricRow
              label="Spares"
              value={`picked up ${focus.spares.hits}/${focus.spares.chances}${pctSuffix(focus.spares.rate)}`}
            />
            <MetricRow
              label="Frame fill"
              value={`${focus.fill.hits}/${focus.fill.chances}${pctSuffix(focus.fill.rate)}`}
            />
          </View>
        ) : null}
        <View style={styles.finishRow}>
          <Pressable
            style={pressStyles(
              styles.button,
              styles.grow,
              disabled ? styles.buttonDisabled : null,
            )}
            disabled={disabled}
            onPress={onNextGame}
            accessibilityRole="button"
            accessibilityLabel="Start a new game"
          >
            <SectionGlyphSvg kind="newGame" size={20} color="#ffffff" />
            <Text style={styles.buttonLabel}>New Game</Text>
          </Pressable>
          <Pressable
            style={pressStyles(
              styles.secondary,
              styles.grow,
              disabled ? styles.buttonDisabled : null,
            )}
            disabled={disabled}
            onPress={onGoHome}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
          >
            <Text style={styles.secondaryLabel}>Home</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          The set is every completed game bowled today.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
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
      {notice && !confirmNewGame && !leftoverUnavailable ? <Text style={styles.note}>{notice}</Text> : null}
      {needsRepair ? (
        <Text style={styles.repair}>
          This game needs a later ball fixed before the score can be finished.
        </Text>
      ) : null}
      {completed ? (
        <>
          <View style={styles.celebration}>
            <StrikeBadge size={126} />
          </View>
          <Text style={styles.complete}>
            Game finished. Final score {view?.sheet?.finalTotal}.
          </Text>
          {completeQuip ? (
            <Text style={styles.quip}>{completeQuip}</Text>
          ) : null}
          {gameAnalysis && gameAnalysis.eligible ? (
            <View style={styles.analysisCard}>
              <View style={styles.sectionTitleRow}>
                <SectionGlyphSvg kind="analysis" size={18} color={ART.green} />
                <Text style={styles.metricsTitle}>Per-game analysis</Text>
              </View>
              <GameAnalysisRows analysis={gameAnalysis} />
            </View>
          ) : null}
          {savedBanner ? (
            <Text style={styles.savedBanner} accessibilityLabel="Game saved">
              {savedBanner}
            </Text>
          ) : null}
          {savedAt === null ? (
            <Pressable
              style={pressStyles(styles.button, disabled ? styles.buttonDisabled : null)}
              disabled={disabled}
              onPress={onSaveGame}
              accessibilityRole="button"
              accessibilityLabel="Save game and stay here"
            >
              <Text style={styles.buttonLabel}>Save game</Text>
            </Pressable>
          ) : (
            <View style={styles.finishRow}>
              <Pressable
                style={pressStyles(
                  styles.button,
                  styles.grow,
                  disabled ? styles.buttonDisabled : null,
                )}
                disabled={disabled}
                onPress={onNextGame}
                accessibilityRole="button"
                accessibilityLabel="Start the next game"
              >
                <Text style={styles.buttonLabel}>Next Game</Text>
              </Pressable>
              <Pressable
                style={pressStyles(
                  styles.secondary,
                  styles.grow,
                  disabled ? styles.buttonDisabled : null,
                )}
                disabled={disabled}
                onPress={onDoneForDay}
                accessibilityRole="button"
                accessibilityLabel="Done for the day — show the game set summary"
              >
                <Text style={styles.secondaryLabel}>Done for the Day</Text>
              </Pressable>
            </View>
          )}
        </>
      ) : null}

      {view?.sheet && !historyOpen ? (
        <View style={styles.laneCard} accessibilityLabel="Scorecard">
          <LaneRunSvg height={26} />
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
        </View>
      ) : null}

      {(pad === "nextBall" || (fixMode && fixLayout.showEditor)) &&
      activeSlot &&
      !completed ? (
        <View style={[styles.block, styles.laneCard]}>
          <Text style={[styles.context, styles.laneText]}>
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
              <Text style={[styles.prompt, styles.laneText]}>Tap the pins still standing.</Text>
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
              <Text style={[styles.prompt, styles.laneText]}>
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
                  style={pressStyles(styles.button, disabled ? styles.buttonDisabled : null)}
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
          <View style={styles.historyHead}>
            <SectionGlyphSvg kind="history" size={20} color={ART.green} />
            <Text style={styles.historyHeadText}>
              These are your games. Tap one to open it.
            </Text>
          </View>
          <Text style={styles.hint}>
            Games with recorded balls cannot be discarded — open one to
            resume it.
          </Text>
          <Pressable
            style={pressStyles(styles.button, disabled ? styles.buttonDisabled : null)}
            disabled={disabled}
            onPress={onRequestNewGame}
          >
            <Text style={styles.buttonLabel}>Start a new game</Text>
          </Pressable>
          {history.map((entry) => (
            <View key={entry.id}>
              <Pressable
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
              {discardableGame({
                status: entry.status,
                rollCount: entry.rollCount,
              }) ? (
                confirmDiscardId === entry.id ? (
                  <View style={styles.topNavRow}>
                    <Pressable
                      style={pressStyles(styles.button, styles.topNavBtn)}
                      disabled={disabled}
                      onPress={() => onConfirmDiscard(entry.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Confirm discard ${entry.label}`}
                    >
                      <Text style={styles.buttonLabel}>Confirm discard</Text>
                    </Pressable>
                    <Pressable
                      style={pressStyles(styles.secondary, styles.topNavBtn)}
                      onPress={onCancelDiscard}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel discard"
                    >
                      <Text style={styles.secondaryLabel}>Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={styles.secondary}
                    disabled={disabled}
                    onPress={() => onRequestDiscard(entry.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Discard empty game ${entry.label}`}
                  >
                    <Text style={styles.secondaryLabel}>
                      Discard empty game
                    </Text>
                  </Pressable>
                )
              ) : null}
            </View>
          ))}
        </View>
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
    </View>
  );
}

/** Live diagnostics snapshot for the dedicated Advanced screen (one-way, host-owned). */
export type AdvancedModel = {
  available: boolean;
  adapter: string;
  startup: string;
  statuses: string;
  deviceId: string;
  schema: string;
  pendingOutbox: string;
  localChanges: string;
  activeSession: string;
  sync: string;
  nasAccepted: string;
  network: string;
  note: string;
  recoveryLine: string;
  faultArmed: boolean;
  conformance: null | {
    adapterName: string;
    platform: string;
    passed: number;
    failed: number;
    rows: { name: string; ok: boolean; error?: string }[];
  };
  canRunConformance: boolean;
  onRecover: () => void;
  onArmTest: () => void;
  onDisarmTest: () => void;
  onToggleNetwork: () => void;
  onProcessRestart: () => void;
  onRunConformance: () => void;
};

function AdvancedRow(props: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{props.label}</Text>
      <Text style={styles.metricValue}>{props.value}</Text>
    </View>
  );
}

function AdvancedButton(props: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={pressStyles(styles.button, props.disabled ? styles.buttonDisabled : null)}
      disabled={props.disabled}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
    >
      <Text style={styles.buttonLabel}>{props.label}</Text>
    </Pressable>
  );
}

/** League handicap inputs (Basis Score + Percentage) driven from the panel. */
export type HandicapUiModel = {
  basis: string;
  pct: string;
  note: string;
  noteError: boolean;
  disabled: boolean;
  average: number | null;
  onChangeBasis: (v: string) => void;
  onChangePct: (v: string) => void;
  onSave: () => void;
};

function HandicapCard(props: { model: HandicapUiModel }) {
  const h = props.model;
  const basisRaw = h.basis.trim();
  const pctRaw = h.pct.trim();
  const basisNum = Number(basisRaw);
  const pctNum = Number(pctRaw);
  const preview =
    h.average != null &&
    basisRaw !== "" &&
    pctRaw !== "" &&
    Number.isFinite(basisNum) &&
    Number.isFinite(pctNum)
      ? computeHandicap(h.average, { basisScore: basisNum, percentage: pctNum })
      : null;
  return (
    <View style={styles.analysisCard}>
      <View style={styles.sectionTitleRow}>
        <TrophySvg size={22} />
        <Text style={styles.metricsTitle}>Handicap (league)</Text>
      </View>
      <Text style={styles.body}>
        (Basis Score − average) × Percentage. The average comes from the
        selected Analysis range; league basis and percentage change per league
        and year.
      </Text>
      <View style={styles.hcpRow}>
        <View style={styles.hcpField}>
          <Text style={styles.hcpFieldLabel}>Basis Score</Text>
          <TextInput
            style={styles.boxedInput}
            value={h.basis}
            onChangeText={h.onChangeBasis}
            placeholder="e.g. 220"
            placeholderTextColor="#9a9488"
            keyboardType="decimal-pad"
            editable={!h.disabled}
            accessibilityLabel="Handicap basis score"
          />
        </View>
        <View style={styles.hcpField}>
          <Text style={styles.hcpFieldLabel}>Percentage (%)</Text>
          <TextInput
            style={styles.boxedInput}
            value={h.pct}
            onChangeText={h.onChangePct}
            placeholder="e.g. 90"
            placeholderTextColor="#9a9488"
            keyboardType="decimal-pad"
            editable={!h.disabled}
            accessibilityLabel="Handicap percentage"
          />
        </View>
      </View>
      <Pressable
        style={pressStyles(
          styles.button,
          h.disabled ? styles.buttonDisabled : null,
        )}
        disabled={h.disabled}
        onPress={h.onSave}
        accessibilityRole="button"
        accessibilityLabel="Save handicap settings"
      >
        <Text style={styles.buttonLabel}>Save handicap settings</Text>
      </Pressable>
      {h.note ? (
        <Text style={h.noteError ? styles.repair : styles.note}>{h.note}</Text>
      ) : null}
      {preview != null && h.average != null ? (
        <Text style={styles.hint}>
          Example with your current average: ({basisNum} − {h.average}) ×{" "}
          {pctNum}% = {preview}
        </Text>
      ) : null}
    </View>
  );
}

export function AdvancedScreen(props: {
  model: AdvancedModel | null | undefined;
  handicap: HandicapUiModel;
}) {
  const m = props.model;
  if (!m) {
    return (
      <View style={{ gap: 12 }}>
        <HandicapCard model={props.handicap} />
        <View style={styles.analysisCard}>
          <Text style={styles.body}>
            Advanced controls are not available yet — reopen this screen once the
            app finishes loading.
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <HandicapCard model={props.handicap} />
      <View style={styles.analysisCard}>
        <AdvancedRow label="SQLite recovery" value={m.recoveryLine} />
        <AdvancedRow
          label="Recovery test"
          value={m.faultArmed ? "armed (one shot)" : "disarmed"}
        />
      </View>
      {m.available ? (
        <View style={styles.analysisCard}>
          <AdvancedRow label="Adapter" value={m.adapter} />
          <AdvancedRow label="Startup" value={m.startup} />
          <AdvancedRow label="Statuses" value={m.statuses} />
          <AdvancedRow label="Device ID" value={m.deviceId} />
          <AdvancedRow label="Schema" value={m.schema} />
          <AdvancedRow label="Pending outbox" value={m.pendingOutbox} />
          <AdvancedRow label="Local changes" value={m.localChanges} />
          <AdvancedRow label="Active session" value={m.activeSession} />
          <AdvancedRow label="Sync" value={m.sync} />
          <AdvancedRow label="NAS accepted" value={m.nasAccepted} />
          <AdvancedRow label="Network" value={m.network} />
          <Text style={styles.hint}>{m.note}</Text>
        </View>
      ) : null}
      <AdvancedButton label="Recover from database" onPress={m.onRecover} />
      <AdvancedButton
        label={m.faultArmed ? "Recovery test armed (one shot)" : "Arm one recovery test"}
        disabled={m.faultArmed}
        onPress={m.onArmTest}
      />
      <AdvancedButton
        label="Disarm recovery test"
        disabled={!m.faultArmed}
        onPress={m.onDisarmTest}
      />
      <AdvancedButton
        label={
          m.network === "unavailable"
            ? "Simulated network: unavailable"
            : "Simulated network: available"
        }
        onPress={m.onToggleNetwork}
      />
      <AdvancedButton label="Simulate process restart" onPress={m.onProcessRestart} />
      {m.canRunConformance ? (
        <AdvancedButton label="Run expo-sqlite conformance" onPress={m.onRunConformance} />
      ) : (
        <Text style={styles.hint}>
          expo-sqlite conformance is native-only. Web preview uses sql.js.
        </Text>
      )}
      {m.conformance ? (
        <View style={styles.analysisCard}>
          <Text style={styles.body}>
            {m.conformance.adapterName} on {m.conformance.platform}:{" "}
            {m.conformance.passed} passed, {m.conformance.failed} failed
          </Text>
          {m.conformance.rows.map((row) => (
            <Text key={row.name} style={styles.body}>
              {row.ok ? "PASS" : "FAIL"} — {row.name}
              {row.error ? `: ${row.error}` : ""}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.hint}>
        Network unavailable is not data loss. Until NAS sync exists, records stay
        Saved locally / Waiting to sync. Synced is never faked.
      </Text>
    </View>
  );
}

/**
 * New-game confirmation — the host renders this directly above the bottom
 * tab bar (the top menu is gone; this is the only confirm surface).
 */
export function NewGameConfirmBox(props: { model: TopNavModel }) {
  const m = props.model;
  if (!m.confirmNewGame) return null;
  return (
    <View style={styles.confirmSheet} accessibilityLabel="Confirm new game">
      <Text style={styles.body}>{m.confirmNotice || "Start a new game?"}</Text>
      <View style={styles.topNavRow}>
        <Pressable
          style={pressStyles(styles.button, styles.topNavBtn)}
          disabled={m.disabled}
          onPress={m.onConfirmNewGame}
          accessibilityRole="button"
          accessibilityLabel="Confirm new game"
        >
          <Text style={styles.topNavLabelPrimary}>Confirm new game</Text>
        </Pressable>
        <Pressable
          style={pressStyles(styles.secondary, styles.topNavBtn)}
          onPress={m.onCancelNewGame}
          accessibilityRole="button"
          accessibilityLabel="Cancel new game"
        >
          <Text style={styles.topNavLabel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const BOTTOM_TABS: ReadonlyArray<{ id: AppScreen; label: string; kind: SectionGlyphKind }> = [
  { id: "landing", label: "Home", kind: "home" },
  { id: "history", label: "History", kind: "history" },
  { id: "analysis", label: "Analysis", kind: "analysis" },
  { id: "advanced", label: "Advanced", kind: "advanced" },
];

/**
 * The single menu: four page tabs plus one contextual action, fixed at the
 * bottom and reachable with the thumb on every screen. Resume is offered
 * while a game is open off the game screen; otherwise New Game is (the
 * landing page keeps its own in-content New Game button).
 */
export function BottomTabBar(props: { model: TopNavModel }) {
  const m = props.model;
  const resume = m.gameOpen && m.screen !== "game";
  const showNew =
    !resume &&
    m.screen !== "landing" &&
    (m.screen !== "game" || m.actions.includes("start"));
  return (
    <View style={styles.tabBar} accessibilityLabel="Page navigation">
      {BOTTOM_TABS.map((tab) => {
        const isActive = tab.id === m.screen;
        return (
          <Pressable
            key={tab.id}
            style={({ pressed }) => [
              styles.tab,
              isActive ? styles.tabActive : null,
              pressed ? styles.pressed : null,
            ]}
            disabled={m.disabled}
            onPress={() => m.onNavigate(tab.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`Go to ${tab.label}`}
          >
            <SectionGlyphSvg
              kind={tab.kind}
              size={22}
              color={isActive ? "#ffffff" : ART.green}
            />
            <Text
              style={[styles.tabLabel, isActive ? styles.tabLabelActive : null]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
      {resume || showNew ? (
        <Pressable
          style={({ pressed }) => [
            styles.tab,
            resume ? styles.tabActionResume : styles.tabActionNew,
            pressed ? styles.pressed : null,
          ]}
          disabled={m.disabled}
          onPress={resume ? m.onResumeGame : m.onRequestNewGame}
          accessibilityRole="button"
          accessibilityLabel={
            resume ? "Resume the open game" : "Start a new game"
          }
        >
          {resume ? (
            <BallGlyphSvg size={22} color={ART.green} />
          ) : (
            <SectionGlyphSvg kind="newGame" size={22} color="#1b1b1b" />
          )}
          <Text
            style={[
              styles.tabLabel,
              resume ? styles.tabActionResumeLabel : styles.tabActionNewLabel,
            ]}
          >
            {resume ? "Resume" : "New"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function pctText(rate: number | null): string {
  return rate == null ? "—" : `${rate}%`;
}

function pctSuffix(rate: number | null): string {
  return rate == null ? "" : ` (${rate}%)`;
}

/**
 * Finished-game summary: first ball + spares up top, then a leaves table
 * (leave · faced · picked up) so every line answers "what did I leave and
 * did I convert it?".
 */
function GameAnalysisRows(props: { analysis: GameAnalysis }) {
  const a = props.analysis;
  const fb = a.firstBall;
  const sp = a.spares;
  const lv = a.leaves;
  const rows = leaveRows(a);
  const split = sparePinSplit(sp);
  const openings = lv.recordedCount + lv.missingCount + lv.emptyCount;
  const spareNote =
    split.single && split.multi
      ? ` · single-pin ${split.single.conversions}/${split.single.opportunities} · multi-pin ${split.multi.conversions}/${split.multi.opportunities}`
      : "";
  const coverageComplete = rows.every(
    (r) => r.chances != null && r.chances === r.faced,
  );
  return (
    <View style={styles.gaWrap}>
      <View style={styles.gaRow}>
        <Text style={styles.gaKey}>First ball</Text>
        <Text style={styles.gaVal}>
          avg {fb.averagePinfall ?? "—"} pins · struck {fb.strikes}/
          {fb.denominator} ({pctText(fb.strikeRate)})
        </Text>
      </View>
      <View style={styles.gaRow}>
        <Text style={styles.gaKey}>Spares</Text>
        <Text style={styles.gaVal}>
          {sp.opportunities === 0
            ? "no chances"
            : `picked up ${sp.conversions}/${sp.opportunities} (${pctText(sp.conversionRate)})${spareNote}`}
        </Text>
      </View>
      {rows.length > 0 ? (
        <>
          <Text style={styles.gaHead}>Leaves you faced</Text>
          <View style={styles.gaTableHead}>
            <Text style={styles.gaHeadLeave}>Leave</Text>
            <Text style={styles.gaHeadNum}>Faced</Text>
            <Text style={styles.gaHeadNum}>Picked up</Text>
          </View>
          {rows.map((r) => (
            <View key={r.label} style={styles.gaLeaveRow}>
              <Text style={styles.gaLeaveLabel}>{r.label}</Text>
              <Text style={styles.gaLeaveNum}>{r.faced}</Text>
              <Text style={styles.gaLeaveNum}>
                {r.pickedUp != null && r.chances != null
                  ? `${r.pickedUp}/${r.chances}`
                  : "—"}
              </Text>
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.body}>
          No pin detail recorded (missing {lv.missingCount}).
        </Text>
      )}
      <Text style={styles.hint}>
        Pin detail on {lv.recordedCount}/{openings} first balls
        {lv.missingCount > 0 ? ` · ${lv.missingCount} not recorded` : ""}
        {rows.length > 0 && !coverageComplete
          ? " · picked up covers frames 1–9 spare chances"
          : ""}
        .
      </Text>
    </View>
  );
}

/** One Analysis focus area: headline rate, supporting rows, coaching copy. */
function FocusCard(props: {
  index: number;
  title: string;
  value: string;
  caption: string;
  lines?: string[];
  copy: string;
  children?: ReactNode;
}) {
  const [showDefinition, setShowDefinition] = useState(false);
  return (
    <View style={styles.focusCard}>
      <View style={styles.focusHead}>
        <View style={styles.focusBadge}>
          <Text style={styles.focusBadgeText}>{props.index}</Text>
        </View>
        <Text style={styles.focusTitle}>{props.title}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.infoBtn,
            pressed ? styles.pressed : null,
          ]}
          onPress={() => setShowDefinition((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`What ${props.title} means`}
          accessibilityState={{ expanded: showDefinition }}
        >
          <Text style={styles.infoBtnLabel}>i</Text>
        </Pressable>
      </View>
      <View style={styles.focusValueRow}>
        <Text style={styles.focusValue}>{props.value}</Text>
        <Text style={styles.focusCaption}>{props.caption}</Text>
      </View>
      {props.lines?.map((line) => (
        <Text key={line} style={styles.focusLine}>
          {line}
        </Text>
      ))}
      {props.children}
      {showDefinition ? (
        <Text style={styles.focusCopy}>{props.copy}</Text>
      ) : null}
    </View>
  );
}

function MetricRow(props: {
  label: string;
  value: string;
  /** Lead row (the range average) gets a larger, green value. */
  emphasis?: boolean;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{props.label}</Text>
      <Text
        style={props.emphasis ? styles.metricValueBig : styles.metricValue}
      >
        {props.value}
      </Text>
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
                  styles.pinPress,
                  props.disabled ? styles.buttonDisabled : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={
                  on ? `Pin ${pin} standing` : `Pin ${pin} down`
                }
              >
                <RackPinSvg pin={pin} standing={on} />
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
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#d9d1c3",
    shadowColor: "#1b1b1b",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  celebration: { alignItems: "center", paddingVertical: 4 },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  gameRowLead: { flexDirection: "row", alignItems: "center", gap: 10 },
  emptyState: { alignItems: "center", gap: 6, paddingVertical: 6 },
  analysisGame: {
    gap: 4,
    borderWidth: 1,
    borderColor: "#d9d1c3",
    borderRadius: 10,
    backgroundColor: "#faf8f4",
    padding: 10,
  },
  analysisGameHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  analysisGameTitle: { fontSize: 15, fontWeight: "700", color: "#1b1b1b", flexShrink: 1 },
  historyHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  historyHeadText: { fontSize: 15, color: "#1b1b1b", flex: 1 },
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
    borderRadius: 12,
    padding: 12,
    gap: 6,
    backgroundColor: "#faf8f4",
    shadowColor: "#1b1b1b",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
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
  metricValueBig: { fontSize: 22, fontWeight: "800", color: "#1f4d3a" },
  /** Trend-card headline: the range average (large) with games/best beside it. */
  avgStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  avgStatLabel: { fontSize: 13, fontWeight: "600", color: "#5c564c" },
  avgStatValue: { fontSize: 30, fontWeight: "800", color: "#1f4d3a" },
  avgStatSide: { alignItems: "flex-end", gap: 2 },
  avgStatSideText: { fontSize: 12, fontWeight: "600", color: "#5c564c" },
  avgStatBest: { fontSize: 12, fontWeight: "700", color: "#9a7b1f" },
  avgStatHcp: { fontSize: 12, fontWeight: "700", color: "#1f4d3a" },
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
  /** Custom period inputs (From/To) and handicap (Basis/Percentage). */
  customDateRow: { flexDirection: "row", gap: 8 },
  customField: { flex: 1, gap: 4 },
  customFieldLabel: { fontSize: 13, fontWeight: "600", color: "#5c564c" },
  customQuickRow: { flexDirection: "row", gap: 8 },
  customError: { fontSize: 13, fontWeight: "600", color: "#8a1f16" },
  boxedInput: {
    borderWidth: 1,
    borderColor: "#cfc6b8",
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: "#1b1b1b",
  },
  hcpRow: { flexDirection: "row", gap: 8 },
  hcpField: { flex: 1, gap: 4 },
  hcpFieldLabel: { fontSize: 13, fontWeight: "600", color: "#5c564c" },
  /** Focus-card definition toggle (ⓘ button). */
  infoBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#5c564c",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  infoBtnLabel: { fontSize: 13, fontWeight: "800", color: "#5c564c", fontStyle: "italic" },
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d9d1c3",
    backgroundColor: "#fff",
    shadowColor: "#1b1b1b",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  gameScore: { fontSize: 20, fontWeight: "800", color: "#1b1b1b" },
  rack: { gap: 4, alignItems: "center", paddingVertical: 2 },
  rackRow: { flexDirection: "row", gap: 5, justifyContent: "center" },
  laneCard: {
    backgroundColor: "#17171f",
    borderRadius: 14,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#33334a",
    marginBottom: 8,
    overflow: "hidden",
    shadowColor: "#17171f",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  laneText: { color: "#f5f3ee" },
  pinPress: { minHeight: 44, justifyContent: "flex-end", alignItems: "center" },
  pinGhost: { width: 36, height: 36 },
  cornerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
  },
  cornerBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#4a4a63",
    backgroundColor: "#262633",
    alignItems: "center",
    justifyContent: "center",
  },
  cornerBtnPrimary: { backgroundColor: "#1f4d3a", borderColor: "#1f4d3a" },
  cornerBtnLabel: { fontSize: 20, fontWeight: "800", color: "#f5f3ee" },
  cornerBtnLabelPrimary: { color: "#fff" },
  ballSwitchRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ballSwitchBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4a4a63",
    backgroundColor: "#262633",
  },
  ballSwitchBtnActive: { backgroundColor: "#1f4d3a", borderColor: "#1f4d3a" },
  ballSwitchLabel: { fontSize: 14, fontWeight: "700", color: "#f5f3ee" },
  ballSwitchLabelActive: { color: "#fff" },
  pad: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  padBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4a4a63",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#262633",
  },
  padLabel: { fontSize: 18, fontWeight: "700", color: "#f5f3ee" },
  button: {
    backgroundColor: "#1f4d3a",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  buttonDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  buttonLabel: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondary: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#cfc6b8",
    backgroundColor: "#fff",
  },
  secondaryLabel: { color: "#1b1b1b", fontWeight: "600", fontSize: 15 },
  /** Post-save action pair: Next Game + Done for the Day (also set summary). */
  finishRow: { flexDirection: "row", gap: 10 },
  grow: { flex: 1 },
  heroCard: {
    backgroundColor: "#17171f",
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#33334a",
    marginBottom: 8,
    flex: 1,
  },
  heroTitle: { color: "#e9c46a", fontSize: 34, fontWeight: "800" },
  heroTag: { color: "#f5f3ee", fontSize: 15, fontWeight: "600" },
  heroStats: { color: "#b9b9d0", fontSize: 14, fontWeight: "600" },
  landingCard: { flex: 1, minHeight: Math.max(0, Dimensions.get("window").height - 200) },
  quip: { color: "#e9c46a", fontSize: 15, fontWeight: "700" },
  bottomBar: { flexDirection: "row", gap: 6 },
  bottomBarBtn: { flex: 1 },
  analysisCard: { gap: 8 },
  trendCard: {
    gap: 8,
    borderWidth: 1,
    borderColor: "#d9d1c3",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 12,
    shadowColor: "#1b1b1b",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  savedBanner: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 16,
    backgroundColor: "#1f4d3a",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    overflow: "hidden",
  },
  tabBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: "#f4f1ea",
    borderTopWidth: 1,
    borderTopColor: "#d9d1c3",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9d1c3",
  },
  tabActionResume: {
    flex: 0,
    paddingHorizontal: 10,
    minWidth: 64,
    backgroundColor: "#eef6f1",
    borderColor: "#1f4d3a",
  },
  tabActionNew: {
    flex: 0,
    paddingHorizontal: 10,
    minWidth: 64,
    backgroundColor: "#e9c46a",
    borderColor: "#c9a24d",
  },
  tabActionResumeLabel: { color: "#1f4d3a", fontWeight: "800" },
  tabActionNewLabel: { color: "#1b1b1b", fontWeight: "800" },
  gaWrap: { gap: 4 },
  gaRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  gaKey: { width: 72, fontSize: 13, fontWeight: "800", color: "#1b1b1b" },
  gaVal: { flex: 1, fontSize: 13, color: "#1b1b1b", lineHeight: 18 },
  gaHead: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1f4d3a",
    marginTop: 8,
  },
  gaTableHead: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#e4ddcf",
  },
  gaHeadLeave: { flex: 1, fontSize: 11, fontWeight: "700", color: "#5c564c" },
  gaHeadNum: {
    width: 66,
    fontSize: 11,
    fontWeight: "700",
    color: "#5c564c",
    textAlign: "right",
  },
  gaLeaveRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 3,
  },
  gaLeaveLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: "#1b1b1b" },
  gaLeaveNum: {
    width: 66,
    fontSize: 13,
    fontWeight: "700",
    color: "#1f4d3a",
    textAlign: "right",
  },
  tabActive: {
    backgroundColor: "#1f4d3a",
    borderColor: "#1f4d3a",
    shadowColor: "#1f4d3a",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tabLabel: { fontSize: 11, fontWeight: "600", color: "#5c564c" },
  tabLabelActive: { color: "#ffffff", fontWeight: "800" },
  focusCard: {
    gap: 6,
    borderWidth: 1,
    borderColor: "#d9d1c3",
    borderRadius: 12,
    backgroundColor: "#faf8f4",
    padding: 12,
    shadowColor: "#1b1b1b",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  focusHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  focusBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#e9c46a",
    alignItems: "center",
    justifyContent: "center",
  },
  focusBadgeText: { fontSize: 13, fontWeight: "800", color: "#1b1b1b" },
  focusTitle: { fontSize: 15, fontWeight: "700", color: "#1b1b1b", flex: 1 },
  focusValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  focusValue: { fontSize: 32, fontWeight: "800", color: "#1f4d3a" },
  focusCaption: { fontSize: 12, color: "#5c564c", paddingBottom: 4, flexShrink: 1 },
  focusLine: { fontSize: 13, fontWeight: "700", color: "#1b1b1b" },
  focusCopy: { fontSize: 12, color: "#5c564c", lineHeight: 17 },
  focusChips: { flexDirection: "row", gap: 6, marginTop: 2 },
  focusChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cfc6b8",
    backgroundColor: "#ffffff",
  },
  focusChipActive: { backgroundColor: "#1f4d3a", borderColor: "#1f4d3a" },
  focusChipLabel: { fontSize: 12, fontWeight: "600", color: "#1b1b1b" },
  focusChipLabelActive: { color: "#ffffff", fontWeight: "700" },
  topNavRow: { flexDirection: "row", gap: 6 },
  topNavBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  topNavLabel: { color: "#1b1b1b", fontWeight: "600", fontSize: 13 },
  topNavLabelPrimary: { color: "#ffffff", fontWeight: "700", fontSize: 13 },
  confirmSheet: {
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#1f4d3a",
    shadowColor: "#1b1b1b",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
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
    width: "17%",
    minWidth: 50,
    borderWidth: 1,
    borderColor: "#4a4a63",
    borderRadius: 6,
    padding: 3,
    backgroundColor: "#262633",
  },
  frameTen: { width: "21%", minWidth: 62 },
  frameHighlight: { borderColor: "#e9c46a", borderWidth: 2 },
  frameNum: { fontSize: 10, fontWeight: "700", color: "#b9b9d0" },
  balls: { flexDirection: "row", gap: 2, minHeight: 16 },
  ballMark: { fontSize: 13, fontWeight: "800", minWidth: 12, color: "#ffffff" },
  frameTotal: { fontSize: 12, fontWeight: "700", marginTop: 1, color: "#e9c46a" },
});
