import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';

export type Language = 'es' | 'en';
const STORAGE_KEY = 'saviasound.language';
const deviceLanguage = (): Language => getLocales()[0]?.languageCode === 'en' ? 'en' : 'es';
let language: Language = deviceLanguage();
let changedByUser = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => language;

void AsyncStorage.getItem(STORAGE_KEY).then(saved => {
  if (!changedByUser && (saved === 'es' || saved === 'en')) {
    language = saved;
    listeners.forEach(listener => listener());
  }
}).catch(() => {});

export function useLanguage() { return useSyncExternalStore(subscribe, snapshot, snapshot); }
export function useTranslation() {
  const current = useLanguage();
  return {
    language: current,
    t: (source: string) => translate(source, current),
    musicLabel: (source: string) => musicLabel(source, current),
  };
}
export function setLanguage(next: Language) {
  changedByUser = true;
  if (language !== next) {
    language = next;
    listeners.forEach(listener => listener());
  }
  void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
}

// Spanish source copy is the fallback. New languages only need another catalog.
const en: Record<string, string> = {
  'Ajustes': 'Settings', 'Idioma': 'Language', 'Español': 'Español', 'Inglés': 'English',
  'Elige el idioma de la aplicación.': 'Choose the app language.',
  'Volver': 'Back', 'Abrir menú': 'Open menu', 'Tu espacio': 'Your space', 'Grabaciones': 'Recordings',
  'Soporte': 'Support', '¿Tienes algún problema? Contáctanos en': 'Need help? Contact us at',
  'Velocidad': 'Speed', 'MÁS LENTA': 'SLOWER', 'MÁS RÁPIDA': 'FASTER',
  'Muestra si la señal de tu planta va más rápida o más lenta que de costumbre durante esta conexión.': 'Shows whether your plant’s signal is faster or slower than usual during this connection.',
  'Amplitud': 'Amplitude', 'MENOR': 'LOWER', 'MAYOR': 'HIGHER',
  'Muestra si los altibajos de la señal son más grandes o más pequeños que los habituales durante esta conexión.': 'Shows whether the signal’s rises and falls are larger or smaller than usual during this connection.',
  'Cambio': 'Change', 'PARECIDO': 'SIMILAR', 'DISTINTO': 'DIFFERENT',
  'Muestra cuánto cambia la señal de un momento a otro, comparado con lo habitual durante esta conexión.': 'Shows how much the signal changes from one moment to the next compared with usual during this connection.',
  'Constancia': 'Stability', 'CAMBIANTE': 'CHANGING', 'ESTABLE': 'STEADY',
  'Muestra si la señal ha mantenido un comportamiento parecido durante el último medio minuto o si ha ido cambiando.': 'Shows whether the signal has stayed similar over the last half minute or has been changing.',
  'Dispositivo conectado': 'Device connected', 'Conectando…': 'Connecting…', 'Sin conectar': 'Not connected',
  'Esperando señal': 'Waiting for signal', 'Nivel habitual': 'Usual level', 'Toca para saber más.': 'Tap to learn more.',
  'GRABANDO': 'RECORDING', 'Reanudar grabación': 'Resume recording', 'Pausar grabación': 'Pause recording',
  'Detener reproducción': 'Stop playback', 'Grabar vídeo con cámara y señal': 'Record video with camera and signal',
  'Información musical': 'Music information', 'Editar mood': 'Edit mood', 'Detener grabación': 'Stop recording',
  'Iniciar grabación': 'Start recording', 'Reproducción en pausa': 'Playback paused',
  'Preparando música': 'Preparing music', 'Silenciar música': 'Mute music', 'Reanudar música': 'Resume music',
  'Cambiar mood. Actual:': 'Change mood. Current:', 'Nueva grabación': 'New recording',
  'Grabación': 'Recording', 'Ponle un nombre. Se guardarán los datos de la planta durante un máximo de': 'Give it a name. Plant data will be saved for up to',
  'minutos.': 'minutes.', 'Nombre de la grabación': 'Recording name', 'Cancelar': 'Cancel', 'Grabar': 'Record',
  'Cerrar explicación': 'Close explanation',
  'Conexión': 'Connection', 'La planta está cerca.': 'Your plant is nearby.', 'Conecta tu saviasound.': 'Connect your saviasound device.',
  'Guardamos en este teléfono los sensores conectados para que la próxima vez solo tengas que tocarlos.': 'Connected sensors are saved on this phone, so next time you can simply tap them.',
  'CONECTADA · RECIBIENDO SEÑAL': 'CONNECTED · RECEIVING SIGNAL', 'Tus dispositivos': 'Your devices',
  'Conectar con': 'Connect to', 'CONECTADO': 'CONNECTED', 'CONEXIÓN RÁPIDA': 'QUICK CONNECT',
  'Eliminar': 'Delete', 'de los dispositivos guardados': 'from saved devices', 'Cerca de ti': 'Nearby',
  'Buscando sensores saviasound…': 'Searching for saviasound sensors…', 'NUEVO DISPOSITIVO': 'NEW DEVICE',
  'Desconectar': 'Disconnect', 'Cancelar búsqueda': 'Cancel search', 'Buscar otra planta': 'Find another plant',
  'Buscar dispositivos': 'Find devices',
  'Enciéndelo y selecciona uno guardado o busca uno nuevo.': 'Turn it on and select a saved device or find a new one.',
  'Desconectando…': 'Disconnecting…',
  'Moods': 'Moods', 'Cada mood escucha la misma señal, pero organiza el tiempo, las voces y el espacio de una forma distinta.': 'Every mood listens to the same signal but arranges time, voices and space differently.',
  'EN ESCUCHA': 'LISTENING', 'Frecuencia': 'Frequency', 'Escala': 'Scale',
  'Jónica': 'Ionian', 'Dórica': 'Dorian', 'Frigia': 'Phrygian', 'Lidia': 'Lydian',
  'Mixolidia': 'Mixolydian', 'Eólica': 'Aeolian', 'Locria': 'Locrian',
  'Pentatónica mayor': 'Major pentatonic', 'Pentatónica menor': 'Minor pentatonic', 'Tonos enteros': 'Whole tone',
  'Cómo escucha': 'How it listens', 'Identidad musical': 'Musical identity', 'Pulso y forma': 'Pulse and form',
  'Voz principal': 'Lead voice', 'Acompañamiento principal': 'Main accompaniment', 'Campo armónico': 'Harmonic field',
  'Apariciones posibles': 'Possible entrances', 'Saludo': 'Greeting', 'Piano grabado': 'Recorded piano',
  'La señal no “compone” una canción: modifica decisiones acotadas dentro de este lenguaje musical.': 'The signal does not “compose” a song: it changes bounded choices within this musical language.',
  'MOOD EN ESCUCHA': 'CURRENT MOOD', 'PARTITURA DEL MOOD': 'MOOD SCORE',
  'QUÉ PUEDE CAMBIAR LA PLANTA': 'WHAT THE PLANT CAN CHANGE', 'TRANSFORMADAS EN VIVO': 'LIVE TRANSFORMATIONS',
  'Ventanas, ondas, peso en el ajuste y decisiones que llegan al motor musical.': 'Windows, waves, fit weights and decisions sent to the music engine.',
  'Reanudar información': 'Resume information', 'Pausar información': 'Pause information',
  'LECTURA PAUSADA · EL AUDIO SIGUE SU CURSO': 'READOUT PAUSED · AUDIO CONTINUES',
  'TU ARCHIVO': 'YOUR ARCHIVE', 'Escucha de nuevo.': 'Listen again.',
  'Tus grabaciones, guardadas en este teléfono. Reprodúcelas con cualquier mood o llévate su música en MP3.': 'Your recordings, saved on this phone. Play them with any mood or take their music with you as an MP3.',
  'Todavía no hay grabaciones': 'No recordings yet', 'Conecta tu dispositivo saviasound y pulsa Rec cuando llegue la señal de la planta.': 'Connect your saviasound device and press Rec when the plant’s signal arrives.',
  'paquetes': 'packets', 'Renombrar': 'Rename', 'Reproducir': 'Play',
  'Eliminar grabación': 'Delete recording', '¿Eliminar': 'Delete', 'Esta acción no se puede deshacer.': 'This cannot be undone.',
  'Cambiar nombre': 'Rename', 'Guardar': 'Save', 'EXPORTAR MP3': 'EXPORT MP3',
  'Elige el mood que sonará durante toda la grabación. El archivo se creará en este teléfono.': 'Choose the mood for the entire recording. The file will be created on this phone.',
  'Creando MP3…': 'Creating MP3…', 'Detén la sesión actual antes de exportar para dejar libre el motor de audio.': 'Stop the current session before exporting to free up the audio engine.',
  'Cancelar exportación': 'Cancel export', 'Crear y guardar': 'Create and save',
  'SEÑAL VIVA': 'LIVE SIGNAL', 'SEÑAL VIVA · AUTO': 'LIVE SIGNAL · AUTO', 'PINZA PARA AJUSTAR': 'PINCH TO ADJUST',
  'Señal de tu planta.': 'Your plant’s signal.', 'segundos visibles. Escala vertical automática.': 'seconds visible. Automatic vertical scale.',
  'Vídeo MP4 creado. Puedes guardarlo en Fotos o compartirlo.': 'MP4 video created. You can save it to Photos or share it.',
  'Vídeo guardado en Fotos.': 'Video saved to Photos.', 'Permite guardar el vídeo para continuar.': 'Allow video saving to continue.',
  'No se pudo guardar el vídeo.': 'Could not save the video.', 'No se pudo empezar a grabar.': 'Could not start recording.',
  'No se pudo guardar en Fotos.': 'Could not save to Photos.', 'No se pudo compartir el vídeo.': 'Could not share the video.',
  'Permitir cámara': 'Allow camera', 'CREANDO MP4…': 'CREATING MP4…', 'PREPARANDO…': 'PREPARING…',
  'Detener vídeo': 'Stop video', 'Grabar vídeo': 'Record video',
  'Conecta tu dispositivo saviasound y activa la música para grabar.': 'Connect your saviasound device and turn on the music to record.',
  'Guardar en Fotos': 'Save to Photos', 'Compartir MP4': 'Share MP4',
  'Junta o separa dos dedos para cambiar el tiempo visible': 'Pinch with two fingers to change the visible time',
  'compás de': 'meter of', 'tiempos. El tempo se mueve dentro de ese margen, sin perseguir cada cambio de la señal.': 'beats. Tempo stays within that range instead of following every change in the signal.',
  'La4 a': 'A4 at', 'Hz. El centro tonal lo decide la señal; la escala elegida define sus grados disponibles.': 'Hz. The signal chooses the tonal center; the selected scale defines its available notes.',
  'Entran solo cuando la forma musical deja espacio.': 'They enter only when the musical form leaves room.',
  'Un pico excepcional activa un golpe de bell tree. La toma varía suavemente con el tempo actual en todos los moods.': 'An exceptional peak triggers a bell tree hit. Its playback shifts gently with the current tempo in every mood.',
  'Salamander Grand Piano V3, grabaciones de Alexander Holm · licencia CC BY 3.0.': 'Salamander Grand Piano V3, recordings by Alexander Holm · CC BY 3.0 license.',
  'No se pudo reproducir.': 'Could not play the recording.', 'No se pudo crear el MP3.': 'Could not create the MP3.',
  'Grabación no válida.': 'Invalid recording.', 'La grabación está dañada.': 'The recording is damaged.',
  'Exportación cancelada.': 'Export cancelled.', 'Mood desconocido.': 'Unknown mood.',
  'La grabación es demasiado corta para crear música con este mood.': 'The recording is too short to make music with this mood.',
  'No se puede compartir el archivo en este dispositivo.': 'This device cannot share the file.',
  'Permite el acceso a Bluetooth para conectar tu dispositivo saviasound.': 'Allow Bluetooth access to connect your saviasound device.',
  'Conexión cancelada.': 'Connection cancelled.', 'Activa Bluetooth y vuelve a conectar.': 'Turn on Bluetooth and connect again.',
  'Permite Bluetooth en los ajustes del teléfono.': 'Allow Bluetooth in your phone settings.',
  'Activa Bluetooth para conectar tu dispositivo saviasound.': 'Turn on Bluetooth to connect your saviasound device.',
  'No se pudo buscar dispositivos Bluetooth.': 'Could not search for Bluetooth devices.',
  'No encuentro tu dispositivo saviasound. Comprueba que esté encendido, acércalo al teléfono e inténtalo otra vez.': 'I can’t find your saviasound device. Make sure it’s on, move it closer to your phone and try again.',
  'Ese sensor dejó de estar disponible. Vuelve a buscarlo.': 'That sensor is no longer available. Search for it again.',
  'El sensor no ofrece el servicio compatible con saviasound. Actualiza el firmware y vuelve a conectar.': 'The sensor does not provide a saviasound-compatible service. Update its firmware and reconnect.',
  'El sensor no ofrece el canal de datos compatible con saviasound. Actualiza el firmware y vuelve a conectar.': 'The sensor does not provide a saviasound-compatible data channel. Update its firmware and reconnect.',
  'No se pudo iniciar la sesión.': 'Could not start the session.',
  'Abre la app de saviasound en iOS o Android para conectar el sensor.': 'Open the saviasound app on iOS or Android to connect the sensor.',
  'Estás en Expo Go, que no incluye el audio ni Bluetooth de saviasound. Abre la app saviasound instalada; puedes hacerlo con npm run ios:open.': 'Expo Go does not include saviasound audio or Bluetooth. Open the installed saviasound app; you can use npm run ios:open.',
  'No se pudo conectar con el dispositivo saviasound.': 'Could not connect to the saviasound device.',
  'La conexión Bluetooth no está preparada.': 'The Bluetooth connection is not ready.',
  'Se ha perdido la conexión con el dispositivo saviasound. Acércalo y vuelve a conectar.': 'The connection to your saviasound device was lost. Move it closer and reconnect.',
  'No se pudo conectar con el dispositivo saviasound. Inténtalo otra vez.': 'Could not connect to the saviasound device. Try again.',
  'La grabación no contiene datos.': 'The recording contains no data.',
  'No se pudo preparar el audio de la grabación.': 'Could not prepare the recording audio.',
  'La música debe estar sonando para grabar el vídeo.': 'Music must be playing to record video.',
  'Dispositivo': 'Device',
  'Ahora mismo': 'Right now', 'Ondas del compás': 'Waves in this bar', 'Último análisis': 'Latest analysis',
  'No se han obtenido componentes útiles en esta ventana.': 'No useful components were found in this window.',
  'Base y melodía comparten armonía. Las duraciones incluyen la caída de las notas.': 'Base and melody share a harmony. Durations include note releases.',
  'Este panel muestra el plan enviado al audio; puede adelantarse a lo que oyes por la cola de reproducción. Los pesos describen el ajuste, no porcentajes de volumen ni actividad biológica.': 'This panel shows the plan sent to audio; it may be ahead of what you hear because of the playback queue. Weights describe the fit, not volume or biological activity.',
  'Conecta tu dispositivo saviasound para ver las ondas de la planta y las decisiones musicales.': 'Connect your saviasound device to see the plant’s waves and musical decisions.',
  'La salida está silenciada; el análisis y la composición siguen avanzando.': 'Output is muted; analysis and composition continue.',
  'Esperando datos recientes. Las voces se están retirando.': 'Waiting for recent data. Voices are fading out.',
  'La variación es muy pequeña: el mood está dejando espacio.': 'Variation is very small: the mood is leaving space.',
  'Introducción con la ventana real de 3 s. La de 8 s aún se está reuniendo.': 'Introduction uses the real 3 s window. The 8 s window is still being collected.',
  'La ventana de 8 s ya está lista; la armonía se incorporará en el siguiente límite de frase.': 'The 8 s window is ready; harmony will enter at the next phrase boundary.',
  'El piano desarrolla una pregunta y resolución de dos compases; la identidad se conserva durante la frase.': 'The piano develops a two-bar question and resolution; identity stays fixed through the phrase.',
  'Datos recién analizados. Se incorporan respetando el compás y la frase actuales.': 'Freshly analyzed data. They enter in time with the current bar and phrase.',
  'Fuentes reales de las notas del plan. Puede haber análisis anteriores: son el motivo y la armonía que se están desarrollando. Los conteos se solapan cuando varias ondas intervienen en una nota.': 'Real sources for the planned notes. Earlier analyses may appear because their motif and harmony are still developing. Counts overlap when several waves affect one note.',
  'acordes': 'chords', 'melodía': 'melody', 'respuesta': 'response', 'acompañamiento': 'accompaniment',
  'adornos': 'ornaments', 'bajo': 'bass', 'batería': 'drums', 'fondo': 'background',
  'análisis': 'analysis', 'Ajuste': 'Fit', 'objetivo': 'target', 'ondas': 'waves', 'Periodo medio': 'Mean period',
  'Onda': 'Wave', 'de peso': 'weight', 'Aporta': 'Adds', 'puntos al ajuste.': 'points to the fit.',
  'ciclos/s analizado · amplitud': 'analyzed cycles/s · amplitude', 'Campo ponderado disponible:': 'Weighted field available:',
  'ciclos por motivo · fase': 'cycles per motif · phase', 'Seguimiento aproximado:': 'Approximate tracking:',
  'del eje analizado.': 'of the analyzed axis.', 'Interviene en': 'Contributes to', 'ataques del plan.': 'planned attacks.',
  'Sin ataques asignados directamente en este compás.': 'No attacks directly assigned in this bar.',
  'Reuniendo la primera ventana:': 'Collecting the first window:', 'del sensor. Después completaremos la de 8 s.': 'from the sensor. The 8 s window follows.',
  'Frase': 'Phrase', 'Recorrido de esta frase:': 'This phrase’s route:', 'Fuente': 'Source',
  'Tempo objetivo:': 'Target tempo:', 'se aproxima cada dos compases.': 'approached every two bars.',
  'Media corta:': 'Short mean:', 'media de': 'mean over', 'Para el tempo:': 'For tempo:',
  'Referencia inicial:': 'Initial reference:', 'Desde el último ataque hasta el final:': 'From the last attack to the end:',
  'tiempos. Puede continuar una nota sostenida o su efecto.': 'beats. A sustained note or its effect may continue.',
  'Máximo previsto:': 'Planned maximum:', 'voces con altura simultáneas': 'simultaneous pitched voices',
  'duraciones ajustadas': 'adjusted durations', 'ataques retirados por espacio. Incluye caída de las notas, no reverberación.': 'attacks removed for space. Includes note releases, not reverb.',
  'Límite del mood:': 'Mood limit:', 'voces afinadas, una reservada para el saludo. Los efectos pueden seguir sonando.': 'pitched voices, one reserved for the greeting. Effects may keep sounding.',
  'Melodía:': 'Melody:', 'notas': 'notes', 'ataques entre todas las capas.': 'attacks across all layers.',
  'Base:': 'Base:', 'saludo:': 'greeting:', 'eventos detectados.': 'detected events.',
  'Instrumentos del tema:': 'Theme instruments:', 'Intensidad musical': 'Musical intensity',
  'Variación relativa medida': 'Measured relative variation', 'evolución musical': 'musical evolution',
  'El motivo viene del análisis': 'The motif comes from analysis', 'y la armonía del': 'and harmony from',
  'Versión del motivo:': 'Motif version:', 'cambio de señal:': 'signal change:', 'anchura espectral:': 'spectral width:',
  'Son escalas musicales, no indicadores biológicos.': 'These are musical scales, not biological indicators.',
  'Plan': 'Plan', 'último análisis': 'latest analysis', 'audio en cola': 'queued audio',
  'Psicodélico': 'Psychedelic', 'Lofi Ondas': 'Lofi Waves', 'Pregunta': 'Question', 'Resolución': 'Resolution',
  'Piano con motivo resuelto y dos voces de acompañamiento graves': 'Piano with a resolved motif and two low accompaniment voices',
  'Fondo suspendido y un motivo de teclas discreto que respira entre repeticiones.': 'A suspended background and a quiet keyboard motif that breathes between repetitions.',
  'Piano suave y colchón cálido de registro medio, con respiración y pausas entre frases.': 'Soft piano and a warm midrange bed, with breathing room and pauses between phrases.',
  'Tres conjuntos cálidos, groove estable y frases guiadas por la planta.': 'Three warm ensembles, a steady groove and phrases guided by the plant.',
  'Pedal modal, figuras de tres y cinco pasos y ecos que cambian de posición lentamente.': 'A modal pedal, three- and five-step figures and echoes that slowly change position.',
  'Vals de piano: melodía cantabile aguda, mano izquierda ligera y respuestas que respiran.': 'Piano waltz with a high cantabile melody, light left hand and breathing replies.',
  'Horizonte de acordes suspendidos, pulsos tenues y destellos que responden a la planta.': 'A horizon of suspended chords, soft pulses and glimmers that respond to the plant.',
  'Techno dub cálido con pulso firme, acordes sintéticos con eco y bajo sincopado.': 'Warm dub techno with a steady pulse, echoing synth chords and syncopated bass.',
  'Sesión de saxo tenor, piano y vibráfono con bajo caminante, swing y conversación improvisada.': 'Tenor sax, piano and vibraphone with walking bass, swing and improvised conversation.',
  'Strumstick cálido': 'Warm strumstick', 'Vibráfono suave': 'Soft vibraphone', 'Piano íntimo': 'Intimate piano',
  'Menor circular': 'Circular minor', 'Dórico suave': 'Soft Dorian', 'Mayor suspendido': 'Suspended major',
  'Roto suave': 'Soft broken', 'Abierto': 'Open',
  'Se esperaban diez valores numéricos.': 'Ten numeric values were expected.',
  'Paquete del sensor no válido': 'Invalid sensor packet',
  'El sintetizador ha producido audio no válido.': 'The synthesizer produced invalid audio.',
  'Falta el módulo de audio nativo en esta instalación. Recompila con npm run android o, en iOS, npx pod-install y npm run ios; recargar Metro no instala el módulo nativo.': 'The native audio module is missing from this installation. Rebuild with npm run android or, on iOS, npx pod-install and npm run ios; reloading Metro does not install the native module.',
  'La música de tu planta': 'Your plant’s music',
};

export function translate(source: string, current: Language): string {
  if (current !== 'en') return source;
  const policy = /^Motivo cada dos compases; identidad cada (\d+); armonía cada (\d+)\.$/.exec(source);
  if (policy) return `Motif every two bars; identity every ${policy[1]}; harmony every ${policy[2]}.`;
  const sensorError = /^No se pudieron recibir los datos del sensor: (.*)$/.exec(source);
  if (sensorError) return `Could not receive sensor data: ${sensorError[1]}`;
  return en[source] ?? source.replace(/^Dispositivo( \d+)$/, (_, number: string) => `Device${number}`);
}
// Used outside React (errors, notifications, exported filenames).
export function t(source: string): string { return translate(source, language); }
export function musicLabel(source: string, current: Language): string {
  if (current !== 'en') return source;
  const notes: Record<string, string> = { Do: 'C', 'Do♯': 'C♯', Re: 'D', 'Mi♭': 'E♭', Mi: 'E', Fa: 'F', 'Fa♯': 'F♯', Sol: 'G', 'La♭': 'A♭', La: 'A', 'Si♭': 'B♭', Si: 'B' };
  return source.replace(/^Centro /, 'Center ').split(' · ').map(part => notes[part] ?? translate(part, current)).join(' · ')
    .replace(/^Center (Do♯|Do|Re|Mi♭|Mi|Fa♯|Fa|Sol|La♭|La|Si♭|Si)$/, (_, note: string) => `Center ${notes[note]}`);
}
export const dateLocale = (current: Language) => current === 'en' ? 'en-US' : 'es-ES';
