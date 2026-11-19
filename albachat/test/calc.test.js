'use strict';
const test = require('node:test');
const assert = require('node:assert');
const c = require('../calc');

const settings = { breakAuto: true, rounding: 1, fivePlus: false, earlyFromSchedule: false, minWages: { 2026: 10320 }, insuranceRates: { pension: 4.75, health: 3.595, ltcOfHealth: 13.14, employment: 0.9 } };
const iso = (date, t) => new Date(c.kstEpoch(date, c.hm(t))).toISOString();
const rec = (staffId, date, a, b, brk = null) => ({ id: date + a, staffId, date, in: iso(date, a), out: b ? iso(b < a ? c.addDays(date, 1) : date, b) : null, brk });
const NOW = Date.parse('2026-11-19T12:00:00+09:00');
const weekdays = { 1: { start: '10:00', end: '14:00', brk: 0 }, 2: { start: '10:00', end: '14:00', brk: 0 }, 3: { start: '10:00', end: '14:00', brk: 0 }, 4: { start: '10:00', end: '14:00', brk: 0 }, 5: { start: '10:00', end: '14:00', brk: 0 } };
const staff = { id: 's1', name: '김알바', hourlyWage: 10320, schedule: weekdays, deduction: 'none' };
const fullWeek = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map(d => rec('s1', d, '10:00', '14:00'));

test('주 20시간 개근 → 기본급과 주휴수당', () => {
  const p = c.payroll({ staff, records: fullWeek, overrides: [], settings, from: '2026-11-02', to: '2026-11-08', now: NOW });
  assert.equal(p.workedMin, 1200);
  assert.equal(p.base, 206400);
  assert.equal(p.holidayPay, 41280); // 20/40 × 8 × 10,320
  assert.equal(p.gross, 247680);
});

test('예정일 결근 → 주휴수당 없음', () => {
  const p = c.payroll({ staff, records: fullWeek.slice(0, 4), overrides: [], settings, from: '2026-11-02', to: '2026-11-08', now: NOW });
  assert.equal(p.holidayPay, 0);
  assert.match(p.weeks[0].status, /결근/);
});

test('휴무로 바뀐 날은 결근이 아님', () => {
  const ov = [{ staffId: 's1', date: '2026-11-06', off: true }];
  const p = c.payroll({ staff, records: fullWeek.slice(0, 4), overrides: ov, settings, from: '2026-11-02', to: '2026-11-08', now: NOW });
  assert.equal(p.holidayPay, Math.round(16 / 40 * 8 * 10320));
});

test('주 15시간 미만 → 주휴 해당 없음', () => {
  const s = { ...staff, schedule: { 6: { start: '10:00', end: '18:00', brk: 60 } } };
  const p = c.payroll({ staff: s, records: [rec('s1', '2026-11-07', '10:00', '18:00')], overrides: [], settings, from: '2026-11-02', to: '2026-11-08', now: NOW });
  assert.equal(p.workedMin, 420);
  assert.equal(p.holidayPay, 0);
});

test('진행 중인 주는 주휴 예정으로만 표시', () => {
  const p = c.payroll({ staff, records: ['2026-11-16', '2026-11-17', '2026-11-18'].map(d => rec('s1', d, '10:00', '14:00')), overrides: [], settings, from: '2026-11-16', to: '2026-11-22', now: NOW });
  assert.equal(p.holidayPay, 0);
  assert.match(p.weeks[0].status, /예정/);
});

test('자정 넘는 근무: 야간시간과 법정 휴게 자동 차감', () => {
  const s = { ...staff, schedule: {} };
  const r = rec('s1', '2026-11-10', '21:00', '02:00');
  const m = c.recordMinutes(r, s, [], settings);
  assert.equal(m.span, 300);
  assert.equal(m.brk, 30);
  assert.equal(m.worked, 270);
  assert.equal(m.night, 240);
});

test('5인 이상: 1일 8시간 초과 연장 + 야간 가산', () => {
  const s = { ...staff, schedule: {} };
  const p = c.payroll({ staff: s, records: [rec('s1', '2026-11-10', '13:00', '00:00', 60)], overrides: [], settings: { ...settings, fivePlus: true }, from: '2026-11-10', to: '2026-11-10', now: NOW });
  assert.equal(p.workedMin, 600);
  assert.equal(p.overtimeMin, 120);
  assert.equal(p.nightMin, 120);
  assert.equal(p.overtimePay, Math.round(2 * 10320 * 0.5));
  assert.equal(p.nightPay, Math.round(2 * 10320 * 0.5));
});

test('4인 이하: 가산 없음', () => {
  const s = { ...staff, schedule: {} };
  const p = c.payroll({ staff: s, records: [rec('s1', '2026-11-10', '13:00', '00:00', 60)], overrides: [], settings, from: '2026-11-10', to: '2026-11-10', now: NOW });
  assert.equal(p.overtimePay + p.nightPay, 0);
});

test('3.3% 공제는 10원 미만 절사', () => {
  const p = c.payroll({ staff: { ...staff, deduction: '3.3' }, records: fullWeek, overrides: [], settings, from: '2026-11-02', to: '2026-11-08', now: NOW });
  assert.deepEqual(p.deductions, [['소득세 (3%)', 7430], ['지방소득세 (0.3%)', 740]]);
  assert.equal(p.net, 247680 - 8170);
});

test('최저임금 미달 경고와 미퇴근 기록', () => {
  const p = c.payroll({ staff: { ...staff, hourlyWage: 9000 }, records: [rec('s1', '2026-11-03', '10:00', null)], overrides: [], settings, from: '2026-11-01', to: '2026-11-30', now: NOW });
  assert.equal(p.warnings.length, 2);
});

test('일찍 출근 시 예정시각부터 인정 옵션', () => {
  const m = c.recordMinutes(rec('s1', '2026-11-02', '09:40', '14:00'), staff, [], { ...settings, earlyFromSchedule: true });
  assert.equal(m.worked, 240);
});
