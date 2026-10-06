import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function ToolPanel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  const colors = useColors();
  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function ToolHeading({ kicker, title, detail }: { kicker: string; title: string; detail?: string }) {
  const colors = useColors();
  return (
    <View style={styles.heading}>
      <Text style={[styles.kicker, { color: colors.primary }]}>{kicker}</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {detail ? <Text style={[styles.detail, { color: colors.mutedForeground }]}>{detail}</Text> : null}
    </View>
  );
}

export function ToolButton({
  label,
  onPress,
  icon,
  disabled = false,
  secondary = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  disabled?: boolean;
  secondary?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const backgroundColor = disabled
    ? colors.muted
    : secondary ? colors.secondary : colors.primary;
  const foregroundColor = disabled
    ? colors.mutedForeground
    : secondary ? colors.secondaryForeground : colors.primaryForeground;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, borderColor: secondary ? colors.border : backgroundColor, opacity: pressed ? 0.78 : 1 },
      ]}
    >
      {icon ? <Feather name={icon} size={15} color={foregroundColor} /> : null}
      <Text style={[styles.buttonText, { color: foregroundColor }]}>{label}</Text>
    </Pressable>
  );
}

export function ToolNotice({
  title,
  message,
  icon = 'info',
  accent,
}: {
  title: string;
  message: string;
  icon?: keyof typeof Feather.glyphMap;
  accent?: string;
}) {
  const colors = useColors();
  const tone = accent ?? colors.accent;
  return (
    <View style={[styles.notice, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <Feather name={icon} size={17} color={tone} />
      <View style={styles.noticeCopy}>
        <Text style={[styles.noticeTitle, { color: tone }]}>{title}</Text>
        <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>{message}</Text>
      </View>
    </View>
  );
}

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getWeekday(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12).getDay();
}

export function daysBetweenLocalDates(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [toYear, toMonth, toDay] = to.split('-').map(Number);
  const fromUtc = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const toUtc = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  heading: { marginBottom: 15 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginBottom: 5 },
  title: { fontSize: 21, fontWeight: '700', letterSpacing: 0.1 },
  detail: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  button: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textAlign: 'center' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 13, padding: 13, marginBottom: 12 },
  noticeCopy: { flex: 1, marginLeft: 10 },
  noticeTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  noticeText: { fontSize: 12, lineHeight: 17 },
});