import { useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { api, ApiError } from '../api';
import { useSession } from '../session';
import { Button, Field, s, toast } from '../ui';

export default function PinScreen({ navigation }: { navigation: { goBack(): void } }) {
  const { t } = useSession();
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!/^\d{4,6}$/.test(pin)) return Alert.alert(t('error'), t('pinInvalid'));
    if (pin !== pin2) return Alert.alert(t('error'), t('pinMismatch'));
    setBusy(true);
    try {
      await api.setPin(pin);
      toast(t('pinSaved'));
      navigation.goBack();
    } catch (e) {
      Alert.alert(t('error'), (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const digits = (fn: (v: string) => void) => (v: string) => fn(v.replace(/\D/g, ''));
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={[s.small, { fontSize: 15, marginBottom: 20 }]}>{t('pinExplain')}</Text>
      <Field label={t('pinNew')} value={pin} onChangeText={digits(setPin)} keyboardType="number-pad"
        secureTextEntry maxLength={6} style={{ fontSize: 24, letterSpacing: 8 }} />
      <Field label={t('pinConfirm')} value={pin2} onChangeText={digits(setPin2)} keyboardType="number-pad"
        secureTextEntry maxLength={6} style={{ fontSize: 24, letterSpacing: 8 }} />
      <Button title={t('save')} onPress={save} busy={busy} style={{ marginTop: 8 }} />
    </ScrollView>
  );
}
