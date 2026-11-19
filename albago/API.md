# 알바고 API (앱 ↔ 서버 규격)

Base URL: `https://albago.kr` (개발: `http://<PC IP>:8080`). JSON 요청/응답.

## 공통
- 언어: 요청 헤더 `X-Lang: ko | en`. 서버 메시지(`message`)가 그 언어로 옵니다.
- 인증: 앱은 `Authorization: Bearer <token>` (웹은 쿠키).
- 오류: HTTP 4xx/5xx + `{ "code": "PIN_WRONG", "message": "현지화된 문장" }`. 401이면 다시 로그인.
- 시각: ISO 8601(UTC). 날짜 `YYYY-MM-DD`, 시각 `HH:MM` 은 한국 시간(KST).

## 알바(직원) 가입·로그인
`POST /api/auth/staff-signup`
```json
{ "storeCode": "1234567890", "name": "김민지", "phone": "01011112222", "loginId": "minji", "password": "8자이상", "lang": "ko" }
```
→ `{ "ok": true, "pending": true, "message": "..." }` 사장님 승인 후 로그인 가능.

`POST /api/auth/login`
```json
{ "storeCode": "1234567890", "loginId": "minji", "password": "...", "client": "app" }
```
→ 직원: `{ "ok": true, "role": "staff", "token": "..." }`
→ 사장님: `{ "otp": true, "otpId": "...", "emailMasked": "a***@gmail.com" }` 다음 `POST /api/auth/otp {otpId, code, client:"app"}` → `{ ok, role:"owner", token }`
→ 승인 대기: 403 `code: "STAFF_PENDING"`

`POST /api/auth/logout`, `PUT /api/auth/lang { "lang": "en" }`

## 직원 홈
`GET /api/staff/home` →
```json
{
  "store": { "name": "행복카페", "lat": 37.5, "lng": 127.0, "radius": 100, "autoGeo": true, "requireLocation": true },
  "me": { "id": "...", "name": "김민지", "lang": "ko", "hasPin": true },
  "status": "off | in | break",
  "since": "ISO 출근 시각 | null",
  "breakSince": "ISO 휴식 시작 | null",
  "today": { "date": "2026-11-19", "shift": { "start": "10:00", "end": "19:00", "breaks": [{ "start": "15:00", "end": "16:00" }] } },
  "shifts": [ { "date": "2026-11-19", "shift": null } ],
  "month": { "from": "2026-11-01", "to": "2026-11-30", "workedMin": 1200, "gross": 250000, "net": 240000, "holidayPay": 40000 },
  "records": [ { "date": "2026-11-19", "in": "ISO", "out": "ISO|null", "breaks": [ { "start": "ISO", "end": "ISO|null" } ] } ]
}
```

## 출퇴근 버튼
`POST /api/staff/punch`
```json
{ "action": "in | out | break_start | break_end", "lat": 37.5, "lng": 127.0, "accuracy": 15 }
```
→ `{ "ok": true, "action": "in", "at": "ISO", "message": "출근했어요 (09:58)", "workedMin": 0 }`
매장이 위치 확인을 켰으면(`requireLocation`) 좌표가 반경 밖일 때 403 `OUT_OF_RANGE`.

## 자동 출퇴근 (지오펜스)
앱이 매장 반경(store.lat/lng/radius)에 들어오거나 나갈 때 호출합니다. 백그라운드 작업에서 호출해도 됩니다.
`POST /api/staff/geo`
```json
{ "event": "enter | exit", "lat": 37.5, "lng": 127.0, "accuracy": 20, "at": "이벤트 발생 ISO (선택)" }
```
→ `{ "action": "in | out | exit_pending | returned | none", "message": "현지화 문장", "notify": true, "at": "ISO" }`
`notify` 가 true면 앱은 `message` 로 로컬 알림을 띄웁니다.

서버 규칙:
- enter: 근무 중이 아니고, 오늘 근무가 있고, 지금이 시작 30분 전부터 종료 전까지면 자동 출근합니다(`in`). 근무가 없는 날이면 `none` + 안내 문장을 보냅니다.
- exit: 근무 중이고 종료 10분 전 이후면 자동 퇴근(`out`)합니다. 근무 시간 중간이면 `exit_pending` 으로 두고, 15분(매장 설정) 안에 돌아오지 않으면 서버가 나간 시각으로 퇴근 처리합니다. 돌아오면 `returned` 입니다.

## PIN (매장 출퇴근 기록부용)
`PUT /api/staff/pin { "pin": "1234" }` → `{ ok }`
