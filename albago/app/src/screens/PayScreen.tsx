import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, ApiError, type PayData, type PayLine, type Payslip } from '../api';
import { duration, money, monthName } from '../i18n';
import type { ScreenProps } from '../nav';
import { rateText } from '../pay';
import { useSession } from '../session';
import { Button, C, Card, s } from '../ui';

export default function PayScreen({ navigation }: ScreenProps<'Pay'>) {
  const { t, lang } = useSession();
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string | undefined>(undefined); // undefined = server's current month
  const [pay, setPay] = useState<PayData | null>(null);
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadPay = useCallback(async (m?: string) => {
    setLoading(true);
    try {
      setPay(await api.pay(m));
      setError(null);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setLoading(false);
    }
  }, []);
  const loadLists = useCallback(async () => {
    const [m, p] = await Promise.allSettled([api.payMonths(), api.payslips()]);
    if (m.status === 'fulfilled') setMonths(m.value.months);
    if (p.status === 'fulfilled') setSlips(p.value.items);
  }, []);

  useEffect(() => { loadPay(month); }, [month, lang, loadPay]);
  // Payslip list refreshes on focus so "new" badges clear after viewing one.
  useFocusEffect(useCallback(() => { loadLists(); }, [loadLists, lang]));

  const openSlip = (id: string, title: string) => navigation.navigate('Document', { kind: 'payslip', id, title });
  const selected = month ?? pay?.month;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
        setRefreshing(true); await Promise.all([loadPay(month), loadLists()]); setRefreshing(false);
      }} />}>
      {pay && (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>
            {rateText(t, pay.payType, pay.hourlyWage, pay.monthlySalary, pay.ordinaryRate)}
          </Text>
          <Text style={[s.small, { fontSize: 15, marginTop: 2 }]}>{t('payDay', { d: pay.payDay })}</Text>
        </View>
      )}

      {months.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}
          contentContainerStyle={{ gap: 8 }}>
          {months.map((m) => (
            <Pressable key={m} onPress={() => setMonth(m)} hitSlop={4}
              style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: C.brand,
                backgroundColor: selected === m ? C.brand : '#fff' }}>
              <Text style={{ color: selected === m ? '#fff' : C.brand, fontWeight: '700' }}>{monthName(m, lang)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {error ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ color: C.danger, marginBottom: 10 }}>{error}</Text>
          <Button title={t('retry')} onPress={() => loadPay(month)} />
        </View>
      ) : null}
      {!pay && !error ? <ActivityIndicator size="large" color={C.brand} style={{ marginVertical: 40 }} /> : null}

      {pay && (
        <View style={{ opacity: loading ? 0.5 : 1 }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.text }}>{monthName(pay.month, lang)}</Text>
              {pay.estimate ? (
                <Text style={{ backgroundColor: C.amber, color: '#fff', fontWeight: '800', fontSize: 13, paddingHorizontal: 8,
                  paddingVertical: 3, borderRadius: 6, overflow: 'hidden' }}>{t('estimate')}</Text>
              ) : null}
            </View>
            <Text style={[s.small, { marginTop: 2 }]}>
              {pay.from} ~ {pay.to} · {t('workedDays', { d: pay.days, h: duration(pay.workedMin, t) })}
            </Text>

            <Text style={[s.label, { marginTop: 16 }]}>{t('payItems')}</Text>
            {pay.items.map((it) => <Line key={it.key} line={it} />)}
            <Total label={t('grossTotal')} amount={money(pay.gross, t)} />

            {pay.deductions.length > 0 && <>
              <Text style={[s.label, { marginTop: 16 }]}>{t('deductions')}</Text>
              {pay.deductions.map((it) => <Line key={it.key} line={it} minus />)}
              <Total label={t('deductionTotal')} amount={`-${money(pay.deductionTotal, t)}`} />
            </>}

            <View style={{ marginTop: 16, padding: 16, borderRadius: 12, backgroundColor: '#e7eefc' }}>
              <Text style={{ color: C.sub, fontWeight: '700' }}>{t('netPay')}</Text>
              <Text style={{ fontSize: 32, fontWeight: '900', color: C.brand, marginTop: 2 }}>{money(pay.net, t)}</Text>
            </View>
            {pay.estimate ? <Text style={[s.small, { marginTop: 10 }]}>{t('estimateNote')}</Text> : null}
            {pay.payslipId ? (
              <Button title={t('viewPayslip')} style={{ marginTop: 14 }}
                onPress={() => openSlip(pay.payslipId!, `${t('payslip')} ${monthName(pay.month, lang)}`)} />
            ) : null}
          </Card>
        </View>
      )}

      <Card title={t('payslips')}>
        {slips.length === 0 ? <Text style={s.small}>{t('noPayslips')}</Text> : null}
        {slips.map((p) => (
          <Pressable key={p.id} accessibilityRole="button" onPress={() => openSlip(p.id, `${t('payslip')} ${p.from} ~ ${p.to}`)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, minHeight: 56,
              borderBottomWidth: 1, borderBottomColor: C.line, opacity: pressed ? 0.6 : 1 })}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{p.from} ~ {p.to}</Text>
                {!p.viewedAt ? (
                  <Text style={{ backgroundColor: C.danger, color: '#fff', fontSize: 11, fontWeight: '800', paddingHorizontal: 6,
                    paddingVertical: 2, borderRadius: 5, overflow: 'hidden' }}>{t('newBadge')}</Text>
                ) : null}
              </View>
              <Text style={s.small}>{t('payDate', { d: p.payDate })}</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, marginRight: 6 }}>{money(p.net, t)}</Text>
            <Text style={{ color: C.sub, fontSize: 20 }}>›</Text>
          </Pressable>
        ))}
      </Card>
    </ScrollView>
  );
}

function Line({ line, minus }: { line: PayLine; minus?: boolean }) {
  const { t } = useSession();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: C.text }}>{line.label}</Text>
        {line.calc ? <Text style={[s.small, { fontSize: 12, color: '#8a93a6' }]}>{line.calc}</Text> : null}
      </View>
      <Text style={{ fontSize: 15, color: C.text }}>{minus ? '-' : ''}{money(line.amount, t)}</Text>
    </View>
  );
}

function Total({ label, amount }: { label: string; amount: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4,
      borderTopWidth: 1, borderTopColor: C.line }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{amount}</Text>
    </View>
  );
}
