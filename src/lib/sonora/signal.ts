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
  /** Strongest packet-level excursion retained even when the 250 ms median stays calm. */
  peakCenter?: number;
  peakContrast?: number;
  /** Robust mean seconds per packet over the latest accepted ten-packet window. */
  packetCadence?: number;
  /** Signed log change at the latest confirmed packet-speed regime transition. */
  packetTempoChange?: number;
  /** Increments when packet arrival speed settles into a substantially new regime. */
  packetRegime?: number;
  packetConfidence?: number;
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
export const GAP_SECONDS = 6;
/** DCT of the ordered packet: these are spatial/sample-order components, never calibrated Hz. */
function describe(
  values: number[],
  time: number,
  seq: number,
  cadence: number,
  packetCadence?: number,
  packetTempoChange = 0,
  packetRegime = 0,
  packetConfidence = 0,
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
    packetCadence,
    packetTempoChange,
    packetRegime,
    packetConfidence,
  };
}
export function createSignalAccumulator(onFrame: (frame: Frame) => void) {
  let bucket: Frame[] = [],
    bin = -1,
    invalid = 0,
    suspect = 0,
    lastTime = -Infinity,
    lastSeq = -1,
    cadenceWindow: number[] = [],
    cadenceCandidate: number[] = [],
    cadenceReference = 0,
    cadenceDirection = 0,
    cadenceStreak = 0,
    cadenceStartedAt = -Infinity,
    lastRegimeTime = -Infinity,
    packetRegime = 0,
    packetTempoChange = 0;
  let lastFrameCenter = 0,
    hasFrameCenter = false;
  const cadenceMean = () => mean(cadenceWindow.slice(-10));
  const acceptCadence = (interval: number, time: number) => {
    if (!(interval > 0) || interval > GAP_SECONDS) {
      if (interval > GAP_SECONDS) {
        cadenceWindow = [];
        cadenceCandidate = [];
        cadenceReference = 0;
        cadenceStartedAt = -Infinity;
        cadenceDirection = cadenceStreak = 0;
        packetTempoChange = 0;
      }
      return;
    }
    if (!Number.isFinite(cadenceStartedAt)) cadenceStartedAt = time;
    // Bluetooth connection startup contains scheduling gaps and short packet bursts.
    // Learn through that transient, but never promote it to a plant regime.
    if (time - cadenceStartedAt < 12) {
      cadenceCandidate = [];
      cadenceWindow.push(interval);
      cadenceWindow = cadenceWindow.slice(-10);
      if (cadenceWindow.length >= 6) cadenceReference = cadenceMean();
      return;
    }
    const typical = cadenceReference;
    const extreme = typical > 0 && (interval > typical * 4 || interval < typical / 4);
    if (extreme) {
      const candidateMean = mean(cadenceCandidate);
      const consistent = !candidateMean ||
        interval <= candidateMean * 2.2 && interval >= candidateMean / 2.2;
      cadenceCandidate = consistent ? [...cadenceCandidate, interval].slice(-3) : [interval];
      // A lone transport hiccup is ignored. Three similarly fast/slow intervals
      // are a real regime candidate and become the start of the new window.
      if (cadenceCandidate.length < 3) return;
      const before = Math.max(0.0001, typical);
      const after = mean(cadenceCandidate);
      cadenceWindow = [...cadenceCandidate];
      cadenceCandidate = [];
      if (time - lastRegimeTime >= 18) {
        cadenceReference = after;
        packetTempoChange = clamp(Math.log2(before / after) / 4, -1, 1);
        packetRegime++;
        lastRegimeTime = time;
      }
      cadenceDirection = cadenceStreak = 0;
      return;
    }
    cadenceCandidate = [];
    cadenceWindow.push(interval);
    cadenceWindow = cadenceWindow.slice(-10);
    const current = cadenceMean();
    if (!cadenceReference && cadenceWindow.length >= 6) cadenceReference = current;
    if (!cadenceReference || cadenceWindow.length < 6) return;
    const ratio = current / cadenceReference;
    const direction = ratio > 1.65 ? 1 : ratio < 0.61 ? -1 : 0;
    if (direction) {
      cadenceStreak = direction === cadenceDirection ? cadenceStreak + 1 : 1;
      cadenceDirection = direction;
      if (cadenceStreak >= 3 && time - lastRegimeTime >= 18) {
        const before = cadenceReference;
        cadenceReference = current;
        packetTempoChange = clamp(Math.log2(before / current) / 4, -1, 1);
        packetRegime++;
        lastRegimeTime = time;
        cadenceDirection = cadenceStreak = 0;
      }
    } else {
      cadenceDirection = cadenceStreak = 0;
      // Follow ordinary drift very slowly, preserving sensitivity to a real jump.
      cadenceReference += (current - cadenceReference) * 0.015;
    }
  };
  const flush = () => {
    if (!bucket.length) return;
    const first = bucket[0];
    const latest = bucket.at(-1)!;
    const center = median(bucket.map((f) => f.center));
    const baseline = hasFrameCenter ? lastFrameCenter : center;
    const peak = bucket.reduce((strongest, frame) =>
      Math.abs(frame.center - baseline) > Math.abs(strongest - baseline) ? frame.center : strongest,
    center);
    onFrame({
      ...first,
      time: latest.time,
      seq: latest.seq,
      level: mean(bucket.map((f) => f.level)),
      center,
      peakCenter: peak,
      peakContrast: Math.abs(peak - baseline),
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
      packetCadence: latest.packetCadence,
      packetTempoChange: latest.packetTempoChange,
      packetRegime: latest.packetRegime,
      packetConfidence: latest.packetConfidence,
    });
    lastFrameCenter = center;
    hasFrameCenter = true;
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
    acceptCadence(cadence, p.elapsed_ms / 1000);
    bucket.push(describe(p.values, p.elapsed_ms / 1000, p.seq, cadence,
      cadenceWindow.length ? cadenceMean() : undefined, packetTempoChange,
      packetRegime, Math.min(1, cadenceWindow.length / 10)));
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
