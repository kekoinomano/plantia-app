/** Raw periods are in microseconds. Reception time is availability, not plant rhythm. */
export type Recording = {
  session: { id: string; name: string; started_at: string; ended_at: string | null; mode: string };
  packets: { seq: number; elapsed_ms: number; values: number[] | null; error?: string | null }[];
};
export const GAP_SECONDS = 6;
export const MAX_PERIOD_US = 5_000_000;
export const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
