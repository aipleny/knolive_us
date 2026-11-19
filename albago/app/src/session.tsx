import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import { api, setUnauthorizedHandler, type Lang, type Store } from './api';
import { geoSupported, hasBackgroundPermission, requestGeoPermissions, startGeofence, stopGeofence } from './geofence';
import { deviceLang, makeT, type T } from './i18n';
import { DEFAULT_SERVER, getItem, setItem } from './storage';

interface Session {
  ready: boolean;
  loggedIn: boolean;
  lang: Lang;
  t: T;
  serverUrl: string;
  autoGeo: boolean;
  setLang(lang: Lang): Promise<void>;
  setServerUrl(url: string): Promise<void>;
  signIn(token: string): Promise<void>;
  signOut(callServer?: boolean): Promise<void>;
  setAutoGeo(on: boolean): Promise<void>;
  /** Called after the home screen loads: (re)registers or stops the store geofence. */
  syncGeo(store: Store): Promise<void>;
}

const Ctx = createContext<Session | null>(null);
export const useSession = () => useContext(Ctx)!;

const ask = (title: string, msg: string, yes: string, no: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, msg, [
      { text: no, style: 'cancel', onPress: () => resolve(false) },
      { text: yes, onPress: () => resolve(true) },
    ], { cancelable: false }));

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [lang, setLangState] = useState<Lang>(deviceLang());
  const [serverUrl, setServerState] = useState(DEFAULT_SERVER);
  const [autoGeo, setAutoGeoState] = useState(true);
  const t = useMemo(() => makeT(lang), [lang]);
  const store = useRef<Store | null>(null);
  const prompted = useRef(false); // explain + ask for "Always" location at most once per app run

  useEffect(() => {
    (async () => {
      const [tok, l, url, geo] = await Promise.all([
        getItem('token'), getItem('lang'), getItem('serverUrl'), getItem('autoGeo'),
      ]);
      const initial: Lang = l === 'ko' || l === 'en' ? l : deviceLang();
      if (!l) await setItem('lang', initial); // so X-Lang matches the UI from the first request
      setLangState(initial);
      if (url) setServerState(url);
      setAutoGeoState(geo !== 'off');
      setLoggedIn(!!tok);
      setReady(true);
    })();
  }, []);

  const signOut = useCallback(async (callServer = true) => {
    if (callServer) await api.logout().catch(() => null);
    await stopGeofence();
    await setItem('token', null);
    store.current = null;
    prompted.current = false;
    setLoggedIn(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { signOut(false); });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const runGeo = useCallback(async (s: Store, enabled: boolean, interactive: boolean) => {
    try {
      if (!enabled || !geoSupported(s)) return stopGeofence();
      if (!(await hasBackgroundPermission())) {
        if (!interactive) return;
        if (!(await ask(t('geoTitle'), t('geoExplain'), t('continue'), t('later')))) return;
        if (!(await requestGeoPermissions())) return Alert.alert(t('geoTitle'), t('geoDenied'));
      }
      await startGeofence(s);
    } catch (e) {
      console.warn('[geofence] setup failed', e);
    }
  }, [t]);

  const syncGeo = useCallback(async (s: Store) => {
    store.current = s;
    const interactive = !prompted.current;
    prompted.current = true;
    await runGeo(s, autoGeo, interactive);
  }, [runGeo, autoGeo]);

  const value: Session = {
    ready, loggedIn, lang, t, serverUrl, autoGeo,
    async setLang(l) {
      await setItem('lang', l);
      setLangState(l);
      if (loggedIn) api.setLang(l).catch(() => null);
    },
    async setServerUrl(url) {
      await setItem('serverUrl', url === DEFAULT_SERVER ? null : url);
      setServerState(url);
    },
    async signIn(token) {
      await setItem('token', token);
      setLoggedIn(true);
    },
    signOut,
    async setAutoGeo(on) {
      await setItem('autoGeo', on ? 'on' : 'off');
      setAutoGeoState(on);
      if (!on) await stopGeofence();
      else if (store.current) {
        if (!geoSupported(store.current)) Alert.alert(t('geoTitle'), t('geoStoreOff'));
        else await runGeo(store.current, true, true);
      }
    },
    syncGeo,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
