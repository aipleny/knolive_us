import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import PinScreen from './src/screens/PinScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SignupScreen from './src/screens/SignupScreen';
import { SessionProvider, useSession } from './src/session';
import { C } from './src/ui';

type Params = { Home: undefined; Settings: undefined; Pin: undefined; Login: undefined; Signup: undefined };
const Stack = createNativeStackNavigator<Params>();
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: C.brand, background: C.bg } };

function Routes() {
  const { ready, loggedIn, t } = useSession();
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

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <NavigationContainer theme={theme}>
          <StatusBar style="dark" />
          <Routes />
        </NavigationContainer>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
