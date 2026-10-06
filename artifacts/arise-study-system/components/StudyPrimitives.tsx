import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { arise } from '@/constants/colors';

export function ProgressBar({ value, color, track }: { value: number; color?: string; track?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.track, { backgroundColor: track ?? colors.muted }]}>
      <View style={[styles.fill, { width: `${Math.max(value > 0 ? 4 : 0, Math.min(100, value * 100))}%`, backgroundColor: color ?? colors.primary }]} />
    </View>
  );
}

export function ScreenHeader({ kicker, title, detail, icon }: { kicker: string; title: string; detail?: string; icon: keyof typeof Feather.glyphMap }) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={[styles.kicker, { color: arise.silver }]}>{kicker}</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {detail ? <Text style={[styles.detail, { color: colors.mutedForeground }]}>{detail}</Text> : null}
      </View>
      <View style={[styles.icon, { borderColor: arise.silver }]}>
        <Feather name={icon} size={20} color={arise.silver} />
      </View>
    </View>
  );
}

export function ActionButton({ label, onPress, icon = 'plus', disabled = false }: { label: string; onPress: () => void; icon?: keyof typeof Feather.glyphMap; disabled?: boolean }) {
  const colors = useColors();
  return (
    <Pressable
      testID={`action-${label.toLowerCase().replace(/\s+/g, '-')}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.action, { backgroundColor: disabled ? colors.muted : colors.primary, opacity: pressed ? 0.75 : 1 }]}
    >
      <Feather name={icon} size={14} color={disabled ? colors.mutedForeground : colors.primaryForeground} />
      <Text style={[styles.actionText, { color: disabled ? colors.mutedForeground : colors.primaryForeground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { height: 7, borderRadius: 1, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  headerCopy: { flex: 1, paddingRight: 16 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 5 },
  title: { fontSize: 29, fontFamily: 'Inter_700Bold', letterSpacing: -0.7 },
  detail: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  icon: { width: 44, height: 44, borderWidth: 1, borderRadius: 3, transform: [{ rotate: '-4deg' }], alignItems: 'center', justifyContent: 'center', backgroundColor: arise.panel },
  action: { minHeight: 46, borderRadius: 3, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.9, flexShrink: 1, textAlign: 'center' },
});