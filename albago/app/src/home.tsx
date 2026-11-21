// Shared GET /api/staff/home state for the tabs (header store name + bell badge, 소통 tab badge,
// Home and 근무표 tabs). Refreshed on login, app foreground, tab focus and after punches.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api, ApiError, type HomeData } from './api';
import { useSession } from './session';

interface HomeState {
  data: HomeData | null;
  error: string | null;
  /** force=false skips the call if the last refresh was under 2s ago (tab focus storms). */
  refresh(force?: boolean): Promise<void>;
}

const Ctx = createContext<HomeState | null>(null);
export const useHome = () => useContext(Ctx)!;

export function HomeProvider({ children }: { children: ReactNode }) {
  const { lang, syncGeo } = useSession();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef(0);

  const refresh = useCallback(async (force = true) => {
    if (!force && Date.now() - last.current < 2000) return;
    last.current = Date.now();
    try {
      const d = await api.home();
      setData(d);
      setError(null);
      syncGeo(d.store);
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, [syncGeo]);

  useEffect(() => { refresh(); }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);

  return <Ctx.Provider value={{ data, error, refresh }}>{children}</Ctx.Provider>;
}
