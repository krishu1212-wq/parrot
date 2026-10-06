import { Text, View, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { arise } from '@/constants/colors';

export function SectionHead({ label, accent = arise.cyan, right }: { label: string; accent?: string; right?: string }) {
  return (
    <View style={h.row}>
      <View style={[h.diamond, { backgroundColor: accent }]} />
      <Text style={[h.label, { color: accent }]}>{label}</Text>
      <View style={[h.rule, { backgroundColor: accent }]} />
      {right ? <Text style={h.right}>{right}</Text> : null}
    </View>
  );
}

export function SegBar({ value, accent, segments = 20 }: { value: number; accent: string; segments?: number }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const on = Math.round(v * segments);
  return (
    <View style={h.seg} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      {Array.from({ length: segments }, (_, i) => (
        <View key={i} style={[h.cell, { backgroundColor: i < on ? accent : 'rgba(255,255,255,0.08)' }]} />
      ))}
    </View>
  );
}

export function Stat({ label, value, accent = arise.ink, style }: { label: string; value: string; accent?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[h.stat, { borderColor: accent + '55' }, style]}>
      <Text style={h.statK}>{label}</Text>
      <Text style={[h.statV, { color: accent }]}>{value}</Text>
    </View>
  );
}

const h = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 10 },
  diamond: { width: 8, height: 8, transform: [{ rotate: '45deg' }] },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 1.2 },
  rule: { flex: 1, height: 1, opacity: 0.35 },
  right: { color: arise.inkSoft, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  seg: { flexDirection: 'row', gap: 2, marginTop: 5 },
  cell: { flex: 1, height: 7, transform: [{ skewX: '-20deg' }] },
  stat: { flex: 1, minWidth: '45%', borderLeftWidth: 2, paddingLeft: 10, paddingVertical: 4 },
  statK: { color: arise.inkSoft, fontSize: 13, lineHeight: 20, fontWeight: '600', letterSpacing: 0.5 },
  statV: { fontSize: 20, fontWeight: '700', marginTop: 2 },
});
