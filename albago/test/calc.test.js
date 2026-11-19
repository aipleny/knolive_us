'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../lib/calc');
const S = { breakAuto: true, rounding: 1, fivePlus: false, earlyFromSchedule: false, minWages: { 2026: 10320 } };
const iso = (d, t) => new Date(C.kstEpoch(d, C.hm(t))).toISOString();
const rec = (date, a, b, extra = {}) => ({ id: date + a, date, in: iso(date, a), out: b ? iso(b <= a ? C.addDays(date, 1) : date, b) : null, breaks: [], ...extra });
const NOW = Date.parse('2026-11-19T12:00:00+09:00');

test('근무표 브레이크타임 구간을 뺀다', () => {
  const sh = { start: '10:00', end: '19:00', breaks: [{ start: '15:00', end: '16:00' }] };
  assert.equal(C.shiftMinutes('2026-11-02', sh), 480);
  const m = C.recordMinutes(rec('2026-11-02', '10:00', '19:00'), sh, S);
  assert.deepEqual([m.worked, m.brk, m.breakSource], [480, 60, 'schedule']);
});
test('브레이크타임 도중 퇴근하면 겹친 만큼만 뺀다', () => {
  const sh = { start: '10:00', end: '19:00', breaks: [{ start: '15:00', end: '16:00' }] };
  assert.equal(C.recordMinutes(rec('2026-11-02', '10:00', '15:30'), sh, S).worked, 300);
});
test('실제 휴식 기록이 근무표보다 우선', () => {
  const sh = { start: '10:00', end: '19:00', breaks: [{ start: '15:00', end: '16:00' }] };
  const r = rec('2026-11-02', '10:00', '19:00', { breaks: [{ start: iso('2026-11-02', '14:00'), end: iso('2026-11-02', '14:20') }] });
  assert.deepEqual([C.recordMinutes(r, sh, S).worked, C.recordMinutes(r, sh, S).breakSource], [520, 'actual']);
});
test('자정 넘는 근무 + 새벽 휴게: 야간시간에서 휴게 제외', () => {
  const sh = { start: '20:00', end: '04:00', breaks: [{ start: '01:00', end: '01:30' }] };
  assert.equal(C.shiftMinutes('2026-11-02', sh), 450);
  const m = C.recordMinutes(rec('2026-11-02', '20:00', '04:00'), sh, S);
  assert.equal(m.worked, 450);
  assert.equal(m.night, 360 - 30); // 22:00~04:00 = 6시간, 휴게 30분 제외
});
test('일정·휴식 없으면 법정 휴게 자동', () => {
  assert.equal(C.recordMinutes(rec('2026-11-02', '09:00', '18:00'), null, S).worked, 480);
  assert.equal(C.recordMinutes(rec('2026-11-02', '09:00', '18:00'), null, { ...S, breakAuto: false }).worked, 540);
});
test('주휴수당: 주 40시간 개근이면 8시간분, 결근이면 없음', () => {
  const sh = { start: '10:00', end: '19:00', breaks: [{ start: '15:00', end: '16:00' }] };
  const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
  const shiftOf = d => days.includes(d) ? sh : null;
  const staff = { id: 's', name: 'a', hourlyWage: 11000 };
  const p = C.payroll({ staff, records: days.map(d => rec(d, '10:00', '19:00')), shiftOf, settings: S, from: '2026-11-02', to: '2026-11-08', now: NOW });
  assert.deepEqual([p.workedMin, p.base, p.holidayPay], [2400, 440000, 88000]);
  const q = C.payroll({ staff, records: days.slice(1).map(d => rec(d, '10:00', '19:00')), shiftOf, settings: S, from: '2026-11-02', to: '2026-11-08', now: NOW });
  assert.equal(q.holidayPay, 0); assert.equal(q.weeks[0].status, 'absent');
});
test('5인 이상: 연장·야간 가산', () => {
  const p = C.payroll({ staff: { id: 's', hourlyWage: 10000 }, records: [rec('2026-11-10', '13:00', '00:00', { brk: 60 })], shiftOf: () => null, settings: { ...S, fivePlus: true }, from: '2026-11-10', to: '2026-11-10', now: NOW });
  assert.deepEqual([p.workedMin, p.overtimeMin, p.nightMin, p.overtimePay, p.nightPay], [600, 120, 120, 10000, 10000]);
});
test('부동소수 오차 없이 10원 절사', () => {
  assert.equal(C.floorTo(1320000 * 1.15 / 100, 10), 15180);
});
