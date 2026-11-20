import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, ApiError, type HomeData, type PunchAction, type Shift } from '../api';
import { dayLabel, duration, hhmm, money } from '../i18n';
import { currentCoords } from '../location';
import type { ScreenProps } from '../nav';
import { rateText } from '../pay';
import { useSession } from '../session';
import { Button, C, Card, Row, s, toast } from '../ui';

export default function HomeScreen({ navigation }: ScreenProps<'Home'>) {
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

  const notifUnread = data?.notifUnread ?? 0;
  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('appName'),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <Pressable onPress={() => navigation.navigate('Notifications')} hitSlop={10}
            accessibilityRole="button" accessibilityLabel={t('notifications')}>
            <Text style={{ fontSize: 22 }}>🔔</Text>
            {notifUnread ? <Badge n={notifUnread} style={{ position: 'absolute', top: -6, right: -10 }} /> : null}
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={10}>
            <Text style={{ color: C.brand, fontSize: 16, fontWeight: '600' }}>{t('settings')}</Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, t, notifUnread]);

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

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
        <Tile icon="✉" label={t('messagesBtn')} badge={data.unread} onPress={() => navigation.navigate('Messages')} />
        <Tile icon="💰" label={t('myPay')} onPress={() => navigation.navigate('Pay')} />
      </View>

      <Pressable onPress={() => navigation.navigate('Pay')} accessibilityRole="button"
        style={({ pressed }) => [s.card, { opacity: pressed ? 0.7 : 1 }]}>
        <Text style={s.cardTitle}>{t('thisMonth')}</Text>
        {data.me.payType ? (
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 }}>
            {rateText(t, data.me.payType, data.me.hourlyWage, data.me.monthlySalary)}
          </Text>
        ) : null}
        <Row left={t('worked')} right={duration(month.workedMin, t)} />
        <Row left={t('gross')} right={money(month.gross, t)} />
        <Row left={t('holidayPay')} right={money(month.holidayPay, t)} />
        <Row left={t('net')} right={money(month.net, t)} strong />
        <Text style={[s.link, { textAlign: 'right', paddingHorizontal: 0, paddingBottom: 0 }]}>{t('viewMyPay')} ›</Text>
      </Pressable>

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

function Badge({ n, style }: { n: number; style?: object }) {
  return (
    <View style={[{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.danger, alignItems: 'center',
      justifyContent: 'center', paddingHorizontal: 6 }, style]}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{n > 99 ? '99+' : n}</Text>
    </View>
  );
}

function Tile({ icon, label, badge, onPress }: { icon: string; label: string; badge?: number; onPress(): void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [s.card, { flex: 1, marginBottom: 0, minHeight: 84, justifyContent: 'center', opacity: pressed ? 0.7 : 1 }]}>
      <Text style={{ fontSize: 24 }}>{icon}</Text>
      <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginTop: 4 }}>{label}</Text>
      {badge ? <Badge n={badge} style={{ position: 'absolute', top: 10, right: 10 }} /> : null}
    </Pressable>
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
