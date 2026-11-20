import { createNavigationContainerRef } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DocKind } from './api';

export type Params = {
  Home: undefined; Settings: undefined; Pin: undefined; Messages: undefined; Compose: undefined;
  Pay: undefined; Contracts: undefined; Notifications: undefined;
  Document: { kind: DocKind; id: string; title: string };
  Login: undefined; Signup: undefined;
};
export type ScreenProps<K extends keyof Params> = NativeStackScreenProps<Params, K>;

export const navRef = createNavigationContainerRef<Params>();

/** Screen for a notification / push kind (message, payslip, contract, schedule, shift_soon, no_out). */
export function screenForKind(kind: unknown): 'Messages' | 'Pay' | 'Contracts' | 'Home' {
  return kind === 'message' ? 'Messages' : kind === 'payslip' ? 'Pay' : kind === 'contract' ? 'Contracts' : 'Home';
}
