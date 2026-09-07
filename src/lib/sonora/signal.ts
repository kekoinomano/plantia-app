/** Signal descriptors. Raw samples are never replaced; signed companding bounds their influence. */
export type Recording = {
  session: {
    id: string;
    name: string;
    started_at: string;
    ended_at: string | null;
    mode: string;
  };
  packets: {
    seq: number;
    elapsed_ms: number;
    values: number[] | null;
    error?: string | null;
  }[];
};
export type Frame = {
  time: number;
  seq: number;
  level: number;
  center: number;
  spread: number;
  roughness: number;
  slope: number;
  spectrum: number[];
  profile: number[];
  cadence: number;
};
export type Analysis = {
  frames: Frame[];
  duration: number;
  suspect: number;
  invalid: number;
  gaps: number;
  baseline: number;
};
export const clamp = (x: number, lo = 0, hi = 1) =>
  Math.max(lo, Math.min(hi, x));
export const mean = (a: number[]) =>
  a.reduce((s, x) => s + x / Math.max(1, a.length), 0);
export function median(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  return s.length
    ? s[Math.floor((s.length - 1) / 2)] / 2 + s[Math.floor(s.length / 2)] / 2
    : 0;
}
export const signedLog = (x: number) =>
  Math.sign(x) * Math.log2(1 + Math.abs(x));
const BIN_MS = 250;
export const GAP_SECONDS = 1.5;
/** DCT of the ordered packet: these are spatial/sample-order components, never calibrated Hz. */
function describe(
  values: number[],
  time: number,
  seq: number,
  cadence: number,
): Frame {
  const log = values.map(signedLog),
    center = median(log);
  const residual = log.map((x) => Math.tanh((x - center) * 2) / 2);
  const spectrum = Array.from({ length: 9 }, (_, k) =>
    Math.abs(
      mean(
        residual.map(
          (x, j) => x * Math.cos((Math.PI * (j + 0.5) * (k + 1)) / log.length),
        ),
      ),
    ),
  );
  return {
    time,
    seq,
    level: mean(values),
    center,
    spread: Math.sqrt(mean(residual.map((x) => x * x))),
    roughness: mean(residual.slice(1).map((x, i) => Math.abs(x - residual[i]))),
    slope: mean(
      residual.map(
        (x, i) => x * ((2 * i) / Math.max(1, values.length - 1) - 1),
      ),
    ),
    spectrum,
    profile: Array.from(
      { length: 10 },
      (_, j) =>
        residual[Math.min(log.length - 1, Math.floor((j * log.length) / 10))],
    ),
    cadence,
  };
}
export function createSignalAccumulator(onFrame: (frame: Frame) => void) {
  let bucket: Frame[] = [],
    bin = -1,
    invalid = 0,
    suspect = 0,
    lastTime = -Infinity,
    lastSeq = -1;
  const flush = () => {
    if (!bucket.length) return;
    const first = bucket[0];
    onFrame({
      ...first,
      time: bucket.at(-1)!.time,
      seq: bucket.at(-1)!.seq,
      level: mean(bucket.map((f) => f.level)),
      center: median(bucket.map((f) => f.center)),
      spread: mean(bucket.map((f) => f.spread)),
      roughness: mean(bucket.map((f) => f.roughness)),
      slope: mean(bucket.map((f) => f.slope)),
      cadence: mean(bucket.map((f) => f.cadence)),
      spectrum: first.spectrum.map((_, j) =>
        mean(bucket.map((f) => f.spectrum[j])),
      ),
      profile: first.profile.map((_, j) =>
        mean(bucket.map((f) => f.profile[j])),
      ),
    });
    bucket = [];
  };
  const push = (p: Recording['packets'][number]) => {
    if (
      !Number.isSafeInteger(p.seq) ||
      p.seq <= lastSeq ||
      !Number.isFinite(p.elapsed_ms) ||
      p.elapsed_ms < 0 ||
      p.elapsed_ms < lastTime ||
      p.error ||
      !p.values ||
      p.values.length !== 10 ||
      !p.values.every(Number.isFinite)
    ) {
      invalid++;
      return;
    }
    const nextBin = Math.floor(p.elapsed_ms / BIN_MS);
    if (nextBin !== bin) {
      flush();
      bin = nextBin;
    }
    const center = median(p.values);
    suspect += p.values.filter(
      (v) => Math.abs(v - center) > Math.max(100, Math.abs(center) * 100),
    ).length;
    const cadence = Number.isFinite(lastTime)
      ? (p.elapsed_ms - lastTime) / 1000
      : 0;
    bucket.push(describe(p.values, p.elapsed_ms / 1000, p.seq, cadence));
    lastTime = p.elapsed_ms;
    lastSeq = p.seq;
  };
  return {
    push,
    flush,
    advance(elapsedMs: number) {
      if (bucket.length && elapsedMs >= (bin + 1) * BIN_MS) flush();
    },
    get invalid() {
      return invalid;
    },
    get suspect() {
      return suspect;
    },
    get pendingFrames() {
      return bucket.length;
    },
  };
}
export function analyzeRecording(recording: Recording): Analysis {
  const frames: Frame[] = [];
  const stream = createSignalAccumulator((frame) => frames.push(frame));
  for (const p of [...recording.packets].sort((a, b) => a.seq - b.seq))
    stream.push(p);
  stream.flush();
  const elapsed = recording.session.ended_at
    ? (Date.parse(recording.session.ended_at) -
        Date.parse(recording.session.started_at)) /
      1000
    : 0;
  return {
    frames,
    duration: Math.max(
      0.25,
      (frames.at(-1)?.time ?? 0) + 0.25,
      Number.isFinite(elapsed) ? elapsed : 0,
    ),
    suspect: stream.suspect,
    invalid: stream.invalid,
    gaps: frames.filter(
      (f, i) => i > 0 && f.time - frames[i - 1].time > GAP_SECONDS,
    ).length,
    baseline: frames[0]?.level ?? 0,
  };
}
export function instrumentCheck(duration = 30): Analysis {
  return analyzeRecording({
    session: {
      id: 'instrument',
      name: 'Señal fija',
      mode: 'demo',
      started_at: '2026-01-01T00:00:00Z',
      ended_at: new Date(
        Date.parse('2026-01-01T00:00:00Z') + duration * 1000,
      ).toISOString(),
    },
    packets: Array.from({ length: Math.ceil(duration * 4) }, (_, i) => ({
      seq: i,
      elapsed_ms: i * 250,
      values: Array(10).fill(20000),
    })),
  });
}
