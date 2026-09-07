import { Platform } from "react-native";
export const colors = {
  background: "#F6F5EF",
  paper: "#FFFDF8",
  ink: "#263E32",
  muted: "#7D877C",
  green: "#3E6650",
  sage: "#DCE5D6",
  line: "#E5E7DC",
  soft: "#EDF0E7",
  amber: "#966D39",
};
export const serif = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" });
