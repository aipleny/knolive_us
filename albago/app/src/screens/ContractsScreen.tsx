import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { api, ApiError, type Contract } from '../api';
import { dateTime } from '../i18n';
import type { ScreenProps } from '../nav';
import { useSession } from '../session';
import { Button, C, s } from '../ui';

export default function ContractsScreen({ navigation }: ScreenProps<'Contracts'>) {
  const { t } = useSession();
  const [items, setItems] = useState<Contract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api.contracts()).items);
      setError(null);
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function receive(c: Contract) {
    Alert.alert(t('receiveTitle'), t('receiveMsg'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('received'),
        onPress: async () => {
          setBusy(c.id);
          try {
            const res = await api.receiveContract(c.id);
            setItems((l) => l?.map((x) => (x.id === c.id ? { ...x, receivedAt: res.receivedAt } : x)) ?? null);
          } catch (e) {
            Alert.alert(t('error'), (e as ApiError).message);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  if (!items) {
    return (
      <View style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
        {error ? <>
          <Text style={{ color: C.danger, marginBottom: 16, textAlign: 'center' }}>{error}</Text>
          <Button title={t('retry')} onPress={load} />
        </> : <ActivityIndicator size="large" color={C.brand} />}
      </View>
    );
  }

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.pad}
      data={items}
      keyExtractor={(c) => c.id}
      refreshControl={<RefreshControl refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={error ? <Text style={{ color: C.danger, marginBottom: 10 }}>{error}</Text> : undefined}
      ListEmptyComponent={<Text style={[s.small, { textAlign: 'center', marginTop: 40 }]}>{t('noContracts')}</Text>}
      renderItem={({ item: c }) => (
        <View style={[s.card, !c.receivedAt && { borderWidth: 2, borderColor: C.brand }]}>
          <Pressable onPress={() => navigation.navigate('Document', { kind: 'contract', id: c.id, title: c.title || t('contract') })}
            accessibilityRole="button" style={{ minHeight: 48 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.text }}>📄 {c.title || t('contract')}</Text>
            <Text style={[s.small, { marginTop: 4 }]}>{dateTime(c.sharedAt ?? c.createdAt)}</Text>
            <Text style={[s.small, { marginTop: 2, color: c.receivedAt ? C.green : C.orange, fontWeight: '600' }]}>
              {c.receivedAt ? t('receivedAt', { t: dateTime(c.receivedAt) }) : t('notReceived')}
            </Text>
          </Pressable>
          {!c.receivedAt && (
            <Button title={t('received')} onPress={() => receive(c)} busy={busy === c.id} style={{ marginTop: 12 }} />
          )}
        </View>
      )}
    />
  );
}
