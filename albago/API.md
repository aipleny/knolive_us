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

## 소통 채널 (메시지·문서 기록) — 추가
기록은 삭제·수정할 수 없습니다(근거 보존). 사장님 문서 중 `requiresAck: true` 는 알바가 [확인했습니다]를 눌러야 합니다.

`GET /api/staff/messages` → 내 대화(사장님 ↔ 나) + 매장 공지, 최신순. 받은 메시지는 조회 시 읽음 처리됩니다.
```json
{ "items": [ {
  "id": "...", "from": "owner | staff", "kind": "notice | instruction | general | warning | discipline | dismissal | suggestion | absence_reason | schedule_request",
  "title": "제목", "body": "내용", "date": "관련 근무일 YYYY-MM-DD | null",
  "createdAt": "ISO", "readAt": "ISO|null", "requiresAck": true, "ackAt": "ISO|null",
  "attachments": [ { "id": "...", "name": "진단서.jpg", "type": "image/jpeg", "size": 120394 } ],
  "hash": "무결성 해시 앞 12자리"
} ], "unread": 0 }
```
`POST /api/staff/messages`
```json
{ "kind": "general | suggestion | absence_reason | schedule_request", "title": "선택", "body": "내용(필수)", "date": "YYYY-MM-DD 선택",
  "attachments": [ { "name": "a.jpg", "type": "image/jpeg", "data": "base64" } ] }
```
첨부: 최대 3개, 각 5MB, 이미지(jpeg/png/heic/webp) 또는 PDF. → `{ ok, id }`

`POST /api/staff/messages/:id/ack` → `{ ok, ackAt }` (확인 서명)
`GET /api/staff/attachments/:id` → 파일 본문 (Bearer 인증)
`POST /api/staff/push-token { "token": "ExponentPushToken[...]" }` → 새 메시지가 오면 서버가 Expo 푸시로 알림(제목 "ALBAGO 알바고", 본문 = 메시지 종류·제목, data `{ type: "message", id }`)
`GET /api/staff/home` 응답에 `"unread": 숫자` 가 추가됩니다.

## v3 — 내 급여 · 임금명세서 · 알림함 · 근로계약서 (추가)

### 내 급여
`GET /api/staff/pay?month=YYYY-MM` (생략 시 이번 달). 금액은 원, 문구는 X-Lang 언어.
```json
{ "month": "2026-11", "from": "2026-11-01", "to": "2026-11-30", "payDay": 10,
  "payType": "hourly | monthly", "hourlyWage": 11000, "monthlySalary": 0, "ordinaryRate": 11000,
  "workedMin": 6240, "days": 13,
  "items": [ { "key": "base", "label": "기본급", "amount": 1144000, "calc": "104시간 × 11,000원" } ],
  "gross": 1320000,
  "deductions": [ { "key": "pension", "label": "국민연금", "amount": 62700 } ],
  "deductionTotal": 128260, "net": 1191740,
  "estimate": true, "payslipId": null }
```
`estimate: true` 이면 아직 사장님이 확정하지 않은 예상 금액입니다. 확정된 임금명세서가 있으면 `estimate: false`, `payslipId` 가 들어오고 금액은 명세서 기준입니다.
`months` 조회: `GET /api/staff/pay/months` → `{ "months": ["2026-11", "2026-10", ...] }` (입사월~이번 달, 최근 순, 최대 24개)

### 임금명세서
`GET /api/staff/payslips` → `{ "items": [ { "id", "from", "to", "payDate", "gross", "net", "issuedAt", "viewedAt" } ] }` (최근 순)
`GET /api/staff/payslips/:id/html` → 인쇄용 완성 HTML 문서(text/html). WebView 로 보여 주고, PDF 저장은 같은 HTML 로 expo-print 사용. 열면 열람 시각이 기록됩니다.

### 근로계약서
`GET /api/staff/contracts` → `{ "items": [ { "id", "title", "createdAt", "sharedAt", "receivedAt" } ] }` (사장님이 앱으로 보낸 것만)
`GET /api/staff/contracts/:id/html` → 완성 HTML 문서
`POST /api/staff/contracts/:id/receive` → `{ ok, receivedAt }` ("받았습니다" = 근로계약서 교부 확인)

### 알림함
`GET /api/staff/notifications` → `{ "items": [ { "id", "kind", "title", "body", "data": { "id": "..." }, "createdAt", "readAt" } ], "unread": 3 }` (최근 100개)
kind: `message`(사장님 메시지·공지) · `payslip`(임금명세서 도착) · `contract`(근로계약서 도착) · `schedule`(근무표 변경) · `shift_soon`(근무 시작 전 알림) · `no_out`(퇴근 미기록)
`POST /api/staff/notifications/read` `{ "ids": ["..."] }` 또는 `{ "all": true }` → `{ ok }`
푸시 data: `{ "type": kind, "id": 관련 id, "notificationId": "..." }`. 탭하면 kind 에 맞는 화면(message→소통, payslip→급여, contract→계약서, schedule·shift_soon·no_out→홈)으로 이동.

### 알림 설정
`GET /api/staff/prefs` / `PUT /api/staff/prefs`
```json
{ "shiftReminder": true, "shiftReminderMin": 30, "outReminder": true, "scheduleChange": true }
```
`shiftReminderMin`: 10~120. 근무 시작 N분 전 알림, 퇴근 미기록 알림(근무 종료 30분 후), 근무표 변경 알림을 서버가 푸시로 보냅니다.

### 홈 응답 추가 필드
`GET /api/staff/home` 에 `"notifUnread": 숫자`, `me.payType`, `me.hourlyWage`, `me.monthlySalary` 추가.
