import { getItem, getServerUrl } from './storage';

export type Lang = 'ko' | 'en';
export type Status = 'off' | 'in' | 'break';
export type PunchAction = 'in' | 'out' | 'break_start' | 'break_end';

export interface Range { start: string; end: string }
export interface Shift { start: string; end: string; breaks?: Range[] }
export interface Store {
  name: string; lat: number | null; lng: number | null; radius: number;
  autoGeo: boolean; requireLocation: boolean;
}
export interface HomeData {
  store: Store;
  me: { id: string; name: string; lang: Lang; hasPin: boolean };
  status: Status;
  since: string | null;
  breakSince: string | null;
  today: { date: string; shift: Shift | null };
  shifts: { date: string; shift: Shift | null }[];
  month: { from: string; to: string; workedMin: number; gross: number; net: number; holidayPay: number };
  records: { date: string; in: string; out: string | null; breaks: { start: string; end: string | null }[] }[];
  unread?: number;
}
export type MessageKind =
  | 'notice' | 'instruction' | 'general' | 'warning' | 'discipline' | 'dismissal'
  | 'suggestion' | 'absence_reason' | 'schedule_request';
export type StaffKind = 'general' | 'suggestion' | 'absence_reason' | 'schedule_request';
export interface Attachment { id: string; name: string; type: string; size: number }
export interface Message {
  id: string; from: 'owner' | 'staff'; kind: MessageKind; title: string; body: string; date: string | null;
  createdAt: string; readAt: string | null; requiresAck: boolean; ackAt: string | null;
  attachments: Attachment[]; hash: string;
}
export interface NewAttachment { name: string; type: string; data: string }
export interface NewMessage { kind: StaffKind; title?: string; body: string; date?: string; attachments: NewAttachment[] }
export type LoginResult =
  | { ok: true; role: 'staff' | 'owner'; token: string }
  | { otp: true; otpId: string; emailMasked: string };
export interface PunchResult { ok: boolean; action: PunchAction; at: string; message: string; workedMin: number }
export interface GeoResult {
  action: 'in' | 'out' | 'exit_pending' | 'returned' | 'none';
  message: string; notify: boolean; at: string;
}
export interface Coords { lat: number; lng: number; accuracy?: number }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Called on any 401 so the app can drop back to the login screen. */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

/** Base URL + auth/lang headers, also used for authenticated image/file downloads. */
export async function endpoint(path: string) {
  const [base, token, lang] = await Promise.all([getServerUrl(), getItem('token'), getItem('lang')]);
  const headers: Record<string, string> = { 'X-Lang': lang === 'en' ? 'en' : 'ko' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return { url: base + path, headers, token, lang };
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { url, headers, token, lang } = await endpoint(path);
  headers.Accept = 'application/json';
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const payload = body === undefined ? undefined : JSON.stringify(body);
  const ctrl = new AbortController(); // longer timeout for uploads (base64 attachments)
  const timer = setTimeout(() => ctrl.abort(), payload && payload.length > 100000 ? 120000 : 15000);
  let res: Response;
  try {
    res = await fetch(url, {
      method, headers, signal: ctrl.signal, body: payload,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', lang === 'en' ? 'Cannot reach the server.' : '서버에 연결할 수 없어요.');
  } finally {
    clearTimeout(timer);
  }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(res.status, data.code || `HTTP_${res.status}`, data.message || `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  login: (storeCode: string, loginId: string, password: string) =>
    request<LoginResult>('POST', '/api/auth/login', { storeCode, loginId, password, client: 'app' }),
  signup: (b: { storeCode: string; name: string; phone: string; loginId: string; password: string; lang: Lang }) =>
    request<{ ok: boolean; pending: boolean; message: string }>('POST', '/api/auth/staff-signup', b),
  logout: () => request<unknown>('POST', '/api/auth/logout'),
  setLang: (lang: Lang) => request<unknown>('PUT', '/api/auth/lang', { lang }),
  home: () => request<HomeData>('GET', '/api/staff/home'),
  punch: (action: PunchAction, c: Coords | null) => request<PunchResult>('POST', '/api/staff/punch', { action, ...c }),
  geo: (event: 'enter' | 'exit', c: Coords | null, at: string) =>
    request<GeoResult>('POST', '/api/staff/geo', { event, ...c, at }),
  setPin: (pin: string) => request<{ ok: boolean }>('PUT', '/api/staff/pin', { pin }),
  messages: () => request<{ items: Message[]; unread: number }>('GET', '/api/staff/messages'),
  sendMessage: (m: NewMessage) => request<{ ok: boolean; id: string }>('POST', '/api/staff/messages', m),
  ack: (id: string) => request<{ ok: boolean; ackAt: string }>('POST', `/api/staff/messages/${encodeURIComponent(id)}/ack`),
  pushToken: (token: string) => request<{ ok: boolean }>('POST', '/api/staff/push-token', { token }),
  attachmentPath: (id: string) => `/api/staff/attachments/${encodeURIComponent(id)}`,
};
