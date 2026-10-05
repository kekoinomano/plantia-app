import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/plant-icon';
import { colors, moodPalette } from '@/components/saviasound-theme';
import { deleteRecording, listRecordings, renameRecording, type SavedRecording } from '@/lib/recordings';
import { plantSession, usePlantControls } from '@/lib/plant-session';
import { exportRecordingMp3, shareMp3 } from '@/lib/recording-export';
import { PROFILES, type ProfileId } from '@/lib/sonora/focus';

const duration = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export default function RecordingsScreen() {
  const router = useRouter();
  const state = usePlantControls();
  const [items, setItems] = useState<SavedRecording[]>(() => listRecordings());
  const [rename, setRename] = useState<SavedRecording | null>(null);
  const [name, setName] = useState('');
  const [exportItem, setExportItem] = useState<SavedRecording | null>(null);
  const [selectedMood, setSelectedMood] = useState<ProfileId>(state.config.profile);
  const [progress, setProgress] = useState<number | null>(null);
  const exportController = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => setItems(listRecordings());

  const play = async (item: SavedRecording) => {
    try {
      if (state.connection === 'connected') await plantSession.disconnect();
      await plantSession.startReplay(item.id);
      router.back();
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'No se pudo reproducir.'); }
  };
  const remove = (item: SavedRecording) => Alert.alert('Eliminar grabación', `¿Eliminar «${item.name}»? Esta acción no se puede deshacer.`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: () => {
      if (state.replay?.id === item.id) plantSession.stopReplay();
      deleteRecording(item.id); refresh();
    } },
  ]);
  const exportMp3 = async () => {
    if (!exportItem || progress !== null) return;
    try {
      setError(null); setProgress(0);
      const controller = new AbortController();
      exportController.current = controller;
      await plantSession.waitForAudioIdle();
      const uri = await exportRecordingMp3(exportItem.id, plantSession.configurationForProfile(selectedMood), setProgress, controller.signal);
      setProgress(null); setExportItem(null);
      await shareMp3(uri);
    } catch (problem) {
      setProgress(null);
      if (exportController.current?.signal.aborted) setExportItem(null);
      else setError(problem instanceof Error ? problem.message : 'No se pudo crear el MP3.');
    } finally { exportController.current = null; }
  };

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
        <Icon name="back" size={20} />
      </Pressable>
      <Text style={styles.headerTitle}>Grabaciones</Text>
      <View style={{ width: 42 }} />
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>TU ARCHIVO</Text>
      <Text style={styles.title}>Escucha de nuevo.</Text>
      <Text style={styles.intro}>Tus plantas, guardadas en este teléfono. Reprodúcelas con cualquier mood o llévate su música en MP3.</Text>
      {error && <Pressable onPress={() => setError(null)} style={styles.error}><Text style={styles.errorText}>{error}</Text><Icon name="close" size={15} color={colors.amber} /></Pressable>}
      {!items.length && <View style={styles.empty}><Icon name="wave" size={28} color={colors.muted} />
        <Text style={styles.emptyTitle}>Todavía no hay grabaciones</Text>
        <Text style={styles.emptyCopy}>Conecta la planta y pulsa Rec cuando llegue su señal.</Text>
      </View>}
      {items.map(item => <View key={item.id} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}><Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.meta}>{new Date(item.startedAt).toLocaleDateString('es-ES')} · {duration(item.durationMs)} · {item.packets} paquetes</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Renombrar ${item.name}`}
            onPress={() => { setRename(item); setName(item.name); }} style={styles.smallButton}><Icon name="edit" size={17} /></Pressable>
        </View>
        <View style={styles.cardActions}>
          <Pressable onPress={() => void play(item)} style={styles.playButton} accessibilityRole="button">
            <Icon name="play" size={16} color={colors.paper} /><Text style={styles.playText}>Reproducir</Text>
          </Pressable>
          <Pressable onPress={() => { setSelectedMood(state.config.profile); setExportItem(item); }} style={styles.exportButton} accessibilityRole="button">
            <Icon name="download" size={16} /><Text style={styles.exportText}>MP3</Text>
          </Pressable>
          <Pressable onPress={() => remove(item)} accessibilityRole="button" accessibilityLabel={`Eliminar ${item.name}`} style={styles.smallButton}>
            <Icon name="trash" size={17} color={colors.muted} />
          </Pressable>
        </View>
      </View>)}
    </ScrollView>
    <Modal visible={rename !== null} transparent animationType="fade" onRequestClose={() => setRename(null)}>
      <View style={styles.backdrop}><View style={styles.dialog}>
        <Text style={styles.dialogTitle}>Cambiar nombre</Text>
        <TextInput value={name} onChangeText={setName} maxLength={70} style={styles.input} accessibilityLabel="Nombre de la grabación" />
        <View style={styles.dialogActions}>
          <Pressable onPress={() => setRename(null)}><Text style={styles.cancel}>Cancelar</Text></Pressable>
          <Pressable onPress={() => { if (rename && name.trim()) { renameRecording(rename.id, name); refresh(); setRename(null); } }} style={styles.confirm}>
            <Text style={styles.confirmText}>Guardar</Text>
          </Pressable>
        </View>
      </View></View>
    </Modal>
    <Modal visible={exportItem !== null} transparent animationType="slide" onRequestClose={() => { if (progress === null) setExportItem(null); }}>
      <View style={styles.sheetBackdrop}><View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.kicker}>EXPORTAR MP3</Text>
        <Text style={styles.dialogTitle}>{exportItem?.name}</Text>
        <Text style={styles.sheetCopy}>Elige el mood que sonará durante toda la grabación. El archivo se creará en este teléfono.</Text>
        <ScrollView style={styles.moods} contentContainerStyle={{ gap: 9 }}>
          {PROFILES.map(mood => <Pressable key={mood.id} onPress={() => setSelectedMood(mood.id)}
            accessibilityRole="radio" accessibilityState={{ checked: selectedMood === mood.id }}
            style={[styles.moodOption, selectedMood === mood.id && { borderColor: moodPalette(mood.id).accent, backgroundColor: moodPalette(mood.id).wash }]}>
            <View style={[styles.moodDot, { backgroundColor: moodPalette(mood.id).accent }]} />
            <Text style={styles.moodName}>{mood.name}</Text>{selectedMood === mood.id && <Icon name="check" size={17} />}
          </Pressable>)}
        </ScrollView>
        {progress !== null && <Text style={styles.progress}>Creando MP3… {Math.round(progress * 100)} %</Text>}
        {(state.connection !== 'idle' || !!state.replay) && <Text style={styles.warning}>Detén la sesión actual antes de exportar para dejar libre el motor de audio.</Text>}
        <View style={styles.dialogActions}>
          <Pressable onPress={() => progress !== null ? exportController.current?.abort() : setExportItem(null)}>
            <Text style={styles.cancel}>{progress !== null ? 'Cancelar exportación' : 'Cancelar'}</Text>
          </Pressable>
          <Pressable disabled={progress !== null || state.connection !== 'idle' || !!state.replay} onPress={() => void exportMp3()}
            style={[styles.confirm, (progress !== null || state.connection !== 'idle' || !!state.replay) && { opacity: .4 }]}>
            <Text style={styles.confirmText}>Crear y guardar</Text>
          </Pressable>
        </View>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { height: 60, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.ink, fontSize: 14 },
  content: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 60, gap: 14 },
  kicker: { color: colors.muted, fontSize: 9, letterSpacing: 2 },
  title: { color: colors.ink, fontSize: 33, letterSpacing: -.8 },
  intro: { color: colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 14 },
  empty: { marginTop: 60, alignItems: 'center', gap: 14 },
  emptyTitle: { color: colors.ink, fontSize: 18 }, emptyCopy: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  card: { backgroundColor: colors.paper, borderRadius: 24, padding: 18, gap: 19 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardName: { color: colors.ink, fontSize: 18 }, meta: { color: colors.muted, fontSize: 10, marginTop: 7 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 17, backgroundColor: colors.forest, paddingHorizontal: 14, height: 38 },
  playText: { color: colors.paper, fontSize: 11 },
  exportButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 17, backgroundColor: colors.soft, paddingHorizontal: 14, height: 38 },
  exportText: { color: colors.ink, fontSize: 11 },
  smallButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  error: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.soft },
  errorText: { flex: 1, color: colors.amber, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,28,17,.35)', justifyContent: 'center', padding: 28 },
  dialog: { backgroundColor: colors.paper, borderRadius: 24, padding: 24, gap: 20 },
  dialogTitle: { color: colors.ink, fontSize: 23 },
  input: { color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.green, paddingVertical: 10, fontSize: 16 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 22, marginTop: 10 },
  cancel: { color: colors.muted, fontSize: 13 },
  confirm: { backgroundColor: colors.forest, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 22 },
  confirmText: { color: colors.paper, fontSize: 12 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(20,28,17,.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.paper, maxHeight: '85%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 34, gap: 14 },
  handle: { width: 34, height: 3, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 8 },
  sheetCopy: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  moods: { flexGrow: 0, maxHeight: 330 },
  moodOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 15, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line },
  moodDot: { width: 8, height: 8, borderRadius: 4 }, moodName: { color: colors.ink, fontSize: 13, flex: 1 },
  progress: { color: colors.green, fontSize: 12 }, warning: { color: colors.amber, fontSize: 11, lineHeight: 17 },
});
