import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/screen-header';
import { Icon } from '@/components/plant-icon';
import { colors } from '@/components/saviasound-theme';
import { setLanguage, useTranslation, type Language } from '@/lib/i18n';

export default function SettingsScreen() {
  const { language, t } = useTranslation();
  const options: { value: Language; label: string }[] = [
    { value: 'es', label: 'Español' }, { value: 'en', label: 'English' },
  ];
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <ScreenHeader title={t('Ajustes')} />
    <View style={styles.content}>
      <Text style={styles.heading}>{t('Idioma')}</Text>
      <Text style={styles.copy}>{t('Elige el idioma de la aplicación.')}</Text>
      {options.map(option => <Pressable key={option.value} accessibilityRole="radio"
        accessibilityState={{ checked: language === option.value }}
        onPress={() => setLanguage(option.value)} style={styles.row}>
        <Text style={styles.option}>{option.label}</Text>
        {language === option.value && <Icon name="check" size={18} color={colors.green} />}
      </Pressable>)}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 24, paddingTop: 36 },
  heading: { color: colors.ink, fontSize: 24 },
  copy: { color: colors.muted, fontSize: 13, marginTop: 9, marginBottom: 30 },
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line },
  option: { flex: 1, color: colors.ink, fontSize: 16 },
});
