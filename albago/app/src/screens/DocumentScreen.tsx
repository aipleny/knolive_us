import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { api, ApiError } from '../api';
import type { ScreenProps } from '../nav';
import { useSession } from '../session';
import { Button, C, s } from '../ui';

/** Shows a server-rendered payslip / contract HTML and lets the staff save it as PDF. */
export default function DocumentScreen({ navigation, route }: ScreenProps<'Document'>) {
  const { kind, id, title } = route.params;
  const { t } = useSession();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const load = () => {
    setError(null);
    api.documentHtml(kind, id).then(setHtml, (e: ApiError) => setError(e.message));
  };
  useEffect(load, [kind, id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function savePdf() {
    if (!html || sharing) return;
    setSharing(true);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
    } catch (e) {
      Alert.alert(t('error'), (e as Error).message);
    } finally {
      setSharing(false);
    }
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerRight: () => html ? (
        <Pressable onPress={savePdf} hitSlop={12} disabled={sharing}>
          <Text style={{ color: C.brand, fontSize: 15, fontWeight: '700', opacity: sharing ? 0.5 : 1 }}>{t('savePdf')}</Text>
        </Pressable>
      ) : null,
    });
  });

  if (error) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Text style={{ color: C.danger, fontSize: 16, marginBottom: 16, textAlign: 'center' }}>{error}</Text>
        <Button title={t('retry')} onPress={load} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }
  if (!html) {
    return <View style={[s.screen, { justifyContent: 'center' }]}><ActivityIndicator size="large" color={C.brand} /></View>;
  }
  return (
    <WebView
      style={{ flex: 1, backgroundColor: '#fff' }}
      originWhitelist={['*']}
      source={{ html }}
      javaScriptEnabled={false}
      setSupportMultipleWindows={false}
      scalesPageToFit
    />
  );
}
