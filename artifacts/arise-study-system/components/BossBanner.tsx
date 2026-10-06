import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { arise } from '@/constants/colors';
import { ParticleField } from '@/components/AriseArt';
import { useReducedMotionPreference } from '@/components/SystemAnimations';

export const BOSS_DEFEAT_THRESHOLD = 0.7;

/** Original boss visual. Defeat = recorded official test with >= 70% self-marked correct. No XP is granted here. */
export default function BossBanner({
  level, answered, total, weakness, result,
}: {
  level: number;
  answered: number;
  total: number;
  weakness: string | null;
  result: { correct: number; total: number } | null;
}) {
  const reduced = useReducedMotionPreference();
  const defeated = !!result && result.total > 0 && result.correct / result.total >= BOSS_DEFEAT_THRESHOLD;
  const hp = result ? (defeated ? 0 : 1 - result.correct / Math.max(1, result.total)) : total > 0 ? 1 - answered / total : 1;
  const status = result ? (defeated ? 'DEFEATED' : 'SURVIVED') : total === 0 ? 'DORMANT' : 'ACTIVE THREAT';
  const tone = defeated ? arise.success : result ? arise.danger : arise.violet;
  return (
    <View style={s.wrap} testID="boss-banner">
      <Image source={require('@/assets/images/arise-warden.webp')} style={s.art} contentFit="cover" />
      <LinearGradient colors={['rgba(4,10,21,0.1)', 'rgba(4,10,21,0.95)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <ParticleField reducedMotion={reduced} />
      <View style={s.body}>
        <View style={s.row}>
          <Text style={[s.kicker, { color: tone }]}>WEEKLY BOSS · {status}</Text>
          <Text style={s.lv}>LV. {String(level).padStart(2, '0')}</Text>
        </View>
        <Text style={s.name}>THE CALCULATION WARDEN</Text>
        <Text style={s.meta}>Weakness: {weakness ?? 'Unknown (not enough recorded results)'}</Text>
        <Text style={s.meta}>{total > 0 ? `${total} saved cards this week · difficulty scales with your saved set` : 'No cards saved this week'}</Text>
        <View style={s.track}><View style={[s.fill, { width: `${Math.max(2, hp * 100)}%`, backgroundColor: tone }]} /></View>
        <Text style={s.hint}>{result ? `${result.correct}/${result.total} recalled` : `${answered}/${total} answered`} · Defeat needs 70% recalled. No bonus XP.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(184,150,255,0.35)', minHeight: 250, justifyContent: 'flex-end', marginBottom: 14, backgroundColor: arise.abyss },
  art: { ...StyleSheet.absoluteFill },
  body: { padding: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  lv: { color: arise.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  name: { color: arise.ink, fontSize: 21, fontWeight: '800', letterSpacing: 0.8, marginTop: 4, marginBottom: 4 },
  meta: { color: arise.inkSoft, fontSize: 14, lineHeight: 20 },
  track: { height: 7, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 10, overflow: 'hidden' },
  fill: { height: 7, borderRadius: 6 },
  hint: { color: arise.inkDim, fontSize: 10, marginTop: 6 },
});
