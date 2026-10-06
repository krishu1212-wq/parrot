import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Quest } from '@/contexts/StudyContext';
import { questIdentity } from './homeTheme';

export function QuestConsoleCard({ quest, onToggle, onFocus, onOpen, openLabel }: {
  quest: Quest; onToggle: () => void; onFocus?: () => void; onOpen: () => void; openLabel: string;
}) {
  const id = questIdentity(quest);
  const done = quest.completed;
  const c = done ? '#6DF0B4' : id.color;
  return (
    <View style={[s.wrap, { borderColor: c, backgroundColor: done ? 'rgba(10,40,34,0.7)' : 'rgba(8,16,32,0.92)' }]}>
      <View style={[s.spine, { backgroundColor: c }]} />
      <View style={[s.glow, { backgroundColor: id.glow }]} pointerEvents="none" />
      <Pressable testID={`quest-${quest.id}`} onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: done }} style={({ pressed }) => [s.main, { opacity: pressed ? 0.82 : 1 }]}>
        <View style={[s.hex, { borderColor: c }]}>
          <Feather name={done ? 'check' : id.icon} size={20} color={c} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.meta}>
            <Text style={[s.cat, { color: c }]} numberOfLines={1}>{quest.category.toUpperCase()}</Text>
            <Text style={s.tier}>{id.tier}</Text>
          </View>
          <Text style={[s.title, done && { textDecorationLine: 'line-through', color: '#8EA6C5' }]}>{quest.title}</Text>
          <Text style={s.sub}>{quest.subtitle}</Text>
          <View style={s.foot}>
            <View style={s.bar}><View style={[s.barFill, { width: done ? '100%' : '0%', backgroundColor: c }]} /></View>
            <Text style={[s.status, { color: c }]}>{done ? 'CLEARED' : quest.isRecovery ? 'RECOVERY' : 'PENDING'}</Text>
          </View>
        </View>
        <View style={s.xpBox}>
          <Text style={[s.xp, { color: c }]}>+{quest.xp}</Text>
          <Text style={s.xpLab}>XP</Text>
          <Text style={s.reward}>REWARD</Text>
        </View>
      </Pressable>
      {!done ? (
        <View style={s.actions}>
          {onFocus ? (
            <Pressable testID={`focus-${quest.id}`} accessibilityRole="button" accessibilityLabel={`Begin focus mission: ${quest.title}`} onPress={onFocus} style={({ pressed }) => [s.btn, { borderColor: c, opacity: pressed ? 0.75 : 1 }]}>
              <Feather name="crosshair" size={14} color={c} />
              <Text style={[s.btnText, { color: c }]}>BEGIN FOCUS MISSION</Text>
            </Pressable>
          ) : null}
          <Pressable testID={`open-${quest.id}`} accessibilityRole="link" accessibilityLabel={openLabel} onPress={onOpen} style={({ pressed }) => [s.btn, { flex: 0, paddingHorizontal: 14, borderColor: '#2A4A70', opacity: pressed ? 0.75 : 1 }]}>
            <Feather name="arrow-right" size={14} color="#9DB3D0" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderWidth: 1, borderLeftWidth: 0, marginBottom: 10, overflow: 'hidden', paddingLeft: 5 },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  glow: { position: 'absolute', right: -40, top: -40, width: 120, height: 120, borderRadius: 60 },
  main: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12 },
  hex: { width: 44, height: 44, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }], borderRadius: 8 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cat: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, flexShrink: 1 },
  tier: { color: '#E4C27A', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#F2F6FF', fontSize: 15, fontWeight: '700', marginTop: 2 },
  sub: { color: '#8EA6C5', fontSize: 13, lineHeight: 15, marginTop: 1 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
  bar: { flex: 1, height: 4, backgroundColor: '#16304D' },
  barFill: { height: 4 },
  status: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  xpBox: { alignItems: 'center', minWidth: 52 },
  xp: { fontSize: 20, fontWeight: '700' },
  xpLab: { color: '#9DB3D0', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  reward: { color: '#5E7595', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  btn: { flex: 1, minHeight: 44, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
});
