import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, View } from 'react-native';
import { api, ApiError, type Prefs } from '../api';
import { useSession } from '../session';
import { C, Chip, s, Section, Text } from '../ui';

const REMINDER_MINUTES = [10, 30, 60];

/** 알림 설정 → GET/PUT /api/staff/prefs */
export default function NotifPrefsScreen() {
  const { t } = useSession();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.prefs().then(setPrefs, (e: ApiError) => setError(e.message)); }, []);

  async function update(patch: Partial<Prefs>) {
    if (!prefs) return;
    const prev = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next); // optimistic
    try {
      await api.setPrefs(next);
    } catch (e) {
      setPrefs(prev);
      Alert.alert(t('error'), (e as ApiError).message);
    }
  }

  if (!prefs) {
    return (
      <View style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
        {error ? <Text style={{ color: C.danger, textAlign: 'center' }}>{error}</Text> : <ActivityIndicator color={C.brand} />}
      </View>
    );
  }
  const minutes = REMINDER_MINUTES.includes(prefs.shiftReminderMin)
    ? REMINDER_MINUTES : [...REMINDER_MINUTES, prefs.shiftReminderMin].sort((a, b) => a - b);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Section title={t('notifPrefs')}>
        <Toggle label={t('shiftReminder')} value={prefs.shiftReminder} onChange={(v) => update({ shiftReminder: v })} />
        {prefs.shiftReminder && (
          <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line2 }}>
            {minutes.map((m) => (
              <Chip key={m} label={t('shiftReminderMin', { n: m })} on={prefs.shiftReminderMin === m}
                onPress={() => update({ shiftReminderMin: m })} />
            ))}
          </View>
        )}
        <Toggle label={t('outReminder')} hint={t('outReminderHint')} value={prefs.outReminder}
          onChange={(v) => update({ outReminder: v })} />
        <Toggle label={t('scheduleChange')} value={prefs.scheduleChange} onChange={(v) => update({ scheduleChange: v })} />
      </Section>
    </ScrollView>
  );
}

export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 6, paddingHorizontal: 2,
      borderBottomWidth: 1, borderBottomColor: C.line2, gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '500' }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.brand }} />
    </View>
  );
}
