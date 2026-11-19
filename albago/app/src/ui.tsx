import type { ReactNode } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, ToastAndroid, View,
  type TextInputProps, type ViewStyle,
} from 'react-native';

export const C = {
  brand: '#2b5ce6',
  green: '#14966b',
  orange: '#d4570f',
  amber: '#b7791f',
  bg: '#f4f6fb',
  card: '#ffffff',
  text: '#1a1f36',
  sub: '#5b6478',
  line: '#e3e7f0',
  danger: '#c62828',
};

export function toast(msg: string) {
  if (!msg) return;
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.LONG);
  else Alert.alert('', msg);
}

export function Button({ title, onPress, color = C.brand, outline, big, busy, disabled, style }: {
  title: string; onPress(): void; color?: string; outline?: boolean; big?: boolean;
  busy?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        s.btn, big && s.btnBig,
        outline ? { borderColor: color, borderWidth: 1.5, backgroundColor: '#fff' } : { backgroundColor: color },
        (pressed || off) && { opacity: 0.6 }, style,
      ]}>
      {busy ? <ActivityIndicator color={outline ? color : '#fff'} />
        : <Text style={[s.btnText, big && s.btnTextBig, outline && { color }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor="#9aa3b5" autoCapitalize="none" autoCorrect={false} {...props}
        style={[s.input, props.style]} />
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

export function Row({ left, right, strong }: { left: string; right: string; strong?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowL, strong && s.strong]}>{left}</Text>
      <Text style={[s.rowR, strong && s.strong]}>{right}</Text>
    </View>
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

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 20, paddingBottom: 40 },
  btn: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnBig: { minHeight: 76, borderRadius: 16 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  btnTextBig: { fontSize: 24 },
  label: { fontSize: 14, color: C.sub, marginBottom: 6, fontWeight: '600' },
  input: {
    minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff',
    paddingHorizontal: 14, fontSize: 17, color: C.text,
  },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.sub, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, gap: 12 },
  rowL: { fontSize: 15, color: C.sub },
  rowR: { fontSize: 15, color: C.text, flexShrink: 1, textAlign: 'right' },
  strong: { fontWeight: '700', color: C.text },
  link: { color: C.brand, fontSize: 15, fontWeight: '600', padding: 10, textAlign: 'center' },
  small: { fontSize: 13, color: C.sub },
  seg: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: C.brand, overflow: 'hidden', alignSelf: 'flex-start' },
  segItem: { paddingVertical: 8, paddingHorizontal: 14 },
  segOn: { backgroundColor: C.brand },
  segText: { color: C.brand, fontWeight: '600' },
});
