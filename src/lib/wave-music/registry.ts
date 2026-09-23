import { lofiWaves } from './moods/lofi';
import { deepFocus } from './moods/deep-focus';
import { sleep } from './moods/sleep';
import { psychedelic } from './moods/psychedelic';
import { ghibli } from './moods/ghibli';
import type { WaveMood } from './types';

export const WAVE_MOODS: readonly WaveMood[] = [deepFocus, sleep, lofiWaves, psychedelic, ghibli];
export const waveMood = (id: string) => WAVE_MOODS.find(mood => mood.profile.id === id);
