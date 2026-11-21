import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { api, ApiError, type NewAttachment, type StaffKind } from '../api';
import { formatSize } from '../attachments';
import { kindLabel } from '../i18n';
import { useSession } from '../session';
import { Button, C, Field, s, Text, toast } from '../ui';

const KINDS: StaffKind[] = ['general', 'suggestion', 'absence_reason', 'schedule_request'];
const MAX_FILES = 3;
const MAX_BYTES = 5 * 1024 * 1024;

type Picked = NewAttachment & { uri: string; size: number };

export default function ComposeScreen({ navigation }: { navigation: { goBack(): void } }) {
  const { t } = useSession();
  const [kind, setKind] = useState<StaffKind>('general');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);

  async function pick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert(t('error'), t('photoPermission'));
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], base64: true, quality: 0.8,
      allowsMultipleSelection: true, selectionLimit: MAX_FILES - files.length,
    });
    if (res.canceled) return;
    const added: Picked[] = [];
    for (const a of res.assets) {
      if (!a.base64) continue;
      const size = Math.floor((a.base64.length * 3) / 4); // bytes actually uploaded
      // With base64 + quality, the picker returns JPEG data, so name/type it as JPEG.
      const name = (a.fileName ?? `photo-${Date.now()}`).replace(/\.\w+$/, '') + '.jpg';
      if (size > MAX_BYTES) { Alert.alert(t('error'), t('tooBig', { name })); continue; }
      added.push({ name, type: 'image/jpeg', data: a.base64, uri: a.uri, size });
    }
    setFiles((f) => [...f, ...added].slice(0, MAX_FILES));
  }

  async function send() {
    if (!body.trim()) return Alert.alert(t('error'), t('bodyRequired'));
    const d = date.trim();
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return Alert.alert(t('error'), t('dateInvalid'));
    const ok = await new Promise<boolean>((r) => Alert.alert(t('send'), t('sendConfirm'), [
      { text: t('cancel'), style: 'cancel', onPress: () => r(false) },
      { text: t('send'), onPress: () => r(true) },
    ]));
    if (!ok) return;
    setBusy(true);
    try {
      await api.sendMessage({
        kind, body: body.trim(), title: title.trim() || undefined, date: d || undefined,
        attachments: files.map(({ name, type, data }) => ({ name, type, data })),
      });
      toast(t('sendDone'));
      navigation.goBack();
    } catch (e) {
      Alert.alert(t('error'), (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>{t('kind')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {KINDS.map((k) => (
            <Pressable key={k} onPress={() => setKind(k)}
              style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5,
                borderColor: C.brand, backgroundColor: kind === k ? C.brand : '#fff' }}>
              <Text style={{ color: kind === k ? '#fff' : C.brand, fontWeight: '600' }}>{kindLabel(k, t)}</Text>
            </Pressable>
          ))}
        </View>
        <Field label={t('titleOpt')} value={title} onChangeText={setTitle} autoCapitalize="sentences" />
        <Field label={t('body')} value={body} onChangeText={setBody} multiline autoCapitalize="sentences"
          style={{ minHeight: 140, textAlignVertical: 'top', paddingTop: 12 }} />
        <Field label={t('dateOpt')} value={date} onChangeText={setDate} placeholder="2026-11-19"
          keyboardType="numbers-and-punctuation" maxLength={10} />

        <Text style={s.label}>{t('attachments')}</Text>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {files.map((f, i) => (
            <View key={f.uri + i} style={{ width: 96 }}>
              <Image source={{ uri: f.uri }} style={{ width: 96, height: 96, borderRadius: 10, backgroundColor: C.line }} />
              <Text style={[s.small, { fontSize: 11 }]}>{formatSize(f.size)}</Text>
              <Pressable onPress={() => setFiles(files.filter((_, j) => j !== i))} hitSlop={6}>
                <Text style={{ color: C.danger, fontWeight: '600' }}>{t('remove')}</Text>
              </Pressable>
            </View>
          ))}
          {files.length < MAX_FILES && (
            <Pressable onPress={pick} style={{ width: 96, height: 96, borderRadius: 10, borderWidth: 1.5,
              borderColor: C.brand, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.brand, fontWeight: '700' }}>{t('addPhoto')}</Text>
            </Pressable>
          )}
        </View>

        <Text style={[s.small, { marginBottom: 14, color: C.orange }]}>{t('composeNote')}</Text>
        <Button title={t('send')} onPress={send} busy={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
