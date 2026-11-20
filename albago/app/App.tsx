import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api } from './src/api';
import { navRef, screenForKind, type Params } from './src/nav';
import ComposeScreen from './src/screens/ComposeScreen';
import ContractsScreen from './src/screens/ContractsScreen';
import DocumentScreen from './src/screens/DocumentScreen';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import MessagesScreen from './src/screens/MessagesScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import PayScreen from './src/screens/PayScreen';
import PinScreen from './src/screens/PinScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SignupScreen from './src/screens/SignupScreen';
import { SessionProvider, useSession } from './src/session';
import { C } from './src/ui';

const Stack = createNativeStackNavigator<Params>();
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: C.brand, background: C.bg } };

function Routes() {
  const { ready, loggedIn, t } = useSession();
  usePushTapNavigation(ready && loggedIn);
  if (!ready) {
    return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: C.bg }}><ActivityIndicator color={C.brand} /></View>;
  }
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: C.brand, headerTitleStyle: { color: C.text }, headerBackTitle: t('back') }}>
      {loggedIn ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('settings') }} />
          <Stack.Screen name="Pin" component={PinScreen} options={{ title: t('pinTitle') }} />
          <Stack.Screen name="Messages" component={MessagesScreen} options={{ title: t('messages') }} />
          <Stack.Screen name="Compose" component={ComposeScreen} options={{ title: t('compose') }} />
          <Stack.Screen name="Pay" component={PayScreen} options={{ title: t('myPay') }} />
          <Stack.Screen name="Contracts" component={ContractsScreen} options={{ title: t('contracts') }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: t('notifications') }} />
          <Stack.Screen name="Document" component={DocumentScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Signup" component={SignupScreen} options={{ title: t('signupTitle') }} />
        </>
      )}
    </Stack.Navigator>
  );
}

/**
 * Tapping a push (also on cold start) opens the screen for its data.type
 * (message→Messages, payslip→Pay, contract→Contracts, others→Home) and marks data.notificationId read.
 */
function usePushTapNavigation(active: boolean) {
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !last) return;
    const data = (last.notification.request.content.data ?? {}) as { type?: unknown; notificationId?: unknown };
    if (!data.type) return; // e.g. local auto-attendance notifications
    const id = last.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    if (typeof data.notificationId === 'string') api.markRead([data.notificationId]).catch(() => null);
    const go = () => {
      if (!navRef.isReady()) return setTimeout(go, 100);
      navRef.navigate(screenForKind(data.type));
    };
    go();
  }, [active, last]);
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <NavigationContainer ref={navRef} theme={theme}>
          <StatusBar style="dark" />
          <Routes />
        </NavigationContainer>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
