'use strict';
// 알바고 근무시간·급여 계산 (순수 함수). 시각은 한국 표준시(UTC+9) 기준.
const KST = 9 * 3600000, DAY = 86400000;

const todayKst = (now = Date.now()) => new Date(now + KST).toISOString().slice(0, 10);
const kstEpoch = (date, min = 0) => Date.parse(date + 'T00:00:00Z') - KST + min * 60000;
const kstDateOf = iso => new Date(Date.parse(iso) + KST).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const dow = d => new Date(d + 'T00:00:00Z').getUTCDay(); // 0=일
const weekStart = d => addDays(d, dow(d) === 0 ? -6 : 1 - dow(d));
const datesBetween = (a, b) => { const o = []; for (let d = a; d <= b; d = addDays(d, 1)) o.push(d); return o; };
const monthEnd = ym => addDays((+ym.slice(5, 7) === 12 ? `${+ym.slice(0, 4) + 1}-01` : `${ym.slice(0, 4)}-${String(+ym.slice(5, 7) + 1).padStart(2, '0')}`) + '-01', -1);
const hm = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
const floorTo = (n, u) => Math.floor(Math.round(n * 1000) / 1000 / u) * u; // 부동소수 오차 보정 후 절사
const ageOn = (birth, date) => { if (!birth) return null; let a = +date.slice(0, 4) - +birth.slice(0, 4); if (date.slice(5) < birth.slice(5)) a--; return a; };

// 근무 예정(shift)의 절대 구간. 종료가 시작보다 이르면 다음 날로 봅니다. 휴게 구간도 같은 규칙.
function shiftSpan(date, shift) {
  const s = kstEpoch(date, hm(shift.start));
  let e = kstEpoch(date, hm(shift.end)); if (e <= s) e += DAY;
  const breaks = (shift.breaks || []).map(b => {
    let bs = kstEpoch(date, hm(b.start)); if (bs < s) bs += DAY;
    let be = kstEpoch(date, hm(b.end)); if (be <= bs) be += DAY;
    return [Math.max(s, bs), Math.min(e, be)];
  }).filter(([a, b]) => b > a);
  return { s, e, breaks };
}
const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
function minusIntervals(base, cuts) { // [[s,e]] - cuts
  let parts = [base];
  for (const [c1, c2] of cuts) parts = parts.flatMap(([s, e]) => c2 <= s || c1 >= e ? [[s, e]] : [[s, Math.min(c1, e)], [Math.max(c2, s), e]].filter(([x, y]) => y > x));
  return parts;
}
function shiftMinutes(date, shift) {
  if (!shift) return 0;
  const { s, e, breaks } = shiftSpan(date, shift);
  return Math.round(minusIntervals([s, e], breaks).reduce((a, [x, y]) => a + y - x, 0) / 60000);
}
function nightMs(s, e) { // 22:00~06:00과 겹치는 ms
  let t = 0; const d0 = kstDateOf(new Date(s).toISOString());
  for (let d = addDays(d0, -1); kstEpoch(d) < e; d = addDays(d, 1)) t += overlap(s, e, kstEpoch(d, 1320), kstEpoch(d, 1800));
  return t;
}
function legalBreak(span) { if (span - 60 >= 480) return 60; if (span - 30 >= 240) return 30; return 0; }

// 출퇴근 기록 1건의 인정 시간.
// 휴게 우선순위: 실제 휴식 기록 → 관리자가 입력한 휴게(분) → 근무표의 브레이크타임 → (설정 시) 법정 최소 휴게
function recordMinutes(rec, shift, settings) {
  if (!rec.out) return null;
  let inMs = Date.parse(rec.in); const outMs = Date.parse(rec.out);
  const sp = shift ? shiftSpan(rec.date, shift) : null;
  if (settings.earlyFromSchedule && sp && inMs < sp.s) inMs = Math.min(sp.s, outMs);
  const span = Math.max(0, Math.round((outMs - inMs) / 60000));
  let cuts = [], brkMin = 0, breakSource = 'none';
  const real = (rec.breaks || []).map(b => [Date.parse(b.start), b.end ? Date.parse(b.end) : outMs]).map(([a, b]) => [Math.max(a, inMs), Math.min(b, outMs)]).filter(([a, b]) => b > a);
  if (real.length) { cuts = real; breakSource = 'actual'; }
  else if (rec.brk !== null && rec.brk !== undefined && rec.brk !== '') { brkMin = Math.max(0, +rec.brk); breakSource = 'manual'; }
  else if (sp && sp.breaks.length) { cuts = sp.breaks.map(([a, b]) => [Math.max(a, inMs), Math.min(b, outMs)]).filter(([a, b]) => b > a); breakSource = 'schedule'; }
  else if (settings.breakAuto) { brkMin = legalBreak(span); breakSource = brkMin ? 'legal' : 'none'; }
  const parts = minusIntervals([inMs, outMs], cuts);
  const net = parts.reduce((a, [x, y]) => a + y - x, 0) / 60000;
  const brk = Math.round(span - net) + brkMin;
  const worked = floorTo(Math.max(0, Math.round(net) - brkMin), Math.max(1, +settings.rounding || 1));
  const night = Math.min(worked, Math.round(parts.reduce((a, [x, y]) => a + nightMs(x, y), 0) / 60000));
  return { span, brk, worked, night, breakSource };
}

const minWageFor = (settings, date) => +((settings.minWages || {})[String(date).slice(0, 4)] || 0);

// 가산율(%) — 사장님이 설정. 없으면 5인 이상일 때 법정 최소값.
function premiumRates(settings) {
  const f = !!settings.fivePlus, p = settings.premiums || {};
  const v = (k, d) => (p[k] === undefined || p[k] === null || p[k] === '' ? d : Math.max(0, +p[k]));
  return { overtime: v('overtime', f ? 50 : 0), night: v('night', f ? 50 : 0), holiday: v('holiday', f ? 50 : 0), holidayOver8: v('holidayOver8', f ? 100 : 0), partTimeExcess: v('partTimeExcess', f ? 50 : 0), publicHolidayPay: p.publicHolidayPay === undefined ? f : !!p.publicHolidayPay, laborDay: p.laborDay === undefined ? true : !!p.laborDay };
}
const patternMin = staff => [0, 1, 2, 3, 4, 5, 6].reduce((a, d) => a + (staff.pattern && staff.pattern[d] ? shiftMinutes('2026-01-05', staff.pattern[d]) : 0), 0);
// 월급제 통상시급의 기준 시간: 직접 입력 > (주 소정 + 주휴) × 365/7/12 > 209
function monthlyStdHours(staff) {
  if (+staff.monthlyHours > 0) return +staff.monthlyHours;
  const w = patternMin(staff) / 60;
  if (!w) return 209;
  return Math.round((w + (w >= 15 ? Math.min(w, 40) / 40 * 8 : 0)) * 365 / 7 / 12);
}
const daysInMonth = d => +monthEnd(d.slice(0, 7)).slice(8);

// 기간 급여. shiftOf(date) → shift|null, records: 이 직원 기록(주휴 판정용 앞뒤 1주 포함)
function payroll({ staff, records, shiftOf, settings, from, to, now = Date.now() }) {
  const monthly = staff.payType === 'monthly';
  const stdHours = monthly ? monthlyStdHours(staff) : 0;
  const wage = monthly ? Math.round((+staff.monthlySalary || 0) / stdHours) : (+staff.hourlyWage || 0); // 통상시급
  const R = premiumRates(settings), today = todayKst(now);
  // 유급휴일: 공휴일(설정 시, 보통 5인 이상) + 근로자의 날(5월 1일, 규모와 무관)
  const holidays = new Set(R.publicHolidayPay ? (settings.publicHolidays || []).map(h => h.date) : []);
  if (R.laborDay) for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) holidays.add(y + '-05-01');
  const weeklyHoliday = staff.weeklyHoliday === undefined || staff.weeklyHoliday === '' ? 0 : +staff.weeklyHoliday;
  const isHolidayWork = d => dow(d) === weeklyHoliday || holidays.has(d);
  const days = {}, open = [], lines = [];
  for (const r of records) {
    if (!r.out) { if (r.date >= from && r.date <= to) open.push(r); continue; }
    const m = recordMinutes(r, shiftOf(r.date), settings);
    const d = (days[r.date] = days[r.date] || { worked: 0, night: 0 });
    d.worked += m.worked; d.night += m.night;
    if (r.date >= from && r.date <= to) lines.push({ id: r.id, date: r.date, in: r.in, out: r.out, ...m, holiday: isHolidayWork(r.date) });
  }
  lines.sort((a, b) => a.in.localeCompare(b.in));
  const W = d => (days[d] ? days[d].worked : 0);
  const range = datesBetween(from, to);
  let worked = 0, night = 0, holidayMin = 0, holidayOver8Min = 0, excessMin = 0;
  const weeklyScheduled = patternMin(staff);
  for (const d of range) if (days[d]) {
    worked += days[d].worked; night += days[d].night;
    if (isHolidayWork(d)) { holidayMin += Math.min(480, W(d)); holidayOver8Min += Math.max(0, W(d) - 480); }
    else if (weeklyScheduled && weeklyScheduled < 2400) { // 단시간근로자: 정한 시간 초과분(법정 연장분 제외)
      const sh = shiftOf(d); excessMin += Math.max(0, Math.min(W(d), 480) - (sh ? shiftMinutes(d, sh) : 0));
    }
  }
  let overtime = 0; const weeks = [];
  for (let ws = weekStart(from); ws <= to; ws = addDays(ws, 7)) {
    const wd = datesBetween(ws, addDays(ws, 6)), inR = wd.filter(d => d >= from && d <= to);
    const WN = d => (isHolidayWork(d) ? 0 : W(d)); // 휴일근로는 연장에서 제외(휴일 가산으로 계산)
    const dailyOt = inR.reduce((s, d) => s + Math.max(0, WN(d) - 480), 0);
    const weekAll = wd.reduce((s, d) => s + W(d), 0), weekAllN = wd.reduce((s, d) => s + WN(d), 0), weekIn = inR.reduce((s, d) => s + WN(d), 0);
    overtime += Math.max(dailyOt, Math.min(weekIn, Math.max(0, weekAllN - 2400)));
    const sched = wd.map(d => ({ d, sh: shiftOf(d) })).filter(x => x.sh);
    const schedMin = sched.reduce((s, x) => s + shiftMinutes(x.d, x.sh), 0);
    const basis = schedMin || weekAll;
    const missing = sched.filter(x => x.d < today && !records.some(r => r.date === x.d)).map(x => x.d);
    let status, amount = 0;
    if (monthly) status = 'monthly';
    else if (basis < 900) status = 'under15';
    else if (missing.length) status = 'absent';
    else if (wd[6] > today) status = 'pending';
    else { status = 'paid'; amount = Math.round(Math.min(basis, 2400) / 2400 * 8 * wage); }
    const counted = wd[6] >= from && wd[6] <= to;
    weeks.push({ start: ws, end: wd[6], scheduledMin: schedMin, workedMin: weekAll, basisMin: basis, status, missing, holidayPay: counted ? amount : 0, counted });
  }
  const holidayPay = weeks.reduce((s, w) => s + w.holidayPay, 0);
  // 기본급: 시급제 = 근무시간 × 시급, 월급제 = 월급 ÷ 그 달 일수 × 재직 일수(일할)
  let base;
  if (monthly) {
    const employed = range.filter(d => (!staff.startDate || d >= staff.startDate) && (!staff.endDate || d <= staff.endDate));
    base = Math.round(employed.reduce((s, d) => s + (+staff.monthlySalary || 0) / daysInMonth(d), 0));
  } else base = Math.round(worked / 60 * wage);
  const pay = (min, rate) => Math.round(min / 60 * wage * rate / 100);
  const overtimePay = pay(overtime, R.overtime), nightPay = pay(night, R.night);
  const holidayWorkPay = pay(holidayMin, R.holiday) + pay(holidayOver8Min, R.holidayOver8);
  const excessPay = pay(excessMin, R.partTimeExcess);
  // 공휴일 유급휴일(시급제): 소정근로일인 공휴일에 쉬어도 1일분 지급
  let publicHolidayPay = 0; const paidHolidays = [];
  if (!monthly) for (const d of range) if (holidays.has(d) && staff.pattern && staff.pattern[dow(d)] && (!staff.startDate || d >= staff.startDate) && (!staff.endDate || d <= staff.endDate)) {
    const amt = Math.round(shiftMinutes(d, staff.pattern[dow(d)]) / 60 * wage); publicHolidayPay += amt; paidHolidays.push({ date: d, amount: amt });
  }
  const allowance = Math.max(0, +staff.monthlyAllowance || 0) && /^\d{4}-\d{2}-01$/.test(from) && to === monthEnd(from.slice(0, 7)) ? +staff.monthlyAllowance : 0;
  const gross = base + holidayPay + overtimePay + nightPay + holidayWorkPay + excessPay + publicHolidayPay + allowance;
  const scheduledMin = range.reduce((s, d) => s + shiftMinutes(d, shiftOf(d)), 0);
  const warnings = [];
  const mw = Math.max(minWageFor(settings, from), minWageFor(settings, to));
  if (mw && wage < mw) warnings.push({ code: 'W_MINWAGE', wage, min: mw });
  if (open.length) warnings.push({ code: 'W_OPEN', n: open.length });
  return { staffId: staff.id, name: staff.name, payType: monthly ? 'monthly' : 'hourly', wage, stdHours, monthlySalary: monthly ? +staff.monthlySalary || 0 : 0, rates: R, from, to, lines, open: open.map(o => ({ id: o.id, date: o.date, in: o.in })),
    workedMin: worked, scheduledMin, overtimeMin: overtime, nightMin: night, holidayMin, holidayOver8Min, excessMin, weeks, paidHolidays,
    base, overtimePay, nightPay, holidayWorkPay, excessPay, publicHolidayPay, holidayPay, allowance, gross, warnings, fivePlus: !!settings.fivePlus, days: Object.keys(days).filter(d => d >= from && d <= to).length };
}

// 상시근로자 수 (근로기준법 시행령 제7조의2): 1개월 연인원 ÷ 가동일수, 미달일수 1/2 규칙
function workforce(countsByDate, extra = 0) {
  const dates = Object.keys(countsByDate).filter(d => countsByDate[d] > 0);
  const op = dates.length;
  if (!op) return { operatingDays: 0, average: extra, daysUnder5: 0, fivePlus: extra >= 5 };
  const counts = dates.map(d => countsByDate[d] + extra);
  const average = counts.reduce((a, b) => a + b, 0) / op;
  const daysUnder5 = counts.filter(c => c < 5).length;
  return { operatingDays: op, average: Math.round(average * 100) / 100, daysUnder5, fivePlus: daysUnder5 < op / 2 };
}

module.exports = { KST, todayKst, kstEpoch, kstDateOf, addDays, dow, weekStart, datesBetween, monthEnd, hm, floorTo, ageOn, shiftSpan, shiftMinutes, minusIntervals, nightMs, legalBreak, recordMinutes, minWageFor, payroll, premiumRates, monthlyStdHours, workforce };
