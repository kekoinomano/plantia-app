import Svg, { Circle, Path, Line } from "react-native-svg";
import { colors } from "./plantia-theme";

export function Icon({
  name,
  size = 22,
  color = colors.ink,
  muted = false,
}: {
  name: "leaf" | "bluetooth" | "play" | "pause" | "sliders" | "close" | "chevron" | "sound" | "info" | "back" | "refresh" | "edit" | "check" | "search" | "wave" | "keys" | "bell" | "strings" | "wind";
  size?: number;
  color?: string;
  muted?: boolean;
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
          {muted && <Path d="M4 4 20 20" strokeWidth={2} />}
        </>
      )}
      {name === "info" && <><Circle cx={12} cy={12} r={9} /><Path d="M12 11v6" /><Circle cx={12} cy={7.5} r={.7} fill={color} strokeWidth={0} /></>}
      {name === "back" && <><Path d="m14 5-7 7 7 7" /><Path d="M7 12h13" /></>}
      {name === "refresh" && <><Path d="M20 7v5h-5" /><Path d="M4 17v-5h5" /><Path d="M6.1 8A7 7 0 0 1 18.7 6L20 8m-16 8 1.3 2A7 7 0 0 0 18 16" /></>}
    </Svg>
  );
}
