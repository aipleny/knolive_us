import { getLocales } from 'expo-localization';
import type { Lang } from './api';

const ko = {
  appName: '알바고',
  storeCode: '매장코드 (사업자번호 10자리)',
  loginId: '아이디',
  password: '비밀번호',
  login: '로그인',
  signup: '알바 회원가입',
  signupTitle: '알바 회원가입',
  signupDone: '가입 신청 완료',
  name: '이름',
  phone: '휴대폰 번호',
  passwordHint: '비밀번호 (8자 이상)',
  language: '언어',
  submit: '가입 신청',
  back: '돌아가기',
  serverSettings: '서버 설정',
  serverAddress: '서버 주소',
  serverHint: '매장 테스트용 예: http://192.168.0.10:8080',
  save: '저장',
  reset: '기본값',
  invalidServer: '서버 주소가 올바르지 않아요.',
  saved: '저장했어요.',
  ownerTitle: '사장님 계정이에요',
  ownerMsg: '이 앱은 알바(직원)용이에요. 사장님은 웹(albago.kr)에서 로그인해 주세요.',
  pending: '사장님 승인 대기 중이에요. 승인 후 로그인할 수 있어요.',
  fillAll: '모든 항목을 입력해 주세요.',
  storeCodeInvalid: '매장코드는 숫자 10자리예요.',
  passwordShort: '비밀번호는 8자 이상이어야 해요.',
  error: '오류',
  ok: '확인',
  cancel: '취소',
  later: '나중에',
  continue: '계속',
  // home
  statusOff: '퇴근 상태',
  statusIn: '근무 중 · {t} 출근',
  statusBreak: '휴식 중 · {t}부터',
  todayShift: '오늘 근무',
  noShift: '근무 없음',
  breakLabel: '휴식',
  clockIn: '출근',
  breakStart: '휴식 시작',
  breakEnd: '휴식 끝',
  clockOut: '퇴근',
  confirmOut: '퇴근할까요?',
  next14: '앞으로 14일 근무',
  thisMonth: '이번 달',
  worked: '근무 시간',
  hours: '{h}시간 {m}분',
  gross: '예상 급여(세전)',
  net: '예상 실수령',
  holidayPay: '주휴수당',
  records: '이번 달 기록',
  noRecords: '기록이 없어요.',
  working: '근무 중',
  won: '{n}원',
  settings: '설정',
  loading: '불러오는 중…',
  retry: '다시 시도',
  // geofence
  geoTitle: '자동 출퇴근',
  geoExplain:
    '매장에 도착하면 자동으로 출근, 떠나면 퇴근을 기록하려면 위치 권한이 "항상 허용"이어야 해요.\n\n매장 주변에 들어오고 나가는 것만 확인하며 이동 경로는 저장하지 않아요. 설정에서 언제든 끌 수 있어요.',
  geoDenied: '위치 권한이 "항상 허용"이 아니라 자동 출퇴근이 동작하지 않아요. 휴대폰 설정에서 바꿀 수 있어요.',
  geoOn: '매장 반경에 들어오면 출근, 나가면 퇴근을 자동으로 기록해요.',
  geoStoreOff: '매장에서 자동 출퇴근을 사용하지 않아요.',
  // settings
  autoGeo: '자동 출퇴근',
  pin: '출퇴근 PIN 설정',
  pinTitle: '출퇴근 PIN',
  pinExplain: '매장에 있는 공용 출퇴근 기기에서 쓰는 숫자 4~6자리예요.',
  pinNew: '새 PIN',
  pinConfirm: 'PIN 확인',
  pinInvalid: 'PIN은 숫자 4~6자리예요.',
  pinMismatch: 'PIN이 서로 달라요.',
  pinSaved: 'PIN을 저장했어요.',
  logout: '로그아웃',
  confirmLogout: '로그아웃할까요?',
  server: '서버',
  version: '버전',
};
type Dict = typeof ko;

const en: Dict = {
  appName: 'Albago',
  storeCode: 'Store code (10-digit business no.)',
  loginId: 'ID',
  password: 'Password',
  login: 'Log in',
  signup: 'Staff sign-up',
  signupTitle: 'Staff sign-up',
  signupDone: 'Request sent',
  name: 'Name',
  phone: 'Mobile number',
  passwordHint: 'Password (8+ characters)',
  language: 'Language',
  submit: 'Sign up',
  back: 'Back',
  serverSettings: 'Server settings',
  serverAddress: 'Server address',
  serverHint: 'For in-store testing, e.g. http://192.168.0.10:8080',
  save: 'Save',
  reset: 'Default',
  invalidServer: 'Invalid server address.',
  saved: 'Saved.',
  ownerTitle: 'This is an owner account',
  ownerMsg: 'This app is for staff. Owners, please log in on the web (albago.kr).',
  pending: 'Waiting for the owner’s approval. You can log in once approved.',
  fillAll: 'Please fill in all fields.',
  storeCodeInvalid: 'Store code must be 10 digits.',
  passwordShort: 'Password must be at least 8 characters.',
  error: 'Error',
  ok: 'OK',
  cancel: 'Cancel',
  later: 'Later',
  continue: 'Continue',
  statusOff: 'Off duty',
  statusIn: 'Working · since {t}',
  statusBreak: 'On break · since {t}',
  todayShift: 'Today’s shift',
  noShift: 'No shift',
  breakLabel: 'Break',
  clockIn: 'Clock in',
  breakStart: 'Start break',
  breakEnd: 'End break',
  clockOut: 'Clock out',
  confirmOut: 'Clock out now?',
  next14: 'Next 14 days',
  thisMonth: 'This month',
  worked: 'Worked',
  hours: '{h}h {m}m',
  gross: 'Est. pay (gross)',
  net: 'Est. take-home',
  holidayPay: 'Weekly holiday pay',
  records: 'This month’s records',
  noRecords: 'No records yet.',
  working: 'working',
  won: '₩{n}',
  settings: 'Settings',
  loading: 'Loading…',
  retry: 'Retry',
  geoTitle: 'Auto attendance',
  geoExplain:
    'To clock you in when you arrive at the store and out when you leave, Albago needs location access set to "Allow all the time".\n\nOnly entering/leaving the store area is checked; your route is not stored. You can turn this off anytime in Settings.',
  geoDenied: 'Location is not set to "Allow all the time", so auto attendance will not work. You can change it in your phone settings.',
  geoOn: 'You will be clocked in when you enter the store area and out when you leave.',
  geoStoreOff: 'Your store does not use auto attendance.',
  autoGeo: 'Auto attendance',
  pin: 'Set check-in PIN',
  pinTitle: 'Check-in PIN',
  pinExplain: 'A 4–6 digit number for the shared check-in device at the store.',
  pinNew: 'New PIN',
  pinConfirm: 'Confirm PIN',
  pinInvalid: 'PIN must be 4–6 digits.',
  pinMismatch: 'PINs do not match.',
  pinSaved: 'PIN saved.',
  logout: 'Log out',
  confirmLogout: 'Log out?',
  server: 'Server',
  version: 'Version',
};

export type TKey = keyof Dict;
export type T = (key: TKey, vars?: Record<string, string | number>) => string;

export const dicts: Record<Lang, Dict> = { ko, en };

export function deviceLang(): Lang {
  return getLocales()[0]?.languageCode === 'ko' ? 'ko' : 'en';
}

export function makeT(lang: Lang): T {
  return (key, vars) =>
    dicts[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''));
}

// ---- formatting (server times are UTC ISO; display in KST, UTC+9, no DST) ----
const KST = 9 * 3600 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

export function hhmm(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + KST);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const WD = { ko: ['일', '월', '화', '수', '목', '금', '토'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
export function dayLabel(date: string, lang: Lang): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${WD[lang][d.getUTCDay()]})`;
}

export function money(n: number, t: T): string {
  return t('won', { n: Math.round(n).toLocaleString('en-US') });
}

export function duration(min: number, t: T): string {
  return t('hours', { h: Math.floor(min / 60), m: min % 60 });
}
