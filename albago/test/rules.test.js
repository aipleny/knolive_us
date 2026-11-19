'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../lib/calc');
const iso = (d, t) => new Date(C.kstEpoch(d, C.hm(t))).toISOString();
const rec = (date, a, b) => ({ id: date + a, date, in: iso(date, a), out: iso(b <= a ? C.addDays(date, 1) : date, b), breaks: [] });
const S = { breakAuto: true, rounding: 1, minWages: { 2026: 10320 } };
const NOW = Date.parse('2026-12-31T12:00:00+09:00');
const P = { start: '09:00', end: '18:00', breaks: [{ start: '12:00', end: '13:00' }] };
const weekdays = { 1: P, 2: P, 3: P, 4: P, 5: P };
const run = (staff, records, settings, from, to, shiftOf = () => null) => C.payroll({ staff: { id: 's', name: 'a', ...staff }, records, shiftOf, settings: { ...S, ...settings }, from, to, now: NOW });

test('월급제: 통상시급 = 월급 ÷ 209, 한 달 기본급 = 월급, 주휴 별도 없음', () => {
  const p = run({ payType: 'monthly', monthlySalary: 2090000, pattern: weekdays }, [rec('2026-11-02', '09:00', '18:00')], { premiums: { laborDay: false } }, '2026-11-01', '2026-11-30');
  assert.deepEqual([p.wage, p.stdHours, p.base, p.holidayPay], [10000, 209, 2090000, 0]);
});
test('월급제 중도 입사 일할', () => {
  const p = run({ payType: 'monthly', monthlySalary: 3000000, startDate: '2026-11-16', pattern: weekdays }, [], { premiums: { laborDay: false } }, '2026-11-01', '2026-11-30');
  assert.equal(p.base, 1500000);
});
test('5인 미만이어도 사장님이 정한 연장 가산율 적용', () => {
  const p = run({ hourlyWage: 10000 }, [rec('2026-11-10', '08:00', '19:00')], { fivePlus: false, premiums: { overtime: 50 } }, '2026-11-10', '2026-11-10');
  assert.deepEqual([p.workedMin, p.overtimeMin, p.overtimePay], [600, 120, 10000]);
});
test('5인 이상: 주휴일(일요일) 근무는 휴일 가산, 연장에서 제외', () => {
  const p = run({ hourlyWage: 10000, weeklyHoliday: 0 }, [rec('2026-11-08', '09:00', '20:00')], { fivePlus: true }, '2026-11-08', '2026-11-08');
  assert.deepEqual([p.workedMin, p.holidayMin, p.holidayOver8Min, p.overtimeMin], [600, 480, 120, 0]);
  assert.equal(p.holidayWorkPay, 40000 + 20000); // 8h×50% + 2h×100%
});
test('공휴일 유급휴일: 근무 요일이면 1일분 지급 (5인 이상)', () => {
  const p = run({ hourlyWage: 10000, pattern: weekdays }, [], { fivePlus: true, publicHolidays: [{ date: '2026-12-25', name: '성탄절' }] }, '2026-12-01', '2026-12-31');
  assert.equal(p.publicHolidayPay, 80000);
});
test('5인 미만은 공휴일 유급 미적용, 근로자의 날은 적용', () => {
  const settings = { fivePlus: false, publicHolidays: [{ date: '2026-12-25' }] };
  assert.equal(run({ hourlyWage: 10000, pattern: weekdays }, [], settings, '2026-12-01', '2026-12-31').publicHolidayPay, 0);
  assert.equal(run({ hourlyWage: 10000, pattern: weekdays }, [], settings, '2026-05-01', '2026-05-31').publicHolidayPay, 80000); // 2026-05-01 금요일
});
test('단시간 근로자: 정한 시간 초과분 가산', () => {
  const sh = { start: '10:00', end: '14:00', breaks: [] };
  const p = run({ hourlyWage: 10000, pattern: { 2: sh } }, [rec('2026-11-10', '10:00', '16:00')], { fivePlus: true }, '2026-11-10', '2026-11-10', () => sh);
  assert.deepEqual([p.excessMin, p.excessPay], [90, 7500]); // 6h - 30m 법정휴게 = 5.5h, 정한 4h 초과 1.5h × 50%
});
test('상시근로자 수: 미달일수 1/2 규칙', () => {
  assert.equal(C.workforce({ a: 6, b: 6, c: 3, d: 3, e: 3 }).fivePlus, false); // 평균 4.2, 미달 3일 ≥ 2.5
  assert.equal(C.workforce({ a: 5, b: 5, c: 5, d: 2 }).fivePlus, true);        // 평균 4.25, 미달 1일 < 2
  assert.equal(C.workforce({ a: 3, b: 3 }, 2).average, 5);
});
