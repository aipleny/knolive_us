import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, View } from 'react-native';
import { api, ApiError, type PunchAction, type Shift } from '../api';
import { dayLabel, hhmm, longDay, money, shortMonth } from '../i18n';
import { currentCoords } from '../location';
import type { TabProps } from '../nav';
import { rateText } from '../pay';
import { useHome } from '../home';
import { useSession } from '../session';
import { Button, C, s, Section, Text, toast } from '../ui';

export const shiftRange = (sh: Shift) => `${sh.start} ~ ${sh.end}`;

export default function HomeScreen({ navigation }: TabProps<'Home'>) {
  const { t, lang, autoGeo } = useSession();
  const { data, error, refresh } = useHome();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<PunchAction | null>(null);

  async function punch(action: PunchAction) {
    if (action === 'out') {
      const ok = await new Promise<boolean>((r) => Alert.alert(t('clockOut'), t('confirmOut'), [
        { text: t('cancel'), style: 'cancel', onPress: () => r(false) },
        { text: t('clockOut'), onPress: () => r(true) },
      ]));
      if (!ok) return;
    }
    setBusy(action);
    try {
      const res = await api.punch(action, await currentCoords(true));
      toast(res.message);
      await refresh();
    } catch (e) {
      Alert.alert(t('error'), (e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        {error ? <>
          <Text style={{ color: C.danger, fontSize: 15, marginBottom: 16, textAlign: 'center' }}>{error}</Text>
          <Button title={t('retry')} onPress={() => refresh()} style={{ alignSelf: 'stretch' }} />
        </> : <ActivityIndicator size="large" color={C.brand} />}
      </View>
    );
  }

  const { status, today, month, store } = data;
  const todayRec = data.records.find((r) => r.date === today.date && r.out);
  const [lead, state, stateColor] =
    status === 'in' ? [t('inAt', { t: hhmm(data.since) }), t('workingNow'), C.green]
    : status === 'break' ? [t('breakAt', { t: hhmm(data.breakSince) }), t('onBreak'), C.purple]
    : todayRec ? [t('outAt', { t: hhmm(todayRec.out) }), t('doneToday'), C.orange]
    : ['', t('notYet'), C.sub];
  const geoCapable = store.autoGeo && store.lat != null && store.lng != null;
  const week = data.shifts.filter((d) => d.date > today.date).slice(0, 3);
  const b = (action: PunchAction) => ({ busy: busy === action, disabled: !!busy, onPress: () => punch(action), big: true });

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}
      refreshControl={<RefreshControl refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} />}>
      {error ? <Text style={{ color: C.danger, marginBottom: 10, fontSize: 13 }}>{error}</Text> : null}

      <View style={[s.card, { paddingVertical: 18 }]}>
        <Text style={{ fontSize: 13, color: C.sub }}>
          {longDay(today.date, lang)} · {today.shift ? t('todayShiftLine', { s: shiftRange(today.shift) }) : t('todayOff')}
        </Text>
        {today.shift?.breaks?.length ? (
          <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
            {t('breakLabel')} {today.shift.breaks.map((x) => `${x.start}~${x.end}`).join(', ')}
          </Text>
        ) : null}
        <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginTop: 6, marginBottom: 14 }}>
          {lead ? `${lead} · ` : ''}<Text style={{ fontSize: 22, fontWeight: '800', color: stateColor }}>{state}</Text>
        </Text>
        {status === 'off' ? (
          <Button title={t('clockIn')} color={C.brand} {...b('in')} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {status === 'in'
              ? <Button title={t('breakStart')} outline {...b('break_start')} style={{ flex: 1 }} />
              : <Button title={t('breakEnd')} outline textColor={C.purple} {...b('break_end')} style={{ flex: 1 }} />}
            <Button title={t('clockOut')} color={C.orange} {...b('out')} style={{ flex: 1 }} />
          </View>
        )}
        {geoCapable ? (
          <Text style={{ fontSize: 12, color: C.sub, marginTop: 10 }}>
            {autoGeo ? t('autoOnLine', { r: Math.max(store.radius || 0, 100) }) : t('autoOffLine')}
          </Text>
        ) : null}
      </View>

      <Section title={t('thisWeek')} link={t('viewAll')} onLink={() => navigation.navigate('Schedule')}>
        {week.map((d) => (
          <View key={d.date} style={s.row}>
            <Text style={s.rowL}>{dayLabel(d.date, lang)}</Text>
            <Text style={[s.rowR, !d.shift && { color: C.sub }]}>{d.shift ? shiftRange(d.shift) : t('dayOff')}</Text>
          </View>
        ))}
      </Section>

      <Section title={t('monthPayTitle', { m: shortMonth(month.from, lang) })} sub={t('estimateShort')}
        link={t('details')} onLink={() => navigation.navigate('Pay')}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
          paddingTop: 12, paddingHorizontal: 2, paddingBottom: 4, gap: 8 }}>
          <Text style={{ fontSize: 13, color: C.sub, flexShrink: 1 }}>
            {t('rateHours', {
              rate: rateText(t, data.me.payType, data.me.hourlyWage, data.me.monthlySalary) || t('worked'),
              h: Math.round(month.workedMin / 6) / 10,
            })}
          </Text>
          <Text style={{ fontSize: 22, fontWeight: '700' }}>{money(month.net, t)}</Text>
        </View>
      </Section>
    </ScrollView>
  );
}
