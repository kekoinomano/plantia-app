import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

export function WaveMark({ color = "#1F2818", width = 54 }: { color?: string; width?: number }) {
  return <Svg width={width} height={width * .32} viewBox="0 90 280 90" fill="none">
    <Path d="M119.569 116.432C119.569 116.432 82.2895 74.4491 61.5941 135.677C40.8988 196.906 8.55312 160.729 8.55312 160.729" stroke={color} strokeWidth={14} strokeLinecap="round" />
    <Path d="M271.569 116.432C271.569 116.432 234.289 74.4491 213.594 135.677C192.899 196.906 160.553 160.729 160.553 160.729" stroke={color} strokeWidth={14} strokeLinecap="round" />
    <Path d="M136.368 130.18C139.005 130.18 141.001 130.971 142.357 132.553C143.788 134.135 144.504 136.169 144.504 138.655C144.504 141.066 143.788 143.1 142.357 144.757C140.926 146.414 138.816 147.243 136.029 147.243C133.392 147.243 131.358 146.414 129.927 144.757C128.496 143.1 127.78 141.141 127.78 138.881C127.78 136.47 128.496 134.436 129.927 132.779C131.358 131.046 133.505 130.18 136.368 130.18Z" fill={color} />
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
