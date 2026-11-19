import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, ApiError, type HomeData, type PunchAction, type Shift } from '../api';
import { dayLabel, duration, hhmm, money } from '../i18n';
import { currentCoords } from '../location';
import { useSession } from '../session';
import { Button, C, Card, Row, s, toast } from '../ui';

type Nav = { navigate(name: 'Settings' | 'Messages'): void; setOptions(o: object): void };

export default function HomeScreen({ navigation }: { navigation: Nav }) {
  const { t, lang, syncGeo } = useSession();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<PunchAction | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.home();
      setData(d);
      setError(null);
      syncGeo(d.store);
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, [syncGeo]);

  // Reload when the screen gains focus (e.g. back from Messages → unread badge) and on language change.
  useFocusEffect(useCallback(() => { load(); }, [load, lang]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') load(); });
    return () => sub.remove();
  }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('appName'),
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={12}>
          <Text style={{ color: C.brand, fontSize: 16, fontWeight: '600' }}>{t('settings')}</Text>
        </Pressable>
      ),
    });
  }, [navigation, t]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

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
      const coords = await currentCoords(true);
      const res = await api.punch(action, coords);
      toast(res.message);
      await load();
    } catch (e) {
      Alert.alert(t('error'), (e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        {error ? (
          <>
            <Text style={{ color: C.danger, fontSize: 16, marginBottom: 16, textAlign: 'center' }}>{error}</Text>
            <Button title={t('retry')} onPress={load} style={{ alignSelf: 'stretch' }} />
          </>
        ) : <ActivityIndicator size="large" color={C.brand} />}
      </View>
    );
  }

  const { status, today, month } = data;
  const statusText = status === 'in' ? t('statusIn', { t: hhmm(data.since) })
    : status === 'break' ? t('statusBreak', { t: hhmm(data.breakSince) }) : t('statusOff');
  const statusColor = status === 'in' ? C.green : status === 'break' ? C.amber : C.sub;
  const buttons: { action: PunchAction; title: string; color: string }[] =
    status === 'off' ? [{ action: 'in', title: t('clockIn'), color: C.green }]
    : status === 'in' ? [
      { action: 'break_start', title: t('breakStart'), color: C.brand },
      { action: 'out', title: t('clockOut'), color: C.orange },
    ] : [{ action: 'break_end', title: t('breakEnd'), color: C.brand }];

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {error ? <Text style={{ color: C.danger, marginBottom: 10 }}>{error}</Text> : null}

      <Card>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 2 }}>{data.store.name}</Text>
        <Text style={s.small}>{dayLabel(today.date, lang)} · {data.me.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: statusColor, marginRight: 8 }} />
          <Text style={{ fontSize: 22, fontWeight: '800', color: statusColor }}>{statusText}</Text>
        </View>
        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
          <Text style={s.label}>{t('todayShift')}</Text>
          <ShiftText shift={today.shift} big />
        </View>
      </Card>

      <View style={{ gap: 12, marginBottom: 18 }}>
        {buttons.map((b) => (
          <Button key={b.action} big title={b.title} color={b.color} busy={busy === b.action}
            disabled={!!busy} onPress={() => punch(b.action)} />
        ))}
      </View>

      <Pressable onPress={() => navigation.navigate('Messages')} accessibilityRole="button"
        style={({ pressed }) => [s.card, { flexDirection: 'row', alignItems: 'center', minHeight: 60, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: C.text }}>✉  {t('messagesBtn')}</Text>
        {data.unread ? (
          <View style={{ minWidth: 26, height: 26, borderRadius: 13, backgroundColor: C.danger, alignItems: 'center',
            justifyContent: 'center', paddingHorizontal: 7, marginRight: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{data.unread > 99 ? '99+' : data.unread}</Text>
          </View>
        ) : null}
        <Text style={{ color: C.sub, fontSize: 20 }}>›</Text>
      </Pressable>

      <Card title={t('thisMonth')}>
        <Row left={t('worked')} right={duration(month.workedMin, t)} />
        <Row left={t('gross')} right={money(month.gross, t)} />
        <Row left={t('holidayPay')} right={money(month.holidayPay, t)} />
        <Row left={t('net')} right={money(month.net, t)} strong />
      </Card>

      <Card title={t('next14')}>
        {data.shifts.slice(0, 14).map((d) => (
          <View key={d.date} style={[s.row, { borderBottomWidth: 1, borderBottomColor: C.line }]}>
            <Text style={[s.rowL, d.date === today.date && s.strong]}>{dayLabel(d.date, lang)}</Text>
            <ShiftText shift={d.shift} />
          </View>
        ))}
      </Card>

      <Card title={t('records')}>
        {data.records.length === 0 ? <Text style={s.small}>{t('noRecords')}</Text> : null}
        {data.records.map((r, i) => (
          <View key={`${r.date}-${i}`} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={s.rowL}>{dayLabel(r.date, lang)}</Text>
              <Text style={s.rowR}>{hhmm(r.in)} – {r.out ? hhmm(r.out) : t('working')}</Text>
            </View>
            {r.breaks.length > 0 && (
              <Text style={[s.small, { textAlign: 'right' }]}>
                {t('breakLabel')} {r.breaks.map((b) => `${hhmm(b.start)}–${b.end ? hhmm(b.end) : ''}`).join(', ')}
              </Text>
            )}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function ShiftText({ shift, big }: { shift: Shift | null; big?: boolean }) {
  const { t } = useSession();
  if (!shift) return <Text style={[s.rowR, { color: C.sub }]}>{t('noShift')}</Text>;
  const breaks = (shift.breaks ?? []).map((b) => `${b.start}–${b.end}`).join(', ');
  return (
    <View style={{ alignItems: big ? 'flex-start' : 'flex-end' }}>
      <Text style={big ? { fontSize: 20, fontWeight: '700', color: C.text } : s.rowR}>{shift.start} – {shift.end}</Text>
      {breaks ? <Text style={s.small}>{t('breakLabel')} {breaks}</Text> : null}
    </View>
  );
}
