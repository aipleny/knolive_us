import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { api, ApiError } from '../api';
import { useSession } from '../session';
import { normalizeServerUrl } from '../storage';
import { Button, C, Field, LangSwitch, s, toast } from '../ui';

export default function LoginScreen({ navigation }: { navigation: { navigate(name: 'Signup'): void } }) {
  const { t, lang, setLang, serverUrl, setServerUrl, signIn } = useSession();
  const [storeCode, setStoreCode] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(serverUrl);

  async function login() {
    const code = storeCode.replace(/\D/g, '');
    if (!code || !loginId.trim() || !password) return Alert.alert(t('error'), t('fillAll'));
    if (code.length !== 10) return Alert.alert(t('error'), t('storeCodeInvalid'));
    setBusy(true);
    try {
      const res = await api.login(code, loginId.trim(), password);
      if ('otp' in res && res.otp) return Alert.alert(t('ownerTitle'), t('ownerMsg'));
      if ('token' in res && res.role === 'staff') return await signIn(res.token);
      Alert.alert(t('ownerTitle'), t('ownerMsg'));
    } catch (e) {
      const err = e as ApiError;
      Alert.alert(t('error'), err.code === 'STAFF_PENDING' ? err.message || t('pending') : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveServer(value: string) {
    const url = normalizeServerUrl(value);
    if (!url) return Alert.alert(t('error'), t('invalidServer'));
    await setServerUrl(url);
    setServer(url);
    toast(t('saved'));
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[s.pad, { paddingTop: 72 }]} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'flex-end' }}><LangSwitch lang={lang} onChange={setLang} /></View>
        <Text style={{ fontSize: 40, fontWeight: '800', color: C.brand, marginTop: 24 }}>{t('appName')}</Text>
        <Text style={[s.small, { marginBottom: 28, fontSize: 15 }]}>
          {lang === 'ko' ? '알바 출퇴근을 간편하게' : 'Simple staff attendance'}
        </Text>

        <Field label={t('storeCode')} value={storeCode} onChangeText={setStoreCode}
          keyboardType="number-pad" maxLength={12} placeholder="1234567890" />
        <Field label={t('loginId')} value={loginId} onChangeText={setLoginId} textContentType="username" />
        <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry
          textContentType="password" onSubmitEditing={login} returnKeyType="go" />
        <Button title={t('login')} onPress={login} busy={busy} style={{ marginTop: 6 }} />
        <Button title={t('signup')} onPress={() => navigation.navigate('Signup')} outline style={{ marginTop: 12 }} />

        <Pressable onPress={() => setShowServer(!showServer)} hitSlop={10} style={{ marginTop: 32 }}>
          <Text style={[s.small, { textAlign: 'center', textDecorationLine: 'underline' }]}>⚙ {t('serverSettings')}</Text>
        </Pressable>
        {showServer && (
          <View style={{ marginTop: 12 }}>
            <Field label={t('serverAddress')} value={server} onChangeText={setServer}
              keyboardType="url" placeholder="https://albago.kr" />
            <Text style={[s.small, { marginTop: -8, marginBottom: 12 }]}>{t('serverHint')}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title={t('reset')} outline onPress={() => saveServer('')} style={{ flex: 1 }} />
              <Button title={t('save')} onPress={() => saveServer(server)} style={{ flex: 1 }} />
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
