import { audioChannels, preset, type Configuration } from '../sonora/presets';
import type { Bank } from '../sonora/dsp';
import { palettePresets } from '../sonora/focus';
import { ensureSfz } from './sfz-library';

/** Install only the sampled programs a mood may play. Model sounds need no files. */
export class SampleBank {
  async load(config: Configuration): Promise<Bank> {
    const needed = new Set([...palettePresets(config.profile),
      ...audioChannels(config).filter(channel => channel.level > 0).map(channel => channel.patch.preset)]
      .map(id => preset(id).program).filter((program): program is string => !!program));
    const bank: Bank = {};
    await Promise.all([...needed].map(async program => {
      if (!await ensureSfz(program))
        throw new Error(`No se pudo preparar el instrumento SFZ: ${program}`);
      bank[program] = [];
      console.info('[saviasound Audio]', JSON.stringify({
        event: 'BANK_SOURCE', mood: config.profile, program, source: 'sfz-flac',
      }));
    }));
    return bank;
  }
}
