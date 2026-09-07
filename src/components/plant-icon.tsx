import Svg, { Circle, Path, Line, Ellipse } from "react-native-svg";
import { colors } from "./plantia-theme";

export function Icon({
  name,
  size = 22,
  color = colors.ink,
}: {
  name: "leaf" | "bluetooth" | "play" | "pause" | "sliders" | "close" | "chevron" | "sound";
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "leaf" && (
        <>
          <Path d="M5 19C1 7 10 3 21 3c0 12-6 18-14 14" />
          <Path d="M3 22 16 9" />
        </>
      )}
      {name === "bluetooth" && <Path d="m7 7 10 10-5 5V2l5 5L7 17" />}
      {name === "play" && <Path d="m9 5 10 7-10 7Z" fill={color} strokeWidth={0} />}
      {name === "pause" && (
        <>
          <Line x1={8} y1={5} x2={8} y2={19} strokeWidth={3} />
          <Line x1={16} y1={5} x2={16} y2={19} strokeWidth={3} />
        </>
      )}
      {name === "sliders" && (
        <>
          <Path d="M4 7h5m4 0h7M4 17h10m4 0h2" />
          <Circle cx={11} cy={7} r={2} />
          <Circle cx={16} cy={17} r={2} />
        </>
      )}
      {name === "close" && <Path d="m6 6 12 12M6 18 18 6" />}
      {name === "chevron" && <Path d="m9 5 7 7-7 7" />}
      {name === "sound" && (
        <>
          <Path d="M4 10h4l5-4v12l-5-4H4Z" />
          <Path d="M17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14" />
        </>
      )}
    </Svg>
  );
}
export function Botanical() {
  return (
    <Svg width={145} height={186} viewBox="0 0 160 200" fill="none">
      <Ellipse cx={87} cy={108} rx={60} ry={72} fill="#E5EADA" opacity={0.55} />
      <Path d="M78 196C69 150 94 109 93 35" stroke="#799477" strokeWidth={1.4} />
      <Path d="M91 73C58 77 50 48 57 17c29 8 47 29 34 56Z" fill="#B7C9AB" />
      <Path d="M91 115c-3-35 13-59 50-59-1 31-19 52-50 59Z" fill="#91AC8B" />
      <Path d="M79 152c-27 0-51-16-54-46 33-8 53 13 54 46Z" fill="#C4D2B7" />
      <Path d="M92 77 62 26m29 91 42-52m-54 90-45-41" stroke="#6F8B6B" strokeWidth={1.1} />
      <Path d="M93 48c-9-20-2-35 11-45 10 22 7 37-11 45Z" fill="#D0DCC4" />
    </Svg>
  );
}
