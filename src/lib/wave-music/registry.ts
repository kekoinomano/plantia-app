import { lofiWaves } from './moods/lofi';
import { deepFocus } from './moods/deep-focus';
import { sleep } from './moods/sleep';
import { psychedelic } from './moods/psychedelic';
import { ghibli } from './moods/ghibli';
import { space } from './moods/space';
import { smoothTechno } from './moods/smooth-techno';
import { jazzSession } from './moods/jazz-session';
import type { WaveMood } from './types';

export const WAVE_MOODS: readonly WaveMood[] = [deepFocus, sleep, lofiWaves, psychedelic, ghibli, space, smoothTechno, jazzSession];
export const waveMood = (id: string) => WAVE_MOODS.find(mood => mood.profile.id === id);
