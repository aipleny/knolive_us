import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from './src/api';
import { HomeProvider, useHome } from './src/home';
import type { TKey } from './src/i18n';
import { goTo, navRef, screenForKind, type Params, type TabParams } from './src/nav';
import ComposeScreen from './src/screens/ComposeScreen';
import ContractsScreen from './src/screens/ContractsScreen';
import DocumentScreen from './src/screens/DocumentScreen';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import MessagesScreen from './src/screens/MessagesScreen';
import MoreScreen from './src/screens/MoreScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import NotifPrefsScreen from './src/screens/NotifPrefsScreen';
import PayScreen from './src/screens/PayScreen';
import PinScreen from './src/screens/PinScreen';
import ScheduleScreen from './src/screens/ScheduleScreen';
import SignupScreen from './src/screens/SignupScreen';
import { SessionProvider, useSession } from './src/session';
import { Badge, C, font, FONTS, Icon, Text, type IconName } from './src/ui';

SplashScreen.preventAutoHideAsync().catch(() => null); // keep splash until fonts + session are ready

const Stack = createNativeStackNavigator<Params>();
const Tab = createBottomTabNavigator<TabParams>();
const f = (fontFamily: string) => ({ fontFamily, fontWeight: 'normal' as const });
const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: C.brand, background: C.bg, card: '#fff', text: C.text, border: C.line },
  fonts: { regular: f(font(400)), medium: f(font(500)), bold: f(font(700)), heavy: f(font(800)) },
};

/** 56px portal header: ALBAGO wordmark + store name, bell with unread badge. */
function AppHeader() {
  const insets = useSafeAreaInsets();
  const { t } = useSession();
  const { data } = useHome();
  const n = data?.notifUnread ?? 0;
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.line }}>
      <View style={{ height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 }}>
          <Text style={{ fontSize: 19, fontWeight: '900', letterSpacing: -0.6, color: C.brand }}>ALBAGO</Text>
          <Text style={{ fontSize: 13, color: C.sub, flexShrink: 1 }} numberOfLines={1}>{data?.store.name ?? ''}</Text>
        </View>
        <Pressable onPress={() => navRef.navigate('Notifications')} accessibilityRole="button"
          accessibilityLabel={`${t('notifications')} ${n}`}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}>
          <Icon name="bell" />
          <Badge n={n} style={{ position: 'absolute', top: 8, right: 8 }} />
        </Pressable>
      </View>
    </View>
  );
}

function MainTabs() {
  const { t } = useSession();
  const { data, refresh } = useHome();
  const insets = useSafeAreaInsets();
  const tabOptions = (icon: IconName, label: TKey) => ({
    tabBarIcon: ({ color }: { color: string }) => <Icon name={icon} color={color} />,
    tabBarLabel: ({ color, focused }: { color: string; focused: boolean }) => (
      <Text style={{ color, fontSize: 11, fontWeight: focused ? '700' : '400', marginTop: 3 }}>{t(label)}</Text>
    ),
  });
  return (
    <Tab.Navigator
      screenListeners={{ focus: () => { refresh(false); } }}
      screenOptions={{
        header: () => <AppHeader />,
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: C.sub,
        tabBarStyle: { height: 64 + insets.bottom, paddingBottom: insets.bottom, borderTopColor: C.line,
          borderTopWidth: 1, elevation: 0, shadowOpacity: 0, backgroundColor: '#fff' },
        tabBarItemStyle: { paddingTop: 8 },
      }}>
      <Tab.Screen name="Home" component={HomeScreen} options={tabOptions('home', 'tabHome')} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} options={tabOptions('calendar', 'tabSchedule')} />
      <Tab.Screen name="Pay" component={PayScreen} options={tabOptions('wallet', 'tabPay')} />
      <Tab.Screen name="Messages" component={MessagesScreen} options={{
        ...tabOptions('chat', 'tabMessages'),
        tabBarBadge: data?.unread ? (data.unread > 99 ? '99+' : data.unread) : undefined,
        tabBarBadgeStyle: { backgroundColor: C.danger, fontFamily: font(700), fontSize: 10 },
      }} />
      <Tab.Screen name="More" component={MoreScreen} options={tabOptions('menu', 'tabMore')} />
    </Tab.Navigator>
  );
}

function Routes() {
  const { ready, loggedIn, t } = useSession();
  usePushTapNavigation(ready && loggedIn);
  if (!ready) return null; // splash is still visible
  const stackOpts = {
    headerTintColor: C.text,
    headerTitleStyle: { fontFamily: font(700), fontSize: 17, color: C.text },
    headerBackTitle: t('back'),
    headerBackTitleStyle: { fontFamily: font(400) },
    headerShadowVisible: true,
    contentStyle: { backgroundColor: C.bg },
  };
  if (!loggedIn) {
    return (
      <Stack.Navigator screenOptions={stackOpts}>
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Signup" component={SignupScreen} options={{ title: t('signupTitle') }} />
      </Stack.Navigator>
    );
  }
  return (
    <HomeProvider>
      <Stack.Navigator screenOptions={stackOpts}>
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="Compose" component={ComposeScreen} options={{ title: t('compose') }} />
        <Stack.Screen name="Document" component={DocumentScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: t('notifications') }} />
        <Stack.Screen name="Pin" component={PinScreen} options={{ title: t('pinTitle') }} />
        <Stack.Screen name="Contracts" component={ContractsScreen} options={{ title: t('contracts') }} />
        <Stack.Screen name="NotifPrefs" component={NotifPrefsScreen} options={{ title: t('notifPrefs') }} />
      </Stack.Navigator>
    </HomeProvider>
  );
}

/**
 * Tapping a push (also on cold start) opens the screen for its data.type
 * (message→소통, payslip→급여, contract→계약서, others→홈) and marks data.notificationId read.
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
      goTo(navRef, screenForKind(data.type));
    };
    go();
  }, [active, last]);
}

function Root() {
  const { ready } = useSession();
  const [fontsLoaded, fontError] = useFonts(FONTS);
  const done = ready && (fontsLoaded || !!fontError);
  useEffect(() => { if (done) SplashScreen.hideAsync().catch(() => null); }, [done]);
  if (!done) return null;
  return (
    <NavigationContainer ref={navRef} theme={theme}>
      <StatusBar style="dark" />
      <Routes />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Root />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
