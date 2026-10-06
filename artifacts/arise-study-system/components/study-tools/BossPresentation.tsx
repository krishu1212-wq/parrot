import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Text, View } from 'react-native';
import { BossEmblem } from '@/components/AriseArt';

/** Presentation only: no storage mutations or reward callbacks. */
export default function BossPresentation({ result }: { result?: { correct: number; total: number } }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (live) setReduced(value); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { live = false; sub.remove(); };
  }, []);
  useEffect(() => {
    if (reduced) { opacity.setValue(1); return; }
    opacity.setValue(0.35);
    const animation = Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reduced, !!result, opacity]);
  return (
    <Animated.View style={{ opacity, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <BossEmblem size={60} color={result ? '#6FE0AC' : '#FF667E'} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: result ? '#6FE0AC' : '#FF667E', fontWeight: '800', letterSpacing: 1 }}>{result ? 'BOSS RESULT RECORDED' : 'WARDEN CHALLENGE READY'}</Text>
        <Text style={{ color: '#D2DBEA', fontSize: 13, lineHeight: 20, marginTop: 5 }}>{result ? `${result.correct}/${result.total} honestly self-marked. Revision is your next step.` : 'Recall saved questions before revealing. You decide whether your answer matches.'}</Text>
      </View>
    </Animated.View>
  );
}