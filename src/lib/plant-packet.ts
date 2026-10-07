import { toByteArray } from "base64-js";
import type { Recording } from "./sonora/signal";

export type PlantPacket = Recording["packets"][number];

/** Decode the sensor's ten ordered values before they reach the graph or music. */
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
    // A faulty first reading can dwarf the other nine. Use the next reading
    // in its place so consumers that require ten positions keep the packet.
    if (values.slice(1).every((v) => v > 0 && v <= 5_000_000) &&
      values[0] > Math.max(...values.slice(1)) * 10) {
      values[0] = values[1];
    }
    return { seq, elapsed_ms, values };
  } catch {
    return { seq, elapsed_ms, values: null, error: "Paquete del sensor no válido" };
  }
}
