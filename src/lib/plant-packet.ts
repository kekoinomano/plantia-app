import { toByteArray } from "base64-js";
import type { Recording } from "./sonora/signal";

export type PlantPacket = Recording["packets"][number];

/** Same ten ordered raw values as the web; no smoothing before Sonora. */
export function decodePlantPacket(base64: string, seq: number, elapsed_ms: number): PlantPacket {
  try {
    const text = String.fromCharCode(...toByteArray(base64));
    const values: unknown = JSON.parse(text).arr;
    if (
      !Array.isArray(values) ||
      values.length !== 10 ||
      !values.every((v) => Number.isSafeInteger(v))
    ) {
      throw new Error("Se esperaban diez valores numéricos.");
    }
    return { seq, elapsed_ms, values };
  } catch {
    return { seq, elapsed_ms, values: null, error: "Paquete del sensor no válido" };
  }
}
