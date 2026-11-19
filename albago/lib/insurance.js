'use strict';
// 4대보험 판정·계산 (월 단위). 요율·상하한은 매장 설정에서 바꿀 수 있습니다.
const { ageOn, floorTo } = require('./calc');

const DEFAULT_RATES = {
  pension: 4.75,          // 국민연금 9.5% → 근로자·사업주 각 4.75% (2026)
  pensionMin: 400000,     // 기준소득월액 하한
  pensionMax: 6370000,    // 기준소득월액 상한
  health: 3.595,          // 건강보험 7.19% → 각 3.595% (2026)
  ltcOfHealth: 13.14,     // 장기요양 = 건강보험료 × 13.14% (2026)
  employment: 0.9,        // 고용보험(실업급여) 근로자 0.9%
  employmentEmployer: 1.15, // 사업주 0.9% + 고용안정·직업능력개발 0.25%(150인 미만)
  industrial: 0.9,        // 산재보험 사업주 전액. 업종별 요율로 바꿔 주세요
  durunuriLimit: 2700000, // 두루누리 지원 월보수 기준(미만)
  durunuriRate: 80,       // 신규가입자 지원율(%)
};
const KINDS = ['pension', 'health', 'employment', 'industrial'];
const F_EMPLOYMENT_MANDATORY = /^F-?(2|5|6)/i;

// 자동 판정. 결과: { pension: {apply:boolean, reason, check?:true}, ... }
function eligibility(staff, { monthHours, date }) {
  const age = ageOn(staff.birth, date);
  const foreign = staff.nationality === 'FOREIGN';
  const under60h = monthHours < 60;
  const out = {};
  out.industrial = { apply: true, reason: 'INS_R_ALL' };
  out.health = under60h ? { apply: false, reason: 'INS_R_UNDER60H' } : { apply: true, reason: 'INS_R_60H' };
  if (under60h) out.pension = { apply: false, reason: 'INS_R_UNDER60H' };
  else if (age !== null && age >= 60) out.pension = { apply: false, reason: 'INS_R_AGE60' };
  else if (age !== null && age < 18) out.pension = { apply: false, reason: 'INS_R_UNDER18' };
  else out.pension = foreign ? { apply: true, reason: 'INS_R_FOREIGN_PENSION', check: true } : { apply: true, reason: 'INS_R_60H' };
  if (under60h) out.employment = { apply: false, reason: 'INS_R_UNDER60H' };
  else if (age !== null && age >= 65) out.employment = { apply: false, reason: 'INS_R_AGE65' };
  else if (foreign && !F_EMPLOYMENT_MANDATORY.test(staff.visa || '')) out.employment = { apply: false, reason: 'INS_R_FOREIGN_EMP', check: true };
  else out.employment = { apply: true, reason: 'INS_R_60H' };
  // 사장님이 직원별로 직접 지정한 값이 우선
  const ov = staff.insurance || {};
  for (const k of KINDS) if (ov[k] === 'yes' || ov[k] === 'no') out[k] = { apply: ov[k] === 'yes', reason: 'INS_R_MANUAL' };
  return out;
}

// 월 보험료. taxable = 과세 대상 보수(비과세 식대 제외)
function premiums(staff, { taxable, monthHours, date, rates: r0, durunuri }) {
  const r = { ...DEFAULT_RATES, ...(r0 || {}) };
  const el = eligibility(staff, { monthHours, date });
  const f10 = n => floorTo(n, 10);
  const items = [];
  const add = (key, emp, er, note) => items.push({ key, employee: emp, employer: er, note });
  if (el.pension.apply) {
    const base = Math.min(r.pensionMax, Math.max(r.pensionMin, floorTo(taxable, 1000)));
    const p = f10(base * r.pension / 100);
    add('pension', p, p, { base });
  }
  if (el.health.apply) {
    const h = f10(taxable * r.health / 100), l = f10(h * r.ltcOfHealth / 100);
    add('health', h, h); add('ltc', l, l);
  }
  if (el.employment.apply) add('employment', f10(taxable * r.employment / 100), f10(taxable * r.employmentEmployer / 100));
  if (el.industrial.apply) add('industrial', 0, f10(taxable * r.industrial / 100));
  // 두루누리 사회보험료 지원(국민연금·고용보험, 신규가입자 80%) — 신청·승인된 직원만
  let support = { employee: 0, employer: 0 };
  if (durunuri && staff.durunuri && taxable < r.durunuriLimit) {
    for (const it of items) if (it.key === 'pension' || it.key === 'employment') {
      const se = f10(it.employee * r.durunuriRate / 100), sr = f10((it.key === 'employment' ? f10(taxable * r.employment / 100) : it.employer) * r.durunuriRate / 100);
      it.supportEmployee = se; it.supportEmployer = sr; support.employee += se; support.employer += sr;
    }
  }
  const employee = items.reduce((s, i) => s + i.employee - (i.supportEmployee || 0), 0);
  const employer = items.reduce((s, i) => s + i.employer - (i.supportEmployer || 0), 0);
  return { eligibility: el, items, employee, employer, support, rates: r };
}

// 직원 공제 전체 (방식: none | 3.3 | insurance)
function deductions(staff, pay, { monthly, monthHours, date, rates, durunuri }) {
  const list = []; let insurance = null;
  if (staff.deduction === '3.3') {
    const tax = floorTo(pay.gross * 0.03, 10);
    list.push({ key: 'bizTax', amount: tax }, { key: 'localTax', amount: floorTo(tax * 0.1, 10) });
  } else if (staff.deduction === 'insurance' && monthly) {
    const taxable = Math.max(0, pay.gross - Math.min(+staff.nonTaxable || 0, 200000));
    insurance = premiums(staff, { taxable, monthHours, date, rates, durunuri });
    for (const it of insurance.items) if (it.employee) list.push({ key: it.key, amount: it.employee - (it.supportEmployee || 0) });
    const it = Math.max(0, +staff.incomeTax || 0);
    if (it) list.push({ key: 'incomeTax', amount: it }, { key: 'localTax', amount: floorTo(it * 0.1, 10) });
  }
  const total = list.reduce((s, d) => s + d.amount, 0);
  return { list, total, insurance, employerCost: insurance ? insurance.employer : 0 };
}

module.exports = { DEFAULT_RATES, eligibility, premiums, deductions };
