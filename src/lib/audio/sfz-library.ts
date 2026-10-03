import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import catalog from '../../../assets/audio/sfz/manifest.json';

type Instrument = { patch: string; packs: number[]; gain: number; version?: number; minNote?: number; maxNote?: number; fixedNote?: number };
const instruments: Record<string, Instrument> = {
  acoustic_grand_piano: {
    patch: 'Steinway B Compact.sfz', gain: 2.2,
    packs: [require('../../../assets/audio/sfz/piano-steinway.sfzpack')],
  },
  ghibli_grand_piano: {
    patch: 'Steinway B Ghibli.sfz', gain: 2.2, version: 2, minNote: 39, maxNote: 82,
    packs: [
      require('../../../assets/audio/sfz/piano-ghibli-soft.sfzpack'),
      require('../../../assets/audio/sfz/piano-ghibli-medium.sfzpack'),
      require('../../../assets/audio/sfz/piano-ghibli-bright.sfzpack'),
    ],
  },
  bass_recorder: {
    patch: 'Baroque Bass Recorder - Sustain.sfz', gain: 6, minNote: 53, maxNote: 79,
    packs: [require('../../../assets/audio/sfz/bass-recorder.sfzpack')],
  },
  renaissance_organ: {
    patch: 'Renaissance Organ - Full.sfz', gain: 0.8, minNote: 36, maxNote: 89,
    packs: [require('../../../assets/audio/sfz/renaissance-organ.sfzpack')],
  },
  vibraphone: {
    patch: 'Vibraphone - Soft Mallets.sfz', gain: 5, minNote: 53, maxNote: 89,
    packs: [require('../../../assets/audio/sfz/vibraphone.sfzpack')],
  },
  bell_tree: {
    patch: 'Bell Tree.sfz', gain: 2.2, minNote: 60, maxNote: 64,
    packs: [require('../../../assets/audio/sfz/bell-tree.sfzpack')],
  },
  tenor_saxophone: {
    patch: 'Tenor Saxophone - Non-Vibrato.sfz', gain: 1.8, version: 2, minNote: 44, maxNote: 89,
    packs: [require('../../../assets/audio/sfz/tenor-saxophone.sfzpack')],
  },
  tenor_saxophone_short: {
    patch: 'Tenor Saxophone - Staccato.sfz', gain: 1.5, minNote: 44, maxNote: 89,
    packs: [require('../../../assets/audio/sfz/tenor-saxophone-short.sfzpack')],
  },
  strumstick: {
    patch: 'Strumstick.sfz', gain: 5, minNote: 48, maxNote: 84,
    packs: [require('../../../assets/audio/sfz/strumstick.sfzpack')],
  },
  dan_tranh: {
    patch: 'Dan Tranh - Normal.sfz', gain: 5, minNote: 47, maxNote: 84,
    packs: [require('../../../assets/audio/sfz/dan-tranh.sfzpack')],
  },
  soft_kick: {
    patch: 'Soft Kick.sfz', gain: 1, fixedNote: 36,
    packs: [require('../../../assets/audio/sfz/soft-kick.sfzpack')],
  },
  soft_snare: {
    patch: 'Soft Snare.sfz', gain: 1, fixedNote: 38,
    packs: [require('../../../assets/audio/sfz/soft-snare.sfzpack')],
  },
  soft_hat: {
    patch: 'Soft Hat.sfz', gain: 1, fixedNote: 42,
    packs: [require('../../../assets/audio/sfz/soft-hat.sfzpack')],
  },
};
// Shared with the offline renderer. Keep pack requires static for Metro.
for (const [program, instrument] of Object.entries(instruments)) {
  const entry = Object.values(catalog).find(item => item.program === program);
  if (!entry || entry.patch !== instrument.patch || entry.gain !== instrument.gain)
    throw new Error(`SFZ catalog mismatch: ${program}`);
}
const installed = new Map<string, { path: string; gain: number; minNote?: number; maxNote?: number; fixedNote?: number }>();
const loading = new Map<string, Promise<boolean>>();
let legacyCleanup: Promise<void> | undefined;

export const sfzInstrument = (program: string) => installed.get(program);
export const supportsSfz = (program: string) => Platform.OS !== 'web' && program in instruments;

export async function ensureSfz(program: string): Promise<boolean> {
  if (!supportsSfz(program)) return false;
  if (installed.has(program)) return true;
  if (loading.has(program)) return loading.get(program)!;
  const promise = (async () => {
    // sfz-v1 contained the two large pianos and other superseded WAV libraries.
    legacyCleanup ??= FileSystem.deleteAsync(`${FileSystem.documentDirectory}sfz-v1/`,
      { idempotent: true }).catch(error => console.warn('[saviasound SFZ] LEGACY_CLEANUP_FAILED', error));
    await legacyCleanup;
    const instrument = instruments[program];
    const root = `${FileSystem.documentDirectory}sfz-v2/`;
    const target = `${root}${program}${instrument.version ? `-v${instrument.version}` : ''}/`;
    const patch = `${target}${instrument.patch}`;
    if (!(await FileSystem.getInfoAsync(patch)).exists) {
      await FileSystem.makeDirectoryAsync(root, { intermediates: true });
      if (instrument.version)
        await FileSystem.deleteAsync(`${root}${program}/`, { idempotent: true });
      const staging = `${root}${program}-installing/`;
      await FileSystem.deleteAsync(staging, { idempotent: true });
      await FileSystem.makeDirectoryAsync(staging);
      try {
        const { unzip } = await import('react-native-zip-archive');
        for (const module of instrument.packs) {
          const asset = await Asset.fromModule(module).downloadAsync();
          if (!asset.localUri) throw new Error(`Missing SFZ package for ${program}`);
          await unzip(asset.localUri, staging);
        }
        if (!(await FileSystem.getInfoAsync(`${staging}${instrument.patch}`)).exists)
          throw new Error(`Incomplete SFZ package for ${program}`);
        await FileSystem.deleteAsync(target, { idempotent: true });
        await FileSystem.moveAsync({ from: staging, to: target });
      } catch (error) {
        await FileSystem.deleteAsync(staging, { idempotent: true });
        throw error;
      }
    }
    installed.set(program, { path: decodeURI(patch.replace(/^file:\/\//, '')),
      gain: instrument.gain, minNote: instrument.minNote, maxNote: instrument.maxNote, fixedNote: instrument.fixedNote });
    return true;
  })().catch(error => {
    console.error('[saviasound SFZ] INSTALL_FAILED', program, error);
    return false;
  }).finally(() => loading.delete(program));
  loading.set(program, promise);
  return promise;
}
