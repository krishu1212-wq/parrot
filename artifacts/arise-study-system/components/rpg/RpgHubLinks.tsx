import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { arise } from '@/constants/colors';
import { goTo } from './RpgBits';

const LINKS = [
  { id: 'gates', label: 'GATES', icon: 'zap' as const, color: arise.cyan },
  { id: 'inventory', label: 'INVENTORY', icon: 'package' as const, color: arise.gold },
  { id: 'loadout', label: 'LOADOUT', icon: 'shield' as const, color: arise.violet },
];

export function RpgHubLinks() {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {LINKS.map((l) => (
        <Pressable key={l.id} testID={`rpg-hub-${l.id}`} accessibilityRole="link" accessibilityLabel={l.label} onPress={() => goTo(`/${l.id}`)}
          style={({ pressed }) => ({ flex: 1, minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: `${l.color}66`, backgroundColor: `${l.color}12`, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.75 : 1 })}>
          <Feather name={l.icon} size={18} color={l.color} />
          <Text style={{ color: l.color, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }}>{l.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
export default RpgHubLinks;
