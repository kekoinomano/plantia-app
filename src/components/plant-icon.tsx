import Svg, { Circle, Path, Line, Ellipse } from "react-native-svg";
import { colors } from "./plantia-theme";

export function Icon({
  name,
  size = 22,
  color = colors.ink,
}: {
  name: "leaf" | "bluetooth" | "play" | "pause" | "sliders" | "close" | "chevron" | "sound" | "edit" | "check" | "search" | "wave" | "keys" | "bell" | "strings" | "wind";
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
      {name === "edit" && <Path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z" />}
      {name === "check" && <Path d="m5 12 4 4L19 6" />}
      {name === "search" && <><Circle cx={10} cy={10} r={6} /><Path d="m15 15 5 5" /></>}
      {name === "wave" && <Path d="M2 12c3-15 5 15 8 0s5 15 8 0 4 0 4 0" />}
      {name === "keys" && <><Path d="M3 4h18v16H3ZM9 4v16m6-16v16" /><Path d="M7 4v8m6-8v8m5-8v8" strokeWidth={3} /></>}
      {name === "bell" && <Path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4ZM10 21h4M12 2v2" />}
      {name === "strings" && <><Path d="m15 3 6 6M18 6l-8 8M8 9c-5 0-8 7-4 11s11 1 11-4c-4 1-7-2-7-7Z" /><Circle cx={8} cy={16} r={2} /></>}
      {name === "wind" && <Path d="m4 20 16-16M4 14l6 6M8 10l6 6m-2-10 6 6m-2-10 6 6" />}
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
