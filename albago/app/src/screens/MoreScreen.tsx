import Constants from 'expo-constants';
import { Alert, ScrollView } from 'react-native';
import type { TabProps } from '../nav';
import { useSession } from '../session';
import { LangSwitch, MenuRow, s, Section } from '../ui';
import { Toggle } from './NotifPrefsScreen';

/** 더보기: portal-style menu (former Settings). */
export default function MoreScreen({ navigation }: TabProps<'More'>) {
  const { t, lang, setLang, autoGeo, setAutoGeo, signOut, serverUrl } = useSession();

  const logout = () => Alert.alert(t('logout'), t('confirmLogout'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('logout'), style: 'destructive', onPress: () => signOut() },
  ]);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Section title={t('tabMore')}>
        <MenuRow label={t('contracts')} onPress={() => navigation.navigate('Contracts')} />
        <MenuRow label={t('notifPrefs')} onPress={() => navigation.navigate('NotifPrefs')} />
        <MenuRow label={t('pinMenu')} onPress={() => navigation.navigate('Pin')} />
      </Section>
      <Section title={t('settings')}>
        <MenuRow label={t('language')} right={<LangSwitch lang={lang} onChange={setLang} />} />
        <Toggle label={t('autoGeo')} hint={t('geoOn')} value={autoGeo} onChange={setAutoGeo} />
        <MenuRow label={t('server')} value={serverUrl} />
        <MenuRow label={t('version')} value={Constants.expoConfig?.version ?? ''} />
        <MenuRow label={t('logout')} danger onPress={logout} right={null} />
      </Section>
    </ScrollView>
  );
}
