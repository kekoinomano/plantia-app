import type { Language } from './i18n';
import type { ProfileId } from './sonora/focus';

type Copy = { name: string; description: string; explanation: readonly string[] };
const common = [
  'Analysis every 2 s: 3 s at 95% and 8 s at 80%, up to eight components; percentages are targets, not guarantees.',
  'Absolute mean and spectral distribution choose the identity at phrase boundaries. Weights show contributions to the fit, not volume or biological indicators.',
  'A raw peak triggers the shared bell tree greeting; the lead briefly recedes while the background continues.',
];
const en: Record<ProfileId, Copy> = {
  'deep-focus': { name: 'Deep focus', description: 'A suspended background and a quiet keyboard motif that breathes between repetitions.', explanation: [
    'Ambient focus: a percussion-free background, pentatonic harmony and a small recurring motif that does not demand attention.',
    'Mean and geometric frequency choose an internal 48–66 BPM. Spectral width chooses the harmonic route; the dominant wave weighs more in the combined contour.',
    'Two slowly entering background voices and keys on alternate bars. High width or activity selects piano for the motif; a large change may modulate at a phrase boundary.', ...common] },
  sleep: { name: 'Sleep', description: 'Soft piano and a warm midrange bed, with breathing room and pauses between phrases.', explanation: [
    'Four slow beats without percussion: a legato bed in the audible center and two piano notes separated by silence.',
    'An open pentatonic harmony lasts four bars; every eight bars the plant may change tonal center and route.',
    'Small fluctuations move accents, articulation and passing notes; a higher long-term mean gradually changes the bed’s timbre at the start of a phrase.',
    'The shared greeting uses a bell tree. No clinical effects are attributed to the tempo or timbre.', ...common] },
  'lofi-waves': { name: 'Lofi Waves', description: 'Three warm ensembles, a steady groove and phrases guided by the plant.', explanation: [
    'The palette is set before mapping: soft vibraphone, intimate piano or strumstick. Each ensemble has a matching base and soloist; instruments are not chosen independently at random.',
    'Two fits every 2 s: a short 3 s window at 95% and a long 8 s window at 80%, up to eight waves. The introduction uses only the complete short window.',
    'Absolute mean affects tempo and accompaniment family; weighted frequency distribution chooses harmony and groove. Variation controls dynamics. The piano develops chord tones rather than turning each wave into a separate note.',
    'The base can support the soloist with separate registers and seventh chords. One melody line, at most five pitched voices including releases. Drums keep time when the melody rests.',
    'Identity lasts eight bars and can adapt after four following a large change. The piano repeats a two-bar question and answer, resolving on the chord’s third.',
    'Short, long and initial means remain in memory with their analyses. Ranges are compared with four sample recordings; they are neither biological calibration nor a guarantee for every circuit.',
    'Midrange acoustic piano with two quieter lower voices. The response ends more softly and sustains longer; the round bass keeps its pattern.',
    'The shared greeting detects a relative extreme before Fourier and uses a bell tree. The soloist briefly recedes; greetings do not stack.'] },
  psychedelic: { name: 'Psychedelic', description: 'A modal pedal, three- and five-step figures and echoes that slowly change position.', explanation: [
    'Modal psychedelia: a stable center lets changes in phase, timbre and space be heard without constantly changing chords.',
    'Dan tranh plays a three-step cell and vibraphone answers with five steps. They share a pulse while their relationship shifts across bars.',
    'The weighted wave field chooses direction and stereo position. Spectral width enables the second figure; persistence sustains the pedal.',
    'The engine uses real delay with a restrained mix and no extra feedback. Layers take turns; tape reversal and nonexistent effects are not simulated.', ...common] },
  ghibli: { name: 'Studio Ghibli', description: 'Piano waltz with a high cantabile melody, light left hand and breathing replies.', explanation: [
    'The reference suggests piano around 83 BPM, with attacks roughly 0.36 and 0.72 s apart and a prominent upper melody. The new piece uses that pace, not its notes.',
    'An original eight-bar theme in 3/4: ascent, descending reply, development and cadence. The left hand adds bass and inner support without competing with the melody.',
    'Weighted mean and frequency choose center and pulse; width and activity in the long window choose the harmonic route and whether orchestration enters.',
    'The eight-bar arc emphasizes its peak and harmonic arrivals. Passing notes and pickups are softer but sustained; the left hand stays below the melody.',
    'Short waves, weighted by their fit, shade each note’s strength and articulation. Short-term activity widens the dynamic arc; long-term persistence extends legato. Arrivals connect across bars and a warm room keeps their resonance.',
    'This mood’s Steinway uses three recorded velocity layers and release samples. Velocity chooses layer and level; duration controls key release without simulating a sustain pedal.',
    'The notes are original; no film melodies are quoted.', ...common] },
  space: { name: 'Space', description: 'A horizon of suspended chords, soft pulses and glimmers that respond to the plant.', explanation: [
    'The seed suggests a sustained, lightly percussive field with prominent F–G–A–C–D and slow openings. Its pentatonic grammar is retained, not its notes or audio.',
    'The slow 58–72 BPM pulse is a compositional choice; the MP3 does not establish one with certainty. Vibraphone and strumstick alternate the lead over a discreet bed.',
    'Mean and frequency of long waves choose center and tempo; width and activity choose the harmonic route and intensity of each twelve-bar opening.',
    'Four motif families emerge from the first available window and remain stable. Rhythm, direction and register vary between plants; short waves move details within each family.',
    'A large signal change may move the tonal center at a scene boundary. The background sustains a root and changes color afterward.', ...common] },
  'smooth-techno': { name: 'Smooth Techno', description: 'Warm dub techno with a steady pulse, echoing synth chords and syncopated bass.', explanation: [
    'The kick marks four beats and the bass answers between them. Snare on two and four and offbeat hats form a recognizable cycle without excessive swing.',
    'Short synthetic third-and-seventh chords repeat in syncopation; the engine’s real delay extends them. A small electronic motif evolves over four bars and leaves room for echo.',
    'Dorian mode keeps a warm minor center. Long-wave identity chooses the eight-bar route, rhythmic family and contour; large changes may renew the frame at a phrase start.',
    'Long-term mean selects the center and target tempo, persistence sets the bed’s duration and weighted short waves move accents and passing notes without breaking the pulse.',
    'The last bar drops some drums and melody layers so the return of the cycle can be heard.', ...common] },
  'jazz-session': { name: 'Jazz Session', description: 'Tenor sax, piano and vibraphone with walking bass, swing and improvised conversation.', explanation: [
    'An eight-bar form uses ii–V–I and turnarounds. Each chord has a seventh; piano comps with thirds and sevenths in syncopation, leaving room for bass.',
    'The bass walks through roots, chord tones and chromatic approaches. Swing delays weak eighth notes; soft hat and ghost snare keep time without covering the solo.',
    'Tenor sax develops two-bar motifs: thirds and sevenths connect changes and passing notes lead into the next. Breaths fall at phrase ends; vibraphone answers every half phrase.',
    'Weighted mean and frequency of long waves set center and tempo; long-term width and activity choose the route. A large variation changes the frame at a phrase start.',
    'Long-term persistence sets how much the bass walks and how legato the phrase is. Weighted short waves shade accents, approaches and comping while pulse and harmony remain clear.', ...common] },
};

export function moodName(id: ProfileId, fallback: string, language: Language) { return language === 'en' ? en[id].name : fallback; }
export function moodDescription(id: ProfileId, fallback: string, language: Language) { return language === 'en' ? en[id].description : fallback; }
export function moodExplanation(id: ProfileId, index: number, fallback: string, language: Language) {
  return language === 'en' ? en[id].explanation[index] ?? fallback : fallback;
}
