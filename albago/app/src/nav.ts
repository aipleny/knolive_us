import { createNavigationContainerRef, type CompositeScreenProps, type NavigatorScreenParams } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DocKind } from './api';

export type TabParams = { Home: undefined; Schedule: undefined; Pay: undefined; Messages: undefined; More: undefined };
export type Params = {
  Main: NavigatorScreenParams<TabParams> | undefined;
  Compose: undefined; Document: { kind: DocKind; id: string; title: string };
  Notifications: undefined; Pin: undefined; Contracts: undefined; NotifPrefs: undefined;
  Login: undefined; Signup: undefined;
};
export type ScreenProps<K extends keyof Params> = NativeStackScreenProps<Params, K>;
export type TabProps<K extends keyof TabParams> =
  CompositeScreenProps<BottomTabScreenProps<TabParams, K>, NativeStackScreenProps<Params>>;

export const navRef = createNavigationContainerRef<Params>();

export type Target = keyof TabParams | 'Contracts';

/** Screen for a notification / push kind (message, payslip, contract, schedule, shift_soon, no_out). */
export function screenForKind(kind: unknown): Target {
  return kind === 'message' ? 'Messages' : kind === 'payslip' ? 'Pay' : kind === 'contract' ? 'Contracts' : 'Home';
}

type Navigate = { navigate(...args: any[]): void };
/** Opens a tab (inside Main) or a stack screen from anywhere. */
export function goTo(nav: Navigate, target: Target) {
  if (target === 'Contracts') nav.navigate('Contracts');
  else nav.navigate('Main', { screen: target });
}
