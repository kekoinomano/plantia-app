export const colors = {
  background: "#F1ECE3",
  paper: "#F8F5EE",
  ink: "#1F2818",
  muted: "#6F7467",
  green: "#59624A",
  forest: "#27311F",
  sage: "#D7CDBF",
  line: "#D7CDBF",
  soft: "#E8E1D6",
  amber: "#8A633F",
};
export const moodPalettes: Record<string, { accent: string; wash: string; deep: string }> = {
  "deep-focus": { accent: "#69765C", wash: "#E3E6DA", deep: "#263021" },
  sleep: { accent: "#66727C", wash: "#E0E5E6", deep: "#283238" },
  "lofi-waves": { accent: "#9A604D", wash: "#EADDD4", deep: "#382820" },
  psychedelic: { accent: "#735F82", wash: "#E6DDE8", deep: "#302838" },
  ghibli: { accent: "#4E7770", wash: "#DCE8E3", deep: "#22332F" },
};

export const moodPalette = (id: string) => moodPalettes[id] ?? moodPalettes["deep-focus"];
