import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { api, ApiError, type NotificationItem } from '../api';
import { dateTime } from '../i18n';
import { screenForKind, type ScreenProps } from '../nav';
import { useSession } from '../session';
import { Button, C, s } from '../ui';

const ICON: Record<string, string> = {
  message: '✉', payslip: '💰', contract: '📄', schedule: '📅', shift_soon: '⏰', no_out: '⚠',
};

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
          <Text style={{ color: C.brand, fontSize: 15, fontWeight: '700' }}>{t('readAll')}</Text>
        </Pressable>
      ) : null,
    });
  }, [navigation, unread, t]);

  function open(n: NotificationItem) {
    if (!n.readAt) {
      markLocal([n.id]);
      api.markRead([n.id]).catch(() => null);
    }
    const screen = screenForKind(n.kind);
    if (screen === 'Home') navigation.popToTop();
    else navigation.navigate(screen);
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
      contentContainerStyle={{ paddingVertical: 8 }}
      data={items}
      keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={error ? <Text style={{ color: C.danger, margin: 16 }}>{error}</Text> : undefined}
      ListEmptyComponent={<Text style={[s.small, { textAlign: 'center', marginTop: 40 }]}>{t('noNotifications')}</Text>}
      renderItem={({ item: n }) => (
        <Pressable onPress={() => open(n)} accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 20, minHeight: 64,
            backgroundColor: n.readAt ? C.bg : '#e7eefc', borderBottomWidth: 1, borderBottomColor: C.line,
            opacity: pressed ? 0.7 : 1,
          })}>
          <Text style={{ fontSize: 20 }}>{ICON[n.kind] ?? '•'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: n.readAt ? '500' : '800', color: C.text }}>{n.title}</Text>
            {n.body ? <Text style={{ fontSize: 14, color: C.sub, marginTop: 2 }} numberOfLines={3}>{n.body}</Text> : null}
            <Text style={[s.small, { fontSize: 12, marginTop: 4 }]}>{dateTime(n.createdAt)}</Text>
          </View>
          {!n.readAt && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.brand, marginTop: 6 }} />}
        </Pressable>
      )}
    />
  );
}
