// Design "시안 A · 포털형": flat white UI, 1px lines, Pretendard everywhere.
import type { ReactNode } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text as RNText, TextInput, ToastAndroid, View,
  type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

export const C = {
  brand: '#1a5fd6',   // accent
  green: '#0b7a3e',   // working
  orange: '#c2410c',  // clock-out
  purple: '#6b4fd8',  // break
  amber: '#b45309',   // estimate badge
  danger: '#d93025',  // red badge / errors
  text: '#1d2129',
  sub: '#5c6370',
  line: '#e5e8ec',
  line2: '#f0f2f5',
  border: '#c9ced6',  // inputs, outlined buttons
  tint: '#eef3fc',    // unread / selected background
  bg: '#ffffff',
  card: '#ffffff',
};

// ---- Pretendard: Android does not synthesize weights for custom fonts, so each weight is its own family.
export const FONTS = {
  'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
  'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.otf'),
  'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
  'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
  'Pretendard-ExtraBold': require('../assets/fonts/Pretendard-ExtraBold.otf'),
  'Pretendard-Black': require('../assets/fonts/Pretendard-Black.otf'),
};
const BY_WEIGHT: Record<number, keyof typeof FONTS> = {
  100: 'Pretendard-Regular', 200: 'Pretendard-Regular', 300: 'Pretendard-Regular', 400: 'Pretendard-Regular',
  500: 'Pretendard-Medium', 600: 'Pretendard-SemiBold', 700: 'Pretendard-Bold', 800: 'Pretendard-ExtraBold',
  900: 'Pretendard-Black',
};
/** font(700) -> 'Pretendard-Bold'. Accepts RN fontWeight values ('bold', '600', 600 ...). */
export function font(weight: TextStyle['fontWeight'] = 400): string {
  const w = weight === 'bold' ? 700 : weight === 'normal' || weight == null ? 400 : Number(weight) || 400;
  return BY_WEIGHT[Math.round(w / 100) * 100] ?? 'Pretendard-Regular';
}

/**
 * Drop-in <Text>: turns any `fontWeight` into the matching Pretendard family (and removes the
 * weight so iOS does not fake-bold it), defaulting to Pretendard-Regular and the body color.
 * Use this instead of react-native's Text everywhere.
 */
export function Text({ style, ...props }: TextProps) {
  const { fontWeight, ...rest } = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  return <RNText {...props} style={[{ color: C.text }, rest, { fontFamily: rest.fontFamily ?? font(fontWeight) }]} />;
}

export function toast(msg: string) {
  if (!msg) return;
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.LONG);
  else Alert.alert('', msg);
}

// ---- stroke icons (from the mockup)
export type IconName = 'home' | 'calendar' | 'wallet' | 'chat' | 'menu' | 'bell' | 'doc' | 'image' | 'chevron';
export function Icon({ name, size = 22, color = C.text, width = 1.8 }: { name: IconName; size?: number; color?: string; width?: number }) {
  const p = { stroke: color, strokeWidth: width, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && <Path {...p} d="M3 11l9-7 9 7v9H3z" />}
      {name === 'calendar' && <><Rect {...p} x={3} y={5} width={18} height={16} rx={2} /><Path {...p} d="M3 10h18M8 3v4M16 3v4" /></>}
      {name === 'wallet' && <><Rect {...p} x={3} y={6} width={18} height={13} rx={2} /><Path {...p} d="M3 10h18" /></>}
      {name === 'chat' && <Path {...p} d="M4 5h16v11H9l-5 4z" />}
      {name === 'menu' && <Path {...p} d="M4 7h16M4 12h16M4 17h16" />}
      {name === 'bell' && <><Path {...p} d="M6 9a6 6 0 1112 0c0 6 2 7 2 7H4s2-1 2-7" /><Path {...p} d="M10 20a2 2 0 004 0" /></>}
      {name === 'doc' && <><Path {...p} d="M6 3h8l4 4v14H6z" /><Path {...p} d="M14 3v4h4M9 12h6M9 16h6" /></>}
      {name === 'image' && <><Rect {...p} x={3} y={5} width={18} height={14} rx={2} /><Path {...p} d="M3 16l5-5 4 4 3-3 6 6" /></>}
      {name === 'chevron' && <Path {...p} d="M9 6l6 6-6 6" />}
    </Svg>
  );
}

export function Badge({ n, style }: { n: number; style?: ViewStyle }) {
  if (!n) return null;
  return (
    <View style={[{ minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.danger, alignItems: 'center',
      justifyContent: 'center', paddingHorizontal: 4 }, style]}>
      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{n > 99 ? '99+' : n}</Text>
    </View>
  );
}

/** Small square label, e.g. "예상", "새로 도착", message kinds. */
export function Tag({ label, color = C.sub, solid }: { label: string; color?: string; solid?: boolean }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', color: solid ? '#fff' : color, backgroundColor: solid ? color : '#fff',
      borderWidth: 1, borderColor: color, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' }}>
      {label}
    </Text>
  );
}

export function Button({ title, onPress, color = C.brand, outline, textColor, big, busy, disabled, style }: {
  title: string; onPress(): void; color?: string; outline?: boolean; textColor?: string; big?: boolean;
  busy?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const off = disabled || busy;
  const fg = textColor ?? (outline ? C.text : '#fff');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        s.btn, big && { height: 52 },
        outline ? { borderColor: C.border, borderWidth: 1, backgroundColor: '#fff' } : { backgroundColor: color },
        (pressed || off) && { opacity: 0.6 }, style,
      ]}>
      {busy ? <ActivityIndicator color={fg} />
        : <Text style={{ color: fg, fontSize: 16, fontWeight: '700' }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor="#9aa1ab" autoCapitalize="none" autoCorrect={false} {...props}
        style={[s.input, props.style, { fontFamily: font(400) }]} />
    </View>
  );
}

export function Card({ title, children, style }: { title?: string; children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[s.card, style]}>
      {title ? <Text style={s.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

/** Portal-style section header: 15px ExtraBold title, 2px dark rule, small grey link on the right. */
export function Section({ title, sub, link, onLink, children, style }: {
  title: string; sub?: string; link?: string; onLink?(): void; children?: ReactNode; style?: ViewStyle;
}) {
  return (
    <View style={[{ marginBottom: 20 }, style]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
        borderBottomWidth: 2, borderBottomColor: C.text, paddingBottom: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: '800' }}>
          {title}{sub ? <Text style={{ fontSize: 12, fontWeight: '500', color: C.sub }}> {sub}</Text> : null}
        </Text>
        {link && onLink ? (
          <Pressable onPress={onLink} hitSlop={12}><Text style={{ fontSize: 12, color: C.sub }}>{link} ›</Text></Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function Row({ left, right, strong, color }: { left: string; right: string; strong?: boolean; color?: string }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowL, strong && s.strong]}>{left}</Text>
      <Text style={[s.rowR, strong && s.strong, color ? { color } : null]}>{right}</Text>
    </View>
  );
}

/** Tappable list row for menus (더보기). */
export function MenuRow({ label, value, onPress, right, danger }: {
  label: string; value?: string; onPress?(): void; right?: ReactNode; danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 2,
        borderBottomWidth: 1, borderBottomColor: C.line2, gap: 8 }, pressed && { backgroundColor: C.line2 }]}>
      <Text style={{ flex: 1, fontSize: 15, color: danger ? C.danger : C.text, fontWeight: '500' }}>{label}</Text>
      {value ? <Text style={{ fontSize: 13, color: C.sub, flexShrink: 1 }} numberOfLines={1}>{value}</Text> : null}
      {right !== undefined ? right : onPress ? <Icon name="chevron" size={16} color={C.sub} /> : null}
    </Pressable>
  );
}

export function LangSwitch({ lang, onChange }: { lang: 'ko' | 'en'; onChange(l: 'ko' | 'en'): void }) {
  return (
    <View style={s.seg}>
      {(['ko', 'en'] as const).map((l) => (
        <Pressable key={l} onPress={() => onChange(l)} style={[s.segItem, lang === l && s.segOn]} hitSlop={6}>
          <Text style={[s.segText, lang === l && { color: '#fff' }]}>{l === 'ko' ? '한국어' : 'English'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Chip used for pickers (month, message kind, reminder minutes). */
export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress(): void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 4,
      borderWidth: 1, borderColor: on ? C.brand : C.border, backgroundColor: on ? C.brand : '#fff' }}>
      <Text style={{ color: on ? '#fff' : C.text, fontSize: 14, fontWeight: on ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40 },
  btn: { height: 48, borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  label: { fontSize: 13, color: C.sub, marginBottom: 6, fontWeight: '600' },
  input: {
    height: 48, borderRadius: 4, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff',
    paddingHorizontal: 12, fontSize: 16, color: C.text,
  },
  card: { backgroundColor: C.card, borderRadius: 6, borderWidth: 1, borderColor: C.line, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 2, gap: 12,
    borderBottomWidth: 1, borderBottomColor: C.line2 },
  rowL: { fontSize: 14, color: C.text },
  rowR: { fontSize: 14, color: C.text, flexShrink: 1, textAlign: 'right' },
  strong: { fontWeight: '700' },
  link: { color: C.brand, fontSize: 14, fontWeight: '600', padding: 10, textAlign: 'center' },
  small: { fontSize: 13, color: C.sub },
  seg: { flexDirection: 'row', borderRadius: 4, borderWidth: 1, borderColor: C.border, overflow: 'hidden', alignSelf: 'flex-start' },
  segItem: { paddingVertical: 7, paddingHorizontal: 12 },
  segOn: { backgroundColor: C.brand },
  segText: { color: C.text, fontSize: 14, fontWeight: '600' },
});
