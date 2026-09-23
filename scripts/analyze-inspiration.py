"""Offline evidence extraction, not instrument recognition or polyphonic transcription."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess

import librosa
import numpy as np
from scipy.signal import find_peaks
import soundfile as sf

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('audio', type=Path)
parser.add_argument('--output', type=Path)
parser.add_argument('--seconds', type=float, default=30, help='Maximum excerpt duration')
args = parser.parse_args()
if args.seconds <= 0:
    parser.error('--seconds must be positive')
out = args.output or args.audio.parent / 'analysis' / args.audio.stem
out.mkdir(parents=True, exist_ok=True)
sr, hop, nfft = 22050, 256, 4096
raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(args.audio), '-t', str(args.seconds),
                               '-f', 'f32le', '-ac', '2', '-ar', str(sr), 'pipe:1'])
stereo = np.frombuffer(raw, dtype='<f4').reshape(-1, 2)
y = stereo.mean(axis=1)
if len(y) < nfft or np.max(np.abs(y)) < 1e-7:
    parser.error('Need at least 0.2 seconds of non-silent audio')
D = librosa.stft(y, n_fft=nfft, hop_length=hop)
H, P = librosa.decompose.hpss(D, margin=3)
harmonic = librosa.istft(H, hop_length=hop, length=len(y))
percussive = librosa.istft(P, hop_length=hop, length=len(y))
sf.write(out / 'harmonic.wav', harmonic, sr)
sf.write(out / 'transients.wav', percussive, sr)
freq = librosa.fft_frequencies(sr=sr, n_fft=nfft)
power = np.abs(D) ** 2
spectrum = power.mean(axis=1)
peaks, _ = find_peaks(spectrum, distance=3)
peaks = sorted((p for p in peaks if 40 <= freq[p] <= 6000), key=lambda p: spectrum[p], reverse=True)[:24]
chroma = librosa.feature.chroma_stft(S=np.abs(H) ** 2, sr=sr, n_fft=nfft, hop_length=hop).mean(axis=1)
chroma /= max(chroma.sum(), 1e-12)
env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
onsets = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units='time')
ac = librosa.autocorrelate(env - env.mean())
lags, _ = find_peaks(ac)
tempos = sorted((int(k) for k in lags if ac[k] > 0 and 45 <= 60 * sr / (hop * k) <= 180), key=lambda k: ac[k], reverse=True)[:5]
pitches, magnitudes = librosa.piptrack(S=np.abs(H), sr=sr, n_fft=nfft, hop_length=hop, fmin=80, fmax=1600)
# Dominant partial per frame: may be an overtone, never label this as exact melody.
idx = magnitudes.argmax(axis=0)
hz = pitches[idx, np.arange(pitches.shape[1])]
strength = magnitudes[idx, np.arange(pitches.shape[1])]
notes = []
for start in np.arange(0, len(y) / sr, 0.5):
    a, b = int(start * sr / hop), int((start + 0.5) * sr / hop)
    valid = (hz[a:b] > 0) & (strength[a:b] > strength.max() * 0.08)
    if valid.any():
        values = librosa.hz_to_midi(hz[a:b][valid])
        bins = np.round(values).astype(int)
        midi = int(np.bincount(bins, weights=strength[a:b][valid]).argmax())
        notes.append({'time': round(float(start), 2), 'dominant_partial_note': librosa.midi_to_note(midi),
                      'hz': round(float(librosa.midi_to_hz(midi)), 2), 'spread_semitones': round(float(np.std(values)), 2)})
mid, side = y, (stereo[:, 0] - stereo[:, 1]) / 2
rms = float(np.sqrt(np.mean(y ** 2)))
timeline = []
# A one-second window resolves low fundamentals better than the 186 ms onset STFT.
# Zero padding interpolates peaks; it does not increase the window's resolution.
for start in range(int(np.ceil(len(y) / sr))):
    segment = y[start * sr:(start + 1) * sr]
    spectrum_long = np.abs(np.fft.rfft(segment * np.hanning(len(segment)), 65536))
    freq_long = np.fft.rfftfreq(65536, 1 / sr)
    candidates, _ = find_peaks(spectrum_long, distance=30)
    strongest = sorted((k for k in candidates if 40 < freq_long[k] < 1600),
                       key=lambda k: spectrum_long[k], reverse=True)[:9]
    timeline.append({'time': start, 'rms_dbfs': float(20 * np.log10(max(float(np.sqrt(np.mean(segment ** 2))), 1e-12))),
                     'peaks': [{'hz': round(float(freq_long[k]), 2), 'note': librosa.hz_to_note(freq_long[k])}
                               for k in strongest]})
report = {
    'source': args.audio.name, 'sha256': hashlib.sha256(args.audio.read_bytes()).hexdigest(),
    'tools': {m: importlib.metadata.version(m) for m in ['numpy', 'scipy', 'librosa', 'soundfile']},
    'duration_analyzed_seconds': len(y) / sr, 'sample_rate': sr,
    'rms_dbfs': float(20 * np.log10(max(rms, 1e-12))),
    'crest_db': float(20 * np.log10(np.max(np.abs(y)) / max(rms, 1e-12))),
    'stereo_side_mid_db': float(10 * np.log10(max(float(np.mean(side ** 2)), 1e-12) / max(float(np.mean(mid ** 2)), 1e-12))),
    'spectral_centroid_hz': float(librosa.feature.spectral_centroid(S=np.abs(D), sr=sr).mean()),
    'rolloff_85_hz': float(librosa.feature.spectral_rolloff(S=np.abs(D), sr=sr).mean()),
    'bands_energy_fraction': {f'{low}-{high}': float(spectrum[(freq >= low) & (freq < high)].sum() / spectrum.sum())
                              for low, high in [(20, 120), (120, 400), (400, 1200), (1200, 4000), (4000, 11025)]},
    'hpss_energy_relative_to_mix': {'harmonic': float(np.sum(np.abs(H) ** 2) / power.sum()),
                                    'transient': float(np.sum(np.abs(P) ** 2) / power.sum())},
    'chroma': {librosa.midi_to_note(60 + n, octave=False): float(chroma[n]) for n in range(12)},
    'spectral_peaks': [{'hz': round(float(freq[p]), 2), 'nearest_note': librosa.hz_to_note(freq[p]),
                        'relative_db': round(float(10 * np.log10(spectrum[p] / spectrum.max())), 2)} for p in peaks],
    'onsets_seconds': onsets.tolist(),
    'tempo_candidates': [{'bpm': round(60 * sr / (hop * k), 2), 'correlation': round(float(ac[k] / max(ac[0], 1e-12)), 3)} for k in tempos],
    'dominant_partials_timeline': notes,
    'one_second_spectral_timeline': timeline,
    'limits': ['HPSS separates sustained/transient components, not instruments.',
               'Spectral peaks and dominant partials can be harmonics, not played notes.',
               'Tempo candidates have half/double-time ambiguity; short excerpts do not establish metre or key.',
               'Synth brand, instrument identity and effect chain require listening and remain hypotheses.']
}
(out / 'analysis.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
