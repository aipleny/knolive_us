import Constants from 'expo-constants';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { useSession } from '../session';
import { Button, C, Card, LangSwitch, Row, s } from '../ui';

export default function SettingsScreen({ navigation }: { navigation: { navigate(name: 'Pin'): void } }) {
  const { t, lang, setLang, autoGeo, setAutoGeo, signOut, serverUrl } = useSession();

  const logout = () => Alert.alert(t('logout'), t('confirmLogout'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('logout'), style: 'destructive', onPress: () => signOut() },
  ]);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Card title={t('language')}>
        <LangSwitch lang={lang} onChange={setLang} />
      </Card>
      <Card title={t('autoGeo')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
          <Text style={{ fontSize: 17, color: C.text, fontWeight: '600' }}>{t('autoGeo')}</Text>
          <Switch value={autoGeo} onValueChange={setAutoGeo} trackColor={{ true: C.brand }} />
        </View>
        <Text style={[s.small, { marginTop: 6 }]}>{t('geoOn')}</Text>
      </Card>
      <Button title={t('pin')} outline onPress={() => navigation.navigate('Pin')} style={{ marginBottom: 14 }} />
      <Card>
        <Row left={t('server')} right={serverUrl} />
        <Row left={t('version')} right={Constants.expoConfig?.version ?? ''} />
      </Card>
      <Button title={t('logout')} color={C.danger} onPress={logout} />
    </ScrollView>
  );
}
