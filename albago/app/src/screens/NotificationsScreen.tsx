import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { api, ApiError, type NotificationItem } from '../api';
import { dateTime, type TKey } from '../i18n';
import { goTo, screenForKind, type ScreenProps } from '../nav';
import { useSession } from '../session';
import { Button, C, s, Text } from '../ui';

export default function NotificationsScreen({ navigation }: ScreenProps<'Notifications'>) {
  const { t } = useSession();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api.notifications()).items);
      setError(null);
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markLocal = (ids: string[] | 'all') => {
    const now = new Date().toISOString();
    setItems((l) => l?.map((n) => (!n.readAt && (ids === 'all' || ids.includes(n.id)) ? { ...n, readAt: now } : n)) ?? null);
  };

  const unread = items?.some((n) => !n.readAt) ?? false;
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => unread ? (
        <Pressable hitSlop={12} onPress={async () => {
          try { await api.markRead('all'); markLocal('all'); } catch (e) { Alert.alert(t('error'), (e as ApiError).message); }
        }}>
          <Text style={{ color: C.brand, fontSize: 14, fontWeight: '700' }}>{t('readAll')}</Text>
        </Pressable>
      ) : null,
    });
  }, [navigation, unread, t]);

  function open(n: NotificationItem) {
    if (!n.readAt) {
      markLocal([n.id]);
      api.markRead([n.id]).catch(() => null);
    }
    goTo(navigation, screenForKind(n.kind));
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
      data={items}
      keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={error ? <Text style={{ color: C.danger, margin: 16 }}>{error}</Text> : undefined}
      ListEmptyComponent={<Text style={[s.small, { textAlign: 'center', marginTop: 40 }]}>{t('noNotifications')}</Text>}
      renderItem={({ item: n }) => (
        <Pressable onPress={() => open(n)} accessibilityRole="button"
          style={({ pressed }) => ({
            paddingVertical: 12, paddingHorizontal: 16, minHeight: 64,
            backgroundColor: pressed ? C.line2 : n.readAt ? '#fff' : C.tint, borderBottomWidth: 1, borderBottomColor: C.line2,
          })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            {!n.readAt && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.danger }} />}
            <Text style={{ fontSize: 12, color: n.readAt ? C.sub : C.brand, fontWeight: '700' }}>{t(`n_${n.kind}` as TKey)}</Text>
            <Text style={{ fontSize: 12, color: C.sub }}>· {dateTime(n.createdAt)}</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: n.readAt ? '500' : '700' }}>{n.title}</Text>
          {n.body ? <Text style={{ fontSize: 13, color: C.sub, marginTop: 2 }} numberOfLines={3}>{n.body}</Text> : null}
        </Pressable>
      )}
    />
  );
}
