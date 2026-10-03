import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@/components/saviasound-theme";
import { GestureHandlerRootView } from "react-native-gesture-handler";
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: colors.background } }}
      />
    </GestureHandlerRootView>
  );
}
