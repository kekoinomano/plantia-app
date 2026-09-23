export type WaveReadout = {
  id: number; rank: number; frequency: number; amplitude: number; phase: number;
  improvement: number; weight: number; cycles: number; age: number;
  roles: string[]; notes: number;
};
export type WindowReadout = {
  analysis: number; seconds: number; target: number; explained: number | null;
  mean: number; rmse: number; waves: WaveReadout[];
};
export type WaveInspection = {
  decision: string; latestAnalysis: number | null; barAnalysis: number | null;
  ageSeconds: number | null; queueSeconds: number; collectedSeconds: number;
  latest: WindowReadout[]; sources: WindowReadout[]; summary: Record<string, unknown>;
};

// A separate external store: graph packets and control renders never subscribe
// to this stream. Only completed analyses/bar changes publish small snapshots.
let snapshot: WaveInspection | null = null;
const listeners = new Set<() => void>();
export const getWaveInspection = () => snapshot;
export function subscribeWaveInspection(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function publishWaveInspection(next: WaveInspection | null) {
  if (snapshot === next) return;
  snapshot = next;
  listeners.forEach(listener => listener());
}
