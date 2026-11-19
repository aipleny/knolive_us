'use strict';
// 인쇄 문서: 근로계약서(고용노동부 표준근로계약서 양식 기반), 임금명세서, 근무표
const CONTRACT_TYPES = {
  parttime: '단시간근로자 표준근로계약서',
  regular: '표준근로계약서 (기간의 정함이 없는 경우)',
  fixed: '표준근로계약서 (기간의 정함이 있는 경우)',
  minor: '연소근로자(18세 미만인 자) 표준근로계약서',
  foreign: '외국인근로자 표준근로계약서 (한/영)',
};
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const u = (v, w) => `<span class="u" ${w ? `style="min-width:${w}px"` : ''}>${esc(v || ' ')}</span>`;
const box = on => `<span class="box">${on ? '✓' : ''}</span>`;
function ymd(d, en) {
  if (!d) return en ? '____ . __ . __' : '&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;일';
  const [y, m, dd] = d.split('-');
  return en ? `${y}. ${m}. ${dd}` : `${y}년 ${+m}월 ${+dd}일`;
}
const minsOf = d => { if (!d || !d.start || !d.end) return 0; const [a, b] = [d.start, d.end].map(t => +t.slice(0, 2) * 60 + +t.slice(3)); let s = b - a; if (s <= 0) s += 1440; return Math.max(0, s - (+d.brk || 0)); };
const hoursText = m => { const h = Math.floor(m / 60), r = m % 60; return r ? `${h}시간 ${r}분` : `${h}시간`; };
function weekMinutes(f) { return DOW_ORDER.reduce((s, d) => s + minsOf(f.days[d]), 0); }
function workDays(f) { return DOW_ORDER.filter(d => f.days[d] && f.days[d].start); }
function uniformTime(f) {
  const ds = workDays(f).map(d => f.days[d]);
  return ds.length && ds.every(x => x.start === ds[0].start && x.end === ds[0].end && (+x.brk || 0) === (+ds[0].brk || 0)) ? ds[0] : null;
}
function dayTable(f) {
  return `<table><tr><th></th>${DOW_ORDER.map(d => `<th>${DOW[d]}요일</th>`).join('')}</tr>
  <tr><th>근로시간</th>${DOW_ORDER.map(d => `<td>${f.days[d] && f.days[d].start ? hoursText(minsOf(f.days[d])) : ''}</td>`).join('')}</tr>
  <tr><th>시업</th>${DOW_ORDER.map(d => `<td>${f.days[d] && f.days[d].start ? f.days[d].start : ''}</td>`).join('')}</tr>
  <tr><th>종업</th>${DOW_ORDER.map(d => `<td>${f.days[d] && f.days[d].start ? f.days[d].end : ''}</td>`).join('')}</tr>
  <tr><th>휴게 시간</th>${DOW_ORDER.map(d => `<td>${f.days[d] && f.days[d].start && +f.days[d].brk ? f.days[d].brk + '분' : ''}</td>`).join('')}</tr></table>`;
}
function wageBlock(f, n) {
  return `<div class="item"><b>${n}. 임 금</b>
  <p>- 시간급 : ${u(Number(f.wage || 0).toLocaleString('ko-KR'), 90)}원</p>
  <p>- 상여금 : 있음 (${f.bonus ? esc(f.bonus) : '&nbsp;&nbsp;&nbsp;'}) 원, 없음 (${f.bonus ? '&nbsp;&nbsp;' : '✓'})</p>
  <p>- 기타급여(제수당 등) : ${f.otherPay ? `있음 (✓) ${u(f.otherPay, 160)}` : '있음 (&nbsp;&nbsp;), 없음 (✓)'}</p>
  ${n === 5 && f.type === 'parttime' ? `<p>- 초과근로에 대한 가산임금률 : ${u(f.fivePlus ? (f.otRate || 50) : '해당 없음(상시 4인 이하)', 60)}${f.fivePlus ? '%' : ''}</p><p class="en" style="color:#000">※ 단시간근로자와 사용자 사이에 근로하기로 정한 시간을 초과하여 근로하면 법정 근로시간 내라도 통상임금의 100분의 50% 이상의 가산임금 지급 (상시근로자 5인 이상 사업장, 기간제법 제6조)</p>` : ''}
  <p>- 임금지급일 : 매월 ${u(f.payDay, 30)}일 (휴일의 경우는 전일 지급)</p>
  <p>- 지급방법 : 근로자에게 직접지급 (${f.payMethod === 'direct' ? '✓' : '&nbsp;&nbsp;'}), 근로자 명의 예금통장에 입금 (${f.payMethod !== 'direct' ? '✓' : '&nbsp;&nbsp;'})</p></div>`;
}
function insuranceBlock(f, n) {
  const i = f.insurance || {};
  return `<div class="item"><b>${n}. 사회보험 적용여부(해당란에 체크)</b><p>${box(i.employment)} 고용보험 &nbsp; ${box(i.industrial)} 산재보험 &nbsp; ${box(i.pension)} 국민연금 &nbsp; ${box(i.health)} 건강보험</p></div>`;
}
function commonTail(n) {
  return `<div class="item"><b>${n}. 근로계약서 교부</b><p>- 사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부요구와 관계없이 근로자에게 교부함 (근로기준법 제17조 이행)</p></div>
  <div class="item"><b>${n + 1}. 근로계약, 취업규칙 등의 성실한 이행의무</b><p>- 사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 함</p></div>
  <div class="item"><b>${n + 2}. 기 타</b><p>- 이 계약에 정함이 없는 사항은 근로기준법령에 의함</p>${n === 9 ? '' : ''}</div>`;
}
function signBlock(f) {
  const s = f.store, w = f.worker;
  return `<p style="text-align:center;margin-top:16px">${ymd(f.signDate)}</p>
  <table class="sign" style="border:0;width:100%"><tr><td style="width:15%"><b>(사업주)</b></td><td>사업체명 : ${u(s.name, 150)} (전화 : ${u(s.phone, 110)})</td></tr>
  <tr><td></td><td>주&nbsp;&nbsp;&nbsp;&nbsp;소 : ${u(s.address, 340)}</td></tr>
  <tr><td></td><td>대 표 자 : ${u(s.owner, 120)} (서명)</td></tr>
  <tr><td style="padding-top:12px"><b>(근로자)</b></td><td style="padding-top:12px">주&nbsp;&nbsp;&nbsp;&nbsp;소 : ${u(w.address, 340)}</td></tr>
  <tr><td></td><td>연 락 처 : ${u(w.phone, 150)}</td></tr>
  <tr><td></td><td>성&nbsp;&nbsp;&nbsp;&nbsp;명 : ${u(w.name, 120)} (서명)</td></tr></table>`;
}
function koreanContract(f) {
  const t = f.type, s = f.store, w = f.worker;
  const uni = uniformTime(f), wd = workDays(f);
  let n = 1, html = `<div class="doc"><h1>${t === 'parttime' ? '단시간근로자 표준근로계약서' : t === 'minor' ? '연소근로자(18세 미만인 자)<br>표준근로계약서' : '표준근로계약서'}</h1>
  <p>${u(s.name, 140)}(이하 "사업주"라 함)과(와) ${u(w.name, 100)}(이하 "근로자"라 함)은 다음과 같이 근로계약을 체결한다.</p>`;
  if (t === 'regular') html += `<div class="item"><b>${n++}. 근로개시일 :</b> ${ymd(f.startDate)}부터</div>`;
  else html += `<div class="item"><b>${n++}. ${t === 'fixed' ? '근로계약기간' : '근로개시일'} :</b> ${ymd(f.startDate)}부터 ${f.endDate || t === 'fixed' ? ymd(f.endDate) + '까지' : ''}<br><span class="en" style="color:#000">※ 근로계약기간을 정하지 않는 경우에는 "근로개시일"만 기재</span></div>`;
  html += `<div class="item"><b>${n++}. 근 무 장 소 :</b> ${u(f.place, 300)}</div><div class="item"><b>${n++}. 업무의 내용 :</b> ${u(f.job, 300)}</div>`;
  if (t === 'parttime') {
    html += `<div class="item"><b>${n++}. 근로일 및 근로일별 근로시간</b>${dayTable(f)}<p>○ 주휴일 : 매주 ${u(f.weeklyHoliday, 30)}요일 &nbsp; <span class="en" style="color:#000">(1주 소정근로시간 ${hoursText(weekMinutes(f))}${weekMinutes(f) < 900 ? ' — 15시간 미만으로 주휴일·연차휴가 미적용' : ''})</span></p></div>`;
  } else {
    html += `<div class="item"><b>${n++}. 소정근로시간 :</b> ${uni ? `${u(uni.start, 50)}부터 ${u(uni.end, 50)}까지 (휴게시간 : ${u((+uni.brk || 0) + '분', 50)})` : '아래 요일별 근로시간에 따름'}${uni ? '' : dayTable(f)}</div>
    <div class="item"><b>${n++}. 근무일/휴일 :</b> 매주 ${u(wd.length, 30)}일 (${wd.map(d => DOW[d]).join('·')}) 근무, 주휴일 매주 ${u(f.weeklyHoliday, 30)}요일</div>`;
  }
  html += wageBlock(f, n++);
  html += `<div class="item"><b>${n++}. 연차유급휴가</b><p>- ${t === 'parttime' ? '통상근로자의 근로시간에 비례하여 연차유급휴가 부여' : '연차유급휴가는 근로기준법에서 정하는 바에 따라 부여함'}</p></div>`;
  if (t === 'minor') html += `<div class="item"><b>${n++}. 가족관계증명서 및 동의서</b><p>- 가족관계기록사항에 관한 증명서 제출 여부 : ${box(f.minorDocs)} 제출</p><p>- 친권자 또는 후견인의 동의서 구비 여부 : ${box(f.minorDocs)} 구비</p><p class="en" style="color:#000">※ 18세 미만인 자의 근로시간은 1일 7시간, 1주 35시간을 초과하지 못하며(당사자 합의 시 1일 1시간, 1주 5시간 한도 연장), 야간(22시~06시)·휴일근로는 본인 동의와 고용노동부장관의 인가가 필요함 (근로기준법 제69조, 제70조)</p></div>`;
  html += insuranceBlock(f, n++);
  html += commonTail(n); n += 3;
  html += signBlock(f) + '</div>';
  if (t === 'minor') html += consentForm(f);
  return html;
}
function consentForm(f) {
  const s = f.store, w = f.worker, g = f.guardian || {};
  return `<div class="doc page-break"><h1>친권자(후견인) 동의서</h1>
  <table><tr><th rowspan="5" style="width:22%">친권자(후견인)<br>인적사항</th><th class="l" style="width:20%">성명</th><td class="l">${esc(g.name)}</td></tr><tr><th class="l">생년월일</th><td class="l">${esc(g.birth)}</td></tr><tr><th class="l">주소</th><td class="l">${esc(g.address)}</td></tr><tr><th class="l">연락처</th><td class="l">${esc(g.phone)}</td></tr><tr><th class="l">연소근로자와의 관계</th><td class="l">${esc(g.relation)}</td></tr>
  <tr><th rowspan="4">연소근로자<br>인적사항</th><th class="l">성명</th><td class="l">${esc(w.name)} (만 ${esc(w.age)}세)</td></tr><tr><th class="l">생년월일</th><td class="l">${esc(w.birth)}</td></tr><tr><th class="l">주소</th><td class="l">${esc(w.address)}</td></tr><tr><th class="l">연락처</th><td class="l">${esc(w.phone)}</td></tr>
  <tr><th rowspan="4">사업장<br>개요</th><th class="l">회사명</th><td class="l">${esc(s.name)}</td></tr><tr><th class="l">회사주소</th><td class="l">${esc(s.address)}</td></tr><tr><th class="l">대표자</th><td class="l">${esc(s.owner)}</td></tr><tr><th class="l">회사전화</th><td class="l">${esc(s.phone)}</td></tr></table>
  <p style="margin-top:24px">본인은 위 연소근로자 ${u(w.name, 100)}가 위 사업장에서 근로를 하는 것에 대하여 동의합니다.</p>
  <p style="text-align:center;margin-top:30px">${ymd(f.signDate)}</p><p style="text-align:right;margin-top:20px">친권자(후견인) ${u(g.name, 120)} (인)</p>
  <p style="margin-top:30px">첨 부 : 가족관계증명서 1부</p></div>`;
}
function foreignContract(f) {
  const s = f.store, w = f.worker, uni = uniformTime(f), wd = workDays(f), wm = weekMinutes(f);
  const monthly = Math.round((wm + (wm >= 900 ? Math.min(wm, 2400) / 5 : 0)) / 60 * 365 / 7 / 12 * (+f.wage || 0));
  const bl = (ko, en) => `${ko}<br><span class="en">${en}</span>`;
  return `<div class="doc"><h1>외국인근로자 표준근로계약서<small>Standard Labor Contract</small></h1>
  <p class="en" style="color:#000">아래 당사자는 다음과 같이 근로계약을 체결하고 이를 성실히 이행할 것을 약정한다.<br>The following parties to the contract agree to fully comply with the terms of the contract stated hereinafter.</p>
  <table><tr><th rowspan="3" style="width:13%">${bl('사용자', 'Employer')}</th><th class="l" style="width:18%">${bl('업체명', 'Name of the enterprise')}</th><td class="l">${esc(s.name)}</td><th class="l" style="width:14%">${bl('전화번호', 'Phone number')}</th><td class="l">${esc(s.phone)}</td></tr>
  <tr><th class="l">${bl('소재지', 'Location of the enterprise')}</th><td class="l" colspan="3">${esc(s.address)}</td></tr>
  <tr><th class="l">${bl('성명', 'Name of the employer')}</th><td class="l">${esc(s.owner)}</td><th class="l">${bl('사업자등록번호', 'Business reg. No.')}</th><td class="l">${esc(s.bizNo)}</td></tr>
  <tr><th rowspan="2">${bl('근로자', 'Employee')}</th><th class="l">${bl('성명', 'Name of the employee')}</th><td class="l">${esc(w.name)}</td><th class="l">${bl('생년월일', 'Birthdate')}</th><td class="l">${esc(w.birth)}</td></tr>
  <tr><th class="l">${bl('본국주소', 'Address (Home Country)')}</th><td class="l" colspan="3">${esc(w.homeAddress)}${w.country ? ` (${esc(w.country)})` : ''}${w.visa ? `<br><span class="en">체류자격 Visa status: ${esc(w.visa)}</span>` : ''}</td></tr></table>
  <table>
  <tr><th class="l" style="width:22%">${bl('1. 근로계약기간', 'Term of labor contract')}</th><td class="l">${ymd(f.startDate)} ~ ${f.endDate ? ymd(f.endDate) : '기간의 정함 없음 (No fixed term)'}<br><span class="en">${ymd(f.startDate, 1)} ~ ${f.endDate ? ymd(f.endDate, 1) : ''}</span><br>- ${box(f.entry !== 're' && f.entry !== 'change')} 신규 Newcomer &nbsp; ${box(f.entry === 're')} 재입국자 Re-entering &nbsp; ${box(f.entry === 'change')} 사업장변경 Changed workplace<br>- 수습기간 Probation period: ${f.probation ? esc(f.probation) + '개월 (months)' : '없음 (None)'}</td></tr>
  <tr><th class="l">${bl('2. 근로장소', 'Place of employment')}</th><td class="l">${esc(f.place)}<br><span class="en">※ 근로자를 이 계약서에서 정한 장소 외에서 근로하게 해서는 안 됨. The employee shall not work at a place other than the place stated above.</span></td></tr>
  <tr><th class="l">${bl('3. 업무내용', 'Description of work')}</th><td class="l">- 업종 Industry: ${esc(s.industry)}<br>- 직무내용 Job description: ${esc(f.job)}</td></tr>
  <tr><th class="l">${bl('4. 근로시간', 'Working hours')}</th><td class="l">${uni ? `${esc(uni.start)} ~ ${esc(uni.end)}` : '요일별 근로시간표에 따름 (See the table below)'} &nbsp;/ 주 ${wd.length}일 (${wd.map(d => DOW[d] + ' ' + DOW_EN[d]).join(', ')}), 1주 ${hoursText(wm)} (${(wm / 60).toFixed(1)} hours/week)${uni ? '' : dayTable(f)}</td></tr>
  <tr><th class="l">${bl('5. 휴게시간', 'Recess hours')}</th><td class="l">1일 ${uni ? (+uni.brk || 0) : '요일별 표 참조'}분 / ${uni ? (+uni.brk || 0) : 'see table'} minutes per day</td></tr>
  <tr><th class="l">${bl('6. 휴일', 'Holidays')}</th><td class="l">주휴일 매주 ${esc(f.weeklyHoliday)}요일 (Weekly paid holiday: every ${DOW_EN[DOW.indexOf(f.weeklyHoliday)] || ''})${wm < 900 ? '<br><span class="en">※ 1주 소정근로시간 15시간 미만: 주휴일 미적용 (Less than 15 hours per week: weekly holiday not applicable)</span>' : ''}</td></tr>
  <tr><th class="l">${bl('7. 임금', 'Payment')}</th><td class="l">1) 시간급 Hourly wage: ${Number(f.wage || 0).toLocaleString('ko-KR')}원 (KRW)<br>&nbsp;&nbsp;&nbsp;월 예상 통상임금(주휴수당 포함) Estimated monthly normal wage (incl. weekly holiday pay): 약 ${monthly.toLocaleString('ko-KR')}원<br>- 상여금 Bonus: ${f.bonus ? esc(f.bonus) + '원' : '없음 (None)'} &nbsp; - 기타 수당 Other allowances: ${f.otherPay ? esc(f.otherPay) : '없음 (None)'}<br>2) 연장, 야간, 휴일근로에 대해서는 통상임금의 50%를 가산 지급 (상시근로자 4인 이하 사업장에는 적용하지 않음)<br><span class="en">Overtime, night shift or holiday work will be paid 50% more than the employee's regular rate of pay (not applicable to businesses with 4 or fewer employees).</span>${f.probation ? '<br>3) 수습기간 중 임금 Wage during probation: ' + esc(f.probationWage || '정상 임금 지급 (Normal wage)') : ''}</td></tr>
  <tr><th class="l">${bl('8. 임금지급일', 'Payment date')}</th><td class="l">매월 ${esc(f.payDay)}일 (휴일의 경우 전일 지급) / ${esc(f.payDay)}th day of every month (paid the day before if it falls on a holiday)</td></tr>
  <tr><th class="l">${bl('9. 지급방법', 'Payment methods')}</th><td class="l">${box(f.payMethod === 'direct')} 직접 지급 In person &nbsp; ${box(f.payMethod !== 'direct')} 통장 입금 By direct deposit transfer into the employee's account<br><span class="en">※ 사용자는 근로자 명의로 된 예금통장 및 도장을 관리해서는 안 됨. The employer shall not keep the bankbook and the seal of the employee.</span></td></tr>
  <tr><th class="l">${bl('10. 숙식제공', 'Accommodations and Meals')}</th><td class="l">1) 숙박시설 제공 Accommodation: ${box(f.housing)} 제공 Provided ${box(!f.housing)} 미제공 Not provided${f.housing ? ' — ' + esc(f.housingNote) : ''}<br>2) 식사 제공 Meals: ${box(f.meals)} 제공 Provided ${box(!f.meals)} 미제공 Not provided${f.meals ? ' — ' + esc(f.mealsNote) : ''}<br><span class="en">※ 숙식 비용의 근로자 부담 수준은 사용자와 근로자 간 협의로 결정 (The cost to be paid by the employee is decided by mutual consultation.)</span></td></tr>
  <tr><th class="l">${bl('11. 사회보험', 'Social insurance')}</th><td class="l">${box((f.insurance || {}).employment)} 고용보험 Employment &nbsp; ${box((f.insurance || {}).industrial)} 산재보험 Industrial accident &nbsp; ${box((f.insurance || {}).pension)} 국민연금 National pension &nbsp; ${box((f.insurance || {}).health)} 건강보험 Health</td></tr>
  <tr><th class="l">${bl('12. 기타', 'Others')}</th><td class="l">이 계약에서 정하지 않은 사항은 근로기준법에서 정하는 바에 따름. 사용자는 계약 체결 시 이 계약서 사본을 근로자에게 교부함.<br><span class="en">Other matters not regulated in this contract will follow the Labor Standards Act. The employer shall give a copy of this contract to the employee.</span></td></tr></table>
  <p style="text-align:center;margin-top:14px">${ymd(f.signDate)} <span class="en">(YYYY.MM.DD: ${ymd(f.signDate, 1)})</span></p>
  <table class="sign" style="border:0;width:100%"><tr><td style="width:50%">사용자 Employer : ${u(s.owner, 120)} (서명 Signature)</td><td>근로자 Employee : ${u(w.name, 120)} (서명 Signature)</td></tr></table></div>`;
}
function contractHTML(f) { return f.type === 'foreign' ? foreignContract(f) : koreanContract(f); }

// 임금명세서 (근로기준법 제48조 제2항, 시행령 제27조의2 기재사항)
function payslipHTML(p, store, payDate) {
  const items = [['기본급', p.base, `${hoursText(p.workedMin)} × ${p.wage.toLocaleString('ko-KR')}원`], ['주휴수당', p.holidayPay, p.weeks.filter(w => w.counted && w.holidayPay).map(w => `${w.start.slice(5)}~${w.end.slice(5)} 주 ${(Math.min(w.basisMin, 2400) / 60).toFixed(1)}시간÷40×8×시급`).join(' / ') || '해당 없음']];
  if (p.fivePlus) items.push(['연장근로수당', p.overtimePay, `${hoursText(p.overtimeMin)} × 시급 × 0.5 (가산분)`], ['야간근로수당', p.nightPay, `${hoursText(p.nightMin)} × 시급 × 0.5 (가산분)`]);
  const days = new Set(p.lines.map(l => l.date)).size;
  return `<div class="doc"><h1>임 금 명 세 서</h1>
  <p style="text-align:right">지급일 : ${ymd(payDate)}</p>
  <table><tr><th style="width:18%">사업장</th><td class="l">${esc(store.name)}</td><th style="width:18%">성명</th><td class="l">${esc(p.name)}</td></tr>
  <tr><th>대표자</th><td class="l">${esc(store.owner)}</td><th>생년월일</th><td class="l">${esc(p.birth)}</td></tr>
  <tr><th>정산 기간</th><td class="l">${esc(p.from)} ~ ${esc(p.to)}</td><th>입사일 / 직무</th><td class="l">${esc(p.startDate)} / ${esc(p.position)}</td></tr></table>
  <h3 style="margin:14px 0 4px">근로일수·시간</h3>
  <table><tr><th>근로일수</th><th>총 근로시간</th><th>연장근로시간</th><th>야간근로시간</th><th>휴일근로시간</th><th>시급</th></tr>
  <tr><td>${days}일</td><td>${hoursText(p.workedMin)}</td><td>${hoursText(p.overtimeMin)}</td><td>${hoursText(p.nightMin)}</td><td>0시간</td><td>${p.wage.toLocaleString('ko-KR')}원</td></tr></table>
  <h3 style="margin:14px 0 4px">지급 내역</h3>
  <table><tr><th style="width:22%">항목</th><th style="width:20%">금액</th><th>계산 방법</th></tr>
  ${items.map(([k, v, how]) => `<tr><td>${k}</td><td style="text-align:right">${Math.round(v).toLocaleString('ko-KR')}원</td><td class="l">${esc(how)}</td></tr>`).join('')}
  <tr><th>지급액 계</th><th style="text-align:right">${p.gross.toLocaleString('ko-KR')}원</th><td></td></tr></table>
  <h3 style="margin:14px 0 4px">공제 내역</h3>
  <table><tr><th style="width:22%">항목</th><th style="width:20%">금액</th><th>비고</th></tr>
  ${p.deductions.length ? p.deductions.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right">${v.toLocaleString('ko-KR')}원</td><td class="l"></td></tr>`).join('') : '<tr><td>공제 없음</td><td style="text-align:right">0원</td><td></td></tr>'}
  <tr><th>공제액 계</th><th style="text-align:right">${p.deductionTotal.toLocaleString('ko-KR')}원</th><td></td></tr></table>
  <table style="margin-top:12px"><tr><th style="width:42%;font-size:12pt">실 지급액</th><th style="text-align:right;font-size:13pt">${p.net.toLocaleString('ko-KR')}원</th></tr></table>
  ${p.accountMasked ? `<p>지급 계좌 : ${esc(p.bank)} ${esc(p.accountMasked)}</p>` : ''}
  <h3 style="margin:14px 0 4px">근무 상세</h3>
  <table><tr><th>날짜</th><th>출근</th><th>퇴근</th><th>휴게</th><th>인정 근로</th><th>야간</th></tr>
  ${p.lines.map(l => `<tr><td>${md(l.date)}</td><td>${kstTime(l.in)}</td><td>${kstTime(l.out)}</td><td>${l.brk}분</td><td>${hoursText(l.worked)}</td><td>${l.night ? hoursText(l.night) : ''}</td></tr>`).join('')}</table>
  <p class="en" style="color:#000;margin-top:10px">※ 근로기준법 제48조 제2항에 따라 교부하는 임금명세서입니다.</p></div>`;
}
function scheduleHTML(w, store) {
  return `<div class="doc" style="max-width:none"><h1 style="font-size:16pt">근 무 표</h1><p>${esc(store)} · ${md(w.days[0])} ~ ${md(w.days[6])}</p>
  <table><tr><th>이름</th>${w.days.map(d => `<th>${md(d)}</th>`).join('')}<th>주간 합계</th></tr>
  ${w.rows.map(r => `<tr><td>${esc(r.name)}</td>${r.shifts.map(s => `<td>${s ? `${s.start}~${s.end}${s.brk ? `<br><small>휴게 ${s.brk}분</small>` : ''}` : '휴무'}</td>`).join('')}<td>${hoursText(r.shifts.reduce((a, s) => a + minsOf(s), 0))}</td></tr>`).join('')}</table></div>`;
}
function printDoc(html) {
  const area = $('#print-area'); area.innerHTML = html;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
}
