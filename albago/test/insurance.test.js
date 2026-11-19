'use strict';
const test = require('node:test');
const assert = require('node:assert');
const I = require('../lib/insurance');
const base = { birth: '2001-03-03', nationality: 'KR', deduction: 'insurance' };
test('월 60시간 이상 내국인: 4대보험 모두 적용, 금액', () => {
  const r = I.premiums(base, { taxable: 1320000, monthHours: 104, date: '2026-11-30' });
  const get = k => r.items.find(i => i.key === k);
  assert.deepEqual([get('pension').employee, get('health').employee, get('ltc').employee, get('employment').employee], [62700, 47450, 6230, 11880]);
  assert.deepEqual([get('employment').employer, get('industrial').employer], [15180, 11880]);
  assert.equal(r.employee, 128260); assert.equal(r.employer, 143440);
});
test('월 60시간 미만: 산재만', () => {
  const e = I.eligibility(base, { monthHours: 40, date: '2026-11-30' });
  assert.deepEqual(['pension', 'health', 'employment', 'industrial'].map(k => e[k].apply), [false, false, false, true]);
});
test('만 60세 이상 국민연금 제외, 65세 이상 고용보험 제외', () => {
  const e = I.eligibility({ ...base, birth: '1960-01-01' }, { monthHours: 100, date: '2026-11-30' });
  assert.deepEqual([e.pension.apply, e.employment.apply, e.health.apply], [false, false, true]);
});
test('외국인 E-9: 고용보험 확인 필요, F-5는 의무', () => {
  assert.equal(I.eligibility({ ...base, nationality: 'FOREIGN', visa: 'E-9' }, { monthHours: 100, date: '2026-11-30' }).employment.check, true);
  assert.equal(I.eligibility({ ...base, nationality: 'FOREIGN', visa: 'F-5' }, { monthHours: 100, date: '2026-11-30' }).employment.apply, true);
});
test('사장님 직접 지정이 우선', () => {
  assert.equal(I.eligibility({ ...base, insurance: { pension: 'no' } }, { monthHours: 100, date: '2026-11-30' }).pension.apply, false);
});
test('국민연금 기준소득 하한 적용', () => {
  const r = I.premiums(base, { taxable: 300000, monthHours: 70, date: '2026-11-30' });
  assert.equal(r.items.find(i => i.key === 'pension').employee, 19000); // 400,000 × 4.75%
});
test('두루누리 80% 지원', () => {
  const r = I.premiums({ ...base, durunuri: true }, { taxable: 1320000, monthHours: 104, date: '2026-11-30', durunuri: true });
  const p = r.items.find(i => i.key === 'pension');
  assert.equal(p.supportEmployee, 50160);
});
test('3.3% 공제', () => {
  const d = I.deductions({ deduction: '3.3' }, { gross: 1000000 }, {});
  assert.deepEqual(d.list.map(x => x.amount), [30000, 3000]);
});
