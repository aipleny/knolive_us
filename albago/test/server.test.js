'use strict';
// 서버 통합 테스트: 가입 → 직원 → 근무표 → 지오펜스 출근/이탈 → 자동 퇴근
const test = require('node:test');
const assert = require('node:assert');
const os = require('os'), fs = require('fs'), path = require('path');
process.env.ALBAGO_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'albago-'));
process.env.ALBAGO_DEV = '1';
const { server, db, sweep } = require('../server');
const C = require('../lib/calc');
let base; const jar = {};
async function call(method, url, body, { token, lang = 'ko' } = {}) {
  const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Lang': lang, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(jar.c ? { Cookie: jar.c } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie(); if (sc.length) jar.c = [...new Map([...(jar.c || '').split('; ').filter(Boolean), ...sc.map(s => s.split(';')[0])].map(s => [s.split('=')[0], s])).values()].join('; ');
  return { status: r.status, body: await r.json().catch(() => null) };
}
test.before(() => new Promise(r => server.listen(0, () => { base = 'http://127.0.0.1:' + server.address().port; r(); })));
test.after(() => { server.close(); });
const silence = console.log; console.log = () => {};
test('전체 흐름', async () => {
  const BN = '1234567891';
  const s1 = await call('POST', '/api/auth/verify/send', { kind: 'sms', target: '01012345678' });
  const pt = (await call('POST', '/api/auth/verify/check', { kind: 'sms', id: s1.body.id, code: s1.body.devCode })).body.ticket;
  const e1 = await call('POST', '/api/auth/verify/send', { kind: 'email', target: 'o@example.com' });
  const et = (await call('POST', '/api/auth/verify/check', { kind: 'email', id: e1.body.id, code: e1.body.devCode })).body.ticket;
  assert.equal((await call('POST', '/api/auth/signup', { bizNo: BN, storeName: '테스트', ownerName: '홍', phone: '01012345678', email: 'o@example.com', phoneTicket: pt, emailTicket: 'bad', loginId: 'boss', password: 'pass1234' })).body.code, 'EMAIL_NOT_VERIFIED');
  assert.equal((await call('POST', '/api/auth/signup', { bizNo: BN, storeName: '테스트', ownerName: '홍', phone: '01012345678', email: 'o@example.com', phoneTicket: pt, emailTicket: et, loginId: 'boss', password: 'pass1234' })).status, 200);
  const l = await call('POST', '/api/auth/login', { storeCode: BN, loginId: 'boss', password: 'pass1234' });
  assert.equal(l.body.otp, true);
  assert.equal((await call('POST', '/api/auth/otp', { otpId: l.body.otpId, code: '000000' })).body.code, 'CODE_WRONG');
  assert.equal((await call('POST', '/api/auth/otp', { otpId: l.body.otpId, code: l.body.devCode })).status, 200);
  await call('PUT', '/api/owner/store', { store: { name: '테스트', lat: 37.5, lng: 127.03 }, settings: { geo: { radius: 100, exitGraceMin: 15 } } });
  const sid = (await call('POST', '/api/owner/staff', { name: '알바', hourlyWage: 10320, loginId: 'alba', password: 'alba12345', pin: '1234' })).body.id;
  // 다른 매장 데이터는 보이지 않아야 함 (매장 격리)
  const today = C.todayKst(), now = Date.now();
  const hhmm = ms => new Date(ms + C.KST).toISOString().slice(11, 16);
  await call('PUT', '/api/owner/shifts', { staffId: sid, date: today, start: hhmm(now - 3600000), end: hhmm(now + 3 * 3600000) });
  const tok = (await call('POST', '/api/auth/login', { storeCode: BN, loginId: 'alba', password: 'alba12345', client: 'app' })).body.token;
  assert.ok(tok);
  assert.equal((await call('POST', '/api/staff/geo', { event: 'enter', lat: 37.5, lng: 127.03 }, { token: tok })).body.action, 'in');
  assert.equal((await call('POST', '/api/staff/geo', { event: 'exit' }, { token: tok })).body.action, 'exit_pending');
  // 20분 전에 나간 것으로 바꾸고 정리 작업 실행 → 나간 시각으로 퇴근
  const exitAt = new Date(now - 20 * 60000).toISOString();
  db.prepare('UPDATE records SET exit_at=? WHERE staff_id=?').run(exitAt, sid);
  sweep();
  const r = db.prepare('SELECT * FROM records WHERE staff_id=?').get(sid);
  assert.equal(r.out_at, exitAt); assert.equal(r.src_out, 'geo-timeout');
  // 앱 버튼 + 위치 필수 설정
  await call('PUT', '/api/owner/store', { settings: { geo: { requireLocation: true } } });
  assert.equal((await call('POST', '/api/staff/punch', { action: 'in', lat: 37.6, lng: 127.1 }, { token: tok, lang: 'en' })).body.code, 'OUT_OF_RANGE');
  const ok = await call('POST', '/api/staff/punch', { action: 'in', lat: 37.5002, lng: 127.0301 }, { token: tok, lang: 'en' });
  assert.match(ok.body.message, /clocked in/);
  // 엑셀
  const x = await fetch(base + `/api/owner/export/payroll.xlsx?from=${today.slice(0, 7)}-01&to=${C.monthEnd(today.slice(0, 7))}`, { headers: { Cookie: jar.c } });
  assert.equal(x.status, 200); assert.match(x.headers.get('content-type'), /spreadsheetml/);
  // 소통 채널: 경고 발송 → 알바 조회·확인 → 무결성 → 변조 감지
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082', 'hex').toString('base64');
  const w = await call('POST', '/api/owner/messages', { staffId: sid, kind: 'warning', title: '지각', body: '11/19 30분 지각', attachments: [{ name: 'a.png', type: 'image/png', data: png }] });
  assert.equal(w.status, 200);
  assert.equal((await call('POST', '/api/owner/messages', { staffId: sid, kind: 'warning', body: 'x', attachments: [{ name: 'a.exe', type: 'application/x-msdownload', data: png }] })).body.code, 'ATT_TYPE');
  await call('POST', '/api/owner/messages', { kind: 'notice', body: '내일 대청소' });
  assert.equal((await call('GET', '/api/staff/home', null, { token: tok })).body.unread, 2);
  const list = (await call('GET', '/api/staff/messages', null, { token: tok })).body.items;
  assert.equal(list.length, 2); const warn = list.find(m => m.kind === 'warning');
  assert.equal(warn.requiresAck, true); assert.ok(warn.readAt === null || warn.readAt);
  const att = await fetch(base + '/api/staff/attachments/' + warn.attachments[0].id, { headers: { Authorization: 'Bearer ' + tok } });
  assert.equal(att.status, 200); assert.equal(Buffer.from(await att.arrayBuffer()).toString('base64'), png);
  assert.ok((await call('POST', `/api/staff/messages/${warn.id}/ack`, {}, { token: tok })).body.ackAt);
  assert.equal((await call('POST', '/api/staff/messages', { kind: 'absence_reason', body: '병원 진료', date: today }, { token: tok })).status, 200);
  const ow = (await call('GET', '/api/owner/messages?staffId=' + sid)).body;
  assert.equal(ow.items.length, 2); assert.ok(ow.items.find(m => m.kind === 'warning').ackAt);
  assert.deepEqual((await call('GET', '/api/owner/messages/verify')).body.ok, true);
  db.prepare("UPDATE messages SET body='바뀐 내용' WHERE kind='warning'").run();
  assert.equal((await call('GET', '/api/owner/messages/verify')).body.ok, false);
  // 5인 이상이면 법정 최소 미만 가산율은 올려서 저장
  await call('PUT', '/api/owner/store', { settings: { fivePlus: true, premiums: { overtime: 0, night: 30, holiday: 70, publicHolidayPay: false } } });
  const st2 = (await call('GET', '/api/owner/bootstrap')).body.store.settings;
  assert.deepEqual([st2.premiums.overtime, st2.premiums.night, st2.premiums.holiday, st2.premiums.publicHolidayPay], [50, 50, 70, true]);
  // 상시근로자 계산 API
  assert.equal(typeof (await call('GET', '/api/owner/workforce')).body.average, 'number');
  // ── v3: 내 급여 · 임금명세서 · 근로계약서 · 알림함 · 알림 예약 ──
  const ym = today.slice(0, 7), mFrom = ym + '-01', mTo = C.monthEnd(ym);
  const pay = (await call('GET', '/api/staff/pay', null, { token: tok })).body;
  assert.equal(pay.estimate, true); assert.equal(pay.payType, 'hourly'); assert.ok(Array.isArray(pay.items));
  assert.ok((await call('GET', '/api/staff/pay/months', null, { token: tok })).body.months.includes(ym));
  assert.equal((await call('GET', '/api/staff/pay?month=2099-01', null, { token: tok })).status, 400);
  // 근무시간이 있어야 명세서가 발송되므로 지난 기록 하나 추가
  await call('POST', '/api/owner/records', { staffId: sid, date: mFrom, inTime: '09:00', outTime: '13:00' });
  const iss = (await call('POST', '/api/owner/payslips', { from: mFrom, to: mTo, payDate: C.addDays(mTo, 10) })).body;
  assert.equal(iss.count, 1);
  const slips = (await call('GET', '/api/staff/payslips', null, { token: tok })).body.items;
  assert.equal(slips.length, 1); assert.equal(slips[0].viewedAt, null);
  const pay2 = (await call('GET', '/api/staff/pay?month=' + ym, null, { token: tok })).body;
  assert.equal(pay2.estimate, false); assert.equal(pay2.payslipId, slips[0].id);
  const html = await fetch(base + `/api/staff/payslips/${slips[0].id}/html`, { headers: { Authorization: 'Bearer ' + tok } });
  assert.match(html.headers.get('content-type'), /text\/html/); const htxt = await html.text(); assert.match(htxt, /임 금 명 세 서/); assert.doesNotMatch(htxt, /<script/);
  assert.ok((await call('GET', '/api/staff/payslips', null, { token: tok })).body.items[0].viewedAt);
  // 다시 발송하면 이전 명세서는 대체
  await call('POST', '/api/owner/payslips', { from: mFrom, to: mTo, payDate: C.addDays(mTo, 10) });
  assert.equal((await call('GET', '/api/staff/payslips', null, { token: tok })).body.items.length, 1);
  // 근로계약서: 앱 전달 → 수령 확인 → 삭제 불가
  const ct = (await call('POST', '/api/owner/contracts', { staffId: sid, type: 'parttime', title: '단시간근로자 표준근로계약서', fields: { type: 'parttime', store: {}, worker: { name: '알바' }, days: {}, rates: {} }, share: true })).body.id;
  const cts = (await call('GET', '/api/staff/contracts', null, { token: tok })).body.items;
  assert.equal(cts.length, 1); assert.equal(cts[0].receivedAt, null);
  assert.ok((await call('POST', `/api/staff/contracts/${ct}/receive`, {}, { token: tok })).body.receivedAt);
  assert.equal((await call('DELETE', `/api/owner/contracts/${ct}`)).body.code, 'CONTRACT_SHARED');
  // 근무표 변경 알림 + 알림함
  await call('PUT', '/api/owner/shifts', { staffId: sid, date: C.addDays(today, 2), start: '10:00', end: '15:00' });
  let nt = (await call('GET', '/api/staff/notifications', null, { token: tok })).body;
  const kinds = new Set(nt.items.map(n => n.kind));
  for (const k of ['message', 'payslip', 'contract', 'schedule']) assert.ok(kinds.has(k), 'missing notification ' + k);
  assert.equal((await call('GET', '/api/staff/home', null, { token: tok })).body.notifUnread, nt.unread);
  // 알림 설정
  assert.equal((await call('PUT', '/api/staff/prefs', { shiftReminderMin: 500, outReminder: false }, { token: tok })).body.shiftReminderMin, 120);
  await call('PUT', '/api/staff/prefs', { shiftReminderMin: 30, outReminder: true }, { token: tok });
  // 근무 시작 전 알림: 20분 뒤 시작하는 근무 (지금은 근무 중이 아니어야 함)
  await call('POST', '/api/staff/punch', { action: 'out', lat: 37.5, lng: 127.03 }, { token: tok });
  const hm = ms => new Date(ms + C.KST).toISOString().slice(11, 16);
  const tm = Date.now() + 20 * 60000;
  if (C.kstDateOf(new Date(tm).toISOString()) === today) {
    await call('PUT', '/api/owner/shifts', { staffId: sid, date: today, start: hm(tm), end: hm(Math.min(tm + 3600000, C.kstEpoch(today, 1439))) });
    const reminders = require('../server').reminders;
    reminders(); reminders();
    nt = (await call('GET', '/api/staff/notifications', null, { token: tok })).body;
    assert.equal(nt.items.filter(n => n.kind === 'shift_soon').length, 1, 'shift_soon once');
  }
  assert.ok((await call('POST', '/api/staff/notifications/read', { all: true }, { token: tok })).body.ok);
  assert.equal((await call('GET', '/api/staff/notifications', null, { token: tok })).body.unread, 0);
  // 값이 빠진 요청은 500이 아니라 400 대 오류
  assert.equal((await call('POST', '/api/auth/otp', {})).status, 400);
  assert.equal((await call('POST', '/api/owner/records', { staffId: { x: 1 } })).status, 400);
  // 정적 파일: 압축·ETag(304)·보안 헤더, 상위 폴더 접근 차단
  const st1 = await fetch(base + '/owner', { headers: { 'Accept-Encoding': 'br' } });
  assert.equal(st1.headers.get('content-encoding'), 'br');
  assert.match(st1.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await fetch(base + '/owner', { headers: { 'If-None-Match': st1.headers.get('etag') } })).status, 304);
  assert.equal((await fetch(base + '/%2e%2e/server.js')).status, 404);
  // 보안 점검 반영: 이름 검증, 기간 상한, 터널 경유 시 인증번호 미노출, 문서 스크립트 차단
  assert.equal((await call('POST', '/api/auth/staff-signup', { storeCode: BN, name: '<img src=x onerror=alert(1)>', loginId: 'xss01', password: 'abcd1234' })).body.code, 'NAME_INVALID');
  assert.equal((await call('GET', '/api/owner/payroll?from=1000-01-01&to=2000-12-31')).body.code, 'BAD_RANGE');
  assert.equal((await call('GET', '/api/owner/payroll?from=2026-01-01&to=2027-12-31')).body.code, 'BAD_RANGE');
  const viaTunnel = await fetch(base + '/api/auth/reset/send', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.9' }, body: JSON.stringify({ storeCode: BN, loginId: 'boss' }) });
  const vt = await viaTunnel.json(); assert.equal(vt.devCode, undefined); assert.equal(vt.emailMasked, undefined);
  const docRes = await fetch(base + `/api/staff/payslips/${slips[0].id}/html`, { headers: { Authorization: 'Bearer ' + tok } });
  assert.match(docRes.headers.get('content-security-policy'), /script-src 'none'/);
  assert.equal((await fetch(base + '/api/auth/me')).headers.get('x-content-type-options'), 'nosniff');
  // 직원 토큰으로 사장님 API 불가
  assert.equal((await call('GET', '/api/owner/bootstrap', null, { token: tok })).status, 401);
});
test.after(() => { console.log = silence; });
