import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { api, ApiError, type Lang } from '../api';
import { useSession } from '../session';
import { Button, C, Field, LangSwitch, s, Text } from '../ui';

export default function SignupScreen({ navigation }: { navigation: { goBack(): void } }) {
  const { t, lang } = useSession();
  const [f, setF] = useState({ storeCode: '', name: '', phone: '', loginId: '', password: '' });
  const [myLang, setMyLang] = useState<Lang>(lang);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  async function submit() {
    const storeCode = f.storeCode.replace(/\D/g, '');
    const phone = f.phone.replace(/\D/g, '');
    if (!storeCode || !f.name.trim() || !phone || !f.loginId.trim() || !f.password) return Alert.alert(t('error'), t('fillAll'));
    if (storeCode.length !== 10) return Alert.alert(t('error'), t('storeCodeInvalid'));
    if (f.password.length < 8) return Alert.alert(t('error'), t('passwordShort'));
    setBusy(true);
    try {
      const res = await api.signup({ storeCode, name: f.name.trim(), phone, loginId: f.loginId.trim(), password: f.password, lang: myLang });
      setDone(res.message || t('pending'));
    } catch (e) {
      Alert.alert(t('error'), (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <View style={[s.screen, s.pad, { justifyContent: 'center' }]}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: C.green, marginBottom: 12, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: C.text }}>{t('signupDone')}</Text>
        <Text style={{ fontSize: 16, lineHeight: 24, marginBottom: 12 }}>{done}</Text>
        <Text style={[s.small, { marginBottom: 28 }]}>{t('pending')}</Text>
        <Button title={t('back')} onPress={() => navigation.goBack()} big />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Field label={t('storeCode')} value={f.storeCode} onChangeText={set('storeCode')} keyboardType="number-pad" maxLength={12} />
        <Field label={t('name')} value={f.name} onChangeText={set('name')} autoCapitalize="words" textContentType="name" />
        <Field label={t('phone')} value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="01012345678" />
        <Field label={t('loginId')} value={f.loginId} onChangeText={set('loginId')} textContentType="username" />
        <Field label={t('passwordHint')} value={f.password} onChangeText={set('password')} secureTextEntry textContentType="newPassword" />
        <Text style={s.label}>{t('language')}</Text>
        <LangSwitch lang={myLang} onChange={setMyLang} />
        <Button title={t('submit')} onPress={submit} busy={busy} big style={{ marginTop: 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
