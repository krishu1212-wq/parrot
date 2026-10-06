import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { arise } from '@/constants/colors';
import { useStudy } from '@/contexts/StudyContext';

export function RpgErrorBanner() {
  const { rpgError, clearRpgError } = useStudy();
  if (!rpgError) return null;
  return (
    <View accessibilityRole="alert" style={b.err}>
      <Feather name="alert-triangle" size={16} color={arise.danger} />
      <Text style={b.errText}>{rpgError}</Text>
      <Pressable testID="rpg-error-dismiss" accessibilityRole="button" accessibilityLabel="Dismiss error" onPress={clearRpgError} style={b.errBtn}>
        <Feather name="x" size={18} color={arise.ink} />
      </Pressable>
    </View>
  );
}

export function Chip({ label, active, onPress, testID, color = arise.cyan }: { label: string; active: boolean; onPress: () => void; testID?: string; color?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
      style={[b.chip, { borderColor: active ? color : arise.panelEdge, backgroundColor: active ? `${color}22` : 'transparent' }]}>
      <Text style={[b.chipText, { color: active ? color : arise.inkSoft }]}>{label}</Text>
    </Pressable>
  );
}

export function HudButton({ label, onPress, testID, color = arise.cyan, disabled, icon, solid }: { label: string; onPress: () => void; testID?: string; color?: string; disabled?: boolean; icon?: keyof typeof Feather.glyphMap; solid?: boolean }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [b.btn, { borderColor: disabled ? arise.rail : color, backgroundColor: solid && !disabled ? color : `${color}14`, opacity: disabled ? 0.55 : pressed ? 0.8 : 1 }]}>
      {icon ? <Feather name={icon} size={15} color={solid && !disabled ? arise.onCyan : disabled ? arise.inkDim : color} /> : null}
      <Text style={[b.btnText, { color: solid && !disabled ? arise.onCyan : disabled ? arise.inkDim : color }]}>{label}</Text>
    </Pressable>
  );
}

export const goTo = (path: string) => router.push(path as never);

export const b = StyleSheet.create({
  err: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: arise.danger, backgroundColor: 'rgba(255,111,145,0.1)', borderRadius: 14, padding: 10, marginBottom: 12 },
  errText: { flex: 1, color: arise.ink, fontSize: 12, lineHeight: 17 },
  errBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  btn: { minHeight: 46, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
});
