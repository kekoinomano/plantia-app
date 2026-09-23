import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./plant-icon";
import { colors } from "./plantia-theme";

export function ScreenHeader({ title, action }: { title: string; action?: ReactNode }) {
  const router = useRouter();
  return <View style={styles.header}>
    <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.button}>
      <Icon name="back" size={20} />
    </Pressable>
    <Text style={styles.title}>{title}</Text>
    <View style={styles.action}>{action}</View>
  </View>;
}
const styles = StyleSheet.create({
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 },
  button: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title: { color: colors.ink, fontSize: 20, letterSpacing: -.3 },
  action: { width: 44, alignItems: "center" },
});
