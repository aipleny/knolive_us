import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { useHome } from '../home';
import { dayLabel, duration, hhmm } from '../i18n';
import { useSession } from '../session';
import { Button, C, s, Section, Text } from '../ui';
import { shiftRange } from './HomeScreen';

/** 근무표: next 14 days of shifts + this month's attendance records. */
export default function ScheduleScreen() {
  const { t, lang } = useSession();
  const { data, error, refresh } = useHome();
  const [refreshing, setRefreshing] = useState(false);

  if (!data) {
    return (
      <View style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
        {error ? <Button title={t('retry')} onPress={() => refresh()} /> : <ActivityIndicator size="large" color={C.brand} />}
      </View>
    );
  }
  const today = data.today.date;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}
      refreshControl={<RefreshControl refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} />}>
      <Section title={t('next14')}>
        {data.shifts.slice(0, 14).map((d) => (
          <View key={d.date} style={[s.row, d.date === today && { backgroundColor: C.tint }]}>
            <Text style={[s.rowL, d.date === today && s.strong]}>{dayLabel(d.date, lang)}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.rowR, !d.shift && { color: C.sub }]}>{d.shift ? shiftRange(d.shift) : t('dayOff')}</Text>
              {d.shift?.breaks?.length ? (
                <Text style={{ fontSize: 12, color: C.sub }}>
                  {t('breakLabel')} {d.shift.breaks.map((b) => `${b.start}~${b.end}`).join(', ')}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </Section>

      <Section title={t('records')} sub={duration(data.month.workedMin, t)}>
        {data.records.length === 0 ? <Text style={[s.small, { paddingVertical: 12 }]}>{t('noRecords')}</Text> : null}
        {data.records.map((r, i) => (
          <View key={`${r.date}-${i}`} style={s.row}>
            <Text style={s.rowL}>{dayLabel(r.date, lang)}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.rowR, !r.out && { color: C.green }]}>
                {hhmm(r.in)} ~ {r.out ? hhmm(r.out) : t('working')}
              </Text>
              {r.breaks.length > 0 && (
                <Text style={{ fontSize: 12, color: C.sub }}>
                  {t('breakLabel')} {r.breaks.map((b) => `${hhmm(b.start)}~${b.end ? hhmm(b.end) : ''}`).join(', ')}
                </Text>
              )}
            </View>
          </View>
        ))}
      </Section>
    </ScrollView>
  );
}
