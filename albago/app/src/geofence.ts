// Auto attendance via OS geofencing. This module must be imported from index.ts so that
// TaskManager.defineTask runs at the top level on every JS start, including headless
// background launches triggered by a geofence event.
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { api, type Store } from './api';
import { currentCoords } from './location';
import { getItem, setItem } from './storage';

export const GEOFENCE_TASK = 'albago-geofence';
const MIN_RADIUS = 100; // OS geofencing is unreliable below ~100 m

export const BRAND = 'ALBAGO 알바고';

/** Android needs a channel before any (local or push) notification is shown. */
export async function ensureChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: BRAND, importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

export async function notify(body: string) {
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({ content: { title: BRAND, body }, trigger: null });
}

TaskManager.defineTask<{ eventType: Location.GeofencingEventType; region: Location.LocationRegion }>(
  GEOFENCE_TASK,
  async ({ data, error }) => {
    if (error || !data) return;
    const event = data.eventType === Location.GeofencingEventType.Enter ? 'enter'
      : data.eventType === Location.GeofencingEventType.Exit ? 'exit' : null;
    if (!event) return;
    const at = new Date().toISOString();
    try {
      if (!(await getItem('token')) || (await getItem('autoGeo')) === 'off') return;
      const coords = await currentCoords(false, 10000);
      const res = await api.geo(event, coords, at);
      if (res.notify && res.message) await notify(res.message);
    } catch (e) {
      console.warn('[geofence]', event, e);
    }
  },
);

export async function stopGeofence() {
  try {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) await Location.stopGeofencingAsync(GEOFENCE_TASK);
  } catch { /* task not registered */ }
  await setItem('geoRegion', null);
}

export function geoSupported(store: Store | undefined): boolean {
  return !!store?.autoGeo && store.lat != null && store.lng != null;
}

export async function hasBackgroundPermission(): Promise<boolean> {
  const [fg, bg] = await Promise.all([
    Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync(),
  ]);
  return fg.status === 'granted' && bg.status === 'granted';
}

/** Requests foreground, then background location, then notification permission. */
export async function requestGeoPermissions(): Promise<boolean> {
  if ((await Location.requestForegroundPermissionsAsync()).status !== 'granted') return false;
  if ((await Location.requestBackgroundPermissionsAsync()).status !== 'granted') return false;
  await Notifications.requestPermissionsAsync().catch(() => null);
  return true;
}

/**
 * Registers (or re-registers, if the store location changed) the store geofence.
 * Assumes permissions are already granted; returns false otherwise.
 */
export async function startGeofence(store: Store): Promise<boolean> {
  if (!geoSupported(store) || !(await hasBackgroundPermission())) return false;
  const region: Location.LocationRegion = {
    identifier: 'store',
    latitude: store.lat!,
    longitude: store.lng!,
    radius: Math.max(store.radius || 0, MIN_RADIUS),
    notifyOnEnter: true,
    notifyOnExit: true,
  };
  const key = JSON.stringify([region.latitude, region.longitude, region.radius]);
  const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
  if (started && (await getItem('geoRegion')) === key) return true;
  await Location.startGeofencingAsync(GEOFENCE_TASK, [region]); // replaces previous regions
  await setItem('geoRegion', key);
  return true;
}
