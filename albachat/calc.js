'use strict';
// 알바챗 근무시간·급여 계산 (순수 함수, 서버와 테스트에서 함께 사용)
// 모든 시각은 한국 표준시(KST, UTC+9, 서머타임 없음) 기준으로 계산합니다.

const KST_OFFSET = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

function kstParts(iso) {
  const d = new Date(new Date(iso).getTime() + KST_OFFSET);
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
function todayKst(now = Date.now()) { return new Date(now + KST_OFFSET).toISOString().slice(0, 10); }
// 'YYYY-MM-DD' + 분(0~) → UTC epoch ms
function kstEpoch(date, min = 0) { return Date.parse(date + 'T00:00:00Z') - KST_OFFSET + min * 60000; }
function addDays(date, n) { return new Date(Date.parse(date + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10); }
function dow(date) { return new Date(date + 'T00:00:00Z').getUTCDay(); } // 0=일 … 6=토
function weekStart(date) { const d = dow(date); return addDays(date, d === 0 ? -6 : 1 - d); } // 월요일 시작
function datesBetween(from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }
const hm = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
const floorTo = (n, unit) => Math.floor(n / unit) * unit; // 원 단위 절사 등

// 근무 일정: 날짜별 변경(overrides)이 주간 기본 근무표보다 우선합니다. 하루 1개 근무.
function shiftFor(staff, overrides, date) {
  if (staff.startDate && date < staff.startDate) return null;
  if (staff.endDate && date > staff.endDate) return null;
  const o = overrides.find(x => x.staffId === staff.id && x.date === date);
  if (o) return o.off ? null : { start: o.start, end: o.end, brk: +o.brk || 0, override: true };
  const s = staff.schedule && staff.schedule[dow(date)];
  return s && s.start && s.end ? { start: s.start, end: s.end, brk: +s.brk || 0 } : null;
}
function shiftMinutes(shift) {
  if (!shift) return 0;
  let span = hm(shift.end) - hm(shift.start);
  if (span <= 0) span += 1440; // 자정을 넘는 근무
  return Math.max(0, span - (shift.brk || 0));
}
// 근로기준법 제54조: 4시간 이상 30분, 8시간 이상 1시간 이상 휴게
function legalBreak(span) {
  if (span - 60 >= 480) return 60;
  if (span - 30 >= 240) return 30;
  return 0;
}
// 22:00~06:00 야간 구간과 겹치는 분
function nightMinutes(startMs, endMs) {
  let total = 0;
  const startDate = kstParts(new Date(startMs).toISOString()).date;
  for (let d = addDays(startDate, -1); kstEpoch(d) < endMs; d = addDays(d, 1)) {
    const a = Math.max(startMs, kstEpoch(d, 22 * 60)), b = Math.min(endMs, kstEpoch(d, 30 * 60));
    if (b > a) total += (b - a) / 60000;
  }
  return Math.round(total);
}

// 기록 1건의 인정 근무시간
function recordMinutes(rec, staff, overrides, settings) {
  if (!rec.out) return null;
  const date = rec.date;
  const shift = shiftFor(staff, overrides, date);
  let inMs = Date.parse(rec.in), outMs = Date.parse(rec.out);
  if (settings.earlyFromSchedule && shift) {
    const sched = kstEpoch(date, hm(shift.start));
    if (inMs < sched) inMs = Math.min(sched, outMs);
  }
  const span = Math.max(0, Math.round((outMs - inMs) / 60000));
  let brk;
  if (rec.brk !== null && rec.brk !== undefined && rec.brk !== '') brk = +rec.brk;
  else if (shift && shift.brk) brk = Math.min(shift.brk, span);
  else brk = settings.breakAuto ? legalBreak(span) : 0;
  const worked = floorTo(Math.max(0, span - brk), Math.max(1, +settings.rounding || 1));
  const night = Math.min(worked, nightMinutes(inMs, outMs));
  return { span, brk, worked, night };
}

function minWageFor(settings, date) {
  const table = settings.minWages || {};
  const y = String(date).slice(0, 4);
  return +table[y] || 0;
}

// 기간 급여 계산. records는 해당 직원의 기록(주휴 판정용으로 기간 앞뒤 1주 포함 권장)
function payroll({ staff, records, overrides, settings, from, to, now = Date.now() }) {
  const wage = +staff.hourlyWage || 0;
  const today = todayKst(now);
  const mine = records.filter(r => r.staffId === staff.id);
  const days = {}; const open = []; const lines = [];
  for (const r of mine) {
    if (!r.out) { if (r.date >= from && r.date <= to) open.push(r); continue; }
    const m = recordMinutes(r, staff, overrides, settings);
    (days[r.date] = days[r.date] || { worked: 0, night: 0 });
    days[r.date].worked += m.worked; days[r.date].night += m.night;
    if (r.date >= from && r.date <= to) lines.push({ id: r.id, date: r.date, in: r.in, out: r.out, ...m });
  }
  lines.sort((a, b) => a.in.localeCompare(b.in));

  let worked = 0, night = 0;
  for (const d of datesBetween(from, to)) if (days[d]) { worked += days[d].worked; night += days[d].night; }

  // 연장근로: 1일 8시간, 1주 40시간 초과분(둘 중 큰 쪽). 기간 안 날짜만 집계.
  let overtime = 0;
  const weeks = [];
  for (let ws = weekStart(from); ws <= to; ws = addDays(ws, 7)) {
    const wd = datesBetween(ws, addDays(ws, 6));
    const inRange = wd.filter(d => d >= from && d <= to);
    const dailyOt = inRange.reduce((s, d) => s + Math.max(0, (days[d] ? days[d].worked : 0) - 480), 0);
    const weekWorkedAll = wd.reduce((s, d) => s + (days[d] ? days[d].worked : 0), 0);
    const weekWorkedIn = inRange.reduce((s, d) => s + (days[d] ? days[d].worked : 0), 0);
    const weeklyOt = Math.min(weekWorkedIn, Math.max(0, weekWorkedAll - 2400));
    overtime += Math.max(dailyOt, weeklyOt);

    // 주휴수당: 주 소정근로 15시간 이상 + 소정근로일 개근. 주휴는 그 주 일요일이 속한 기간에 반영.
    const sunday = wd[6];
    const scheduled = wd.map(d => ({ d, shift: shiftFor(staff, overrides, d) })).filter(x => x.shift);
    const schedMin = scheduled.reduce((s, x) => s + shiftMinutes(x.shift), 0);
    const basis = schedMin || weekWorkedAll;
    const missing = scheduled.filter(x => x.d < today && !days[x.d] && !mine.some(r => r.date === x.d)).map(x => x.d);
    let status, amount = 0;
    if (basis < 900) status = '해당 없음 (주 15시간 미만)';
    else if (missing.length) status = '미지급 (결근 ' + missing.map(d => d.slice(5)).join(', ') + ')';
    else if (sunday > today) status = '예정 (주 진행 중)';
    else { status = '지급'; amount = Math.round(Math.min(basis, 2400) / 2400 * 8 * wage); }
    const counted = sunday >= from && sunday <= to;
    weeks.push({ start: ws, end: sunday, scheduledMin: schedMin, workedMin: weekWorkedAll, basisMin: basis, status, holidayPay: counted ? amount : 0, counted });
  }
  const holidayPay = weeks.reduce((s, w) => s + w.holidayPay, 0);

  const five = !!settings.fivePlus;
  const base = Math.round(worked / 60 * wage);
  const overtimePay = five ? Math.round(overtime / 60 * wage * 0.5) : 0;
  const nightPay = five ? Math.round(night / 60 * wage * 0.5) : 0;
  const gross = base + overtimePay + nightPay + holidayPay;

  const deductions = [];
  const r = settings.insuranceRates || {};
  if (staff.deduction === '3.3') {
    const tax = floorTo(gross * 0.03, 10);
    deductions.push(['소득세 (3%)', tax], ['지방소득세 (0.3%)', floorTo(tax * 0.1, 10)]);
  } else if (staff.deduction === 'insurance') {
    const health = floorTo(gross * (+r.health || 0) / 100, 10);
    deductions.push(
      ['국민연금', floorTo(gross * (+r.pension || 0) / 100, 10)],
      ['건강보험', health],
      ['장기요양보험', floorTo(health * (+r.ltcOfHealth || 0) / 100, 10)],
      ['고용보험', floorTo(gross * (+r.employment || 0) / 100, 10)]
    );
  }
  const deductionTotal = deductions.reduce((s, d) => s + d[1], 0);

  const warnings = [];
  const mw = Math.max(minWageFor(settings, from), minWageFor(settings, to));
  if (mw && wage < mw) warnings.push(`시급 ${wage.toLocaleString('ko-KR')}원이 최저임금 ${mw.toLocaleString('ko-KR')}원보다 낮습니다.`);
  if (open.length) warnings.push(`퇴근 기록이 없는 출근 ${open.length}건은 계산에서 빠졌습니다.`);

  return {
    staffId: staff.id, name: staff.name, wage, from, to, lines, open: open.map(o => ({ id: o.id, date: o.date, in: o.in })),
    workedMin: worked, overtimeMin: overtime, nightMin: night, weeks,
    base, overtimePay, nightPay, holidayPay, gross, deductions, deductionTotal, net: gross - deductionTotal, warnings,
    fivePlus: five
  };
}

module.exports = { kstParts, todayKst, kstEpoch, addDays, dow, weekStart, datesBetween, hm, shiftFor, shiftMinutes, legalBreak, nightMinutes, recordMinutes, payroll, minWageFor };
