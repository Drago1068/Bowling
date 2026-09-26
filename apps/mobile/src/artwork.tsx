import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  View,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import {
  Canvas,
  Fill,
  LinearGradient as SkLinearGradient,
  RadialGradient as SkRadialGradient,
  vec,
} from "@shopify/react-native-skia";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  Text,
} from "react-native-svg";

/** Shell palette shared by page graphics and the scoring styles. */
export const ART = {
  laneDeep: "#101017",
  lane: "#17171f",
  laneRaised: "#262633",
  laneEdge: "#4a4a63",
  cream: "#f4f1ea",
  sand: "#d9d1c3",
  sandDeep: "#cfc6b8",
  green: "#1f4d3a",
  gold: "#e9c46a",
  cyan: "#7fd4ff",
  red: "#d62828",
  ink: "#1b1b1b",
  muted: "#5c564c",
} as const;

export type SectionGlyphKind =
  | "history"
  | "analysis"
  | "advanced"
  | "newGame"
  | "home";

const ENTER_MS = 340;

/** Mount-time fade + rise. Re-runs whenever `key` changes. */
function useEnter(delay = 0) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(value, {
        toValue: 1,
        duration: ENTER_MS,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, 0);
    return () => {
      clearTimeout(timer);
      value.setValue(0);
    };
  }, [delay, value]);
  return value;
}

export function enterStyle(enter: Animated.Value, rise = 10) {
  return {
    opacity: enter,
    transform: [
      {
        translateY: enter.interpolate({
          inputRange: [0, 1],
          outputRange: [rise, 0],
        }),
      },
    ],
  } as const;
}

/** Wrapper that fades content in when it first mounts. */
export function Enter(props: {
  children: ReactNode;
  delay?: number;
  rise?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const enter = useEnter(props.delay ?? 0);
  return (
    <Animated.View style={[enterStyle(enter, props.rise ?? 10), props.style]}>
      {props.children}
    </Animated.View>
  );
}

const PIN_BODY =
  "M20 3 C15 3 13.5 8 14.5 13 L16.5 24 C10.5 30 7.5 38 7.5 46 " +
  "C7.5 57 12.5 61.5 20 61.5 C27.5 61.5 32.5 57 32.5 46 " +
  "C32.5 38 29.5 30 23.5 24 L25.5 13 C26.5 8 25 3 20 3 Z";

function LanePinShape(props: { number: number }) {
  return (
    <G>
      <Path d={PIN_BODY} fill="#ffffff" stroke="#cfc6b8" strokeWidth={1.5} />
      <Rect x={14.5} y={14.5} width={11} height={3.4} rx={1.7} fill="#d62828" />
      <Rect x={14.5} y={20.5} width={11} height={3.4} rx={1.7} fill="#d62828" />
      <Text
        x={20}
        y={52}
        fontSize={14}
        fontWeight="bold"
        textAnchor="middle"
        fill="#17171f"
      >
        {props.number}
      </Text>
    </G>
  );
}

/**
 * Rack pin: standing pins render as white lane pins with red stripes;
 * knocked-down pins render as dark numbered circles (Lanetalk language).
 */
export function RackPinSvg(props: { pin: number; standing: boolean; size?: number }) {
  const size = props.size ?? 36;
  if (!props.standing) {
    return (
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Circle cx={20} cy={20} r={17} fill="#262633" stroke="#4a4a63" strokeWidth={2} />
        <Text
          x={20}
          y={25.5}
          fontSize={15}
          fontWeight="bold"
          textAnchor="middle"
          fill="#f5f3ee"
        >
          {props.pin}
        </Text>
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size * 1.4} viewBox="0 0 40 64">
      <LanePinShape number={props.pin} />
    </Svg>
  );
}

/** Landing hero: ball bursting through a fan of pins over speed streaks. */
export function HeroArtSvg(props: { width?: number | string }) {
  return (
    <Svg width={props.width ?? "100%"} height={190} viewBox="0 0 320 170">
      <Defs>
        <RadialGradient id="heroBall" cx="35%" cy="30%" r="75%">
          <Stop offset="0%" stopColor="#4a4a63" />
          <Stop offset="55%" stopColor="#23232f" />
          <Stop offset="100%" stopColor="#14141f" />
        </RadialGradient>
        <LinearGradient id="heroLane" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#e9c46a" stopOpacity={0} />
          <Stop offset="50%" stopColor="#e9c46a" stopOpacity={0.55} />
          <Stop offset="100%" stopColor="#e9c46a" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Polygon points="0,40 96,74 0,108" fill="#7fd4ff" opacity={0.16} />
      <Polygon points="0,84 88,104 0,128" fill="#7fd4ff" opacity={0.12} />
      <Polygon points="0,120 80,132 0,148" fill="#7fd4ff" opacity={0.1} />
      <G transform="translate(168,36) rotate(18)">
        <LanePinShape number={7} />
      </G>
      <G transform="translate(202,24) rotate(8)">
        <LanePinShape number={8} />
      </G>
      <G transform="translate(234,24) rotate(-8)">
        <LanePinShape number={9} />
      </G>
      <G transform="translate(264,38) rotate(-20)">
        <LanePinShape number={10} />
      </G>
      <Circle cx={118} cy={94} r={60} fill="url(#heroBall)" stroke="#4a4a63" strokeWidth={3} />
      <Ellipse
        cx={94}
        cy={68}
        rx={20}
        ry={11}
        fill="#ffffff"
        opacity={0.28}
        transform="rotate(-25 94 68)"
      />
      <Circle cx={132} cy={80} r={6.5} fill="#0c0c12" />
      <Circle cx={149} cy={90} r={6.5} fill="#0c0c12" />
      <Circle cx={140} cy={108} r={6.5} fill="#0c0c12" />
      <Rect x={0} y={160} width={320} height={4} fill="url(#heroLane)" />
      <Circle cx={36} cy={30} r={3} fill="#e9c46a" opacity={0.9} />
      <Circle cx={292} cy={120} r={2.5} fill="#e9c46a" opacity={0.8} />
      <Circle cx={262} cy={140} r={2} fill="#e9c46a" opacity={0.7} />
      <Circle cx={60} cy={140} r={2} fill="#7fd4ff" opacity={0.6} />
    </Svg>
  );
}

/** Compact bowling ball mark — works on light or dark surfaces. */
export function BallGlyphSvg(props: { size?: number; color?: string }) {
  const size = props.size ?? 22;
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx={16} cy={16} r={14} fill={props.color ?? ART.lane} />
      <Ellipse
        cx={11}
        cy={8.5}
        rx={5.5}
        ry={3}
        fill="#ffffff"
        opacity={0.22}
        transform="rotate(-30 11 8.5)"
      />
      <Circle cx={12.5} cy={12.5} r={2.3} fill="#000000" opacity={0.42} />
      <Circle cx={19} cy={11.5} r={2.3} fill="#000000" opacity={0.42} />
      <Circle cx={15.5} cy={18} r={2.3} fill="#000000" opacity={0.42} />
    </Svg>
  );
}

/** Trophy mark for the metrics card header. */
export function TrophySvg(props: { size?: number }) {
  const size = props.size ?? 22;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <LinearGradient id="trophyGold" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#f6df9c" />
          <Stop offset="55%" stopColor="#e9c46a" />
          <Stop offset="100%" stopColor="#c9982c" />
        </LinearGradient>
      </Defs>
      <Path
        d="M11 5 h18 v11 a9 9 0 0 1 -18 0 z"
        fill="url(#trophyGold)"
      />
      <Path
        d="M11 8 h-4 a5 5 0 0 0 5 8"
        stroke="#c9982c"
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M29 8 h4 a5 5 0 0 1 -5 8"
        stroke="#c9982c"
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
      />
      <Rect x={18} y={25} width={4} height={5} fill="#c9982c" />
      <Rect x={12} y={31} width={16} height={4} rx={2} fill="url(#trophyGold)" />
    </Svg>
  );
}

/** Line-art glyphs used on buttons and banners. */
export function SectionGlyphSvg(props: {
  kind: SectionGlyphKind;
  size?: number;
  color?: string;
}) {
  const size = props.size ?? 24;
  const color = props.color ?? ART.green;
  const shared = {
    stroke: color,
    strokeWidth: 2.4,
    fill: "none" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      {props.kind === "history" ? (
        <G>
          <Rect x={10} y={4} width={17} height={12} rx={2.5} opacity={0.55} {...shared} />
          <Rect x={5} y={13} width={17} height={12} rx={2.5} {...shared} />
          <Line x1={9} y1={18} x2={18} y2={18} {...shared} />
          <Line x1={9} y1={22} x2={14} y2={22} {...shared} />
        </G>
      ) : props.kind === "analysis" ? (
        <G>
          <Line x1={4} y1={28} x2={28} y2={28} {...shared} />
          <Rect x={6} y={18} width={5} height={10} rx={1.5} {...shared} />
          <Rect x={14} y={12} width={5} height={16} rx={1.5} {...shared} />
          <Rect x={22} y={6} width={5} height={22} rx={1.5} {...shared} />
        </G>
      ) : props.kind === "advanced" ? (
        <G>
          <Line x1={4} y1={9} x2={28} y2={9} {...shared} />
          <Circle cx={21} cy={9} r={4} {...shared} />
          <Line x1={4} y1={17} x2={28} y2={17} {...shared} />
          <Circle cx={11} cy={17} r={4} {...shared} />
          <Line x1={4} y1={25} x2={28} y2={25} {...shared} />
          <Circle cx={18} cy={25} r={4} {...shared} />
        </G>
      ) : props.kind === "home" ? (
        <G>
          <Path d="M4 15 L16 5 L28 15" {...shared} />
          <Rect x={7} y={15} width={18} height={12} rx={1.5} {...shared} />
          <Rect x={13} y={20} width={6} height={7} rx={1} {...shared} />
          <Circle cx={16} cy={11} r={1.6} fill={color} stroke="none" />
        </G>
      ) : (
        <G>
          <Line x1={2} y1={12} x2={9} y2={12} {...shared} />
          <Line x1={0} y1={19} x2={7} y2={19} {...shared} />
          <Line x1={3} y1={26} x2={9} y2={26} {...shared} />
          <Circle cx={19} cy={17} r={9} {...shared} />
          <Circle cx={17} cy={14} r={1.5} fill={color} stroke="none" />
          <Circle cx={22.5} cy={14.5} r={1.5} fill={color} stroke="none" />
          <Circle cx={19.5} cy={20} r={1.5} fill={color} stroke="none" />
        </G>
      )}
    </Svg>
  );
}

/**
 * Full-width lane run: boards, foul line, range dots, and the seven approach
 * arrows pointing toward the pin deck. Decorative only.
 */
/**
 * Lane strip. Two layers so nothing stretches: the background (boards, foul
 * line, vignette) is allowed to fill any width, while arrows and the pin deck
 * stay at a fixed size and uniform scale.
 */
export function LaneRunSvg(props: { height?: number }) {
  const height = props.height ?? 56;
  const arrowRows = [12, 21, 30, 39, 48];
  return (
    <View
      style={[artStyles.laneTrack, { height }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 320 60"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <LinearGradient id="laneVignette" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#000000" stopOpacity={0.42} />
            <Stop offset="30%" stopColor="#000000" stopOpacity={0} />
            <Stop offset="70%" stopColor="#000000" stopOpacity={0} />
            <Stop offset="100%" stopColor="#000000" stopOpacity={0.45} />
          </LinearGradient>
          <LinearGradient id="laneSheen" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.09} />
            <Stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={320} height={60} fill={ART.lane} />
        {[8, 16, 24, 32, 40, 48].map((y) => (
          <Rect key={y} x={0} y={y} width={320} height={1} fill={ART.laneRaised} />
        ))}
        <Rect x={0} y={0} width={320} height={26} fill="url(#laneSheen)" />
        <Rect x={13} y={0} width={2} height={60} fill={ART.gold} opacity={0.5} />
        <Rect x={17} y={0} width={1} height={60} fill={ART.gold} opacity={0.22} />
        <Rect x={0} y={0} width={320} height={60} fill="url(#laneVignette)" />
      </Svg>
      <View style={[artStyles.laneDetail, { height }]}>
        <Svg width={184} height={height} viewBox="0 0 184 60">
          {[16, 30, 44, 58].map((x) =>
            [14, 23, 32, 41, 50].map((y) => (
              <Circle key={`${x}-${y}`} cx={x} cy={y} r={2} fill={ART.laneEdge} opacity={0.8} />
            )),
          )}
          {arrowRows.map((y, i) => {
            const tip = 92 + (2 - Math.abs(i - 2)) * 9;
            const center = i === 2;
            return (
              <Path
                key={`arrow-${y}`}
                d={`M${tip} ${y} L${tip - 15} ${y - 4.5} L${tip - 15} ${y + 4.5} Z`}
                fill={center ? ART.gold : ART.cyan}
                opacity={center ? 0.92 : 0.45}
              />
            );
          })}
          <Line x1={112} y1={6} x2={112} y2={54} stroke={ART.laneEdge} strokeWidth={1} opacity={0.7} />
          {[
            { x: 150, y: 41 },
            { x: 142, y: 27 },
            { x: 158, y: 27 },
            { x: 134, y: 13 },
            { x: 150, y: 13 },
            { x: 166, y: 13 },
          ].map((p) => (
            <G key={`pin-${p.x}-${p.y}`} transform={`translate(${p.x - 6},${p.y}) scale(0.3)`}>
              <Path d={PIN_BODY} fill="#ffffff" stroke={ART.sandDeep} strokeWidth={4} />
              <Rect x={14.5} y={14.5} width={11} height={3.4} rx={1.7} fill={ART.red} />
              <Rect x={14.5} y={20.5} width={11} height={3.4} rx={1.7} fill={ART.red} />
            </G>
          ))}
        </Svg>
      </View>
    </View>
  );
}

/** Self-contained lane strip for light surfaces (own dark rounded frame). */
export function LaneStrip(props: { height?: number }) {
  const height = props.height ?? 56;
  return (
    <View style={[artStyles.laneStrip, { height }]}>
      <LaneRunSvg height={height} />
    </View>
  );
}

/** Per-section banner scene, drawn at a fixed size so nothing stretches. */
function BannerScene(props: { kind: "history" | "analysis" | "advanced" }) {
  if (props.kind === "history") {
    return (
      <Svg width={152} height={96} viewBox="0 0 152 96">
        <G opacity={0.9}>
          <Rect x={8} y={16} width={66} height={58} rx={7} fill="#1c1c26" stroke={ART.laneEdge} />
          <Rect x={18} y={26} width={66} height={58} rx={7} fill="#23232f" stroke={ART.laneEdge} />
          <Rect x={26} y={34} width={30} height={4} rx={2} fill={ART.gold} />
          {[46, 54, 62, 70].map((y) => (
            <Rect key={y} x={26} y={y} width={50} height={3} rx={1.5} fill={ART.laneEdge} />
          ))}
        </G>
        <G transform="translate(104,18) scale(1.05)">
          <Path d={PIN_BODY} fill="#ffffff" stroke={ART.sandDeep} strokeWidth={2} />
          <Rect x={14.5} y={14.5} width={11} height={3.4} rx={1.7} fill={ART.red} />
          <Rect x={14.5} y={20.5} width={11} height={3.4} rx={1.7} fill={ART.red} />
        </G>
        <G transform="translate(96,78)">
          <Circle cx={0} cy={0} r={12} fill={ART.laneDeep} stroke={ART.laneEdge} strokeWidth={1.5} />
          <Ellipse cx={-4} cy={-6} rx={4.5} ry={2.5} fill="#ffffff" opacity={0.22} transform="rotate(-30 -4 -6)" />
        </G>
      </Svg>
    );
  }
  if (props.kind === "analysis") {
    const bars = [
      { x: 14, h: 28 },
      { x: 38, h: 44 },
      { x: 62, h: 22 },
      { x: 86, h: 52 },
    ];
    return (
      <Svg width={152} height={96} viewBox="0 0 152 96">
        <Line x1={8} y1={80} x2={144} y2={80} stroke={ART.laneEdge} strokeWidth={1.5} />
        {bars.map((b, i) => (
          <Rect
            key={b.x}
            x={b.x}
            y={80 - b.h}
            width={16}
            height={b.h}
            rx={3}
            fill={i % 2 === 0 ? ART.cyan : ART.gold}
            opacity={i % 2 === 0 ? 0.55 : 0.75}
          />
        ))}
        <Path
          d="M22 54 L46 40 L70 60 L94 30"
          stroke={ART.green}
          strokeWidth={2.5}
          fill="none"
          strokeDasharray="5 5"
          strokeLinecap="round"
        />
        {[
          { x: 22, y: 54 },
          { x: 46, y: 40 },
          { x: 70, y: 60 },
          { x: 94, y: 30 },
        ].map((p) => (
          <Circle key={`${p.x}`} cx={p.x} cy={p.y} r={3} fill={ART.green} stroke="#0f2b20" />
        ))}
        <G transform="translate(126,64)">
          <Circle cx={0} cy={0} r={14} fill={ART.laneDeep} stroke={ART.laneEdge} strokeWidth={1.5} />
          <Ellipse cx={-5} cy={-7} rx={5} ry={3} fill="#ffffff" opacity={0.22} transform="rotate(-30 -5 -7)" />
        </G>
      </Svg>
    );
  }
  const rows = [
    { y: 30, w: 54, dot: ART.green },
    { y: 46, w: 40, dot: ART.gold },
    { y: 62, w: 48, dot: ART.green },
  ];
  return (
    <Svg width={152} height={96} viewBox="0 0 152 96">
      <Rect x={8} y={16} width={94} height={64} rx={9} fill="#1c1c26" stroke={ART.laneEdge} />
      <Rect x={8} y={16} width={94} height={14} rx={9} fill={ART.laneRaised} />
      <Rect x={16} y={21} width={26} height={4} rx={2} fill={ART.gold} opacity={0.85} />
      {rows.map((r) => (
        <G key={r.y}>
          <Rect x={16} y={r.y} width={r.w} height={5} rx={2.5} fill={ART.laneRaised} />
          <Circle cx={88} cy={r.y + 2.5} r={4.5} fill={r.dot} opacity={0.9} />
        </G>
      ))}
      <G transform="translate(126,20) scale(0.95)">
        <Path d={PIN_BODY} fill="#ffffff" stroke={ART.sandDeep} strokeWidth={2} />
        <Rect x={14.5} y={14.5} width={11} height={3.4} rx={1.7} fill={ART.red} />
        <Rect x={14.5} y={20.5} width={11} height={3.4} rx={1.7} fill={ART.red} />
      </G>
    </Svg>
  );
}

/** Page header strip: stretch-safe wash, fixed-size scene, fixed-size glyph. */
export function SectionBanner(props: {
  kind: "history" | "analysis" | "advanced";
}) {
  const enter = useEnter(40);
  return (
    <Animated.View
      style={[artStyles.banner, enterStyle(enter, 8)]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={artStyles.bannerDecor}>
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 240 96"
          preserveAspectRatio="none"
          style={StyleSheet.absoluteFill}
        >
          <Defs>
            <LinearGradient id="bannerWash" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor={ART.laneDeep} />
              <Stop offset="70%" stopColor={ART.lane} />
              <Stop offset="100%" stopColor="#20202c" />
            </LinearGradient>
            <LinearGradient id="bannerGrain" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.07} />
              <Stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={240} height={96} fill="url(#bannerWash)" />
          {[6, 13, 21, 30, 40, 51, 63, 76, 90].map((y) => (
            <Rect key={y} x={0} y={y} width={240} height={1} fill="#ffffff" opacity={0.04} />
          ))}
          <Rect x={0} y={0} width={240} height={40} fill="url(#bannerGrain)" />
          <Line x1={0} y1={88} x2={240} y2={88} stroke={ART.gold} strokeWidth={2} opacity={0.5} />
        </Svg>
        <View style={artStyles.bannerScene}>
          <BannerScene kind={props.kind} />
        </View>
      </View>
      <View style={artStyles.bannerGlyph}>
        <SectionGlyphSvg kind={props.kind} size={54} color={ART.gold} />
      </View>
    </Animated.View>
  );
}

/** Empty-state illustration: one lone pin, one ball, and the line between. */
export function EmptyStateArt(props: {
  kind: "history" | "analysis";
  height?: number;
}) {
  const height = props.height ?? 150;
  return (
    <Svg
      width="100%"
      height={height}
      viewBox="0 0 260 150"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle
        cx={130}
        cy={74}
        r={60}
        fill="#faf8f4"
        stroke={ART.sand}
        strokeWidth={2}
        strokeDasharray="7 9"
      />
      <G transform="translate(58,34) scale(0.95)">
        <Path d={PIN_BODY} fill="#ffffff" stroke={ART.sandDeep} strokeWidth={1.5} />
        <Rect x={14.5} y={14.5} width={11} height={3.4} rx={1.7} fill={ART.red} />
        <Rect x={14.5} y={20.5} width={11} height={3.4} rx={1.7} fill={ART.red} />
      </G>
      <Path
        d="M146 96 Q 120 58 98 66"
        stroke={ART.gold}
        strokeWidth={2.5}
        strokeDasharray="5 7"
        fill="none"
        strokeLinecap="round"
      />
      <G transform="translate(175,100)">
        <Circle cx={0} cy={0} r={30} fill={ART.lane} stroke={ART.laneEdge} strokeWidth={2} />
        <Ellipse
          cx={-12}
          cy={-16}
          rx={11}
          ry={6}
          fill="#ffffff"
          opacity={0.2}
          transform="rotate(-30 -12 -16)"
        />
        <Circle cx={-9} cy={-6} r={5} fill="#0b0b10" />
        <Circle cx={4} cy={-9} r={5} fill="#0b0b10" />
        <Circle cx={-2} cy={6} r={5} fill="#0b0b10" />
      </G>
      <Circle cx={218} cy={34} r={3.5} fill={ART.gold} opacity={0.9} />
      <Circle cx={40} cy={112} r={3} fill={ART.gold} opacity={0.7} />
      <Circle cx={132} cy={22} r={2.5} fill={ART.cyan} opacity={0.7} />
      {props.kind === "analysis" ? (
        <G opacity={0.85}>
          <Line x1={214} y1={78} x2={214} y2={96} stroke={ART.green} strokeWidth={4} strokeLinecap="round" />
          <Line x1={226} y1={68} x2={226} y2={96} stroke={ART.green} strokeWidth={4} strokeLinecap="round" />
          <Line x1={238} y1={56} x2={238} y2={96} stroke={ART.green} strokeWidth={4} strokeLinecap="round" />
        </G>
      ) : null}
    </Svg>
  );
}

/** Celebration mark shown when a game is finished. */
export function StrikeBadge(props: { size?: number }) {
  const size = props.size ?? 132;
  const enter = useEnter(0);
  const rays = Array.from({ length: 12 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 12;
    const inner = 46;
    const outer = 74;
    const spread = 0.13;
    const x1 = 80 + Math.cos(angle) * inner;
    const y1 = 80 + Math.sin(angle) * inner;
    const x2 = 80 + Math.cos(angle - spread) * outer;
    const y2 = 80 + Math.sin(angle - spread) * outer;
    const x3 = 80 + Math.cos(angle + spread) * outer;
    const y3 = 80 + Math.sin(angle + spread) * outer;
    return `${x1},${y1} ${x2},${y2} ${x3},${y3}`;
  });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const rotate = enter.interpolate({
    inputRange: [0, 1],
    outputRange: ["-45deg", "0deg"],
  });
  const glowSize = Math.round(size * 1.36);
  const glowPad = (glowSize - size) / 2;
  const glowMid = glowSize / 2;
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        opacity: enter,
        transform: [{ scale }, { rotate }],
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Canvas
        pointerEvents="none"
        style={[
          artStyles.badgeGlow,
          { width: glowSize, height: glowSize, left: -glowPad, top: -glowPad },
        ]}
      >
        <Fill>
          <SkRadialGradient
            c={vec(glowMid, glowMid)}
            r={glowMid}
            colors={[
              "rgba(233,196,106,0)",
              "rgba(233,196,106,0.55)",
              "rgba(233,196,106,0)",
            ]}
            positions={[0, 0.56, 1]}
          />
        </Fill>
      </Canvas>
      <Svg width={size} height={size} viewBox="0 0 160 160">
      <Defs>
        <RadialGradient id="strikeCore" cx="50%" cy="42%" r="60%">
          <Stop offset="0%" stopColor="#20202c" />
          <Stop offset="100%" stopColor={ART.laneDeep} />
        </RadialGradient>
      </Defs>
      {rays.map((points, i) => (
        <Polygon
          key={`ray-${i}`}
          points={points}
          fill={ART.gold}
          opacity={i % 2 === 0 ? 0.85 : 0.45}
        />
      ))}
      <Circle cx={80} cy={80} r={46} fill="url(#strikeCore)" stroke={ART.gold} strokeWidth={3} />
      <Text
        x={80}
        y={100}
        fontSize={52}
        fontWeight="bold"
        textAnchor="middle"
        fill={ART.gold}
      >
        X
      </Text>
      <Circle cx={38} cy={38} r={3} fill="#ffffff" opacity={0.8} />
      <Circle cx={126} cy={124} r={2.5} fill="#ffffff" opacity={0.65} />
      </Svg>
    </Animated.View>
  );
}

/** Loading ornament: a ball rolling down a lane toward the deck. */
export function LoadingLaneArt(props: { width?: number; height?: number }) {
  const width = props.width ?? 168;
  const height = props.height ?? 44;
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 168 44"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Rect x={0} y={6} width={168} height={32} rx={16} fill={ART.lane} />
      <Rect x={14} y={14} width={22} height={3} rx={1.5} fill={ART.cyan} opacity={0.55} />
      <Rect x={20} y={21} width={26} height={3} rx={1.5} fill={ART.cyan} opacity={0.4} />
      <Rect x={16} y={28} width={18} height={3} rx={1.5} fill={ART.cyan} opacity={0.3} />
      <Circle cx={58} cy={22} r={13} fill={ART.laneRaised} stroke={ART.laneEdge} strokeWidth={2} />
      <Ellipse cx={53} cy={16} rx={5} ry={3} fill="#ffffff" opacity={0.25} transform="rotate(-30 53 16)" />
      <Circle cx={55} cy={19} r={2.2} fill="#0b0b10" />
      <Circle cx={61} cy={18} r={2.2} fill="#0b0b10" />
      <Circle cx={58} cy={25} r={2.2} fill="#0b0b10" />
      {[86, 104, 122].map((x) => (
        <Circle key={x} cx={x} cy={22} r={2.4} fill={ART.gold} opacity={0.65} />
      ))}
      <Circle cx={144} cy={15} r={4} fill="#ffffff" />
      <Circle cx={152} cy={22} r={4} fill="#ffffff" />
      <Circle cx={144} cy={29} r={4} fill="#ffffff" />
      <Rect x={142} y={12.4} width={4} height={2} fill={ART.red} opacity={0.8} />
      <Rect x={150} y={19.4} width={4} height={2} fill={ART.red} opacity={0.8} />
      <Rect x={142} y={26.4} width={4} height={2} fill={ART.red} opacity={0.8} />
    </Svg>
  );
}

/** Failure ornament: a fallen pin with impact marks. */
export function PinDownArt(props: { size?: number }) {
  const size = props.size ?? 64;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle cx={36} cy={36} r={32} fill="#fdecea" stroke="#c4564a" strokeWidth={2} />
      <G transform="translate(16,46) rotate(-90) scale(0.62)">
        <Path d={PIN_BODY} fill="#ffffff" stroke={ART.sandDeep} strokeWidth={2} />
        <Rect x={14.5} y={14.5} width={11} height={3.4} rx={1.7} fill={ART.red} />
        <Rect x={14.5} y={20.5} width={11} height={3.4} rx={1.7} fill={ART.red} />
      </G>
      <Line x1={56} y1={26} x2={66} y2={20} stroke="#c4564a" strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={58} y1={36} x2={68} y2={36} stroke="#c4564a" strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={56} y1={46} x2={66} y2={52} stroke="#c4564a" strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}

/** Thin gradient rule that closes the frozen top navigation. */
export function NavAccentBar() {
  return (
    <Svg
      width="100%"
      height={5}
      viewBox="0 0 320 5"
      preserveAspectRatio="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <LinearGradient id="navAccentWash" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor={ART.green} />
          <Stop offset="34%" stopColor="#3d7f5f" />
          <Stop offset="56%" stopColor={ART.gold} />
          <Stop offset="100%" stopColor={ART.green} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={320} height={5} fill="url(#navAccentWash)" />
    </Svg>
  );
}

/**
 * Soft page wash with faint lane boards. The GPU layer (Skia) owns the wash,
 * the light blooms and the vignette; the SVG layer only draws the boards, so
 * nothing here depends on a stretched gradient.
 */
export function PageBackground() {
  const { width, height } = Dimensions.get("window");
  const diag = Math.sqrt(width * width + height * height);
  const boards = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96];
  return (
    <View style={artStyles.pageRoot}>
      <Canvas
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Fill>
          <SkLinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={["#f8f5ee", "#eee8db"]}
          />
        </Fill>
        <Fill>
          <SkRadialGradient
            c={vec(width * 0.84, height * 0.08)}
            r={diag * 0.5}
            colors={["rgba(233,196,106,0.4)", "rgba(233,196,106,0)"]}
            positions={[0, 1]}
          />
        </Fill>
        <Fill>
          <SkRadialGradient
            c={vec(width * 0.1, height * 0.94)}
            r={diag * 0.38}
            colors={["rgba(31,77,58,0.13)", "rgba(31,77,58,0)"]}
            positions={[0, 1]}
          />
        </Fill>
        <Fill>
          <SkRadialGradient
            c={vec(width / 2, height / 2)}
            r={diag / 2}
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.07)"]}
            positions={[0.58, 1]}
          />
        </Fill>
      </Canvas>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {boards.map((x) => (
          <Line
            key={`board-${x}`}
            x1={x}
            y1={0}
            x2={x}
            y2={100}
            stroke="#e3dac6"
            strokeWidth={0.35}
            opacity={0.7}
          />
        ))}
      </Svg>
    </View>
  );
}

/**
 * Chronological average-by-date sparkline: solid gold line for the date
 * average, dashed green for the week average, honest grid behind it.
 */
export function AverageSparkline(props: {
  rows: ReadonlyArray<{
    date: string;
    average: number | null;
    weekAverage: number | null;
  }>;
  height?: number;
}) {
  const height = props.height ?? 136;
  const points = props.rows
    .slice()
    .reverse()
    .filter((r) => r.average != null)
    .map((r) => ({ date: r.date, avg: r.average as number, week: r.weekAverage }));
  if (points.length === 0) {
    return null;
  }
  const values: number[] = [];
  for (const p of points) {
    values.push(p.avg);
    if (p.week != null) values.push(p.week);
  }
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 10) {
    lo -= 5;
    hi += 5;
  } else {
    lo -= (hi - lo) * 0.15;
    hi += (hi - lo) * 0.1;
  }
  const left = 14;
  const right = 266;
  const top = 20;
  const bottom = 92;
  const n = points.length;
  const xAt = (i: number) => (n === 1 ? (left + right) / 2 : left + (i * (right - left)) / (n - 1));
  const yAt = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const avgPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)} ${yAt(p.avg).toFixed(1)}`)
    .join(" ");
  const areaPath =
    n > 1
      ? `${avgPath} L${xAt(n - 1).toFixed(1)} ${bottom} L${xAt(0).toFixed(1)} ${bottom} Z`
      : "";
  const weekPoints = points
    .map((p, i) => (p.week == null ? null : { x: xAt(i), y: yAt(p.week) }))
    .filter((p): p is { x: number; y: number } => p != null);
  const weekPath = weekPoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const gridLines = [top, (top + bottom) / 2, bottom];

  return (
    <Enter>
      <Svg
        width="100%"
        height={height}
        viewBox="0 0 280 120"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {gridLines.map((y) => (
          <Line
            key={y}
            x1={left}
            y1={y}
            x2={right}
            y2={y}
            stroke="#e3dccd"
            strokeWidth={1}
            strokeDasharray="3 5"
          />
        ))}
        <Line x1={left} y1={bottom} x2={right} y2={bottom} stroke={ART.sandDeep} strokeWidth={1.5} />
        {areaPath ? <Path d={areaPath} fill={ART.gold} opacity={0.16} /> : null}
        {weekPath ? (
          <Path
            d={weekPath}
            stroke={ART.green}
            strokeWidth={2}
            fill="none"
            strokeDasharray="6 5"
            strokeLinecap="round"
          />
        ) : null}
        <Path d={avgPath} stroke={ART.gold} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        {points.map((p, i) => (
          <Circle
            key={`${p.date}-${i}`}
            cx={xAt(i)}
            cy={yAt(p.avg)}
            r={3.5}
            fill={ART.gold}
            stroke="#fff"
            strokeWidth={1.5}
          />
        ))}
        <Text x={left} y={14} fontSize={10} fill={ART.muted}>
          {`high ${Math.round(Math.max(...values))}`}
        </Text>
        <Text x={left} y={112} fontSize={9} fill={ART.muted}>
          {points[0]?.date ?? ""}
        </Text>
        <Text x={right} y={112} fontSize={9} fill={ART.muted} textAnchor="end">
          {points[n - 1]?.date ?? ""}
        </Text>
      </Svg>
    </Enter>
  );
}

/** Per-game final-total bars. Highest game reads gold; the rest stay green. */
export function FinalTotalsBars(props: {
  items: ReadonlyArray<{ label: string; total: number }>;
  height?: number;
}) {
  const items = props.items.filter((i) => Number.isFinite(i.total));
  if (items.length === 0) {
    return null;
  }
  const height = props.height ?? 128;
  const barW = 24;
  const gap = 12;
  const padLeft = 12;
  const width = padLeft * 2 + items.length * barW + (items.length - 1) * gap;
  const baseline = 86;
  const max = Math.max(...items.map((i) => i.total), 1);
  const top = 26;
  let bestIndex = 0;
  items.forEach((item, i) => {
    if (item.total > (items[bestIndex]?.total ?? -1)) bestIndex = i;
  });

  return (
    <Enter>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} 110`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Line x1={6} y1={baseline} x2={width - 6} y2={baseline} stroke={ART.sandDeep} strokeWidth={1.5} />
        <Line
          x1={6}
          y1={top - 6}
          x2={width - 6}
          y2={top - 6}
          stroke="#e3dccd"
          strokeWidth={1}
          strokeDasharray="3 5"
        />
        {items.map((item, i) => {
          const h = Math.max(3, (item.total / max) * (baseline - top));
          const x = padLeft + i * (barW + gap);
          const best = i === bestIndex;
          return (
            <G key={`${item.label}-${i}`}>
              <Rect
                x={x}
                y={baseline - h}
                width={barW}
                height={h}
                rx={4}
                fill={best ? ART.gold : ART.green}
                opacity={best ? 1 : 0.78}
              />
              <Text
                x={x + barW / 2}
                y={baseline - h - 6}
                fontSize={9}
                fontWeight="bold"
                fill={best ? ART.green : ART.muted}
                textAnchor="middle"
              >
                {String(item.total)}
              </Text>
              <Text x={x + barW / 2} y={baseline + 14} fontSize={9} fill={ART.muted} textAnchor="middle">
                {`#${i + 1}`}
              </Text>
            </G>
          );
        })}
        <Text x={6} y={16} fontSize={10} fill={ART.muted}>
          {`best ${max}`}
        </Text>
      </Svg>
    </Enter>
  );
}

/**
 * Average score per period (day/week/month/year) — the Analysis trend chart
 * that follows the Week/Month/Year/All-time range chips.
 */
export function AverageTrendBars(props: {
  items: ReadonlyArray<{ label: string; average: number; count: number }>;
  /** Range average drawn as a dashed line across the bars (and named in the legend). */
  average?: number | null;
  height?: number;
}) {
  const items = props.items.filter((i) => Number.isFinite(i.average));
  if (items.length === 0) {
    return null;
  }
  const height = props.height ?? 140;
  const n = items.length;
  const barW = n > 10 ? 20 : n > 7 ? 24 : 30;
  const gap = n > 10 ? 8 : 10;
  const padLeft = 14;
  const width = padLeft * 2 + n * barW + (n - 1) * gap;
  const baseline = 92;
  const top = 30;
  const max = Math.max(...items.map((i) => i.average), 1);
  let bestIndex = 0;
  items.forEach((item, i) => {
    if (item.average > (items[bestIndex]?.average ?? -1)) bestIndex = i;
  });
  const rangeAverage =
    props.average != null && Number.isFinite(props.average) && props.average > 0
      ? props.average
      : null;
  const averageY =
    rangeAverage != null
      ? baseline -
        Math.max(0, Math.min(1, rangeAverage / max)) * (baseline - top)
      : null;

  return (
    <Enter>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} 120`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Line
          x1={6}
          y1={baseline}
          x2={width - 6}
          y2={baseline}
          stroke={ART.sandDeep}
          strokeWidth={1.5}
        />
        {averageY != null ? (
          <Line
            x1={6}
            y1={averageY}
            x2={width - 6}
            y2={averageY}
            stroke={ART.green}
            strokeWidth={1.25}
            strokeDasharray="4 4"
            opacity={0.65}
          />
        ) : null}
        {items.map((item, i) => {
          const h = Math.max(4, (item.average / max) * (baseline - top));
          const x = padLeft + i * (barW + gap);
          const best = i === bestIndex;
          return (
            <G key={`${item.label}-${i}`}>
              <Rect
                x={x}
                y={baseline - h}
                width={barW}
                height={h}
                rx={4}
                fill={best ? ART.gold : ART.green}
                opacity={best ? 1 : 0.78}
              />
              <Text
                x={x + barW / 2}
                y={baseline - h - 6}
                fontSize={9}
                fontWeight="bold"
                fill={best ? ART.green : ART.muted}
                textAnchor="middle"
              >
                {String(Math.round(item.average))}
              </Text>
              <Text
                x={x + barW / 2}
                y={baseline + 13}
                fontSize={8}
                fill={ART.muted}
                textAnchor="middle"
              >
                {item.label}
              </Text>
              {item.count > 1 ? (
                <Text
                  x={x + barW / 2}
                  y={baseline + 24}
                  fontSize={7}
                  fill={ART.sandDeep}
                  textAnchor="middle"
                >
                  {`x${item.count}`}
                </Text>
              ) : null}
            </G>
          );
        })}
        <Text x={6} y={14} fontSize={10} fill={ART.muted}>
          {`${rangeAverage != null ? `average ${Math.round(rangeAverage)} · ` : ""}best ${Math.round(max)}`}
        </Text>
      </Svg>
    </Enter>
  );
}

const artStyles = StyleSheet.create({
  pageRoot: { flex: 1 },
  badgeGlow: { position: "absolute" },
  laneTrack: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: ART.lane,
  },
  laneDetail: {
    position: "absolute",
    right: 2,
    top: 0,
    alignItems: "flex-end",
  },
  bannerScene: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  laneStrip: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: ART.lane,
    borderWidth: 1,
    borderColor: "#33334a",
  },
  banner: {
    height: 96,
    borderRadius: 14,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ART.lane,
    borderWidth: 1,
    borderColor: "#33334a",
  },
  bannerDecor: { flex: 1, height: 96 },
  bannerGlyph: {
    width: 92,
    alignItems: "center",
    justifyContent: "center",
    paddingRight: 6,
  },
});
