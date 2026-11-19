import * as SecureStore from 'expo-secure-store';

// SecureStore is used for every small value (token, server URL, settings) so the
// background geofence task can read them too. AFTER_FIRST_UNLOCK lets iOS read the
// keychain while the phone is locked (a geofence event usually arrives then).
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export const DEFAULT_SERVER = 'https://albago.kr';

export type Key = 'token' | 'serverUrl' | 'lang' | 'autoGeo' | 'geoRegion';

export async function getItem(key: Key): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, OPTS);
  } catch {
    return null;
  }
}

export async function setItem(key: Key, value: string | null): Promise<void> {
  if (value == null) await SecureStore.deleteItemAsync(key, OPTS);
  else await SecureStore.setItemAsync(key, value, OPTS);
}

export async function getServerUrl(): Promise<string> {
  return (await getItem('serverUrl')) || DEFAULT_SERVER;
}

/** "192.168.0.10:8080/" -> "http://192.168.0.10:8080", returns null if invalid. */
export function normalizeServerUrl(input: string): string | null {
  let s = input.trim().replace(/\/+$/, '');
  if (!s) return DEFAULT_SERVER;
  if (!/^https?:\/\//i.test(s)) s = (/^[\d.]+(:\d+)?$/.test(s) ? 'http://' : 'https://') + s;
  return /^https?:\/\/[^\s/]+(\/[^\s]*)?$/i.test(s) ? s : null;
}
