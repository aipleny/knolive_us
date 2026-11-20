import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { api, ApiError, type Prefs } from '../api';
import type { ScreenProps } from '../nav';
import { useSession } from '../session';
import { Button, C, Card, LangSwitch, Row, s } from '../ui';

const REMINDER_MINUTES = [10, 30, 60];

export default function SettingsScreen({ navigation }: ScreenProps<'Settings'>) {
  const { t, lang, setLang, autoGeo, setAutoGeo, signOut, serverUrl } = useSession();
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => { api.prefs().then(setPrefs, () => null); }, []);

  async function updatePrefs(patch: Partial<Prefs>) {
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

  const logout = () => Alert.alert(t('logout'), t('confirmLogout'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('logout'), style: 'destructive', onPress: () => signOut() },
  ]);

  const minuteOptions = prefs && !REMINDER_MINUTES.includes(prefs.shiftReminderMin)
    ? [...REMINDER_MINUTES, prefs.shiftReminderMin].sort((a, b) => a - b) : REMINDER_MINUTES;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Card title={t('language')}>
        <LangSwitch lang={lang} onChange={setLang} />
      </Card>
      <Card title={t('autoGeo')}>
        <Toggle label={t('autoGeo')} value={autoGeo} onChange={setAutoGeo} />
        <Text style={[s.small, { marginTop: 6 }]}>{t('geoOn')}</Text>
      </Card>

      {prefs && (
        <Card title={t('notifPrefs')}>
          <Toggle label={t('shiftReminder')} value={prefs.shiftReminder} onChange={(v) => updatePrefs({ shiftReminder: v })} />
          {prefs.shiftReminder && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              {minuteOptions.map((m) => {
                const on = prefs.shiftReminderMin === m;
                return (
                  <Pressable key={m} onPress={() => updatePrefs({ shiftReminderMin: m })} hitSlop={4}
                    style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5,
                      borderColor: C.brand, backgroundColor: on ? C.brand : '#fff' }}>
                    <Text style={{ color: on ? '#fff' : C.brand, fontWeight: '700' }}>{t('shiftReminderMin', { n: m })}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Toggle label={t('outReminder')} value={prefs.outReminder} onChange={(v) => updatePrefs({ outReminder: v })} />
          <Text style={[s.small, { marginBottom: 8 }]}>{t('outReminderHint')}</Text>
          <Toggle label={t('scheduleChange')} value={prefs.scheduleChange} onChange={(v) => updatePrefs({ scheduleChange: v })} />
        </Card>
      )}

      <Button title={t('contracts')} outline onPress={() => navigation.navigate('Contracts')} style={{ marginBottom: 12 }} />
      <Button title={t('pin')} outline onPress={() => navigation.navigate('Pin')} style={{ marginBottom: 14 }} />
      <Card>
        <Row left={t('server')} right={serverUrl} />
        <Row left={t('version')} right={Constants.expoConfig?.version ?? ''} />
      </Card>
      <Button title={t('logout')} color={C.danger} onPress={logout} />
    </ScrollView>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
      <Text style={{ fontSize: 16, color: C.text, fontWeight: '600', flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.brand }} />
    </View>
  );
}
