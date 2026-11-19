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

// 기간 급여. shiftOf(date) → shift|null, records: 이 직원 기록(주휴 판정용 앞뒤 1주 포함)
function payroll({ staff, records, shiftOf, settings, from, to, now = Date.now() }) {
  const wage = +staff.hourlyWage || 0, today = todayKst(now);
  const days = {}, open = [], lines = [];
  for (const r of records) {
    if (!r.out) { if (r.date >= from && r.date <= to) open.push(r); continue; }
    const m = recordMinutes(r, shiftOf(r.date), settings);
    const d = (days[r.date] = days[r.date] || { worked: 0, night: 0 });
    d.worked += m.worked; d.night += m.night;
    if (r.date >= from && r.date <= to) lines.push({ id: r.id, date: r.date, in: r.in, out: r.out, ...m });
  }
  lines.sort((a, b) => a.in.localeCompare(b.in));
  let worked = 0, night = 0;
  for (const d of datesBetween(from, to)) if (days[d]) { worked += days[d].worked; night += days[d].night; }
  let overtime = 0; const weeks = [];
  for (let ws = weekStart(from); ws <= to; ws = addDays(ws, 7)) {
    const wd = datesBetween(ws, addDays(ws, 6)), inR = wd.filter(d => d >= from && d <= to);
    const W = d => (days[d] ? days[d].worked : 0);
    const dailyOt = inR.reduce((s, d) => s + Math.max(0, W(d) - 480), 0);
    const weekAll = wd.reduce((s, d) => s + W(d), 0), weekIn = inR.reduce((s, d) => s + W(d), 0);
    overtime += Math.max(dailyOt, Math.min(weekIn, Math.max(0, weekAll - 2400)));
    const sched = wd.map(d => ({ d, sh: shiftOf(d) })).filter(x => x.sh);
    const schedMin = sched.reduce((s, x) => s + shiftMinutes(x.d, x.sh), 0);
    const basis = schedMin || weekAll;
    const missing = sched.filter(x => x.d < today && !records.some(r => r.date === x.d)).map(x => x.d);
    let status, amount = 0;
    if (basis < 900) status = 'under15';
    else if (missing.length) status = 'absent';
    else if (wd[6] > today) status = 'pending';
    else { status = 'paid'; amount = Math.round(Math.min(basis, 2400) / 2400 * 8 * wage); }
    const counted = wd[6] >= from && wd[6] <= to;
    weeks.push({ start: ws, end: wd[6], scheduledMin: schedMin, workedMin: weekAll, basisMin: basis, status, missing, holidayPay: counted ? amount : 0, counted });
  }
  const holidayPay = weeks.reduce((s, w) => s + w.holidayPay, 0);
  const five = !!settings.fivePlus;
  const base = Math.round(worked / 60 * wage);
  const overtimePay = five ? Math.round(overtime / 60 * wage * 0.5) : 0;
  const nightPay = five ? Math.round(night / 60 * wage * 0.5) : 0;
  const allowance = Math.max(0, +staff.monthlyAllowance || 0) && /^\d{4}-\d{2}-01$/.test(from) && to === monthEnd(from.slice(0, 7)) ? +staff.monthlyAllowance : 0;
  const gross = base + overtimePay + nightPay + holidayPay + allowance;
  const scheduledMin = datesBetween(from, to).reduce((s, d) => s + shiftMinutes(d, shiftOf(d)), 0);
  const warnings = [];
  const mw = Math.max(minWageFor(settings, from), minWageFor(settings, to));
  if (mw && wage < mw) warnings.push({ code: 'W_MINWAGE', wage, min: mw });
  if (open.length) warnings.push({ code: 'W_OPEN', n: open.length });
  return { staffId: staff.id, name: staff.name, wage, from, to, lines, open: open.map(o => ({ id: o.id, date: o.date, in: o.in })), workedMin: worked, scheduledMin, overtimeMin: overtime, nightMin: night, weeks, base, overtimePay, nightPay, holidayPay, allowance, gross, warnings, fivePlus: five, days: Object.keys(days).filter(d => d >= from && d <= to).length };
}

module.exports = { KST, todayKst, kstEpoch, kstDateOf, addDays, dow, weekStart, datesBetween, monthEnd, hm, floorTo, ageOn, shiftSpan, shiftMinutes, minusIntervals, nightMs, legalBreak, recordMinutes, minWageFor, payroll };
