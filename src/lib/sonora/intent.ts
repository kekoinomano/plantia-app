import { clamp, type Frame } from './signal.ts';
import { createGestureDetector } from './gesture.ts';

export type PlantCharacter = { level: number; pace: number; variation: number; texture: number };
export type MusicalIntent = {
  frame: Frame;
  character: PlantCharacter;
  motion: number;
  detail: number;
  profileScale: number;
  bands: number[];
  shape: number;
  contour: number;
  position: number;
  greeting: boolean;
};

/** Updated ONLY by real readings. Musical clock ticks must never reanalyse a packet. */
export class PlantInterpreter {
  private previous: Frame | null = null;
  private baseline = 0;
  private character: PlantCharacter = { level: 0.5, pace: 0.5, variation: 0, texture: 0 };
  private gesture = createGestureDetector();

  push(f: Frame): MusicalIntent {
    const first = !this.previous;
    const delta = first ? 0 : f.center - this.previous!.center;
    const dt = first ? 0.25 : Math.max(0.001, f.time - this.previous!.time);
    const measured = {
      level: clamp((f.center + 2) / 24),
      pace: 1 / (1 + Math.max(0.001, f.cadence) / 0.12),
      variation: Math.abs(delta) / (Math.abs(delta) + dt * 0.12),
      texture: f.spread / (f.spread + 0.08),
    };
    const follow = first ? 1 : 1 - Math.exp(-dt / 4);
    for (const key of ['level', 'pace', 'variation', 'texture'] as const)
      this.character[key] += (measured[key] - this.character[key]) * follow;
    this.baseline = first ? f.center : this.baseline + (f.center - this.baseline) * (1 - Math.exp(-dt / 3));
    const profileScale = Math.max(0.004, f.spread);
    const bandSum = Math.max(0.0001, f.spectrum.reduce((sum, x) => sum + x, 0));
    const shape = f.spectrum.reduce((sum, x, i) => sum + x * (i + 1), 0) /
      Math.max(1e-8, f.spectrum.reduce((sum, x) => sum + x, 0)) / 9;
    this.previous = f;
    return {
      frame: f, character: { ...this.character }, profileScale, shape,
      motion: 1 - Math.exp(-Math.abs(delta) * 24 - f.roughness * 8),
      detail: 1 - Math.exp(-f.spread * 18),
      bands: f.spectrum.map((x) => Math.sqrt(x / bandSum)),
      contour: Math.tanh((f.center - this.baseline) * 60 + f.slope * 35),
      position: clamp(0.1 + this.character.level * 0.65 +
        (this.character.pace - 0.5) * 0.24 + (shape - 0.5) * 0.22, 0.12, 0.88),
      greeting: Boolean(this.gesture.push(f)),
    };
  }
}
