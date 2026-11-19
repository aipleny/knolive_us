'use strict';
// 알바챗 관리자 화면
let A = null, tab = 'today', weekDate = null, showRetired = false, editing = null, cellCtx = null, recEditing = null, lastPayroll = null;
const panel = name => $(`[data-panel="${name}"]`);
const staffById = id => A.staff.find(s => s.id === id);
const activeStaff = () => A.staff.filter(s => s.active).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
const monthEnd = ym => addDays((+ym.slice(5) === 12 ? (+ym.slice(0, 4) + 1) + '-01' : ym.slice(0, 5) + String(+ym.slice(5) + 1).padStart(2, '0')) + '-01', -1);
const weekStartOf = d => addDays(d, dowOf(d) === 0 ? -6 : 1 - dowOf(d));
const minWage = (date = A.today) => +(A.settings.minWages || {})[date.slice(0, 4)] || 0;
const shiftMins = s => { if (!s || !s.start) return 0; let m = (+s.end.slice(0, 2) * 60 + +s.end.slice(3)) - (+s.start.slice(0, 2) * 60 + +s.start.slice(3)); if (m <= 0) m += 1440; return Math.max(0, m - (+s.brk || 0)); };
const weeklyMins = s => [0, 1, 2, 3, 4, 5, 6].reduce((a, d) => a + shiftMins(s.schedule && s.schedule[d]), 0);
const ageOn = (birth, date) => { if (!birth) return null; let a = +date.slice(0, 4) - +birth.slice(0, 4); if (date.slice(5) < birth.slice(5)) a--; return a; };
function csv(name, head, rows) {
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const blob = new Blob(['﻿' + [head, ...rows].map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$$('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());

// ── 로그인 ──
async function boot() {
  const st = await api('/api/admin/state');
  $('#store').textContent = st.store || '';
  if (!st.setup) { $('#setup').hidden = false; return; }
  if (!st.loggedIn) { $('#login').hidden = false; $('#login-pw').focus(); return; }
  $('#setup').hidden = $('#login').hidden = true; $('#app').hidden = false; $('#logout').hidden = false;
  await refresh(); show(tab);
}
async function refresh() { A = await api('/api/admin/data'); $('#store').textContent = A.settings.store.name || ''; }
$('#setup').onsubmit = async e => {
  e.preventDefault();
  if ($('#setup-pw').value !== $('#setup-pw2').value) return $('#setup-err').textContent = '비밀번호가 서로 다릅니다.';
  try { await api('/api/admin/setup', { method: 'POST', body: { password: $('#setup-pw').value, storeName: $('#setup-store').value } }); tab = 'settings'; boot(); }
  catch (err) { $('#setup-err').textContent = err.message; }
};
$('#login').onsubmit = async e => {
  e.preventDefault();
  try { await api('/api/admin/login', { method: 'POST', body: { password: $('#login-pw').value } }); $('#login-pw').value = ''; boot(); }
  catch (err) { $('#login-err').textContent = err.message; }
};
$('#logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); location.reload(); };
$('#tabs').onclick = e => { const t = e.target.dataset.tab; if (t) show(t); };
async function show(t) {
  tab = t;
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $$('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== t);
  try { await ({ today: renderToday, staff: renderStaff, schedule: renderSchedule, records: renderRecords, payroll: renderPayroll, contract: renderContract, settings: renderSettings })[t](); }
  catch (e) { if (e.data && e.data.login) location.reload(); else toast(e.message, 'error'); }
}

// ── 오늘 ──
async function renderToday() {
  await refresh();
  const recs = (await api(`/api/admin/records?from=${addDays(A.today, -2)}&to=${A.today}`)).rows;
  const todays = recs.filter(r => r.date === A.today);
  const staff = activeStaff();
  const rows = staff.map(s => ({ s, mine: todays.filter(r => r.staffId === s.id).sort((a, b) => a.in.localeCompare(b.in)) }));
  const wk = await api('/api/admin/week?date=' + A.today);
  const di = wk.days.indexOf(A.today);
  const shiftOf = id => { const r = wk.rows.find(x => x.id === id); return r ? r.shifts[di] : null; };
  const scheduled = staff.filter(s => shiftOf(s.id));
  const stale = recs.filter(r => !r.out && Date.now() - Date.parse(r.in) > 16 * 3600000);
  const alerts = [];
  for (const s of staff) {
    if (minWage() && s.hourlyWage < minWage()) alerts.push(`${s.name}: 시급 ${won(s.hourlyWage)}이 올해 최저임금 ${won(minWage())}보다 낮습니다.`);
    const next = (A.settings.minWages || {})[+A.today.slice(0, 4) + 1];
    if (next && s.hourlyWage < next && A.today.slice(5) >= '11-01') alerts.push(`${s.name}: 내년 최저임금 ${won(next)} 적용 전 시급 조정이 필요합니다.`);
    for (const [k, label] of [['visaExpiry', '체류기간'], ['healthCert', '보건증']]) if (s[k] && s[k] <= addDays(A.today, 30)) alerts.push(`${s.name}: ${label} 만료${s[k] < A.today ? '됨' : ' 예정'} (${s[k]})`);
    if (s.nationality === 'FOREIGN' && /^D-?[24]/i.test(s.visa || '')) alerts.push(`${s.name}: 유학(D-2)·어학연수(D-4) 비자는 출입국관리사무소의 시간제취업 허가가 필요합니다. 허가 여부를 확인하세요.`);
    const age = ageOn(s.birth, A.today);
    if (age !== null && age < 18) alerts.push(`${s.name}: 만 ${age}세 연소근로자 — 가족관계증명서·친권자 동의서 비치, 1일 7시간·1주 35시간 이내, 야간·휴일근로 제한.`);
  }
  for (const r of stale) alerts.push(`${r.name}: ${md(r.date)} ${kstTime(r.in)} 출근 후 퇴근 기록이 없습니다. 출퇴근 기록에서 수정하세요.`);
  panel('today').innerHTML = `
    <div class="kpis">
      <div class="card stat"><span>근무 중</span><strong>${staff.filter(s => s.status === 'in').length}명</strong></div>
      <div class="card stat"><span>오늘 근무 예정</span><strong>${scheduled.length}명</strong></div>
      <div class="card stat"><span>등록 직원</span><strong>${staff.length}명</strong></div>
      <div class="card stat"><span>확인 필요</span><strong>${alerts.length}건</strong></div>
    </div>
    ${alerts.length ? `<div class="section">${alerts.map(a => `<div class="warnbox">${esc(a)}</div>`).join('')}</div>` : ''}
    <div class="card section"><div class="spread"><h2>${md(A.today)} 출근 현황</h2><button class="btn small" id="today-reload">새로고침</button></div>
    <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>이름</th><th>오늘 예정</th><th>출근</th><th>퇴근</th><th>상태</th></tr></thead><tbody>
    ${rows.map(({ s, mine }) => {
      const sh = shiftOf(s.id); const first = mine[0], last = mine[mine.length - 1];
      let state = s.status === 'in' ? '<span class="pill in">근무 중</span>' : mine.length ? '<span class="pill">퇴근</span>' : sh ? '<span class="pill warn">미출근</span>' : '<span class="pill">휴무</span>';
      if (first && sh) { const late = Math.round((Date.parse(first.in) - Date.parse(A.today + 'T' + sh.start + ':00+09:00')) / 60000); if (late > 5) state += ` <span class="pill out">지각 ${late}분</span>`; }
      return `<tr><td><span style="color:${esc(s.color)}">●</span> ${esc(s.name)}</td><td>${esc(shiftText(sh))}</td><td>${first ? kstTime(first.in) : ''}</td><td>${last && last.out ? kstTime(last.out) : ''}</td><td>${state}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">직원 탭에서 직원을 등록하세요.</td></tr>'}</tbody></table></div></div>
    ${A.clientIp && !(await api('/api/admin/state')).kiosk ? `<div class="infobox">이 기기를 매장 출퇴근 단말기(POS)로 쓰려면 <b>설정 → 이 기기를 출퇴근 단말기로 등록</b>을 누르세요.</div>` : ''}`;
  $('#today-reload').onclick = renderToday;
}

// ── 직원 ──
function renderStaff() {
  const list = A.staff.filter(s => showRetired || s.active).sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name, 'ko'));
  panel('staff').innerHTML = `<div class="spread section"><h2>직원 관리</h2><div class="row"><label class="chk"><input type="checkbox" id="show-retired" ${showRetired ? 'checked' : ''}> 퇴사자 보기</label><button class="btn primary" id="add-staff">+ 직원 등록</button></div></div>
  <div class="table-wrap"><table><thead><tr><th>이름</th><th>연락처</th><th>구분</th><th class="num">시급</th><th>주 소정근로</th><th>입사일</th><th>공제</th><th>비상연락</th><th>상태</th><th></th></tr></thead><tbody>
  ${list.map(s => {
    const wm = weeklyMins(s), low = minWage() && s.hourlyWage < minWage();
    return `<tr><td><span style="color:${esc(s.color)}">●</span> <b>${esc(s.name)}</b>${s.position ? `<br><span class="muted">${esc(s.position)}</span>` : ''}</td><td>${esc(s.phone)}</td>
    <td>${s.nationality === 'FOREIGN' ? `<span class="pill warn">외국인</span> ${esc(s.visa || '')}` : '내국인'}</td>
    <td class="num">${won(s.hourlyWage)}${low ? '<br><span class="pill out">최저임금 미달</span>' : ''}</td>
    <td>${hours(wm)}${wm && wm < 900 ? ' <span class="pill">주휴 없음</span>' : ''}</td><td>${esc(s.startDate || '')}</td>
    <td>${{ none: '없음', '3.3': '3.3%', insurance: '4대보험' }[s.deduction] || ''}</td><td>${esc([s.emergencyName, s.emergencyRelation, s.emergencyPhone].filter(Boolean).join(' · '))}</td>
    <td>${!s.active ? '<span class="pill">퇴사</span>' : s.status === 'in' ? '<span class="pill in">근무 중</span>' : ''}${s.hasPin ? '' : ' <span class="pill out">PIN 없음</span>'}</td>
    <td><button class="btn small" data-edit="${s.id}">수정</button></td></tr>`;
  }).join('') || '<tr><td colspan="10" class="muted">등록된 직원이 없습니다.</td></tr>'}</tbody></table></div>
  <p class="muted">근로기준법상 근로자명부·임금대장·근로계약서는 퇴사 후 3년간 보존해야 합니다. 출퇴근 기록이 있는 직원은 삭제 대신 퇴사 처리하세요.</p>`;
  $('#add-staff').onclick = () => openStaff(null);
  $('#show-retired').onchange = e => { showRetired = e.target.checked; renderStaff(); };
  $$('[data-edit]').forEach(b => b.onclick = () => openStaff(staffById(b.dataset.edit)));
}
const SCH_DAYS = [1, 2, 3, 4, 5, 6, 0];
function openStaff(s) {
  editing = s; const f = $('#staff-form'); f.reset();
  $('#staff-dlg-title').textContent = s ? `${s.name} 정보 수정` : '직원 등록';
  $('#staff-err').textContent = '';
  for (const el of f.elements) if (el.name && s && el.name in s && el.type !== 'radio') el.value = s[el.name] || (el.type === 'color' ? '#2b5ce6' : '');
  f.nationality.value = s ? s.nationality || 'KR' : 'KR';
  if (!s) { f.hourlyWage.value = minWage() || ''; f.startDate.value = A.today; f.color.value = ['#2b5ce6', '#14966b', '#d4570f', '#8e44ad', '#c0392b', '#16a2b8', '#b8860b'][A.staff.length % 7]; }
  $('#rrn-now').innerHTML = s && s.rrnMasked ? `현재 ${esc(s.rrnMasked)} · <a href="#" data-reveal>보기</a>` : '';
  $('#alien-now').innerHTML = s && s.alienNoMasked ? `현재 ${esc(s.alienNoMasked)} · <a href="#" data-reveal>보기</a>` : '';
  $('#acct-now').innerHTML = s && s.accountMasked ? `현재 ${esc(s.accountMasked)} · <a href="#" data-reveal>보기</a>` : '';
  $('#pin-hint').textContent = s && s.hasPin ? '바꿀 때만 입력' : '숫자 4~6자리 (필수)';
  $$('[data-reveal]').forEach(a => a.onclick = async e => {
    e.preventDefault(); const r = await api(`/api/admin/staff/${s.id}/sensitive`);
    f.rrn.value = r.rrn; f.alienNo.value = r.alienNo; f.account.value = r.account;
  });
  $('#sch-edit').innerHTML = SCH_DAYS.map(d => { const x = (s && s.schedule && s.schedule[d]) || {}; return `<div class="sch-edit"><span class="d">${DOW[d]}</span><input type="time" data-d="${d}" data-k="start" value="${esc(x.start || '')}" aria-label="${DOW[d]}요일 시작"><input type="time" data-d="${d}" data-k="end" value="${esc(x.end || '')}" aria-label="${DOW[d]}요일 종료"><input type="number" min="0" step="5" data-d="${d}" data-k="brk" value="${esc(x.brk || '')}" placeholder="휴게분" aria-label="${DOW[d]}요일 휴게(분)"></div>`; }).join('');
  $('#staff-delete').hidden = !s; $('#staff-toggle').hidden = !s;
  $('#staff-toggle').textContent = s && !s.active ? '재직으로 복귀' : '퇴사 처리';
  natToggle(); wageHint();
  $('#staff-dlg').showModal();
}
function natToggle() { const fr = $('#staff-form').nationality.value === 'FOREIGN'; $('#kr-fields').hidden = fr; $('#fr-fields').hidden = !fr; }
function wageHint() { const w = +$('#staff-form').hourlyWage.value; $('#minwage-hint').textContent = minWage() ? `${A.today.slice(0, 4)}년 최저임금 ${won(minWage())}${w && w < minWage() ? ' — 현재 입력한 시급이 최저임금보다 낮습니다!' : ''}` : ''; }
$('#staff-form').addEventListener('change', e => { if (e.target.name === 'nationality') natToggle(); });
$('#staff-form').hourlyWage.addEventListener('input', wageHint);
$('#staff-form').onsubmit = async e => {
  e.preventDefault();
  const f = e.target, body = {};
  for (const el of f.elements) if (el.name && (el.type !== 'radio' || el.checked)) body[el.name] = el.value;
  body.schedule = {};
  for (const d of SCH_DAYS) {
    const g = k => $(`#sch-edit [data-d="${d}"][data-k="${k}"]`).value;
    if (g('start') && g('end')) body.schedule[d] = { start: g('start'), end: g('end'), brk: g('brk') || 0 };
    else if (g('start') || g('end')) return $('#staff-err').textContent = `${DOW[d]}요일 시작·종료 시각을 모두 입력하세요.`;
  }
  if (!editing && !body.pin) return $('#staff-err').textContent = '출퇴근 PIN을 정해 주세요.';
  try {
    await api(editing ? `/api/admin/staff/${editing.id}` : '/api/admin/staff', { method: editing ? 'PUT' : 'POST', body });
    $('#staff-dlg').close(); toast('저장했습니다.', 'ok'); await refresh(); show(tab);
  } catch (err) { $('#staff-err').textContent = err.message; }
};
$('#staff-toggle').onclick = async () => {
  const s = editing, retire = s.active;
  if (retire && !confirm(`${s.name}님을 퇴사 처리할까요? 기록은 그대로 보존됩니다.`)) return;
  const body = { active: !retire }; if (retire && !s.endDate) body.endDate = A.today;
  await api(`/api/admin/staff/${s.id}`, { method: 'PUT', body }); $('#staff-dlg').close(); await refresh(); show(tab);
};
$('#staff-delete').onclick = async () => {
  if (!confirm(`${editing.name}님을 완전히 삭제할까요?`)) return;
  try { await api(`/api/admin/staff/${editing.id}`, { method: 'DELETE' }); $('#staff-dlg').close(); await refresh(); show(tab); }
  catch (err) { $('#staff-err').textContent = err.message; }
};

// ── 근무표 ──
async function renderSchedule() {
  weekDate = weekDate || A.today;
  const w = await api('/api/admin/week?date=' + weekDate);
  A.week = w;
  panel('schedule').innerHTML = `<div class="spread section"><h2>근무표 · ${md(w.days[0])} ~ ${md(w.days[6])}</h2><div class="row">
    <button class="btn small" id="wk-prev">◀ 지난주</button><button class="btn small" id="wk-now">이번 주</button><button class="btn small" id="wk-next">다음 주 ▶</button><button class="btn small" id="wk-print">인쇄</button></div></div>
    <div class="table-wrap"><table class="sched"><thead><tr><th>이름</th>${w.days.map(d => `<th class="${d === A.today ? 'today' : ''}">${md(d)}</th>`).join('')}<th>주간 합계</th></tr></thead><tbody>
    ${w.rows.map(r => `<tr><td><span style="color:${esc(r.color)}">●</span> ${esc(r.name)}</td>${r.shifts.map((s, i) => `<td class="cell ${w.days[i] === A.today ? 'today' : ''} ${s ? (s.override ? 'ov' : '') : 'off'}" data-sid="${r.id}" data-date="${w.days[i]}">${s ? `${s.start}~${s.end}${s.brk ? `<br><small class="muted">휴게 ${s.brk}분</small>` : ''}` : '휴무'}</td>`).join('')}
    <td>${hours(r.shifts.reduce((a, s) => a + shiftMins(s), 0))}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">직원을 먼저 등록하세요.</td></tr>'}
    </tbody></table></div><p class="muted">칸을 누르면 그 날짜만 근무시간을 바꾸거나 휴무로 지정할 수 있습니다. <span class="ov" style="color:var(--brand);font-weight:700">파란 글씨</span>는 날짜별로 변경된 일정입니다. 매주 반복되는 기본 근무표는 직원 정보에서 바꿉니다.</p>`;
  $('#wk-prev').onclick = () => { weekDate = addDays(w.days[0], -7); renderSchedule(); };
  $('#wk-next').onclick = () => { weekDate = addDays(w.days[0], 7); renderSchedule(); };
  $('#wk-now').onclick = () => { weekDate = A.today; renderSchedule(); };
  $('#wk-print').onclick = () => printDoc(scheduleHTML(w, A.settings.store.name));
  $$('.sched td.cell').forEach(td => td.onclick = () => openCell(td.dataset.sid, td.dataset.date));
}
function openCell(sid, date) {
  const s = staffById(sid), row = A.week.rows.find(r => r.id === sid), cur = row.shifts[A.week.days.indexOf(date)];
  const base = s.schedule && s.schedule[dowOf(date)];
  cellCtx = { sid, date };
  $('#cell-title').textContent = `${s.name} · ${md(date)}`;
  $('#cell-base').textContent = `기본 근무표: ${shiftText(base)}`;
  $('#cell-start').value = cur ? cur.start : (base ? base.start : ''); $('#cell-end').value = cur ? cur.end : (base ? base.end : ''); $('#cell-brk').value = cur ? cur.brk || '' : '';
  $('#cell-err').textContent = ''; $('#cell-dlg').showModal();
}
async function cellSave(mode) {
  try {
    await api('/api/admin/overrides', { method: 'POST', body: { staffId: cellCtx.sid, date: cellCtx.date, mode, start: $('#cell-start').value, end: $('#cell-end').value, brk: $('#cell-brk').value } });
    $('#cell-dlg').close(); await refresh(); renderSchedule();
  } catch (e) { $('#cell-err').textContent = e.message; }
}
$('#cell-save').onclick = () => cellSave('set'); $('#cell-off').onclick = () => cellSave('off'); $('#cell-reset').onclick = () => cellSave('reset');

// ── 출퇴근 기록 ──
let recFilter = null;
async function renderRecords() {
  recFilter = recFilter || { from: weekStartOf(A.today), to: A.today, staffId: '' };
  const q = new URLSearchParams(recFilter);
  const data = await api('/api/admin/records?' + q);
  const totalMin = data.rows.reduce((a, r) => a + (r.calc ? r.calc.worked : 0), 0);
  panel('records').innerHTML = `<div class="spread section"><h2>출퇴근 기록</h2><button class="btn primary" id="rec-add">+ 기록 추가</button></div>
  <div class="card section"><div class="grid g4" style="align-items:end">
    <label class="f">시작일<input type="date" id="rf-from" value="${recFilter.from}"></label><label class="f">종료일<input type="date" id="rf-to" value="${recFilter.to}"></label>
    <label class="f">직원<select id="rf-staff"><option value="">전체</option>${A.staff.map(s => `<option value="${s.id}" ${s.id === recFilter.staffId ? 'selected' : ''}>${esc(s.name)}${s.active ? '' : ' (퇴사)'}</option>`).join('')}</select></label>
    <div class="row"><button class="btn" id="rf-go">조회</button><button class="btn" id="rf-csv">CSV</button></div></div></div>
  <p class="muted">${data.rows.length}건 · 인정 근무시간 합계 ${hours(totalMin)}</p>
  <div class="table-wrap"><table><thead><tr><th>근무일</th><th>이름</th><th>예정</th><th>출근</th><th>퇴근</th><th class="num">휴게</th><th class="num">인정 근무</th><th class="num">야간</th><th>비고</th><th></th></tr></thead><tbody>
  ${data.rows.map(r => `<tr><td>${md(r.date)}</td><td>${esc(r.name)}</td><td class="muted">${esc(r.shift ? r.shift.start + '~' + r.shift.end : '-')}</td><td>${kstTime(r.in)}</td>
    <td>${r.out ? kstTime(r.out) + (kstDate(r.out) !== r.date ? ' <small class="muted">(+1일)</small>' : '') : '<span class="pill in">근무 중</span>'}</td>
    <td class="num">${r.calc ? r.calc.brk + '분' : ''}${r.brk == null && r.calc && r.calc.brk ? '<small class="muted"> 자동</small>' : ''}</td><td class="num">${r.calc ? hours(r.calc.worked) : ''}</td><td class="num">${r.calc && r.calc.night ? hours(r.calc.night) : ''}</td>
    <td>${r.edited ? '<span class="pill warn">수정됨</span> ' : ''}${r.source === 'mobile' ? '<span class="pill">휴대폰</span> ' : ''}${esc(r.note || '')}</td><td><button class="btn small" data-rec="${r.id}">수정</button></td></tr>`).join('') || '<tr><td colspan="10" class="muted">기록이 없습니다.</td></tr>'}
  </tbody></table></div>`;
  const go = () => { recFilter = { from: $('#rf-from').value, to: $('#rf-to').value, staffId: $('#rf-staff').value }; renderRecords(); };
  $('#rf-go').onclick = go; $('#rf-staff').onchange = go;
  $('#rf-csv').onclick = () => csv(`출퇴근기록_${recFilter.from}_${recFilter.to}.csv`, ['근무일', '이름', '예정', '출근', '퇴근', '휴게(분)', '인정근무(분)', '야간(분)', '비고'],
    data.rows.map(r => [r.date, r.name, r.shift ? r.shift.start + '~' + r.shift.end : '', kstTime(r.in), r.out ? kstDate(r.out) + ' ' + kstTime(r.out) : '', r.calc ? r.calc.brk : '', r.calc ? r.calc.worked : '', r.calc ? r.calc.night : '', r.note || '']));
  $('#rec-add').onclick = () => openRec(null);
  $$('[data-rec]').forEach(b => b.onclick = () => openRec(data.rows.find(r => r.id === b.dataset.rec)));
}
function openRec(r) {
  recEditing = r;
  $('#rec-title').textContent = r ? '출퇴근 기록 수정' : '출퇴근 기록 추가';
  $('#rec-staff').innerHTML = A.staff.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('#rec-staff').value = r ? r.staffId : (recFilter.staffId || (activeStaff()[0] || {}).id || '');
  $('#rec-staff').disabled = !!r;
  $('#rec-date').value = r ? r.date : A.today; $('#rec-in').value = r ? kstTime(r.in) : ''; $('#rec-out').value = r && r.out ? kstTime(r.out) : '';
  $('#rec-brk').value = r && r.brk != null ? r.brk : ''; $('#rec-note').value = r ? r.note || '' : '';
  $('#rec-delete').hidden = !r; $('#rec-err').textContent = '';
  $('#rec-dlg').showModal();
}
$('#rec-save').onclick = async () => {
  const body = { staffId: $('#rec-staff').value, date: $('#rec-date').value, inTime: $('#rec-in').value, outTime: $('#rec-out').value, brk: $('#rec-brk').value, note: $('#rec-note').value };
  try { await api(recEditing ? `/api/admin/records/${recEditing.id}` : '/api/admin/records', { method: recEditing ? 'PUT' : 'POST', body }); $('#rec-dlg').close(); renderRecords(); }
  catch (e) { $('#rec-err').textContent = e.message; }
};
$('#rec-delete').onclick = async () => { if (!confirm('이 기록을 삭제할까요?')) return; await api(`/api/admin/records/${recEditing.id}`, { method: 'DELETE' }); $('#rec-dlg').close(); renderRecords(); };

// ── 급여 정산 ──
let payFilter = null;
async function renderPayroll() {
  if (!payFilter) { const ym = A.today.slice(0, 7); payFilter = { mode: 'month', month: ym, week: weekStartOf(A.today), from: ym + '-01', to: monthEnd(ym) }; }
  const pf = payFilter;
  if (pf.mode === 'month') { pf.from = pf.month + '-01'; pf.to = monthEnd(pf.month); }
  if (pf.mode === 'week') { pf.from = weekStartOf(pf.week); pf.to = addDays(pf.from, 6); }
  const data = await api(`/api/admin/payroll?from=${pf.from}&to=${pf.to}`);
  lastPayroll = data;
  const nextPay = () => { const [y, m] = pf.to.split('-').map(Number); const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(A.settings.payDay || 10, 28)).padStart(2, '0')}`; };
  pf.payDate = pf.payDate || nextPay();
  const sum = k => data.list.reduce((a, p) => a + p[k], 0);
  panel('payroll').innerHTML = `<div class="spread section"><h2>급여 정산</h2><div class="row"><button class="btn" id="pay-csv">CSV</button><button class="btn primary" id="pay-print-all">임금명세서 전체 인쇄</button></div></div>
  <div class="card section"><div class="grid g4" style="align-items:end">
    <label class="f">정산 단위<select id="pf-mode"><option value="month">월급 (월 단위)</option><option value="week">주급 (주 단위)</option><option value="range">기간 직접 선택</option></select></label>
    <label class="f" id="pf-month-l">월<input type="month" id="pf-month" value="${pf.month}"></label>
    <label class="f" id="pf-week-l">주(아무 날짜나 선택)<input type="date" id="pf-week" value="${pf.week}"></label>
    <label class="f" id="pf-from-l">시작일<input type="date" id="pf-from" value="${pf.from}"></label><label class="f" id="pf-to-l">종료일<input type="date" id="pf-to" value="${pf.to}"></label>
    <label class="f">지급일 <small>임금명세서 표시</small><input type="date" id="pf-paydate" value="${pf.payDate}"></label>
    <button class="btn" id="pf-go">계산</button></div>
    <p class="muted" style="margin-top:10px">${pf.from} ~ ${pf.to} · ${A.settings.fivePlus ? '상시근로자 5인 이상: 연장·야간 50% 가산 적용' : '상시근로자 4인 이하: 연장·야간 가산 미적용 (설정에서 변경)'} · 주휴수당은 주(월~일)의 일요일이 속한 기간에 반영</p></div>
  <div class="kpis"><div class="card stat"><span>총 근무시간</span><strong>${hours(sum('workedMin'))}</strong></div><div class="card stat"><span>주휴수당 합계</span><strong>${won(sum('holidayPay'))}</strong></div><div class="card stat"><span>세전 지급 합계</span><strong>${won(sum('gross'))}</strong></div><div class="card stat"><span>실지급 합계</span><strong>${won(sum('net'))}</strong></div></div>
  <div class="table-wrap"><table><thead><tr><th>이름</th><th class="num">시급</th><th class="num">근무시간</th><th class="num">기본급</th><th class="num">주휴수당</th><th class="num">연장·야간</th><th class="num">세전</th><th class="num">공제</th><th class="num">실지급</th><th></th></tr></thead><tbody>
  ${data.list.map((p, i) => `<tr><td><b>${esc(p.name)}</b>${p.warnings.map(w => `<br><span class="pill out">${esc(w)}</span>`).join('')}</td><td class="num">${won(p.wage)}</td><td class="num">${hours(p.workedMin)}</td><td class="num">${won(p.base)}</td><td class="num">${won(p.holidayPay)}</td><td class="num">${won(p.overtimePay + p.nightPay)}</td><td class="num">${won(p.gross)}</td><td class="num">${won(p.deductionTotal)}</td><td class="num"><b>${won(p.net)}</b></td>
    <td><div class="row" style="flex-wrap:nowrap"><button class="btn small" data-detail="${i}">주별 상세</button><button class="btn small" data-slip="${i}">명세서</button></div></td></tr>
    <tr data-detail-row="${i}" hidden><td colspan="10" style="background:#fafbfd"><table><thead><tr><th>주</th><th>예정 소정근로</th><th>실근무</th><th>주휴 판단</th><th class="num">이번 정산 반영 주휴</th></tr></thead><tbody>
    ${p.weeks.map(w => `<tr><td>${md(w.start)} ~ ${md(w.end)}</td><td>${hours(w.scheduledMin)}</td><td>${hours(w.workedMin)}</td><td>${esc(w.status)}</td><td class="num">${w.counted ? won(w.holidayPay) : '<span class="muted">다른 기간에 반영</span>'}</td></tr>`).join('')}</tbody></table>
    ${p.deductions.length ? `<p class="muted">공제: ${p.deductions.map(d => `${esc(d[0])} ${won(d[1])}`).join(' · ')}</p>` : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="muted">해당 기간에 계산할 직원이 없습니다.</td></tr>'}
  </tbody></table></div>
  <div class="infobox">· 주휴수당: 1주 소정근로시간 15시간 이상이고 그 주 근무 예정일을 모두 출근했을 때, (주 소정근로시간 ÷ 40 × 8 × 시급), 최대 8시간분. 근무표가 없는 주는 실제 근무시간을 기준으로 봅니다.<br>
  · 공제 3.3%는 사업소득 원천징수(소득세 3% + 지방소득세 0.3%), 4대보험은 근로자 부담분 추정치이며 근로소득 간이세액은 포함하지 않습니다. 요율은 설정에서 바꿀 수 있습니다.<br>
  · 휴일근로 가산, 월 중도 입·퇴사 일할 등 특수한 경우는 노무사·세무사 확인을 권합니다.</div>`;
  $('#pf-mode').value = pf.mode;
  const vis = () => { const m = $('#pf-mode').value; $('#pf-month-l').hidden = m !== 'month'; $('#pf-week-l').hidden = m !== 'week'; $('#pf-from-l').hidden = $('#pf-to-l').hidden = m !== 'range'; };
  vis(); $('#pf-mode').onchange = vis;
  $('#pf-go').onclick = () => { payFilter = { mode: $('#pf-mode').value, month: $('#pf-month').value, week: $('#pf-week').value, from: $('#pf-from').value, to: $('#pf-to').value, payDate: '' }; renderPayroll(); };
  $('#pf-paydate').onchange = e => pf.payDate = e.target.value;
  $$('[data-detail]').forEach(b => b.onclick = () => { const r = $(`[data-detail-row="${b.dataset.detail}"]`); r.hidden = !r.hidden; });
  $$('[data-slip]').forEach(b => b.onclick = () => printDoc(payslipHTML(data.list[b.dataset.slip], data.store, pf.payDate)));
  $('#pay-print-all').onclick = () => printDoc(data.list.map((p, i) => `<div class="${i ? 'page-break' : ''}">${payslipHTML(p, data.store, pf.payDate)}</div>`).join(''));
  $('#pay-csv').onclick = () => csv(`급여정산_${pf.from}_${pf.to}.csv`, ['이름', '시급', '근무시간(분)', '연장(분)', '야간(분)', '기본급', '주휴수당', '연장수당', '야간수당', '세전', '공제', '실지급', '은행', '계좌'],
    data.list.map(p => [p.name, p.wage, p.workedMin, p.overtimeMin, p.nightMin, p.base, p.holidayPay, p.overtimePay, p.nightPay, p.gross, p.deductionTotal, p.net, p.bank || '', p.accountMasked || '']));
}

// ── 근로계약서 ──
let ctStaff = '', ctType = '';
function autoType(s) {
  const age = ageOn(s.birth, A.today);
  if (s.nationality === 'FOREIGN') return 'foreign';
  if (age !== null && age < 18) return 'minor';
  if (weeklyMins(s) < 2400) return 'parttime';
  return s.endDate ? 'fixed' : 'regular';
}
function renderContract() {
  const list = activeStaff();
  if (!list.find(s => s.id === ctStaff)) { ctStaff = list[0] ? list[0].id : ''; ctType = ''; }
  const s = staffById(ctStaff);
  const past = A.contracts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!s) { panel('contract').innerHTML = '<div class="card">직원을 먼저 등록하세요.</div>'; return; }
  ctType = ctType || autoType(s);
  const hol = [0, 6, 5, 4, 3, 2, 1].find(d => !(s.schedule && s.schedule[d])) ?? 0;
  const st = A.settings.store;
  panel('contract').innerHTML = `<div class="spread section"><h2>근로계약서 작성</h2></div>
  <div class="card section"><form id="ct-form" class="grid g3">
    <label class="f">직원<select id="ct-staff">${list.map(x => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${esc(x.name)}${x.nationality === 'FOREIGN' ? ' (외국인)' : ''}</option>`).join('')}</select></label>
    <label class="f" style="grid-column:span 2">계약서 양식 <small>국적·나이·근무시간에 따라 자동 추천</small><select id="ct-type">${Object.entries(CONTRACT_TYPES).map(([k, v]) => `<option value="${k}" ${k === ctType ? 'selected' : ''}>${v}${k === autoType(s) ? ' (추천)' : ''}</option>`).join('')}</select></label>
    <label class="f">근로개시일<input name="startDate" type="date" value="${esc(s.startDate || A.today)}"></label>
    <label class="f">계약 종료일 <small>기간제·외국인만</small><input name="endDate" type="date" value="${esc(s.endDate || '')}"></label>
    <label class="f">계약 체결일<input name="signDate" type="date" value="${A.today}"></label>
    <label class="f">근무 장소<input name="place" value="${esc(st.address ? `${st.name} (${st.address})` : st.name)}"></label>
    <label class="f" style="grid-column:span 2">업무 내용<input name="job" value="${esc(s.jobDesc || s.position || '')}"></label>
    <label class="f">시급(원)<input name="wage" type="number" value="${esc(s.hourlyWage)}"></label>
    <label class="f">주휴일<select name="weeklyHoliday">${DOW.map((d, i) => `<option ${i === hol ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
    <label class="f">임금 지급일(매월)<input name="payDay" type="number" min="1" max="31" value="${esc(A.settings.payDay)}"></label>
    <label class="f">상여금 <small>없으면 비움</small><input name="bonus"></label>
    <label class="f">기타 수당 <small>없으면 비움</small><input name="otherPay" placeholder="예: 식대 월 5만원"></label>
    <label class="f">지급 방법<select name="payMethod"><option value="account" ${A.settings.payMethod !== 'direct' ? 'selected' : ''}>근로자 명의 통장 입금</option><option value="direct" ${A.settings.payMethod === 'direct' ? 'selected' : ''}>직접 지급</option></select></label>
    <div style="grid-column:1/-1"><span class="muted">사회보험 적용</span><div class="row">
      <label class="chk"><input type="checkbox" name="ins_employment" checked> 고용보험</label><label class="chk"><input type="checkbox" name="ins_industrial" checked> 산재보험</label>
      <label class="chk"><input type="checkbox" name="ins_pension" ${s.deduction === 'insurance' ? 'checked' : ''}> 국민연금</label><label class="chk"><input type="checkbox" name="ins_health" ${s.deduction === 'insurance' ? 'checked' : ''}> 건강보험</label></div></div>
    <fieldset id="ct-foreign" style="grid-column:1/-1" ${ctType === 'foreign' ? '' : 'hidden'}><legend>외국인근로자 항목</legend><div class="grid g3">
      <label class="f">입국 구분<select name="entry"><option value="new">신규</option><option value="re">재입국자</option><option value="change">사업장 변경</option></select></label>
      <label class="f">수습기간(개월) <small>없으면 비움</small><input name="probation" type="number" min="0"></label>
      <label class="f">수습 중 임금<input name="probationWage" placeholder="예: 정상 임금 지급"></label>
      <label class="chk"><input type="checkbox" name="housing"> 숙소 제공</label><label class="f">숙소 비용·내용<input name="housingNote" placeholder="예: 무료 / 월 10만원 공제"></label><span></span>
      <label class="chk"><input type="checkbox" name="meals"> 식사 제공</label><label class="f">식사 비용·내용<input name="mealsNote" placeholder="예: 근무 중 1식 무료"></label></div>
      <p class="muted">본국 주소·체류자격은 직원 정보에서 입력합니다. 현재: ${esc(s.homeAddress || '본국 주소 없음')} / ${esc(s.visa || '체류자격 없음')}</p></fieldset>
    <fieldset id="ct-minor" style="grid-column:1/-1" ${ctType === 'minor' ? '' : 'hidden'}><legend>연소근로자 · 친권자(후견인) 동의서</legend><div class="grid g3">
      <label class="chk"><input type="checkbox" name="minorDocs" checked> 가족관계증명서·동의서 구비</label>
      <label class="f">친권자 성명<input name="g_name"></label><label class="f">관계<input name="g_relation" placeholder="예: 부"></label>
      <label class="f">생년월일<input name="g_birth" type="date"></label><label class="f">연락처<input name="g_phone"></label><label class="f">주소<input name="g_address"></label></div></fieldset>
  </form>
  ${!st.owner || !st.address ? '<div class="warnbox">설정에서 대표자명·사업장 주소·전화번호를 입력하면 계약서에 자동으로 들어갑니다.</div>' : ''}
  ${!Object.keys(s.schedule || {}).length ? '<div class="warnbox">이 직원의 주간 기본 근무표가 비어 있습니다. 직원 정보에서 근무 요일·시간을 입력하면 계약서의 근로시간이 채워집니다.</div>' : ''}
  <div class="row" style="margin-top:14px"><button class="btn" id="ct-preview">미리보기</button><button class="btn primary" id="ct-print">저장하고 인쇄</button></div></div>
  <div class="card section" id="ct-preview-box" hidden style="overflow:auto"></div>
  <div class="card section"><h3>작성한 계약서</h3><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>작성일</th><th>직원</th><th>양식</th><th></th></tr></thead><tbody>
  ${past.map(c => `<tr><td>${kstDate(c.createdAt)} ${kstTime(c.createdAt)}</td><td>${esc((staffById(c.staffId) || {}).name || '(삭제됨)')}</td><td>${esc(c.title)}</td><td><div class="row"><button class="btn small" data-reprint="${c.id}">다시 인쇄</button><button class="btn small danger" data-ctdel="${c.id}">삭제</button></div></td></tr>`).join('') || '<tr><td colspan="4" class="muted">아직 없습니다.</td></tr>'}</tbody></table></div>
  <p class="muted">근로계약서는 2부 작성해 서명 후 1부를 근로자에게 교부해야 합니다(근로기준법 제17조, 미교부 시 500만원 이하 벌금). 퇴사 후 3년간 보관하세요.</p></div>`;
  $('#ct-staff').onchange = e => { ctStaff = e.target.value; ctType = ''; renderContract(); };
  $('#ct-type').onchange = e => { ctType = e.target.value; $('#ct-foreign').hidden = ctType !== 'foreign'; $('#ct-minor').hidden = ctType !== 'minor'; };
  $('#ct-preview').onclick = () => { const b = $('#ct-preview-box'); b.hidden = false; b.innerHTML = contractHTML(contractFields(s)); b.scrollIntoView({ behavior: 'smooth' }); };
  $('#ct-print').onclick = async () => {
    const f = contractFields(s);
    await api('/api/admin/contracts', { method: 'POST', body: { staffId: s.id, type: f.type, title: CONTRACT_TYPES[f.type], fields: f } });
    await refresh(); printDoc(contractHTML(f)); renderContract();
  };
  $$('[data-reprint]').forEach(b => b.onclick = async () => { const c = await api('/api/admin/contracts/' + b.dataset.reprint); printDoc(contractHTML(c.fields)); });
  $$('[data-ctdel]').forEach(b => b.onclick = async () => { if (!confirm('목록에서 삭제할까요?')) return; await api('/api/admin/contracts/' + b.dataset.ctdel, { method: 'DELETE' }); await refresh(); renderContract(); });
}
function contractFields(s) {
  const f = $('#ct-form'), v = n => f.elements[n] ? (f.elements[n].type === 'checkbox' ? f.elements[n].checked : f.elements[n].value) : '';
  const st = A.settings.store;
  return {
    type: $('#ct-type').value, store: { ...st }, fivePlus: A.settings.fivePlus,
    worker: { name: s.name, phone: s.phone, address: s.address, birth: s.birth, age: ageOn(s.birth, A.today), country: s.country, homeAddress: s.homeAddress, visa: s.visa },
    days: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, (s.schedule || {})[d] || null])),
    startDate: v('startDate'), endDate: v('endDate'), signDate: v('signDate'), place: v('place'), job: v('job'), wage: +v('wage'), weeklyHoliday: v('weeklyHoliday'),
    payDay: v('payDay'), bonus: v('bonus'), otherPay: v('otherPay'), payMethod: v('payMethod'),
    insurance: { employment: v('ins_employment'), industrial: v('ins_industrial'), pension: v('ins_pension'), health: v('ins_health') },
    entry: v('entry'), probation: v('probation'), probationWage: v('probationWage'), housing: v('housing'), housingNote: v('housingNote'), meals: v('meals'), mealsNote: v('mealsNote'),
    minorDocs: v('minorDocs'), guardian: { name: v('g_name'), relation: v('g_relation'), birth: v('g_birth'), phone: v('g_phone'), address: v('g_address') },
  };
}

// ── 설정 ──
async function renderSettings() {
  await refresh();
  const s = A.settings, st = s.store, r = s.insuranceRates, g = s.geofence || {};
  const state = await api('/api/admin/state');
  panel('settings').innerHTML = `
  <div class="card section"><h2>이 기기 · 출퇴근 단말기</h2>
    <p class="muted" style="margin:6px 0 12px">매장 POS·태블릿에서 이 버튼을 한 번 누르면, 그 기기의 첫 화면(<b>${esc(location.origin)}/</b>)이 직원 출퇴근 화면이 됩니다. 등록되지 않은 기기에서는 직원 목록이 보이지 않습니다.</p>
    <div class="row">${state.kiosk ? '<span class="pill in">이 기기는 단말기로 등록됨</span>' : ''}<button class="btn primary" id="kiosk-reg">이 기기를 출퇴근 단말기로 등록</button><button class="btn danger" id="kiosk-reset">모든 단말기 등록 해제</button></div></div>
  <form class="card section" id="set-store"><h2>사업장 정보 <small class="muted">근로계약서·임금명세서에 들어갑니다</small></h2><div class="grid g3" style="margin-top:12px">
    <label class="f">상호<input name="name" value="${esc(st.name)}"></label><label class="f">대표자<input name="owner" value="${esc(st.owner)}"></label><label class="f">사업자등록번호<input name="bizNo" value="${esc(st.bizNo)}"></label>
    <label class="f" style="grid-column:span 2">사업장 주소<input name="address" value="${esc(st.address)}"></label><label class="f">전화번호<input name="phone" value="${esc(st.phone)}"></label>
    <label class="f">업종<input name="industry" value="${esc(st.industry)}" placeholder="예: 음식점업"></label></div><button class="btn primary" style="margin-top:12px">저장</button></form>
  <form class="card section" id="set-rules"><h2>근무·급여 규칙</h2><div class="grid g3" style="margin-top:12px">
    <label class="chk" style="grid-column:1/-1"><input type="checkbox" name="fivePlus" ${s.fivePlus ? 'checked' : ''}> <span><b>상시근로자 5인 이상 사업장</b><br><span class="muted">켜면 연장(1일 8시간·1주 40시간 초과)·야간(22시~06시) 근로에 통상임금 50% 가산을 계산합니다.</span></span></label>
    <label class="chk" style="grid-column:1/-1"><input type="checkbox" name="breakAuto" ${s.breakAuto ? 'checked' : ''}> <span><b>휴게시간 자동 차감</b><br><span class="muted">근무표·기록에 휴게가 없으면 법정 최소 휴게(4시간 이상 30분, 8시간 이상 1시간)를 뺍니다.</span></span></label>
    <label class="chk" style="grid-column:1/-1"><input type="checkbox" name="earlyFromSchedule" ${s.earlyFromSchedule ? 'checked' : ''}> <span><b>일찍 출근해도 예정 시작시각부터 인정</b><br><span class="muted">업무 지시 없이 일찍 온 경우만 해당합니다. 실제로 일을 시켰다면 근무시간으로 인정해야 합니다.</span></span></label>
    <label class="f">근무시간 계산 단위<select name="rounding">${[1, 5, 10, 15, 30].map(x => `<option value="${x}" ${+s.rounding === x ? 'selected' : ''}>${x}분 (나머지 버림)</option>`).join('')}</select></label>
    <label class="f">임금 지급일(매월)<input name="payDay" type="number" min="1" max="31" value="${esc(s.payDay)}"></label>
    <label class="f">기본 지급 방법<select name="payMethod"><option value="account">통장 입금</option><option value="direct" ${s.payMethod === 'direct' ? 'selected' : ''}>직접 지급</option></select></label>
  </div>
  <h3 style="margin-top:16px">연도별 최저임금 (시급)</h3><div class="grid g4" style="margin-top:8px" id="mw">${Object.entries(s.minWages || {}).map(([y, v]) => `<label class="f">${y}년<input data-year="${y}" type="number" value="${v}"></label>`).join('')}<label class="f">연도 추가<input id="mw-new-y" type="number" placeholder="예: ${+A.today.slice(0, 4) + 2}"></label><label class="f">시급<input id="mw-new-v" type="number"></label></div>
  <h3 style="margin-top:16px">4대보험 근로자 부담 요율 (%)</h3><div class="grid g4" style="margin-top:8px">
    <label class="f">국민연금<input name="pension" type="number" step="0.001" value="${r.pension}"></label><label class="f">건강보험<input name="health" type="number" step="0.001" value="${r.health}"></label>
    <label class="f">장기요양 <small>건강보험료 대비 %</small><input name="ltcOfHealth" type="number" step="0.01" value="${r.ltcOfHealth}"></label><label class="f">고용보험<input name="employment" type="number" step="0.001" value="${r.employment}"></label></div>
  <p class="muted">기본값은 2026년 기준 근로자 부담분입니다(국민연금 9.5%의 절반, 건강보험 7.19%의 절반, 장기요양 = 건강보험료의 13.14%, 고용보험 0.9%). 매년 요율이 바뀌면 여기서 고쳐 주세요.</p>
  <button class="btn primary" style="margin-top:12px">저장</button></form>
  <form class="card section" id="set-mobile"><h2>직원 휴대폰 출퇴근 제한</h2>
    <p class="muted" style="margin:6px 0 12px">직원은 휴대폰에서 <b>${esc(location.origin)}/me</b> 로 접속해 휴대폰 번호와 PIN으로 로그인합니다. 집에서 누르는 것을 막으려면 아래 중 하나를 켜세요.</p>
    <label class="f">허용 IP <small>매장 와이파이의 공인 IP, 쉼표로 구분. 비우면 제한 없음. 지금 이 기기 IP: ${esc(A.clientIp)}</small><input name="allowedIps" value="${esc((s.allowedIps || []).join(', '))}"></label>
    <button type="button" class="btn small" id="ip-add" style="margin-top:6px">지금 이 기기 IP 추가</button>
    <div class="grid g4" style="margin-top:14px;align-items:end"><label class="chk"><input type="checkbox" name="geoOn" ${g.enabled ? 'checked' : ''}> 위치(GPS)로 제한</label>
    <label class="f">위도<input name="lat" value="${esc(g.lat)}"></label><label class="f">경도<input name="lng" value="${esc(g.lng)}"></label><label class="f">반경(m)<input name="radius" type="number" value="${esc(g.radius || 150)}"></label></div>
    <button type="button" class="btn small" id="geo-here" style="margin-top:6px">지금 위치를 매장 위치로</button>
    <p class="muted">위치 확인은 HTTPS로 배포한 경우에만 휴대폰에서 동작합니다.</p>
    <button class="btn primary" style="margin-top:12px">저장</button></form>
  <form class="card section" id="set-pw"><h2>관리자 비밀번호 변경</h2><div class="grid g3" style="margin-top:12px"><label class="f">현재 비밀번호<input type="password" name="current" required autocomplete="current-password"></label><label class="f">새 비밀번호 (8자 이상)<input type="password" name="next" minlength="8" required autocomplete="new-password"></label></div><button class="btn primary" style="margin-top:12px">변경</button></form>
  <div class="card section"><h2>백업 · 기록</h2><p class="muted" style="margin:6px 0 12px">백업 파일의 주민번호·계좌번호는 암호화된 상태입니다. 복원하려면 서버의 <code>data/secret.key</code> 파일도 함께 보관해야 합니다.</p>
    <div class="row"><a class="btn" href="/api/admin/backup">백업 내려받기</a><button class="btn" id="audit-show">변경 기록 보기</button></div><div id="audit" style="margin-top:12px"></div></div>`;
  const save = async (body, msg = '저장했습니다.') => { try { await api('/api/admin/settings', { method: 'PUT', body }); toast(msg, 'ok'); await refresh(); } catch (e) { toast(e.message, 'error'); } };
  $('#set-store').onsubmit = e => { e.preventDefault(); const f = e.target; save({ store: Object.fromEntries(['name', 'owner', 'bizNo', 'address', 'phone', 'industry'].map(k => [k, f[k].value])) }); };
  $('#set-rules').onsubmit = e => {
    e.preventDefault(); const f = e.target;
    const minWages = Object.fromEntries($$('#mw [data-year]').map(i => [i.dataset.year, +i.value]));
    if ($('#mw-new-y').value && $('#mw-new-v').value) minWages[$('#mw-new-y').value] = +$('#mw-new-v').value;
    save({ fivePlus: f.fivePlus.checked, breakAuto: f.breakAuto.checked, earlyFromSchedule: f.earlyFromSchedule.checked, rounding: f.rounding.value, payDay: f.payDay.value, payMethod: f.payMethod.value, minWages,
      insuranceRates: { pension: f.pension.value, health: f.health.value, ltcOfHealth: f.ltcOfHealth.value, employment: f.employment.value } }).then(renderSettings);
  };
  $('#set-mobile').onsubmit = e => { e.preventDefault(); const f = e.target; save({ allowedIps: f.allowedIps.value.split(',').map(x => x.trim()).filter(Boolean), geofence: { enabled: f.geoOn.checked, lat: f.lat.value, lng: f.lng.value, radius: f.radius.value } }); };
  $('#ip-add').onclick = () => { const i = $('#set-mobile').allowedIps; const l = i.value.split(',').map(x => x.trim()).filter(Boolean); if (!l.includes(A.clientIp)) l.push(A.clientIp); i.value = l.join(', '); };
  $('#geo-here').onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => { const f = $('#set-mobile'); f.lat.value = p.coords.latitude.toFixed(6); f.lng.value = p.coords.longitude.toFixed(6); f.geoOn.checked = true; }, () => toast('위치를 가져올 수 없습니다. (HTTPS 또는 localhost 필요)', 'error')) : toast('위치 기능이 없는 브라우저입니다.', 'error');
  $('#set-pw').onsubmit = async e => { e.preventDefault(); try { await api('/api/admin/password', { method: 'POST', body: { current: e.target.current.value, next: e.target.next.value } }); e.target.reset(); toast('비밀번호를 바꿨습니다.', 'ok'); } catch (err) { toast(err.message, 'error'); } };
  $('#kiosk-reg').onclick = async () => { await api('/api/admin/kiosk', { method: 'POST' }); toast('이 기기를 출퇴근 단말기로 등록했습니다.', 'ok'); renderSettings(); };
  $('#kiosk-reset').onclick = async () => { if (!confirm('등록된 모든 출퇴근 단말기를 해제할까요? 각 기기에서 다시 등록해야 합니다.')) return; await api('/api/admin/kiosk/reset', { method: 'POST' }); renderSettings(); };
  $('#audit-show').onclick = async () => { const rows = await api('/api/admin/audit'); $('#audit').innerHTML = `<div class="table-wrap" style="max-height:360px"><table><thead><tr><th>시각</th><th>누가</th><th>내용</th></tr></thead><tbody>${rows.map(a => `<tr><td>${kstDate(a.at)} ${kstTime(a.at)}</td><td>${esc(a.who)}</td><td>${esc(a.what)}</td></tr>`).join('')}</tbody></table></div>`; };
}

boot().catch(e => toast(e.message, 'error'));
