import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

export function WaveMark({ color = "#1F2818", width = 54 }: { color?: string; width?: number }) {
  return <Svg width={width} height={width * .32} viewBox="0 0 120 38" fill="none">
    <Path d="M4 20C17-3 28 4 39 23S61 38 73 16 94 1 116 20" stroke={color} strokeWidth={5.5} strokeLinecap="round" />
  </Svg>;
}

export function LivingPattern({ color }: { color: string }) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      {[-80,-35,10,55,100,145,190,235,280,325,370,415].map((offset, index) =>
        <Path key={offset} d={`M${offset} 860C${offset+95} 690 ${offset-35} 540 ${offset+62} 380S${offset+135} 130 ${offset+40} -40`}
          fill="none" stroke={color} strokeWidth={1.1} opacity={index % 2 ? .1 : .16} />)}
    </Svg>
  </View>;
}
