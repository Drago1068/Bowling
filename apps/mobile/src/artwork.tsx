import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  Text,
} from "react-native-svg";

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
