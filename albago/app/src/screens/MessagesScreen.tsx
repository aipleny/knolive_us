import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, RefreshControl, View, type ImageURISource } from 'react-native';
import { api, ApiError, type Attachment, type Message } from '../api';
import { formatSize, imageSource, isImage, openFile } from '../attachments';
import { dateTime, kindLabel } from '../i18n';
import { useHome } from '../home';
import type { TabProps } from '../nav';
import { useSession } from '../session';
import { Button, C, Icon, s, Tag, Text } from '../ui';

const DOC_KINDS = new Set(['notice', 'instruction', 'warning', 'discipline', 'dismissal']);
const KIND_COLOR: Record<string, string> = {
  notice: C.brand, instruction: C.brand, warning: C.orange, discipline: C.danger, dismissal: C.danger,
};

export default function MessagesScreen({ navigation }: TabProps<'Messages'>) {
  const { t } = useSession();
  const { refresh: refreshHome } = useHome();
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
      refreshHome(); // GET marks messages read → update the tab badge
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, [refreshHome]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

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
          <Text style={{ color: C.danger, fontSize: 15, marginBottom: 16, textAlign: 'center' }}>{error}</Text>
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            borderBottomWidth: 2, borderBottomColor: C.text, paddingBottom: 8, marginBottom: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '800' }}>{t('messages')}</Text>
            <Button title={t('write')} onPress={() => navigation.navigate('Compose')}
              style={{ height: 34, paddingHorizontal: 14 }} />
          </View>
          {error ? <Text style={{ color: C.danger, marginBottom: 10 }}>{error}</Text> : null}
          <Text style={[s.small, { fontSize: 12, marginBottom: 12 }]}>{t('recordNote')}</Text>
        </>}
        ListEmptyComponent={<Text style={[s.small, { textAlign: 'center', marginTop: 40 }]}>{t('noMessages')}</Text>}
        renderItem={({ item: m }) => (
          <MessageItem m={m} onAck={() => ack(m)} acking={acking === m.id} onOpen={open} />
        )}
      />
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }} onPress={() => setViewer(null)}>
          {viewer ? <Image source={viewer} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
          <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '600', padding: 20 }}>{t('close')}</Text>
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
        <Tag label={kindLabel(m.kind, t)} color={color} solid={doc} />
        <Text style={{ fontSize: 12, color: C.sub }}>{mine ? t('sent') : t('fromOwner')} · {dateTime(m.createdAt)}</Text>
      </View>
      {m.title ? <Text style={{ fontSize: doc ? 17 : 15, fontWeight: '700', marginBottom: 4 }}>{m.title}</Text> : null}
      <Text style={{ fontSize: 14, lineHeight: 21 }}>{m.body}</Text>
      {m.date ? <Text style={[s.small, { marginTop: 8 }]}>{t('relatedDate')}: {m.date}</Text> : null}
      {m.attachments.map((a) => (
        <Pressable key={a.id} onPress={() => onOpen(a)} hitSlop={4}
          style={{ marginTop: 8, paddingHorizontal: 10, minHeight: 40, borderRadius: 4, borderWidth: 1, borderColor: C.line,
            backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={isImage(a) ? 'image' : 'doc'} size={18} color={C.brand} />
          <Text style={{ color: C.brand, fontWeight: '600', fontSize: 13, flex: 1 }} numberOfLines={1}>{a.name}</Text>
          <Text style={{ fontSize: 12, color: C.sub }}>{formatSize(a.size)}</Text>
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
      <View style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: C.tint, borderRadius: 6,
        borderWidth: 1, borderColor: '#d6e2f7', padding: 14, marginBottom: 12 }}>{body}</View>
    );
  }
  return (
    <View style={[{ backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: needsAck ? color : C.line,
      padding: 16, marginBottom: 12 },
      doc ? { borderLeftWidth: 3, borderLeftColor: color } : { alignSelf: 'flex-start', maxWidth: '88%' }]}>
      {body}
    </View>
  );
}
