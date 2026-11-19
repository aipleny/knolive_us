import { createNavigationContainerRef, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ComposeScreen from './src/screens/ComposeScreen';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import MessagesScreen from './src/screens/MessagesScreen';
import PinScreen from './src/screens/PinScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SignupScreen from './src/screens/SignupScreen';
import { SessionProvider, useSession } from './src/session';
import { C } from './src/ui';

type Params = {
  Home: undefined; Settings: undefined; Pin: undefined; Messages: undefined; Compose: undefined;
  Login: undefined; Signup: undefined;
};
const Stack = createNativeStackNavigator<Params>();
const navRef = createNavigationContainerRef<Params>();
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: C.brand, background: C.bg } };

function Routes() {
  const { ready, loggedIn, t } = useSession();
  usePushTapToMessages(ready && loggedIn);
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

/** Opening a push with data.type === "message" (also on cold start) goes to the Messages screen. */
function usePushTapToMessages(active: boolean) {
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !last || last.notification.request.content.data?.type !== 'message') return;
    const id = last.notification.request.identifier;
    if (handled.current === id) return;
    const go = () => {
      if (!navRef.isReady()) return setTimeout(go, 100);
      handled.current = id;
      navRef.navigate('Messages');
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
