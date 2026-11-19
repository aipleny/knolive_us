import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { ensureChannel } from './geofence';

/**
 * Asks for notification permission and sends this device's Expo push token to the server.
 * Push tokens need an EAS projectId (app.json extra.eas.projectId, set by `eas init`);
 * without one we skip registration — local notifications (auto attendance) still work.
 */
export async function registerPush(): Promise<void> {
  try {
    await ensureChannel();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('[push] no EAS projectId in app config; skipping push token registration');
      return;
    }
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.pushToken(data);
  } catch (e) {
    console.warn('[push] registration failed', e); // e.g. simulator, Expo Go limits, offline
  }
}
