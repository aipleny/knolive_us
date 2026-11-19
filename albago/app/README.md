# 알바고 직원 앱 (Expo)

알바(직원)용 출퇴근 앱입니다. 사장님은 웹(albago.kr)을 사용합니다.
서버 규격은 `../API.md` 를 따릅니다.

- Expo SDK 58 · TypeScript · React Navigation (native-stack)
- 위치 `expo-location` · 백그라운드 작업 `expo-task-manager` · 알림 `expo-notifications`
- 토큰/설정 저장 `expo-secure-store` · 언어 감지 `expo-localization`

## 폴더 구조

```
index.ts            진입점 (지오펜스 작업 정의 import, 알림 핸들러)
App.tsx             화면 이동 (로그인 전: 로그인/가입, 로그인 후: 홈/설정/PIN)
src/api.ts          서버 API (Bearer 토큰, X-Lang 헤더, 401 → 로그아웃)
src/storage.ts      SecureStore 저장 (token, serverUrl, lang, autoGeo, geoRegion)
src/geofence.ts     자동 출퇴근: TaskManager 작업 + 지오펜스 등록/해제
src/location.ts     현재 위치 (출퇴근 버튼·지오펜스 공용)
src/session.tsx     로그인 상태, 언어, 서버 주소, 자동 출퇴근 설정
src/i18n.ts         한국어/영어 문구, KST 시각 표시
src/ui.tsx          버튼·입력칸·카드, 색상
src/screens/        Login, Signup, Home, Settings, Pin
```

## 실행

```bash
cd app
npm install
npx expo start
```

### Expo Go 로 빠르게 보기
휴대폰에 Expo Go 설치 → `npx expo start` 의 QR 코드 스캔.
로그인, 출퇴근 버튼, 근무표, PIN 설정, 언어 변경은 Expo Go 에서 확인할 수 있습니다.

> **백그라운드 지오펜스(자동 출퇴근)는 Expo Go 에서 동작하지 않습니다.**
> "항상 허용" 위치 권한과 백그라운드 작업은 앱 자체 설정(app.json)이 들어간 개발 빌드가 필요합니다.

### 개발 빌드 (자동 출퇴근 테스트용)
```bash
npm i -g eas-cli
eas login
eas build --profile development --platform android   # 또는 ios
# 설치 후
npx expo start --dev-client
```
Android 는 USB 연결 후 `npx expo run:android` 로 로컬 빌드도 가능합니다(Android SDK 필요).

### 매장 Wi-Fi 의 테스트 서버에 붙기
로그인 화면 아래 **⚙ 서버 설정** → 서버 주소에 `http://192.168.0.10:8080` 입력 → 저장.
(기본값 `https://albago.kr`, 값은 기기에 저장됩니다. "기본값" 버튼으로 되돌립니다.)

- `http://` 주소는 개발 빌드(디버그)와 Expo Go 에서는 됩니다.
  Android 릴리스 빌드는 기본적으로 http 를 막으므로, 릴리스 APK 로 http 서버를 테스트하려면
  `expo-build-properties` 로 `android.usesCleartextTraffic: true` 를 켜야 합니다(운영 빌드에는 넣지 마세요).
- iOS 는 `NSAllowsLocalNetworking` 이 켜져 있습니다.

## 자동 출퇴근 동작
1. 로그인 후 홈을 불러오면 `store.autoGeo` 가 켜져 있고 매장 좌표가 있을 때,
   이유를 먼저 설명한 뒤 위치 권한(앱 사용 중 → 항상 허용)과 알림 권한을 요청합니다.
2. 매장 좌표 중심, 반경 `max(store.radius, 100m)` 로 지오펜스를 등록합니다
   (100m 미만은 OS 지오펜스가 불안정합니다). 매장 좌표/반경이 바뀌면 다시 등록합니다.
3. 들어오거나 나가면 백그라운드 작업이 `POST /api/staff/geo` 를 호출하고,
   응답 `notify: true` 이면 `message` 로 로컬 알림("알바고")을 띄웁니다.
4. 설정 > 자동 출퇴근 끄기 또는 로그아웃 시 지오펜스를 해제합니다.

참고: OS 지오펜스는 수 분 늦게 오거나 실내에서 놓칠 수 있습니다. 출퇴근 버튼이 항상 기본 수단입니다.

## 스토어 빌드·제출 (EAS)

```bash
eas build --profile production --platform android   # .aab
eas build --profile production --platform ios
eas submit --platform android
eas submit --platform ios
```
번들 ID / 패키지명: `kr.albago.app`. 버전 번호는 EAS 원격 버전 관리(`autoIncrement`)로 올라갑니다.

### Google Play – 백그라운드 위치 신고
`ACCESS_BACKGROUND_LOCATION` 을 쓰므로 Play Console 에서 **앱 콘텐츠 > 민감한 권한 > 위치 권한** 신고가 필요합니다.
- 핵심 기능 설명 예: "직원이 매장 반경에 들어오거나 나갈 때 앱을 열지 않아도 출근·퇴근을 기록하는 자동 출퇴근 기능".
- 앱 안의 사전 안내(권한 요청 전 설명 대화상자) 화면과 동작 영상(30초 이내, 유튜브 링크)이 필요합니다:
  설명 대화상자 → 권한 "항상 허용" → 매장 도착 시 출근 알림이 보이도록 촬영하세요.
- 개인정보처리방침에 위치 정보 수집 목적(출퇴근 기록)과 보관 방식을 적어야 합니다.
- 이 앱은 지오펜스만 쓰므로 포그라운드 서비스(FOREGROUND_SERVICE_LOCATION)는 끄고 있습니다.

### Apple App Store – "항상" 위치 사용 사유
- `Info.plist` 문구(`NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`)는 app.json 에 한/영으로 들어 있습니다.
- 심사 메모(App Review Notes)에 다음을 적으세요: 백그라운드 위치는 매장 지오펜스 출입(자동 출퇴근)에만 쓰고,
  이동 경로는 저장하지 않으며, 설정에서 끌 수 있음. 테스트용 매장코드/직원 계정과 매장 좌표를 함께 제공하세요.
- `UIBackgroundModes: location` 사용 사유를 묻는 경우가 있으니 위 설명과 동일하게 답합니다.
- 직원 전용 앱이라 심사용 데모 계정이 반드시 필요합니다(승인 완료된 직원 계정).
