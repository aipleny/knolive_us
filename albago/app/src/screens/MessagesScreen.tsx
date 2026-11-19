import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, RefreshControl, Text, View, type ImageURISource,
} from 'react-native';
import { api, ApiError, type Attachment, type Message } from '../api';
import { formatSize, imageSource, isImage, openFile } from '../attachments';
import { dateTime, kindLabel } from '../i18n';
import { useSession } from '../session';
import { Button, C, s } from '../ui';

const DOC_KINDS = new Set(['notice', 'instruction', 'warning', 'discipline', 'dismissal']);
const KIND_COLOR: Record<string, string> = {
  notice: C.brand, instruction: C.brand, warning: C.orange, discipline: C.danger, dismissal: C.danger,
};

type Nav = { navigate(name: 'Compose'): void; setOptions(o: object): void };

export default function MessagesScreen({ navigation }: { navigation: Nav }) {
  const { t } = useSession();
  const [items, setItems] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [acking, setAcking] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ImageURISource | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.messages();
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('Compose')} hitSlop={12}>
          <Text style={{ color: C.brand, fontSize: 16, fontWeight: '700' }}>{t('write')}</Text>
        </Pressable>
      ),
    });
  }, [navigation, t]);

  function ack(m: Message) {
    Alert.alert(t('ackTitle'), t('ackMsg'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('ack'),
        onPress: async () => {
          setAcking(m.id);
          try {
            const res = await api.ack(m.id);
            setItems((list) => list?.map((x) => (x.id === m.id ? { ...x, ackAt: res.ackAt } : x)) ?? null);
          } catch (e) {
            Alert.alert(t('error'), (e as ApiError).message);
          } finally {
            setAcking(null);
          }
        },
      },
    ]);
  }

  async function open(a: Attachment) {
    try {
      if (isImage(a)) setViewer(await imageSource(a));
      else await openFile(a);
    } catch {
      Alert.alert(t('error'), t('openFailed'));
    }
  }

  if (!items) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        {error ? <>
          <Text style={{ color: C.danger, fontSize: 16, marginBottom: 16, textAlign: 'center' }}>{error}</Text>
          <Button title={t('retry')} onPress={load} style={{ alignSelf: 'stretch' }} />
        </> : <ActivityIndicator size="large" color={C.brand} />}
      </View>
    );
  }

  return (
    <>
      <FlatList
        style={s.screen}
        contentContainerStyle={s.pad}
        data={items}
        keyExtractor={(m) => m.id}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={<>
          {error ? <Text style={{ color: C.danger, marginBottom: 10 }}>{error}</Text> : null}
          <Text style={[s.small, { marginBottom: 12 }]}>{t('recordNote')}</Text>
        </>}
        ListEmptyComponent={<Text style={[s.small, { textAlign: 'center', marginTop: 40 }]}>{t('noMessages')}</Text>}
        renderItem={({ item: m }) => (
          <MessageItem m={m} onAck={() => ack(m)} acking={acking === m.id} onOpen={open} />
        )}
      />
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }} onPress={() => setViewer(null)}>
          {viewer ? <Image source={viewer} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
          <Text style={{ color: '#fff', textAlign: 'center', fontSize: 17, padding: 20 }}>{t('close')}</Text>
        </Pressable>
      </Modal>
    </>
  );
}

function MessageItem({ m, onAck, acking, onOpen }: {
  m: Message; onAck(): void; acking: boolean; onOpen(a: Attachment): void;
}) {
  const { t } = useSession();
  const mine = m.from === 'staff';
  const doc = !mine && DOC_KINDS.has(m.kind);
  const color = KIND_COLOR[m.kind] ?? C.sub;
  const needsAck = m.requiresAck && !m.ackAt;

  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <Text style={{ color: doc ? '#fff' : color, backgroundColor: doc ? color : undefined, fontWeight: '800',
          fontSize: 13, paddingHorizontal: doc ? 8 : 0, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' }}>
          {kindLabel(m.kind, t)}
        </Text>
        <Text style={s.small}>{mine ? t('sent') : t('fromOwner')} · {dateTime(m.createdAt)}</Text>
      </View>
      {m.title ? <Text style={{ fontSize: doc ? 18 : 16, fontWeight: '700', color: C.text, marginBottom: 6 }}>{m.title}</Text> : null}
      <Text style={{ fontSize: 15, color: C.text, lineHeight: 22 }}>{m.body}</Text>
      {m.date ? <Text style={[s.small, { marginTop: 8 }]}>{t('relatedDate')}: {m.date}</Text> : null}
      {m.attachments.map((a) => (
        <Pressable key={a.id} onPress={() => onOpen(a)} hitSlop={4}
          style={{ marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff' }}>
          <Text style={{ color: C.brand, fontWeight: '600' }} numberOfLines={1}>
            {isImage(a) ? '🖼' : '📄'} {a.name} <Text style={s.small}>({formatSize(a.size)})</Text>
          </Text>
        </Pressable>
      ))}
      {!mine && (
        <View style={{ marginTop: 10, borderTopWidth: doc ? 1 : 0, borderTopColor: C.line, paddingTop: doc ? 8 : 0 }}>
          <Text style={s.small}>
            {m.readAt ? `${t('readAt')} ${dateTime(m.readAt)}` : t('unreadMark')}
            {m.ackAt ? ` · ${t('ackedAt', { t: dateTime(m.ackAt) })}` : m.requiresAck ? ` · ${t('ackNeeded')}` : ''}
          </Text>
          {doc && m.hash ? <Text style={[s.small, { fontSize: 11, marginTop: 2 }]}>#{m.hash}</Text> : null}
        </View>
      )}
      {needsAck && <Button title={t('ack')} color={color} onPress={onAck} busy={acking} style={{ marginTop: 12 }} />}
    </>
  );

  if (mine) {
    return (
      <View style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: '#e7eefc', borderRadius: 16,
        borderBottomRightRadius: 4, padding: 14, marginBottom: 12 }}>{body}</View>
    );
  }
  return (
    <View style={[{ backgroundColor: C.card, borderRadius: doc ? 8 : 16, padding: 16, marginBottom: 12 },
      doc ? { borderLeftWidth: 5, borderLeftColor: color } : { alignSelf: 'flex-start', maxWidth: '88%', borderBottomLeftRadius: 4 },
      needsAck && { borderWidth: 2, borderColor: color, borderLeftWidth: 5 }]}>
      {body}
    </View>
  );
}
