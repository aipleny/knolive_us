import * as Location from 'expo-location';
import type { Coords } from './api';

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

const toCoords = (l: Location.LocationObject | null): Coords | null =>
  l ? { lat: l.coords.latitude, lng: l.coords.longitude, accuracy: l.coords.accuracy ?? undefined } : null;

/** Best-effort current position; null if permission is missing or no fix in time. */
export async function currentCoords(ask = false, timeoutMs = 8000): Promise<Coords | null> {
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted' && ask) status = (await Location.requestForegroundPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const fresh = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null),
      timeoutMs,
    );
    if (fresh) return toCoords(fresh);
    return toCoords(await Location.getLastKnownPositionAsync({ maxAge: 120000 }).catch(() => null));
  } catch {
    return null;
  }
}
