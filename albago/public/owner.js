'use strict';
// 알바고 사장님 화면
let O = null, tab = 'today';
const panel = n => $(`[data-panel="${n}"]`);
const staffById = id => O.staff.find(s => s.id === id);
const active = () => O.staff.filter(s => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'ko'));
const minWage = (d = O.today) => +(O.store.settings.minWages || {})[d.slice(0, 4)] || 0;
const ageOn = (b, d) => { if (!b) return null; let a = +d.slice(0, 4) - +b.slice(0, 4); if (d.slice(5) < b.slice(5)) a--; return a; };
const tmin = s => +s.slice(0, 2) * 60 + +s.slice(3);
const shiftMin = s => { if (!s || !s.start) return 0; let m = tmin(s.end) - tmin(s.start); if (m <= 0) m += 1440; for (const b of s.breaks || []) { let x = tmin(b.end) - tmin(b.start); if (x < 0) x += 1440; m -= x; } return Math.max(0, m); };
const srcBadge = s => s ? `<span class="pill">${t('SRC_' + s.replace('-', '_').toUpperCase())}</span>` : '';
const fail = e => { if (e.status === 401) location.href = '/login'; else toast(e.message, 'error'); };
$$('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());

// 휴게 구간 입력 줄
function breakRows(box, list) {
  box.innerHTML = '';
  (list || []).forEach(b => addBreakRow(box, b));
}
function addBreakRow(box, b = {}) {
  const row = document.createElement('div'); row.className = 'brk-row';
  row.innerHTML = `<input type="time" class="b-s" value="${esc(b.start || '')}" aria-label="${t('BREAK')} ${t('START')}"><span>~</span><input type="time" class="b-e" value="${esc(b.end || '')}" aria-label="${t('BREAK')} ${t('END')}"><button type="button" class="btn small ghost" aria-label="${t('DELETE')}">✕</button>`;
  row.querySelector('button').onclick = () => row.remove();
  box.append(row);
}
const readBreaks = box => [...box.querySelectorAll('.brk-row')].map(r => ({ start: r.querySelector('.b-s').value, end: r.querySelector('.b-e').value })).filter(b => b.start && b.end);
const toHHMM = iso => kstTime(iso);

async function boot() {
  try { await refresh(); adoptLang(O.user.lang); } catch (e) { return fail(e); }
  langButton(() => { headerInfo(); show(tab); });
  $('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.href = '/login'; };
  $('#kiosk-open').onclick = async e => { e.preventDefault(); if (!O.kiosk) { if (!confirm(t('KIOSK_REG_CONFIRM'))) return; await api('/api/owner/kiosk', { method: 'POST' }); } location.href = '/kiosk'; };
  $$('.side .nav').forEach(b => b.onclick = () => show(b.dataset.tab));
  $('#me-btn').onclick = e => { e.stopPropagation(); $('#me-pop').hidden = !$('#me-pop').hidden; };
  document.addEventListener('click', e => { if (!e.target.closest('#me-pop')) $('#me-pop').hidden = true; if (!e.target.closest('.search')) $('#q-res').hidden = true; });
  $('#q').oninput = search; $('#q').onfocus = search;
  $('#q').onkeydown = e => { if (e.key === 'Enter') { const b = $('#q-res button'); if (b) b.click(); } if (e.key === 'Escape') $('#q-res').hidden = true; };
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== tab) show(h); });
  headerInfo();
  show(location.hash.slice(1) || 'today');
}
const TABS = ['today', 'staff', 'contract', 'schedule', 'records', 'payroll', 'messages', 'settings'];
const TAB_KEY = { today: 'TAB_TODAY', staff: 'TAB_STAFF', contract: 'TAB_CONTRACT', schedule: 'TAB_SCHEDULE', records: 'TAB_RECORDS', payroll: 'TAB_PAYROLL', messages: 'TAB_MESSAGES', settings: 'TAB_SETTINGS' };
function headerInfo() {
  $('#me-btn').textContent = (O.store.ownerName || O.user.loginId || '?').slice(0, 1);
  $('#me-who').innerHTML = `<b style="color:var(--ink)">${esc(O.store.name)}</b><br>${t('STORE_CODE')} ${esc(O.store.bizNo)}<br>${esc(O.user.loginId)}`;
  const pend = O.staff.filter(s => s.status === 'pending').length;
  $('#b-staff').hidden = !pend; $('#b-staff').textContent = pend;
}
function search() {
  const v = $('#q').value.trim().toLowerCase(), box = $('#q-res');
  if (!v) { box.hidden = true; return; }
  const menus = TABS.map(k => ({ label: t(TAB_KEY[k]), go: () => show(k) })).filter(m => m.label.toLowerCase().includes(v));
  const people = O.staff.filter(s => s.name.toLowerCase().includes(v) || String(s.phone || '').includes(v)).slice(0, 6).map(s => ({ label: `${s.name} · ${t('TAB_STAFF')}`, go: () => { show('staff'); openStaff(s); } }));
  const all = [...menus, ...people];
  box.innerHTML = all.length ? all.map((r, i) => `<button type="button" data-i="${i}">${esc(r.label)}</button>`).join('') : `<div class="muted" style="padding:10px 14px">${t('NO_RESULT')}</div>`;
  box.hidden = false;
  $$('#q-res button').forEach(b => b.onclick = () => { all[b.dataset.i].go(); box.hidden = true; $('#q').value = ''; });
}
async function refresh() { O = await api('/api/owner/bootstrap'); }
async function show(x) {
  if (!TABS.includes(x)) x = 'today';
  tab = x; if (location.hash.slice(1) !== x) history.replaceState(null, '', '#' + x);
  $$('.side .nav').forEach(b => b.classList.toggle('active', b.dataset.tab === x));
  $$('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== x);
  $('#page-h').textContent = t(TAB_KEY[x]);
  $('#page-date').textContent = x === 'today' ? md(O.today) : '';
  window.scrollTo(0, 0);
  try { await ({ today: renderToday, staff: renderStaff, schedule: renderSchedule, records: renderRecords, payroll: renderPayroll, messages: renderMessages, contract: renderContract, settings: renderSettings })[x](); } catch (e) { fail(e); }
}

// ═══ 오늘 (업무 콘솔형 대시보드) ═══
const minOfDay = iso => { const d = new Date(Date.parse(iso) + KST); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
async function renderToday() {
  await refresh(); headerInfo();
  const d = O.today, ym = d.slice(0, 7), prev = addDays(ym + '-01', -1).slice(0, 7);
  const [recs, sh, pay, msgs, prevSlips, prevPay] = await Promise.all([
    api(`/api/owner/records?from=${addDays(d, -2)}&to=${d}`), api(`/api/owner/shifts?from=${d}&to=${d}`),
    api(`/api/owner/payroll?from=${ym}-01&to=${d}`), api('/api/owner/messages'),
    api(`/api/owner/payslips?from=${prev}-01&to=${monthEnd(prev)}`), api(`/api/owner/payroll?from=${prev}-01&to=${monthEnd(prev)}`)]);
  const unreadMsg = Object.values(msgs.unread).reduce((a, b) => a + b, 0);
  $('#b-msg').hidden = !unreadMsg; $('#b-msg').textContent = unreadMsg;
  const staff = active(), shiftOf = id => sh.shifts.find(s => s.staffId === id) || null;
  const todays = recs.rows.filter(r => r.date === d);
  if (!staff.length) {
    panel('today').innerHTML = `<div class="card"><div class="empty"><b>${t('EMPTY_STAFF_T')}</b>${t('EMPTY_STAFF_D')}<br><button class="btn primary" id="first-staff">${t('ADD_STAFF')}</button></div></div>`;
    $('#first-staff').onclick = () => { show('staff'); openStaff(null); };
    return;
  }
  const nowMin = minOfDay(new Date().toISOString());
  const rows = staff.map(s => {
    const shift = shiftOf(s.id), mine = todays.filter(r => r.staffId === s.id).sort((a, b) => a.in.localeCompare(b.in));
    const first = mine[0], late = first && shift ? Math.round((Date.parse(first.in) - Date.parse(`${d}T${shift.start}:00+09:00`)) / 60000) : 0;
    const absent = shift && !mine.length && nowMin > +shift.start.slice(0, 2) * 60 + +shift.start.slice(3) + 10;
    return { s, shift, mine, late: late > 5 ? late : 0, absent };
  }).filter(r => r.shift || r.mine.length);
  // 할 일
  const todos = [];
  const pending = O.staff.filter(s => s.status === 'pending');
  for (const p of pending) todos.push({ text: t('TODO_APPROVE', { name: p.name }), btn: t('APPROVE'), go: () => show('staff') });
  for (const r of recs.rows) if (!r.out && Date.now() - Date.parse(r.in) > 16 * 3600000) todos.push({ text: t('TODO_NO_OUT', { name: r.name, date: md(r.date) }), btn: t('FIX'), go: () => { RF = { from: r.date, to: r.date, staffId: r.staffId }; show('records'); } });
  const unpaid = prevPay.list.filter(p => p.gross > 0 && !prevSlips.items.some(x => x.staffId === p.staffId));
  if (unpaid.length) todos.push({ text: t('TODO_SLIPS', { month: +prev.slice(5), n: unpaid.length }), btn: t('SEND'), go: () => { PF = { mode: 'month', month: prev, week: weekStartOf(d) }; show('payroll'); } });
  const waitCt = O.contracts.filter(c => c.sharedAt && !c.receivedAt).length;
  if (waitCt) todos.push({ text: t('TODO_CONTRACT', { n: waitCt }), btn: t('VIEW'), go: () => show('contract') });
  if (unreadMsg) todos.push({ text: t('TODO_MSG', { n: unreadMsg }), btn: t('VIEW'), go: () => show('messages') });
  if (O.store.lat == null) todos.push({ text: t('AL_NO_LOCATION'), btn: t('SET'), go: () => show('settings') });
  for (const s of staff) {
    if (s.payType !== 'monthly' && minWage() && s.hourlyWage < minWage()) todos.push({ text: t('AL_MINWAGE', { name: s.name, wage: won(s.hourlyWage), min: won(minWage()) }), btn: t('EDIT'), go: () => { show('staff'); openStaff(s); } });
    const next = O.store.settings.minWages[+d.slice(0, 4) + 1];
    if (next && s.payType !== 'monthly' && s.hourlyWage < next && d.slice(5) >= '11-01') todos.push({ text: t('AL_NEXT_MINWAGE', { name: s.name, min: won(next) }), btn: t('EDIT'), go: () => { show('staff'); openStaff(s); } });
    for (const [k, label] of [['visaExpiry', 'VISA_EXPIRY'], ['healthCert', 'HEALTH_CERT']]) if (s[k] && s[k] <= addDays(d, 30)) todos.push({ text: t('AL_EXPIRE', { name: s.name, what: t(label), date: s[k] }), btn: t('EDIT'), go: () => { show('staff'); openStaff(s); } });
    if (!s.hasPin && !s.hasLogin) todos.push({ text: t('AL_NO_PIN', { name: s.name }), btn: t('EDIT'), go: () => { show('staff'); openStaff(s); } });
  }
  const working = staff.filter(s => s.work.status !== 'off').length, scheduled = staff.filter(s => shiftOf(s.id)).length;
  const lateN = rows.filter(r => r.late || r.absent).length;
  const cost = pay.list.reduce((a, p) => a + p.totalCost, 0);
  // 타임라인 범위
  const mins = [];
  for (const r of rows) { if (r.shift) { const a = +r.shift.start.slice(0, 2) * 60 + +r.shift.start.slice(3); let b = +r.shift.end.slice(0, 2) * 60 + +r.shift.end.slice(3); if (b <= a) b += 1440; mins.push(a, b); } for (const m of r.mine) { mins.push(minOfDay(m.in)); if (m.out) mins.push(minOfDay(m.out) < minOfDay(m.in) ? minOfDay(m.out) + 1440 : minOfDay(m.out)); } }
  mins.push(nowMin);
  const lo = Math.max(0, Math.floor((Math.min(...mins) - 30) / 60) * 60), hi = Math.min(1440 + 360, Math.ceil((Math.max(...mins) + 30) / 60) * 60), span = Math.max(60, hi - lo);
  const pct = m => `${Math.max(0, Math.min(100, (m - lo) / span * 100)).toFixed(2)}%`;
  const wid = (a, b) => `${Math.max(1.5, (Math.min(b, hi) - Math.max(a, lo)) / span * 100).toFixed(2)}%`;
  const ticks = []; for (let h = lo; h <= hi; h += Math.max(60, Math.ceil(span / 60 / 8) * 60)) ticks.push(String(Math.floor(h / 60) % 24).padStart(2, '0'));
  const lane = r => {
    let h = '';
    if (r.shift) { const a = +r.shift.start.slice(0, 2) * 60 + +r.shift.start.slice(3); let b = +r.shift.end.slice(0, 2) * 60 + +r.shift.end.slice(3); if (b <= a) b += 1440; h += `<div class="bar plan" style="left:${pct(a)};width:${wid(a, b)}${r.absent ? ';color:var(--err);border-color:var(--err);font-weight:700' : ''}">${!r.mine.length ? esc((r.absent ? t('ST_ABSENT') + ' · ' : '') + r.shift.start + ' ~ ' + r.shift.end) : ''}</div>`; }
    for (const m of r.mine) {
      const a = minOfDay(m.in); let b = m.out ? minOfDay(m.out) : nowMin; if (b < a) b += 1440;
      const st = !m.out ? (r.s.work.status === 'break' ? 'rest' : 'work') : 'done';
      const label = !m.out ? (st === 'rest' ? t('ST_BREAK') : `${t('ST_IN')} · ${kstTime(m.in)}`) + (r.late ? ` · ${t('LATE', { m: r.late })}` : '') : `${kstTime(m.in)} ~ ${kstTime(m.out)}`;
      h += `<div class="bar ${st}" style="left:${pct(a)};width:${wid(a, b)}">${esc(label)}</div>`;
    }
    return `<span class="who">${esc(r.s.name)}</span><div class="lane">${h}<div class="now" style="left:${pct(nowMin)}"></div></div>`;
  };
  panel('today').innerHTML = `
  <div class="kpis">
    <div class="card stat"><span>${t('K_WORKING')}</span><strong>${working}<small> / ${scheduled}${t('PEOPLE') || ''}</small></strong></div>
    <div class="card stat"><span>${t('K_LATE')}</span><strong>${lateN}<small>${t('PEOPLE')}</small></strong></div>
    <div class="card stat"><span>${t('K_ALERTS')}</span><strong style="color:${todos.length ? 'var(--err)' : 'inherit'}">${todos.length}<small>${t('COUNT_UNIT')}</small></strong></div>
    <div class="card stat"><span>${t('K_COST', { m: +ym.slice(5) })}</span><strong>${won(cost)}</strong></div>
  </div>
  <section class="card section"><div class="spread"><h2>${t('TODAY_WORK')}</h2><div class="row"><button class="btn small" id="t-reload">${t('REFRESH')}</button><button class="btn small" id="t-sched">${t('EDIT_SCHEDULE')}</button></div></div>
    ${rows.length ? `<div class="tl"><span></span><div class="axis">${ticks.map(x => `<span>${x}</span>`).join('')}</div>${rows.map(lane).join('')}</div>` : `<div class="empty"><b>${t('EMPTY_TODAY_T')}</b>${t('EMPTY_TODAY_D')}</div>`}
  </section>
  <div class="two">
    <section class="card"><h2>${t('TODO_TITLE')}</h2>
      ${todos.length ? todos.slice(0, 8).map((x, i) => `<div class="todo"><span>${esc(x.text)}</span><button class="btn small" data-todo="${i}" style="color:var(--brand)">${esc(x.btn)}</button></div>`).join('') : `<div class="empty" style="padding:24px"><b>${t('TODO_NONE')}</b></div>`}
    </section>
    <section class="card"><h2>${t('QUICK_TITLE')}</h2>
      <div class="quick">
        <button data-q="staff"><span>${t('Q_STAFF')}</span><small>${t('Q_STAFF_D')}</small></button>
        <button data-q="schedule"><span>${t('Q_SCHEDULE')}</span><small>${t('Q_SCHEDULE_D')}</small></button>
        <button data-q="payroll"><span>${t('Q_PAYROLL')}</span><small>${t('Q_PAYROLL_D')}</small></button>
        <button data-q="notice"><span>${t('Q_NOTICE')}</span><small>${t('Q_NOTICE_D')}</small></button>
        <button data-q="contract"><span>${t('Q_CONTRACT')}</span><small>${t('Q_CONTRACT_D')}</small></button>
        <button data-q="excel"><span>${t('Q_EXCEL')}</span><small>${t('Q_EXCEL_D')}</small></button>
      </div>
    </section>
  </div>`;
  $('#t-reload').onclick = renderToday; $('#t-sched').onclick = () => show('schedule');
  $$('[data-todo]').forEach(b => b.onclick = () => todos[b.dataset.todo].go());
  const Q = { staff: () => { show('staff'); openStaff(null); }, schedule: () => show('schedule'), payroll: () => show('payroll'), notice: () => { MSG_SEL = 'notice'; show('messages'); }, contract: () => show('contract'), excel: () => download(`/api/owner/export/records.xlsx?from=${ym}-01&to=${d}`) };
  $$('[data-q]').forEach(b => b.onclick = Q[b.dataset.q]);
}

// ═══ 직원 ═══
let showRetired = false, editing = null;
function renderStaff() {
  const pending = O.staff.filter(s => s.status === 'pending');
  const list = O.staff.filter(s => s.status === 'active' || (showRetired && s.status === 'retired'));
  panel('staff').innerHTML = `
  ${pending.length ? `<div class="card section"><h3>${t('PENDING_TITLE')}</h3><p class="muted">${t('PENDING_HELP')}</p><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>${t('NAME')}</th><th>${t('LOGIN_ID')}</th><th>${t('MOBILE')}</th><th>${t('JOINED')}</th><th></th></tr></thead><tbody>
  ${pending.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.loginId)}</td><td>${esc(s.phone)}</td><td>${kstDate(s.createdAt)}</td><td><div class="row"><button class="btn small primary" data-approve="${s.id}">${t('APPROVE')}</button><button class="btn small danger" data-reject="${s.id}">${t('REJECT')}</button></div></td></tr>`).join('')}</tbody></table></div></div>` : ''}
  <div class="spread section"><h2>${t('TAB_STAFF')}</h2><div class="row"><label class="chk"><input type="checkbox" id="show-retired" ${showRetired ? 'checked' : ''}> ${t('SHOW_RETIRED')}</label><button class="btn primary" id="add-staff">+ ${t('ADD_STAFF')}</button></div></div>
  <div class="table-wrap"><table><thead><tr><th>${t('NAME')}</th><th>${t('MOBILE')}</th><th>${t('TYPE')}</th><th class="num">${t('WAGE')}</th><th>${t('WEEKLY_PATTERN')}</th><th>${t('DEDUCTION')}</th><th>${t('FS_EMERGENCY')}</th><th>${t('ACCOUNT_STATUS')}</th><th></th></tr></thead><tbody>
  ${list.map(s => { const wm = [0, 1, 2, 3, 4, 5, 6].reduce((a, d) => a + shiftMin((s.pattern || {})[d]), 0); return `<tr><td><span style="color:${esc(s.color || '#2459e0')}">●</span> <b>${esc(s.name)}</b>${s.position ? `<br><span class="muted">${esc(s.position)}</span>` : ''}</td><td>${esc(s.phone)}</td>
    <td>${s.nationality === 'FOREIGN' ? `<span class="pill warn">${t('FOREIGNER')}</span> ${esc(s.visa || '')}` : t('KOREAN')}</td><td class="num">${s.payType === 'monthly' ? `${t('PT_MONTHLY')} ${won(s.monthlySalary)}` : won(s.hourlyWage)}${s.payType !== 'monthly' && minWage() && s.hourlyWage < minWage() ? `<br><span class="pill out">${t('BELOW_MIN')}</span>` : ''}</td>
    <td>${wm ? hours(wm) : '-'}${wm && wm < 900 ? ` <span class="pill">${t('NO_HOLIDAY_PAY')}</span>` : ''}</td><td>${t({ none: 'DED_NONE', '3.3': 'DED_33', insurance: 'DED_INS' }[s.deduction || 'none'])}</td>
    <td>${esc([s.emergencyName, s.emergencyRelation, s.emergencyPhone].filter(Boolean).join(' · '))}</td>
    <td>${s.status === 'retired' ? `<span class="pill">${t('RETIRED')}</span>` : ''}${s.hasLogin ? `<span class="pill in">${t('APP_ON')}</span>` : ''} ${s.hasPin ? '' : `<span class="pill out">${t('NO_PIN')}</span>`}</td>
    <td><button class="btn small" data-edit="${s.id}">${t('EDIT')}</button></td></tr>`; }).join('') || `<tr><td colspan="9" class="muted">${t('NO_STAFF')}</td></tr>`}</tbody></table></div>
  <p class="muted">${t('KEEP_3Y')}</p>`;
  $('#add-staff').onclick = () => openStaff(null);
  $('#show-retired').onchange = e => { showRetired = e.target.checked; renderStaff(); };
  $$('[data-edit]').forEach(b => b.onclick = () => openStaff(staffById(b.dataset.edit)));
  $$('[data-approve]').forEach(b => b.onclick = async () => { await api(`/api/owner/staff/${b.dataset.approve}`, { method: 'PUT', body: { status: 'active' } }); await refresh(); openStaff(staffById(b.dataset.approve)); toast(t('APPROVED_HELP'), 'ok'); });
  $$('[data-reject]').forEach(b => b.onclick = async () => { if (!confirm(t('REJECT_CONFIRM'))) return; await api(`/api/owner/staff/${b.dataset.reject}`, { method: 'DELETE' }); await refresh(); renderStaff(); });
}
const PAT_DAYS = [1, 2, 3, 4, 5, 6, 0];
function openStaff(s) {
  editing = s; const f = $('#staff-form'); f.reset(); applyI18n(f);
  $('#staff-title').textContent = s ? s.name : t('ADD_STAFF'); $('#staff-err').textContent = '';
  for (const el of f.elements) if (el.name && s && el.name in s && !['radio', 'checkbox', 'password'].includes(el.type)) el.value = s[el.name] ?? '';
  f.nationality.value = s ? s.nationality || 'KR' : 'KR';
  f.durunuri.checked = !!(s && s.durunuri);
  f.lang.value = s ? s.lang || 'ko' : 'ko';
  $('#weekly-holiday').innerHTML = [0, 1, 2, 3, 4, 5, 6].map(d => `<option value="${d}">${DOWS()[d]}</option>`).join('');
  f.weeklyHoliday.value = s && s.weeklyHoliday !== undefined ? s.weeklyHoliday : 0; f.payType.value = (s && s.payType) || 'hourly';
  for (const k of ['pension', 'health', 'employment', 'industrial']) { const sel = f['ins_' + k]; sel.innerHTML = ['auto', 'yes', 'no'].map(v => `<option value="${v}">${t('INS_' + v.toUpperCase())}</option>`).join(''); sel.value = (s && s.insurance && s.insurance[k]) || 'auto'; }
  if (!s) { f.hourlyWage.value = minWage() || ''; f.startDate.value = O.today; f.color.value = ['#2459e0', '#14966b', '#d4570f', '#8e44ad', '#c0392b', '#16a2b8', '#b8860b'][O.staff.length % 7]; }
  $('#rrn-now').innerHTML = s && s.rrnMasked ? `${esc(s.rrnMasked)} · <a href="#" data-reveal>${t('VIEW')}</a>` : '';
  $('#alien-now').innerHTML = s && s.alienNoMasked ? `${esc(s.alienNoMasked)} · <a href="#" data-reveal>${t('VIEW')}</a>` : '';
  $('#acct-now').innerHTML = s && s.accountMasked ? `${esc(s.accountMasked)} · <a href="#" data-reveal>${t('VIEW')}</a>` : '';
  $('#pin-hint').textContent = s && s.hasPin ? t('PIN_KEEP') : t('PIN_RULE');
  $$('[data-reveal]').forEach(a => a.onclick = async e => { e.preventDefault(); const r = await api(`/api/owner/staff/${s.id}/sensitive`); f.rrn.value = r.rrn; f.alienNo.value = r.alienNo; f.account.value = r.account; });
  $('#pattern').innerHTML = `<div class="pattern"><span></span><span class="h">${t('START')}</span><span class="h">${t('END')}</span><span class="h">${t('BREAK')} ${t('START')}</span><span class="h">${t('BREAK')} ${t('END')}</span></div>` + PAT_DAYS.map(d => { const x = (s && s.pattern && s.pattern[d]) || {}; const b = (x.breaks || [])[0] || {}; return `<div class="pattern" data-d="${d}"><b>${DOWS()[d]}</b><input type="time" class="p-s" value="${esc(x.start || '')}"><input type="time" class="p-e" value="${esc(x.end || '')}"><input type="time" class="p-bs" value="${esc(b.start || '')}"><input type="time" class="p-be" value="${esc(b.end || '')}"></div>`; }).join('') + `<div class="row"><button type="button" class="btn small" id="pat-copy">${t('PAT_COPY_MON')}</button></div>`;
  $('#pat-copy').onclick = () => { const m = $('#pattern [data-d="1"]'); for (const d of [2, 3, 4, 5]) { const r = $(`#pattern [data-d="${d}"]`); for (const c of ['p-s', 'p-e', 'p-bs', 'p-be']) r.querySelector('.' + c).value = m.querySelector('.' + c).value; } };
  $('#staff-delete').hidden = !s; $('#staff-status').hidden = !s || s.status === 'pending';
  $('#staff-status').textContent = s && s.status === 'retired' ? t('REACTIVATE') : t('RETIRE');
  nat(); payTypeToggle(); wageHint();
  $('#staff-dlg').showModal();
}
function nat() { const fr = $('#staff-form').nationality.value === 'FOREIGN'; $('#kr-fields').hidden = fr; $('#fr-fields').hidden = !fr; }
function payTypeToggle() { const m = $('#staff-form').payType.value === 'monthly'; $('#l-hourly').hidden = m; $('#l-monthly').hidden = $('#l-mhours').hidden = !m; wageHint(); }
function wageHint() {
  const f = $('#staff-form');
  if (f.payType.value === 'monthly') { const wk = PAT_DAYS.reduce((a, d) => { const r = $(`#pattern [data-d="${d}"]`); if (!r) return a; const g = c => r.querySelector('.' + c).value; return a + (g('p-s') && g('p-e') ? shiftMin({ start: g('p-s'), end: g('p-e'), breaks: g('p-bs') && g('p-be') ? [{ start: g('p-bs'), end: g('p-be') }] : [] }) : 0); }, 0) / 60; const sal = +f.monthlySalary.value, h = +f.monthlyHours.value || (wk ? Math.round((wk + (wk >= 15 ? Math.min(wk, 40) / 40 * 8 : 0)) * 365 / 7 / 12) : 209), rate = sal ? Math.round(sal / h) : 0; $('#minwage-hint').textContent = t('MONTHLY_HINT', { h, rate: won(rate), min: won(minWage()) }) + (rate && minWage() && rate < minWage() ? ' ' + t('BELOW_MIN') + '!' : ''); return; } const w = +$('#staff-form').hourlyWage.value; $('#minwage-hint').textContent = minWage() ? t('MINWAGE_HINT', { y: O.today.slice(0, 4), min: won(minWage()) }) + (w && w < minWage() ? ' ' + t('BELOW_MIN') + '!' : '') : ''; }
$('#staff-form').addEventListener('change', e => { if (e.target.name === 'nationality') nat(); if (e.target.name === 'payType') payTypeToggle(); });
$('#staff-form').monthlySalary.addEventListener('input', wageHint); $('#pattern').addEventListener('input', wageHint); $('#staff-form').monthlyHours.addEventListener('input', wageHint);
$('#staff-form').hourlyWage.addEventListener('input', wageHint);
$('#staff-form').onsubmit = async e => {
  e.preventDefault(); const f = e.target, b = {};
  for (const el of f.elements) if (el.name && !el.name.startsWith('ins_') && (el.type !== 'radio' || el.checked) && el.type !== 'checkbox') b[el.name] = el.value;
  b.durunuri = f.durunuri.checked;
  b.insurance = Object.fromEntries(['pension', 'health', 'employment', 'industrial'].map(k => [k, f['ins_' + k].value]));
  b.pattern = {};
  for (const d of PAT_DAYS) { const r = $(`#pattern [data-d="${d}"]`), g = c => r.querySelector('.' + c).value; if (g('p-s') && g('p-e')) b.pattern[d] = { start: g('p-s'), end: g('p-e'), breaks: g('p-bs') && g('p-be') ? [{ start: g('p-bs'), end: g('p-be') }] : [] }; }
  if (!b.password) delete b.password; if (!b.pin) delete b.pin;
  try { await api(editing ? `/api/owner/staff/${editing.id}` : '/api/owner/staff', { method: editing ? 'PUT' : 'POST', body: b }); $('#staff-dlg').close(); toast(t('SAVED'), 'ok'); await refresh(); show(tab); }
  catch (err) { $('#staff-err').textContent = err.message; }
};
$('#staff-status').onclick = async () => { const s = editing, retire = s.status === 'active'; if (retire && !confirm(t('RETIRE_CONFIRM', { name: s.name }))) return; await api(`/api/owner/staff/${s.id}`, { method: 'PUT', body: { status: retire ? 'retired' : 'active', ...(retire && !s.endDate ? { endDate: O.today } : {}) } }); $('#staff-dlg').close(); await refresh(); show(tab); };
$('#staff-delete').onclick = async () => { if (!confirm(t('DELETE_CONFIRM', { name: editing.name }))) return; try { await api(`/api/owner/staff/${editing.id}`, { method: 'DELETE' }); $('#staff-dlg').close(); await refresh(); show(tab); } catch (e) { $('#staff-err').textContent = e.message; } };

// ═══ 근무표 (월 달력 + 일괄 등록) ═══
let schMonth = null, selDates = new Set(), bulkStaff = null, bulkWd = new Set([1, 2, 3, 4, 5]), bulkBreaks = [], SH = null, shCtx = null;
async function renderSchedule() {
  schMonth = schMonth || O.today.slice(0, 7);
  const from = schMonth + '-01', to = monthEnd(schMonth), dates = []; for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  SH = await api(`/api/owner/shifts?from=${from}&to=${to}`);
  const map = new Map(SH.shifts.map(s => [s.staffId + s.date, s]));
  const staff = active(); if (!bulkStaff) bulkStaff = new Set(staff.map(s => s.id));
  for (const d of [...selDates]) if (d < from || d > to) selDates.delete(d);
  panel('schedule').innerHTML = `
  <div class="spread section"><h2>${t('TAB_SCHEDULE')}</h2><div class="row"><button class="btn small" id="m-prev">◀</button><input type="month" id="m-pick" value="${schMonth}" style="width:auto"><button class="btn small" id="m-next">▶</button><button class="btn small" id="m-print">${t('PRINT')}</button></div></div>
  <div class="card section"><h3>${t('BULK_TITLE')}</h3><p class="muted" style="margin:4px 0 12px">${t('BULK_HELP')}</p>
    <div class="grid" style="gap:14px">
      <div><div class="spread"><span class="muted">${t('STAFF')}</span><button type="button" class="btn small ghost" id="bk-all">${t('SELECT_ALL')}</button></div><div class="chips" id="bk-staff">${staff.map(s => `<label><input type="checkbox" value="${s.id}" ${bulkStaff.has(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('') || `<span class="muted">${t('NO_STAFF')}</span>`}</div></div>
      <div><span class="muted">${t('DAYS_TO_APPLY')}</span> <span class="pill warn" id="sel-info" ${selDates.size ? '' : 'hidden'}>${t('SELECTED_DATES', { n: selDates.size })}</span>
        <div class="row" style="margin-top:6px"><input type="date" id="bk-from" value="${from}" style="width:auto"> ~ <input type="date" id="bk-to" value="${to}" style="width:auto">
        <button type="button" class="btn small" data-preset="weekday">${t('P_WEEKDAY')}</button><button type="button" class="btn small" data-preset="weekend">${t('P_WEEKEND')}</button><button type="button" class="btn small" data-preset="all">${t('P_ALL')}</button></div>
        <div class="chips" id="bk-wd" style="margin-top:8px">${PAT_DAYS.map(d => `<label><input type="checkbox" value="${d}" ${bulkWd.has(d) ? 'checked' : ''}> ${DOWS()[d]}</label>`).join('')}</div></div>
      <div class="grid g4" style="align-items:end"><label class="f"><span>${t('START')}</span><input type="time" id="bk-start" value="${esc(renderSchedule.start || '09:00')}"></label><label class="f"><span>${t('END')}</span><input type="time" id="bk-end" value="${esc(renderSchedule.end || '18:00')}"></label>
        <div style="grid-column:span 2"><span class="muted">${t('BREAK_TIMES')}</span><div id="bk-breaks" class="grid" style="gap:6px;margin-top:4px"></div><button type="button" class="btn small" id="bk-add-brk" style="margin-top:4px">${t('ADD_BREAK')}</button></div></div>
      <div class="row"><button class="btn primary" data-bulk="fill">${t('BULK_FILL')}</button><button class="btn" data-bulk="overwrite">${t('BULK_OVERWRITE')}</button><button class="btn" data-bulk="pattern">${t('BULK_PATTERN')}</button><button class="btn danger" data-bulk="delete">${t('BULK_DELETE')}</button></div>
    </div></div>
  <p class="muted">${t('CAL_HELP')}</p>
  <div class="cal-wrap"><table class="cal"><thead><tr><th>${t('NAME')} <small class="muted">(${t('MONTH_TOTAL')})</small></th>${dates.map(d => `<th data-date="${d}" class="${dowOf(d) === 0 ? 'sun' : dowOf(d) === 6 ? 'sat' : ''} ${selDates.has(d) ? 'sel' : ''} ${d === O.today ? 'today' : ''}">${+d.slice(8)}<br>${DOWS()[dowOf(d)]}</th>`).join('')}</tr></thead><tbody>
  ${staff.map(s => `<tr><td><span style="color:${esc(s.color || '#2459e0')}">●</span> ${esc(s.name)}<br><small class="muted">${hours(dates.reduce((a, d) => a + shiftMin(map.get(s.id + d)), 0))}</small></td>${dates.map(d => { const x = map.get(s.id + d); return `<td class="cell ${x ? 'has' : ''} ${selDates.has(d) ? 'selcol' : ''}" data-sid="${s.id}" data-date="${d}">${x ? `${x.start}<br>${x.end}${x.breaks.length ? `<small>☕${esc(x.breaks.map(b => b.start).join(','))}</small>` : ''}` : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  breakRows($('#bk-breaks'), bulkBreaks);
  $('#bk-add-brk').onclick = () => addBreakRow($('#bk-breaks'));
  $('#m-prev').onclick = () => { schMonth = addDays(schMonth + '-01', -1).slice(0, 7); renderSchedule(); };
  $('#m-next').onclick = () => { schMonth = addDays(monthEnd(schMonth), 1).slice(0, 7); renderSchedule(); };
  $('#m-pick').onchange = e => { if (e.target.value) { schMonth = e.target.value; renderSchedule(); } };
  $('#bk-all').onclick = () => { const all = $$('#bk-staff input').every(i => i.checked); $$('#bk-staff input').forEach(i => i.checked = !all); };
  $$('[data-preset]').forEach(b => b.onclick = () => { const set = { weekday: [1, 2, 3, 4, 5], weekend: [6, 0], all: [0, 1, 2, 3, 4, 5, 6] }[b.dataset.preset]; $$('#bk-wd input').forEach(i => i.checked = set.includes(+i.value)); });
  $$('.cal thead th[data-date]').forEach(th => th.onclick = () => { const d = th.dataset.date; selDates.has(d) ? selDates.delete(d) : selDates.add(d); keepBulk(); renderSchedule(); });
  $$('.cal td.cell').forEach(td => td.onclick = () => openShift(td.dataset.sid, td.dataset.date, map.get(td.dataset.sid + td.dataset.date)));
  $$('[data-bulk]').forEach(b => b.onclick = () => bulk(b.dataset.bulk));
  $('#m-print').onclick = () => printDoc(monthHTML(staff, dates, map));
}
function keepBulk() {
  bulkStaff = new Set($$('#bk-staff input:checked').map(i => i.value)); bulkWd = new Set($$('#bk-wd input:checked').map(i => +i.value));
  bulkBreaks = readBreaks($('#bk-breaks')); renderSchedule.start = $('#bk-start').value; renderSchedule.end = $('#bk-end').value;
}
async function bulk(kind) {
  keepBulk();
  if (!bulkStaff.size) return toast(t('PICK_STAFF'), 'error');
  const body = { staffIds: [...bulkStaff], from: $('#bk-from').value, to: $('#bk-to').value, weekdays: selDates.size || kind === 'pattern' ? [] : [...bulkWd], dates: [...selDates], start: $('#bk-start').value, end: $('#bk-end').value, breaks: bulkBreaks,
    mode: kind === 'delete' ? 'delete' : kind === 'pattern' ? 'pattern' : 'set', overwrite: kind !== 'fill' };
  if (!selDates.size && !bulkWd.size && kind !== 'pattern') return toast(t('PICK_DAYS'), 'error');
  if (kind === 'delete' && !confirm(t('BULK_DELETE_CONFIRM'))) return;
  try { const r = await api('/api/owner/shifts/bulk', { method: 'POST', body }); toast(t('BULK_DONE', { n: r.count }), 'ok'); selDates.clear(); renderSchedule(); } catch (e) { fail(e); }
}
function openShift(sid, date, cur) {
  const s = staffById(sid), pat = (s.pattern || {})[dowOf(date)];
  shCtx = { sid, date };
  $('#shift-title').textContent = `${s.name} · ${md(date)}`;
  const base = cur || pat || {};
  $('#sh-start').value = base.start || ''; $('#sh-end').value = base.end || '';
  breakRows($('#sh-breaks'), base.breaks || []); $('#sh-err').textContent = '';
  $('#shift-dlg').showModal();
}
$('#sh-add-brk').onclick = () => addBreakRow($('#sh-breaks'));
$('#sh-save').onclick = async () => { try { await api('/api/owner/shifts', { method: 'PUT', body: { staffId: shCtx.sid, date: shCtx.date, start: $('#sh-start').value, end: $('#sh-end').value, breaks: readBreaks($('#sh-breaks')) } }); $('#shift-dlg').close(); renderSchedule(); } catch (e) { $('#sh-err').textContent = e.message; } };
$('#sh-off').onclick = async () => { await api('/api/owner/shifts', { method: 'PUT', body: { staffId: shCtx.sid, date: shCtx.date, off: true } }); $('#shift-dlg').close(); renderSchedule(); };
function monthHTML(staff, dates, map) {
  const weeks = []; for (let i = 0; i < dates.length; i += 7) weeks.push(dates.slice(i, i + 7));
  return `<div class="doc" style="max-width:none"><h1 style="font-size:16pt">근 무 표</h1><p>${esc(O.store.name)} · ${schMonth}</p>${weeks.map(w => `<table><tr><th>이름</th>${w.map(d => `<th>${mdK(d)}</th>`).join('')}</tr>${staff.map(s => `<tr><td>${esc(s.name)}</td>${w.map(d => { const x = map.get(s.id + d); return `<td>${x ? `${x.start}~${x.end}${x.breaks.length ? `<br><small>휴게 ${x.breaks.map(b => b.start + '~' + b.end).join(', ')}</small>` : ''}` : '-'}</td>`; }).join('')}</tr>`).join('')}</table>`).join('')}</div>`;
}

// ═══ 출퇴근 기록 ═══
let RF = null, recEditing = null;
async function renderRecords() {
  RF = RF || { from: weekStartOf(O.today), to: O.today, staffId: '' };
  const data = await api('/api/owner/records?' + new URLSearchParams(RF));
  const total = data.rows.reduce((a, r) => a + (r.calc ? r.calc.worked : 0), 0);
  panel('records').innerHTML = `<div class="spread section"><h2>${t('TAB_RECORDS')}</h2><div class="row"><a class="btn" id="x-rec" href="#">${t('EXCEL_RECORDS')}</a><button class="btn primary" id="rec-add">+ ${t('ADD_RECORD')}</button></div></div>
  <div class="card section"><div class="grid g4" style="align-items:end"><label class="f"><span>${t('FROM')}</span><input type="date" id="rf-from" value="${RF.from}"></label><label class="f"><span>${t('TO')}</span><input type="date" id="rf-to" value="${RF.to}"></label>
  <label class="f"><span>${t('STAFF')}</span><select id="rf-staff"><option value="">${t('ALL')}</option>${O.staff.filter(s => s.status !== 'pending').map(s => `<option value="${s.id}" ${s.id === RF.staffId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label><button class="btn" id="rf-go">${t('SEARCH')}</button></div></div>
  <p class="muted">${t('REC_SUMMARY', { n: data.rows.length, h: hours(total) })}</p>
  <div class="table-wrap"><table><thead><tr><th>${t('WORK_DATE')}</th><th>${t('NAME')}</th><th>${t('SCHEDULE')}</th><th>${t('IN')}</th><th>${t('BREAK')}</th><th>${t('OUT')}</th><th class="num">${t('BREAK_MIN')}</th><th class="num">${t('PAID_HOURS')}</th><th class="num">${t('NIGHT')}</th><th>${t('NOTE')}</th><th></th></tr></thead><tbody>
  ${data.rows.slice().reverse().map(r => `<tr><td>${md(r.date)}</td><td>${esc(r.name)}</td><td class="muted">${r.shift ? esc(r.shift.start + '~' + r.shift.end) : '-'}</td><td>${toHHMM(r.in)} ${srcBadge(r.srcIn)}</td>
    <td class="muted">${esc(r.breaks.map(b => toHHMM(b.start) + '~' + (b.end ? toHHMM(b.end) : '')).join(', '))}</td>
    <td>${r.out ? toHHMM(r.out) + (kstDate(r.out) !== r.date ? ' <small class="muted">(+1)</small>' : '') + ' ' + srcBadge(r.srcOut) : r.exitAt ? `<span class="pill out">${t('ST_EXIT_PENDING')}</span>` : `<span class="pill in">${t('ST_IN')}</span>`}</td>
    <td class="num">${r.calc ? r.calc.brk + t('MIN_UNIT') : ''}${r.calc && r.calc.breakSource !== 'none' && r.calc.breakSource !== 'actual' ? `<br><small class="muted">${t('BS_' + r.calc.breakSource.toUpperCase())}</small>` : ''}</td><td class="num">${r.calc ? hours(r.calc.worked) : ''}</td><td class="num">${r.calc && r.calc.night ? hours(r.calc.night) : ''}</td>
    <td>${r.edited ? `<span class="pill warn">${t('EDITED')}</span> ` : ''}${esc(r.note || '')}</td><td><button class="btn small" data-rec="${r.id}">${t('EDIT')}</button></td></tr>`).join('') || `<tr><td colspan="11" class="muted">${t('NO_RECORDS')}</td></tr>`}</tbody></table></div>`;
  const go = () => { RF = { from: $('#rf-from').value, to: $('#rf-to').value, staffId: $('#rf-staff').value }; renderRecords(); };
  $('#rf-go').onclick = go; $('#rf-staff').onchange = go;
  $('#x-rec').onclick = e => { e.preventDefault(); download(`/api/owner/export/records.xlsx?from=${RF.from}&to=${RF.to}`); };
  $('#rec-add').onclick = () => openRec(null);
  $$('[data-rec]').forEach(b => b.onclick = () => openRec(data.rows.find(r => r.id === b.dataset.rec)));
}
async function download(url) {
  try { const r = await fetch(url, { headers: { 'X-Lang': LANG } }); if (!r.ok) throw new Error((await r.json()).message); const blob = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (r.headers.get('Content-Disposition') || '').match(/filename="(.+)"/)?.[1] || 'albago.xlsx'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  catch (e) { toast(e.message, 'error'); }
}
function openRec(r) {
  recEditing = r;
  $('#rec-title').textContent = r ? t('EDIT_RECORD') : t('ADD_RECORD');
  $('#rec-staff').innerHTML = O.staff.filter(s => s.status !== 'pending').map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('#rec-staff').value = r ? r.staffId : (RF.staffId || (active()[0] || {}).id || ''); $('#rec-staff').disabled = !!r;
  $('#rec-date').value = r ? r.date : O.today; $('#rec-in').value = r ? toHHMM(r.in) : ''; $('#rec-out').value = r && r.out ? toHHMM(r.out) : '';
  breakRows($('#rec-breaks'), r ? r.breaks.filter(b => b.end).map(b => ({ start: toHHMM(b.start), end: toHHMM(b.end) })) : []);
  $('#rec-brk').value = r && r.brk != null ? r.brk : ''; $('#rec-note').value = r ? r.note || '' : '';
  $('#rec-delete').hidden = !r; $('#rec-err').textContent = ''; $('#rec-dlg').showModal();
}
$('#rec-add-brk').onclick = () => addBreakRow($('#rec-breaks'));
$('#rec-save').onclick = async () => {
  const body = { staffId: $('#rec-staff').value, date: $('#rec-date').value, inTime: $('#rec-in').value, outTime: $('#rec-out').value, breaks: readBreaks($('#rec-breaks')), brk: $('#rec-brk').value, note: $('#rec-note').value };
  try { await api(recEditing ? `/api/owner/records/${recEditing.id}` : '/api/owner/records', { method: recEditing ? 'PUT' : 'POST', body }); $('#rec-dlg').close(); renderRecords(); } catch (e) { $('#rec-err').textContent = e.message; }
};
$('#rec-delete').onclick = async () => { if (!confirm(t('DELETE_REC_CONFIRM'))) return; await api(`/api/owner/records/${recEditing.id}`, { method: 'DELETE' }); $('#rec-dlg').close(); renderRecords(); };

// ═══ 급여 ═══
let PF = null;
async function renderPayroll() {
  if (!PF) { const ym = O.today.slice(0, 7); PF = { mode: 'month', month: ym, week: weekStartOf(O.today), from: ym + '-01', to: monthEnd(ym) }; }
  if (PF.mode === 'month') { PF.from = PF.month + '-01'; PF.to = monthEnd(PF.month); }
  if (PF.mode === 'week') { PF.from = weekStartOf(PF.week); PF.to = addDays(PF.from, 6); }
  const [data, slips] = await Promise.all([api(`/api/owner/payroll?from=${PF.from}&to=${PF.to}`), api(`/api/owner/payslips?from=${PF.from}&to=${PF.to}`)]);
  const slipOf = id => slips.items.find(x => x.staffId === id);
  if (!PF.payDate) { const [y, m] = PF.to.split('-').map(Number); PF.payDate = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-${String(Math.min(O.store.settings.payDay || 10, 28)).padStart(2, '0')}`; }
  const sum = k => data.list.reduce((a, p) => a + p[k], 0);
  const monthly = data.list[0] ? data.list[0].monthly : PF.mode === 'month';
  panel('payroll').innerHTML = `<div class="spread section"><h2>${t('TAB_PAYROLL')}</h2><div class="row"><button class="btn" id="x-pay">${t('EXCEL_PAYROLL')}</button><button class="btn" id="slip-issue">${t('ISSUE_SLIPS')}</button><button class="btn primary" id="slip-all">${t('PRINT_ALL_SLIPS')}</button></div></div>
  <div class="card section"><div class="grid g4" style="align-items:end">
    <label class="f"><span>${t('PAY_UNIT')}</span><select id="pf-mode"><option value="month">${t('PAY_MONTH')}</option><option value="week">${t('PAY_WEEK')}</option><option value="range">${t('PAY_RANGE')}</option></select></label>
    <label class="f" id="l-month"><span>${t('MONTH')}</span><input type="month" id="pf-month" value="${PF.month}"></label><label class="f" id="l-week"><span>${t('WEEK_PICK')}</span><input type="date" id="pf-week" value="${PF.week}"></label>
    <label class="f" id="l-from"><span>${t('FROM')}</span><input type="date" id="pf-from" value="${PF.from}"></label><label class="f" id="l-to"><span>${t('TO')}</span><input type="date" id="pf-to" value="${PF.to}"></label>
    <label class="f"><span>${t('PAY_DATE')}</span><input type="date" id="pf-paydate" value="${PF.payDate}"></label><button class="btn" id="pf-go">${t('CALCULATE')}</button></div>
    <p class="muted" style="margin-top:8px">${PF.from} ~ ${PF.to} · ${t(O.store.settings.fivePlus ? 'FIVE_ON' : 'FIVE_OFF')} (${rateLine()}) · ${t('HOLIDAY_RULE_SHORT')}${monthly ? '' : ' · ' + t('INS_MONTHLY_ONLY')}</p></div>
  <div class="kpis"><div class="card stat"><span>${t('WORK_HOURS')}</span><strong>${hours(sum('workedMin'))}</strong></div><div class="card stat"><span>${t('GROSS')}</span><strong>${won(sum('gross'))}</strong></div><div class="card stat"><span>${t('NET_TOTAL')}</span><strong>${won(sum('net'))}</strong></div><div class="card stat"><span>${t('TOTAL_COST')}</span><strong>${won(sum('totalCost'))}</strong></div></div>
  <div class="table-wrap"><table><thead><tr><th>${t('NAME')}</th><th class="num">${t('WAGE')}</th><th class="num">${t('WORK_HOURS')}</th><th class="num">${t('BASE_PAY')}</th><th class="num">${t('HOLIDAY_PAY')}</th><th class="num">${t('EXTRA_PAY')}</th><th class="num">${t('GROSS')}</th><th class="num">${t('DEDUCTIONS')}</th><th class="num">${t('NET')}</th><th class="num">${t('EMPLOYER_INS')}</th><th></th></tr></thead><tbody>
  ${data.list.map((p, i) => `<tr><td><b>${esc(p.name)}</b>${p.payType === 'monthly' ? ` <span class="pill">${t('PT_MONTHLY')}</span>` : ''}${(sl => sl ? `<br><span class="pill ${sl.viewedAt ? 'in' : 'warn'}">${t(sl.viewedAt ? 'SLIP_VIEWED' : 'SLIP_ISSUED', { at: kstDate(sl.viewedAt || sl.issuedAt).slice(5) })}</span>` : '')(slipOf(p.staffId))}${p.warnings.map(w => `<br><span class="pill out">${esc(t(w.code, { ...w, wage: won(w.wage), min: won(w.min) }))}</span>`).join('')}</td><td class="num">${won(p.wage)}</td><td class="num">${hours(p.workedMin)}</td><td class="num">${won(p.base)}</td><td class="num">${won(p.holidayPay)}${p.publicHolidayPay ? `<br><small class="muted">+${t('PAID_HOLIDAY')} ${won(p.publicHolidayPay)}</small>` : ''}</td><td class="num">${won(p.overtimePay + p.nightPay + p.holidayWorkPay + p.excessPay)}</td><td class="num">${won(p.gross)}</td><td class="num">${won(p.deductionTotal)}</td><td class="num"><b>${won(p.net)}</b></td><td class="num">${won(p.employerCost)}</td>
    <td><div class="row" style="flex-wrap:nowrap"><button class="btn small" data-det="${i}">${t('DETAIL')}</button><button class="btn small" data-slip="${i}">${t('PAYSLIP')}</button></div></td></tr>
    <tr data-det-row="${i}" hidden><td colspan="11" style="background:#fafbfd">${payDetail(p)}</td></tr>`).join('') || `<tr><td colspan="11" class="muted">${t('NO_STAFF')}</td></tr>`}</tbody></table></div>
  <div class="infobox">${t('PAY_INFO')}</div>`;
  $('#pf-mode').value = PF.mode;
  const vis = () => { const m = $('#pf-mode').value; $('#l-month').hidden = m !== 'month'; $('#l-week').hidden = m !== 'week'; $('#l-from').hidden = $('#l-to').hidden = m !== 'range'; };
  vis(); $('#pf-mode').onchange = vis;
  $('#pf-go').onclick = () => { PF = { mode: $('#pf-mode').value, month: $('#pf-month').value, week: $('#pf-week').value, from: $('#pf-from').value, to: $('#pf-to').value }; renderPayroll(); };
  $('#pf-paydate').onchange = e => PF.payDate = e.target.value;
  $$('[data-det]').forEach(b => b.onclick = () => { const r = $(`[data-det-row="${b.dataset.det}"]`); r.hidden = !r.hidden; });
  const foreign = p => (staffById(p.staffId) || {}).nationality === 'FOREIGN';
  $$('[data-slip]').forEach(b => b.onclick = () => { const p = data.list[b.dataset.slip]; printDoc(payslipHTML(p, data.store, PF.payDate, foreign(p))); });
  $('#slip-all').onclick = () => printDoc(data.list.map((p, i) => `<div class="${i ? 'page-break' : ''}">${payslipHTML(p, data.store, PF.payDate, foreign(p))}</div>`).join(''));
  $('#slip-issue').onclick = async () => {
    const n = data.list.filter(p => p.gross > 0).length; if (!n) return toast(t('NO_STAFF'), 'error');
    if (!confirm(t('ISSUE_CONFIRM', { n, from: PF.from, to: PF.to, date: PF.payDate }))) return;
    try { const r = await api('/api/owner/payslips', { method: 'POST', body: { from: PF.from, to: PF.to, payDate: PF.payDate } }); toast(t('ISSUED_N', { n: r.count }), 'ok'); renderPayroll(); } catch (e) { fail(e); }
  };
  $('#x-pay').onclick = () => download(`/api/owner/export/payroll.xlsx?from=${PF.from}&to=${PF.to}`);
}
function curRates() { const r = O.store.settings.premiums || {}, f = O.store.settings.fivePlus, v = (k, d) => (r[k] === undefined || r[k] === '' ? d : +r[k]); return { overtime: v('overtime', f ? 50 : 0), night: v('night', f ? 50 : 0), holiday: v('holiday', f ? 50 : 0), holidayOver8: v('holidayOver8', f ? 100 : 0), partTimeExcess: v('partTimeExcess', f ? 50 : 0) }; }
function rateLine() { const r = O.store.settings.premiums || {}, f = O.store.settings.fivePlus, v = (k, d) => r[k] ?? d; return t('RATES_LINE', { o: v('overtime', f ? 50 : 0), n: v('night', f ? 50 : 0), h: v('holiday', f ? 50 : 0), h8: v('holidayOver8', f ? 100 : 0), x: v('partTimeExcess', f ? 50 : 0) }); }
function payDetail(p) {
  const R = p.rates, L = [];
  L.push([t('BASE_PAY'), p.payType === 'monthly' ? t('BASE_MONTHLY', { s: won(p.monthlySalary), h: p.stdHours, r: won(p.wage) }) : `${hours(p.workedMin)} × ${won(p.wage)}`, p.base]);
  if (p.holidayPay) L.push([t('HOLIDAY_PAY'), '', p.holidayPay]);
  if (p.overtimeMin) L.push([t('OT_PAY'), `${hours(p.overtimeMin)} × ${won(p.wage)} × ${R.overtime}%`, p.overtimePay]);
  if (p.nightMin) L.push([t('NIGHT_PAY'), `${hours(p.nightMin)} × ${won(p.wage)} × ${R.night}%`, p.nightPay]);
  if (p.holidayMin || p.holidayOver8Min) L.push([t('HOLIDAY_WORK_PAY'), `${hours(p.holidayMin)} × ${R.holiday}% + ${hours(p.holidayOver8Min)} × ${R.holidayOver8}%`, p.holidayWorkPay]);
  if (p.excessMin) L.push([t('EXCESS_PAY'), `${hours(p.excessMin)} × ${won(p.wage)} × ${R.partTimeExcess}%`, p.excessPay]);
  for (const h of p.paidHolidays) L.push([t('PAID_HOLIDAY'), md(h.date), h.amount]);
  if (p.allowance) L.push([t('ALLOWANCE'), '', p.allowance]);
  const items = `<table style="margin-bottom:10px"><thead><tr><th>${t('PAY_ITEM')}</th><th>${t('PAY_CALC')}</th><th class="num">${t('AMOUNT')}</th></tr></thead><tbody>${L.map(([a, b, c]) => `<tr><td>${a}</td><td class="muted">${esc(b)}</td><td class="num">${won(c)}</td></tr>`).join('')}</tbody></table>`;
  return items + payDetail0(p);
}
function payDetail0(p) {
  const weeks = `<table><thead><tr><th>${t('WEEK')}</th><th>${t('SCHEDULED')}</th><th>${t('WORKED')}</th><th>${t('HOLIDAY_JUDGE')}</th><th class="num">${t('HOLIDAY_PAY')}</th></tr></thead><tbody>${p.weeks.map(w => `<tr><td>${md(w.start)} ~ ${md(w.end)}</td><td>${hours(w.scheduledMin)}</td><td>${hours(w.workedMin)}</td><td>${t('HW_' + w.status.toUpperCase(), { days: w.missing.map(d => d.slice(5)).join(', ') })}</td><td class="num">${w.counted ? won(w.holidayPay) : `<span class="muted">${t('OTHER_PERIOD')}</span>`}</td></tr>`).join('')}</tbody></table>`;
  const ded = p.deductions.length ? `<p style="margin-top:8px">${t('DEDUCTIONS')}: ${p.deductions.map(d => `${t('D_' + d.key)} ${won(d.amount)}`).join(' · ')}</p>` : '';
  let ins = '';
  if (p.insurance) {
    const e = p.insurance.eligibility;
    ins = `<h4 style="margin:12px 0 6px">${t('INS_TITLE')} <small class="muted">(${t('MONTH_HOURS', { h: p.monthHours.toFixed(1) })})</small></h4><table><thead><tr><th>${t('X_KIND')}</th><th>${t('X_APPLY')}</th><th>${t('X_REASON')}</th><th class="num">${t('X_EMPLOYEE')}</th><th class="num">${t('X_EMPLOYER')}</th><th class="num">${t('X_SUPPORT')}</th></tr></thead><tbody>
    ${['pension', 'health', 'ltc', 'employment', 'industrial'].map(k => { const it = p.insurance.items.find(i => i.key === k), el = e[k === 'ltc' ? 'health' : k]; return `<tr><td>${t('D_' + k)}</td><td>${el.apply ? '<span class="pill in">O</span>' : '<span class="pill">X</span>'}${el.check ? ` <span class="pill warn">${t('INS_CHECK')}</span>` : ''}</td><td class="muted">${t(el.reason)}</td><td class="num">${it ? won(it.employee) : '-'}</td><td class="num">${it ? won(it.employer) : '-'}</td><td class="num">${it && (it.supportEmployee || it.supportEmployer) ? won((it.supportEmployee || 0) + (it.supportEmployer || 0)) : ''}</td></tr>`; }).join('')}
    <tr><th>${t('X_TOTAL')}</th><th></th><th></th><th class="num">${won(p.insurance.employee)}</th><th class="num">${won(p.insurance.employer)}</th><th></th></tr></tbody></table>`;
  } else if (p.deduction === 'insurance' && !p.monthly) ins = `<p class="muted">${t('INS_MONTHLY_ONLY')}</p>`;
  return weeks + ded + ins;
}

// ═══ 근로계약서 ═══
let ctStaff = '', ctType = '';
function autoType(s) {
  const age = ageOn(s.birth, O.today);
  if (s.nationality === 'FOREIGN') return 'foreign';
  if (age !== null && age < 18) return 'minor';
  const wm = [0, 1, 2, 3, 4, 5, 6].reduce((a, d) => a + shiftMin((s.pattern || {})[d]), 0);
  if (wm < 2400) return 'parttime';
  return s.endDate ? 'fixed' : 'regular';
}
function renderContract() {
  const list = active();
  if (!list.find(s => s.id === ctStaff)) { ctStaff = list[0] ? list[0].id : ''; ctType = ''; }
  const s = staffById(ctStaff), st = O.store;
  if (!s) { panel('contract').innerHTML = `<div class="card">${t('NO_STAFF')}</div>`; return; }
  ctType = ctType || autoType(s);
  const hol = s.weeklyHoliday !== undefined && s.weeklyHoliday !== '' ? +s.weeklyHoliday : [0, 6, 5, 4, 3, 2, 1].find(d => !(s.pattern && s.pattern[d])) ?? 0;
  const KDOW = ['일', '월', '화', '수', '목', '금', '토'];
  panel('contract').innerHTML = `<div class="spread section"><h2>${t('TAB_CONTRACT')}</h2></div>
  <div class="card section"><form id="ct-form" class="grid g3">
    <label class="f"><span>${t('STAFF')}</span><select id="ct-staff">${list.map(x => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${esc(x.name)}${x.nationality === 'FOREIGN' ? ' (' + t('FOREIGNER') + ')' : ''}</option>`).join('')}</select></label>
    <label class="f" style="grid-column:span 2"><span>${t('CT_TYPE')}</span><select id="ct-type">${Object.entries(CONTRACT_TYPES).map(([k, v]) => `<option value="${k}" ${k === ctType ? 'selected' : ''}>${v}${k === autoType(s) ? ' ★' : ''}</option>`).join('')}</select></label>
    <label class="f"><span>${t('START_DATE')}</span><input name="startDate" type="date" value="${esc(s.startDate || O.today)}"></label><label class="f"><span>${t('END_DATE')}</span><input name="endDate" type="date" value="${esc(s.endDate || '')}"></label><label class="f"><span>${t('SIGN_DATE')}</span><input name="signDate" type="date" value="${O.today}"></label>
    <label class="f"><span>${t('WORKPLACE')}</span><input name="place" value="${esc(st.address ? `${st.name} (${st.address})` : st.name)}"></label><label class="f" style="grid-column:span 2"><span>${t('JOB_DESC')}</span><input name="job" value="${esc(s.jobDesc || s.position || '')}"></label>
    <label class="f"><span>${t(s.payType === 'monthly' ? 'MONTHLY_SALARY' : 'WAGE')}</span><input name="wage" type="number" value="${esc(s.payType === 'monthly' ? s.monthlySalary : s.hourlyWage)}"></label>
    <label class="f"><span>${t('WEEKLY_HOLIDAY')}</span><select name="weeklyHoliday">${KDOW.map((d, i) => `<option value="${d}" ${i === hol ? 'selected' : ''}>${DOWS()[i]}</option>`).join('')}</select></label>
    <label class="f"><span>${t('PAY_DAY')}</span><input name="payDay" type="number" min="1" max="31" value="${esc(st.settings.payDay)}"></label>
    <label class="f"><span>${t('BONUS')}</span><input name="bonus"></label><label class="f"><span>${t('OTHER_PAY')}</span><input name="otherPay"></label>
    <label class="f"><span>${t('PAY_METHOD')}</span><select name="payMethod"><option value="account">${t('PM_ACCOUNT')}</option><option value="direct" ${st.settings.payMethod === 'direct' ? 'selected' : ''}>${t('PM_DIRECT')}</option></select></label>
    <div style="grid-column:1/-1" class="chips"><label><input type="checkbox" name="ins_employment" checked> ${t('D_employment')}</label><label><input type="checkbox" name="ins_industrial" checked> ${t('D_industrial')}</label><label><input type="checkbox" name="ins_pension" ${s.deduction === 'insurance' ? 'checked' : ''}> ${t('D_pension')}</label><label><input type="checkbox" name="ins_health" ${s.deduction === 'insurance' ? 'checked' : ''}> ${t('D_health')}</label></div>
    <fieldset id="ct-foreign" style="grid-column:1/-1" ${ctType === 'foreign' ? '' : 'hidden'}><legend>${t('CT_FOREIGN')}</legend><div class="grid g3">
      <label class="f"><span>${t('CT_ENTRY')}</span><select name="entry"><option value="new">${t('CT_NEW')}</option><option value="re">${t('CT_RE')}</option><option value="change">${t('CT_CHANGE')}</option></select></label>
      <label class="f"><span>${t('CT_PROBATION')}</span><input name="probation" type="number" min="0"></label><label class="f"><span>${t('CT_PROB_WAGE')}</span><input name="probationWage"></label>
      <label class="chk"><input type="checkbox" name="housing"> ${t('CT_HOUSING')}</label><label class="f"><span>${t('CT_HOUSING_NOTE')}</span><input name="housingNote"></label><span></span>
      <label class="chk"><input type="checkbox" name="meals"> ${t('CT_MEALS')}</label><label class="f"><span>${t('CT_MEALS_NOTE')}</span><input name="mealsNote"></label></div></fieldset>
    <fieldset id="ct-minor" style="grid-column:1/-1" ${ctType === 'minor' ? '' : 'hidden'}><legend>${t('CT_MINOR')}</legend><div class="grid g3">
      <label class="chk"><input type="checkbox" name="minorDocs" checked> ${t('CT_MINOR_DOCS')}</label><label class="f"><span>${t('CT_G_NAME')}</span><input name="g_name"></label><label class="f"><span>${t('RELATION')}</span><input name="g_relation"></label>
      <label class="f"><span>${t('BIRTH')}</span><input name="g_birth" type="date"></label><label class="f"><span>${t('PHONE')}</span><input name="g_phone"></label><label class="f"><span>${t('ADDRESS')}</span><input name="g_address"></label></div></fieldset>
  </form>
  ${!st.ownerName || !st.address ? `<div class="warnbox">${t('CT_NEED_STORE')}</div>` : ''}${!Object.keys(s.pattern || {}).length ? `<div class="warnbox">${t('CT_NEED_PATTERN')}</div>` : ''}
  <label class="chk" style="margin-top:14px"><input type="checkbox" id="ct-share" ${s.hasLogin ? 'checked' : 'disabled'}> ${t(s.hasLogin ? 'CT_SHARE' : 'CT_SHARE_NOAPP')}</label>
  <div class="row" style="margin-top:10px"><button class="btn" id="ct-preview">${t('PREVIEW')}</button><button class="btn primary" id="ct-print">${t('SAVE_PRINT')}</button></div></div>
  <div class="card section" id="ct-box" hidden style="overflow:auto"></div>
  <div class="card section"><h3>${t('CT_LIST')}</h3><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>${t('CREATED')}</th><th>${t('STAFF')}</th><th>${t('CT_TYPE')}</th><th>${t('CT_DELIVERY')}</th><th></th></tr></thead><tbody>
  ${O.contracts.map(c => `<tr><td>${kstDate(c.createdAt)} ${kstTime(c.createdAt)}</td><td>${esc((staffById(c.staffId) || {}).name || '-')}</td><td>${esc(c.title)}</td><td>${c.receivedAt ? `<span class="pill in">${t('CT_RECEIVED', { at: kstDate(c.receivedAt) })}</span>` : c.viewedAt ? `<span class="pill warn">${t('CT_VIEWED')}</span>` : c.sharedAt ? `<span class="pill">${t('CT_SENT')}</span>` : `<span class="muted">-</span>`}</td><td><div class="row"><button class="btn small" data-rp="${c.id}">${t('REPRINT')}</button>${c.sharedAt ? '' : `<button class="btn small" data-cs="${c.id}">${t('CT_SEND_APP')}</button><button class="btn small danger" data-cd="${c.id}">${t('DELETE')}</button>`}</div></td></tr>`).join('') || `<tr><td colspan="5" class="muted">-</td></tr>`}</tbody></table></div>
  <p class="muted">${t('CT_LAW')}</p></div>`;
  $('#ct-staff').onchange = e => { ctStaff = e.target.value; ctType = ''; renderContract(); };
  $('#ct-type').onchange = e => { ctType = e.target.value; $('#ct-foreign').hidden = ctType !== 'foreign'; $('#ct-minor').hidden = ctType !== 'minor'; };
  $('#ct-preview').onclick = () => { const b = $('#ct-box'); b.hidden = false; b.innerHTML = contractHTML(ctFields(s)); b.scrollIntoView({ behavior: 'smooth' }); };
  $('#ct-print').onclick = async () => { const f = ctFields(s); await api('/api/owner/contracts', { method: 'POST', body: { staffId: s.id, type: f.type, title: CONTRACT_TYPES[f.type], fields: f, share: $('#ct-share').checked } }); await refresh(); printDoc(contractHTML(f)); renderContract(); };
  $$('[data-rp]').forEach(b => b.onclick = async () => printDoc(contractHTML((await api('/api/owner/contracts/' + b.dataset.rp)).fields)));
  $$('[data-cs]').forEach(b => b.onclick = async () => { try { await api(`/api/owner/contracts/${b.dataset.cs}/share`, { method: 'POST' }); toast(t('SENT'), 'ok'); await refresh(); renderContract(); } catch (e) { fail(e); } });
  $$('[data-cd]').forEach(b => b.onclick = async () => { if (!confirm(t('DELETE') + '?')) return; await api('/api/owner/contracts/' + b.dataset.cd, { method: 'DELETE' }); await refresh(); renderContract(); });
}
function ctFields(s) {
  const f = $('#ct-form'), v = n => f.elements[n] ? (f.elements[n].type === 'checkbox' ? f.elements[n].checked : f.elements[n].value) : '';
  const st = O.store;
  return {
    payType: s.payType || 'hourly', monthlySalary: s.payType === 'monthly' ? +$('#ct-form').elements.wage.value : 0, rates: curRates(), otRate: curRates().partTimeExcess,
    type: $('#ct-type').value, store: { name: st.name, owner: st.ownerName, bizNo: st.bizNo, address: st.address, phone: st.phone, industry: st.industry }, fivePlus: st.settings.fivePlus,
    worker: { name: s.name, phone: s.phone, address: s.address, birth: s.birth, age: ageOn(s.birth, O.today), country: s.country, homeAddress: s.homeAddress, visa: s.visa },
    days: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, (s.pattern || {})[d] || null])),
    startDate: v('startDate'), endDate: v('endDate'), signDate: v('signDate'), place: v('place'), job: v('job'), wage: s.payType === 'monthly' ? Math.round(+v('wage') / (+s.monthlyHours || 209)) : +v('wage'), weeklyHoliday: v('weeklyHoliday'), payDay: v('payDay'), bonus: v('bonus'), otherPay: v('otherPay'), payMethod: v('payMethod'),
    insurance: { employment: v('ins_employment'), industrial: v('ins_industrial'), pension: v('ins_pension'), health: v('ins_health') },
    entry: v('entry'), probation: v('probation'), probationWage: v('probationWage'), housing: v('housing'), housingNote: v('housingNote'), meals: v('meals'), mealsNote: v('mealsNote'),
    minorDocs: v('minorDocs'), guardian: { name: v('g_name'), relation: v('g_relation'), birth: v('g_birth'), phone: v('g_phone'), address: v('g_address') },
  };
}

// ═══ 설정 ═══
async function renderSettings() {
  await refresh();
  const st = O.store, s = st.settings, g = s.geo, r = s.rates;
  panel('settings').innerHTML = `<nav class="subnav">${[['f-store', 'STORE_INFO'], ['f-scale', 'SCALE_TITLE'], ['f-rules', 'RULES'], ['f-geo', 'AUTO_TITLE'], ['k-card', 'KIOSK_TITLE'], ['f-pw', 'CHANGE_PW']].map(([id, k]) => `<a href="#" data-jump="${id}">${t(k)}</a>`).join('')}</nav>
  <div class="card section" id="k-card"><h2>${t('KIOSK_TITLE')}</h2><p class="muted" style="margin:6px 0 12px">${t('KIOSK_SET_HELP')}</p>
    <div class="row">${O.kiosk ? `<span class="pill in">${t('KIOSK_THIS_ON')}</span>` : ''}<button class="btn primary" id="k-reg">${t('KIOSK_REG')}</button><button class="btn danger" id="k-reset">${t('KIOSK_RESET')}</button></div></div>
  <form class="card section" id="f-store"><h2>${t('STORE_INFO')}</h2><div class="grid g3" style="margin-top:12px">
    <label class="f"><span>${t('STORE_CODE')}</span><input value="${esc(st.bizNo)}" disabled></label><label class="f"><span>${t('STORE_NAME')}</span><input name="name" value="${esc(st.name)}"></label><label class="f"><span>${t('OWNER_NAME')}</span><input name="ownerName" value="${esc(st.ownerName)}"></label>
    <label class="f" style="grid-column:span 2"><span>${t('STORE_ADDRESS')}</span><input name="address" value="${esc(st.address)}"></label><label class="f"><span>${t('PHONE')}</span><input name="phone" value="${esc(st.phone)}"></label>
    <label class="f"><span>${t('INDUSTRY')}</span><input name="industry" value="${esc(st.industry)}"></label></div>
    <h3 style="margin-top:16px">${t('STORE_LOCATION')}</h3><p class="muted">${t('LOCATION_HELP')}</p>
    <div class="grid g4" style="margin-top:8px;align-items:end"><label class="f"><span>${t('LAT')}</span><input name="lat" value="${esc(st.lat ?? '')}"></label><label class="f"><span>${t('LNG')}</span><input name="lng" value="${esc(st.lng ?? '')}"></label>
    <button type="button" class="btn" id="geo-addr">${t('FIND_BY_ADDRESS')}</button><button type="button" class="btn" id="geo-here">${t('USE_HERE')}</button></div>
    <p style="margin-top:6px">${st.lat != null ? `<a target="_blank" rel="noopener" href="https://map.kakao.com/link/map/${encodeURIComponent(st.name)},${st.lat},${st.lng}">${t('VIEW_MAP')}</a>` : ''}</p>
    <button class="btn primary" style="margin-top:12px">${t('SAVE')}</button></form>
  <form class="card section" id="f-geo"><h2>${t('AUTO_TITLE')}</h2><p class="muted" style="margin:6px 0 12px">${t('AUTO_HELP')}</p><div class="grid g3">
    <label class="chk" style="grid-column:1/-1"><input type="checkbox" name="auto" ${g.auto ? 'checked' : ''}> <span><b>${t('AUTO_ON')}</b></span></label>
    <label class="f"><span>${t('RADIUS')}</span><input name="radius" type="number" min="30" max="1000" value="${g.radius}"><small>${t('RADIUS_HELP')}</small></label>
    <label class="f"><span>${t('EARLY_MIN')}</span><input name="earlyMin" type="number" value="${g.earlyMin}"></label><label class="f"><span>${t('LATE_OUT_MIN')}</span><input name="lateOutMin" type="number" value="${g.lateOutMin}"></label>
    <label class="f"><span>${t('EXIT_GRACE')}</span><input name="exitGraceMin" type="number" value="${g.exitGraceMin}"></label>
    <label class="chk" style="grid-column:1/-1"><input type="checkbox" name="requireLocation" ${g.requireLocation ? 'checked' : ''}> <span>${t('REQUIRE_LOC')}</span></label></div>
    <button class="btn primary" style="margin-top:12px">${t('SAVE')}</button></form>
  <form class="card section" id="f-scale"><h2>${t('SCALE_TITLE')}</h2><p class="muted" style="margin:6px 0 12px">${t('SCALE_HELP')}</p>
    <div class="infobox" id="wf-box">${t('WF_LOADING')}</div>
    <div class="row" style="margin:8px 0 14px"><label class="f" style="flex-direction:row;align-items:center;gap:8px"><span>${t('WF_EXTRA')}</span><input id="wf-extra" type="number" min="0" value="0" style="width:90px"></label><button type="button" class="btn small" id="wf-calc">${t('WF_CALC')}</button></div>
    <label class="chk"><input type="checkbox" name="fivePlus" ${s.fivePlus ? 'checked' : ''}> <span><b>${t('FIVE_PLUS')}</b><br><span class="muted">${t('FIVE_PLUS_HELP2')}</span></span></label>
    <h3 style="margin-top:16px">${t('PREMIUM_TITLE')}</h3><p class="muted">${t('PREMIUM_HELP')}</p>
    <div class="grid g4" style="margin-top:8px">${[['overtime', 50], ['night', 50], ['holiday', 50], ['holidayOver8', 100], ['partTimeExcess', 50]].map(([k, d]) => `<label class="f"><span>${t('PR_' + k)}</span><input data-prem="${k}" type="number" min="0" max="300" step="5" value="${esc((s.premiums || {})[k] ?? '')}" placeholder="${s.fivePlus ? d : 0}"><small>${t('PR_LEGAL', { d: s.fivePlus ? d : 0 })}</small></label>`).join('')}</div>
    <div class="row" style="margin-top:8px"><button type="button" class="btn small" id="pr-legal">${t('PR_FILL_LEGAL')}</button><button type="button" class="btn small" id="pr-zero">${t('PR_FILL_ZERO')}</button></div>
    <label class="chk" style="margin-top:12px"><input type="checkbox" name="publicHolidayPay" ${((s.premiums || {}).publicHolidayPay ?? s.fivePlus) ? 'checked' : ''}> <span><b>${t('PUBLIC_HOLIDAY_PAY')}</b><br><span class="muted">${t('PUBLIC_HOLIDAY_PAY_HELP')}</span></span></label>
    <label class="chk" style="margin-top:8px"><input type="checkbox" name="laborDay" ${((s.premiums || {}).laborDay ?? true) ? 'checked' : ''}> <span><b>${t('LABOR_DAY')}</b><br><span class="muted">${t('LABOR_DAY_HELP')}</span></span></label>
    <h3 style="margin-top:16px">${t('HOLIDAY_LIST')}</h3><p class="muted">${t('HOLIDAY_LIST_HELP')}</p>
    <textarea id="hol-list" style="min-height:140px;margin-top:6px;font-family:ui-monospace,monospace">${esc((s.publicHolidays || []).map(h => `${h.date} ${h.name}`).join('\n'))}</textarea>
    <div class="row" style="margin-top:6px"><button type="button" class="btn small" data-hol="2026">${t('HOL_LOAD', { y: 2026 })}</button><button type="button" class="btn small" data-hol="2027">${t('HOL_LOAD', { y: 2027 })}</button></div>
    <button class="btn primary" style="margin-top:12px">${t('SAVE')}</button></form>
  <form class="card section" id="f-rules"><h2>${t('RULES')}</h2><div class="grid g3" style="margin-top:12px">
    <label class="chk" style="grid-column:1/-1"><input type="checkbox" name="breakAuto" ${s.breakAuto ? 'checked' : ''}> <span><b>${t('BREAK_AUTO')}</b><br><span class="muted">${t('BREAK_AUTO_HELP')}</span></span></label>
    <label class="chk" style="grid-column:1/-1"><input type="checkbox" name="earlyFromSchedule" ${s.earlyFromSchedule ? 'checked' : ''}> <span><b>${t('EARLY_SCHED')}</b><br><span class="muted">${t('EARLY_SCHED_HELP')}</span></span></label>
    <label class="f"><span>${t('ROUNDING')}</span><select name="rounding">${[1, 5, 10, 15, 30].map(x => `<option value="${x}" ${+s.rounding === x ? 'selected' : ''}>${x}${t('MIN_UNIT')}</option>`).join('')}</select></label>
    <label class="f"><span>${t('PAY_DAY')}</span><input name="payDay" type="number" min="1" max="31" value="${s.payDay}"></label>
    <label class="f"><span>${t('PAY_METHOD')}</span><select name="payMethod"><option value="account">${t('PM_ACCOUNT')}</option><option value="direct" ${s.payMethod === 'direct' ? 'selected' : ''}>${t('PM_DIRECT')}</option></select></label></div>
    <h3 style="margin-top:16px">${t('MINWAGE_TABLE')}</h3><div class="grid g4" id="mw" style="margin-top:8px">${Object.entries(s.minWages).map(([y, v]) => `<label class="f"><span>${y}</span><input data-y="${y}" type="number" value="${v}"></label>`).join('')}<label class="f"><span>${t('ADD_YEAR')}</span><input id="mw-y" type="number"></label><label class="f"><span>${t('WAGE')}</span><input id="mw-v" type="number"></label></div>
    <h3 style="margin-top:16px">${t('INS_RATES')}</h3><div class="grid g4" style="margin-top:8px">${Object.keys(r).map(k => `<label class="f"><span>${t('R_' + k)}</span><input data-rate="${k}" type="number" step="0.001" value="${r[k]}"></label>`).join('')}</div>
    <p class="muted">${t('INS_RATES_HELP')}</p>
    <label class="chk" style="margin-top:10px"><input type="checkbox" name="durunuri" ${s.durunuri ? 'checked' : ''}> <span><b>${t('DURUNURI')}</b><br><span class="muted">${t('DURUNURI_HELP')}</span></span></label>
    <button class="btn primary" style="margin-top:12px">${t('SAVE')}</button></form>
  <form class="card section" id="f-pw"><h2>${t('CHANGE_PW')}</h2><p class="muted">${t('LOGIN_EMAIL', { email: O.user.email })}</p><div class="grid g3" style="margin-top:12px"><label class="f"><span>${t('CURRENT_PW')}</span><input type="password" name="current" required autocomplete="current-password"></label><label class="f"><span>${t('NEW_PW')}</span><input type="password" name="next" required autocomplete="new-password"></label></div><button class="btn primary" style="margin-top:12px">${t('CHANGE_PW')}</button></form>
  <div class="card section"><h2>${t('AUDIT')}</h2><button class="btn" id="audit-btn" style="margin-top:10px">${t('VIEW')}</button><div id="audit" style="margin-top:10px"></div></div>`;
  $$('[data-jump]').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById(a.dataset.jump).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const save = async (body, after) => { try { await api('/api/owner/store', { method: 'PUT', body }); toast(t('SAVED'), 'ok'); await refresh(); after && after(); } catch (e) { fail(e); } };
  $('#f-store').onsubmit = e => { e.preventDefault(); const f = e.target; save({ store: { name: f.name.value, ownerName: f.ownerName.value, address: f.address.value, phone: f.phone.value, industry: f.industry.value, lat: f.lat.value, lng: f.lng.value } }, renderSettings); };
  $('#geo-addr').onclick = async () => { const f = $('#f-store'); try { const r2 = await api('/api/owner/geocode', { method: 'POST', body: { address: f.address.value } }); f.lat.value = r2.lat; f.lng.value = r2.lng; toast(r2.address); } catch (e) { toast(e.message, 'error'); } };
  $('#geo-here').onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => { const f = $('#f-store'); f.lat.value = p.coords.latitude.toFixed(6); f.lng.value = p.coords.longitude.toFixed(6); toast(t('ACCURACY', { m: Math.round(p.coords.accuracy) })); }, () => toast(t('GEO_DENIED'), 'error'), { enableHighAccuracy: true }) : toast(t('GEO_DENIED'), 'error');
  $('#f-geo').onsubmit = e => { e.preventDefault(); const f = e.target; save({ settings: { geo: { auto: f.auto.checked, radius: f.radius.value, earlyMin: f.earlyMin.value, lateOutMin: f.lateOutMin.value, exitGraceMin: f.exitGraceMin.value, requireLocation: f.requireLocation.checked } } }); };
  const HOL = { 2026: [['01-01', '신정'], ['02-16', '설날 연휴'], ['02-17', '설날'], ['02-18', '설날 연휴'], ['03-01', '삼일절'], ['03-02', '대체공휴일(삼일절)'], ['05-05', '어린이날'], ['05-24', '부처님오신날'], ['05-25', '대체공휴일(부처님오신날)'], ['06-03', '전국동시지방선거'], ['06-06', '현충일'], ['08-15', '광복절'], ['08-17', '대체공휴일(광복절)'], ['09-24', '추석 연휴'], ['09-25', '추석'], ['09-26', '추석 연휴'], ['10-03', '개천절'], ['10-05', '대체공휴일(개천절)'], ['10-09', '한글날'], ['12-25', '기독탄신일']],
    2027: [['01-01', '신정'], ['02-06', '설날 연휴'], ['02-07', '설날'], ['02-08', '설날 연휴'], ['02-09', '대체공휴일(설날)'], ['03-01', '삼일절'], ['05-05', '어린이날'], ['05-13', '부처님오신날'], ['06-06', '현충일'], ['08-15', '광복절'], ['08-16', '대체공휴일(광복절)'], ['09-14', '추석 연휴'], ['09-15', '추석'], ['09-16', '추석 연휴'], ['10-03', '개천절'], ['10-04', '대체공휴일(개천절)'], ['10-09', '한글날'], ['10-11', '대체공휴일(한글날)'], ['12-25', '기독탄신일'], ['12-27', '대체공휴일(기독탄신일)']] };
  $$('[data-hol]').forEach(b => b.onclick = () => { const y = b.dataset.hol, cur = $('#hol-list').value.split('\n').filter(l => l.trim() && !l.startsWith(y)); $('#hol-list').value = [...cur, ...HOL[y].map(([d, n]) => `${y}-${d} ${n}`)].sort().join('\n'); toast(t('HOL_VERIFY')); });
  const legal = () => $('#f-scale').fivePlus.checked;
  $('#pr-legal').onclick = () => { const L = { overtime: 50, night: 50, holiday: 50, holidayOver8: 100, partTimeExcess: 50 }; $$('[data-prem]').forEach(i => i.value = legal() ? L[i.dataset.prem] : 0); $('#f-scale').publicHolidayPay.checked = legal(); };
  $('#pr-zero').onclick = () => $$('[data-prem]').forEach(i => i.value = 0);
  const wf = async () => { try { const r = await api('/api/owner/workforce?extra=' + (+$('#wf-extra').value || 0)); $('#wf-box').innerHTML = t('WF_RESULT', { from: r.from, to: r.to, days: r.operatingDays, avg: r.average, under: r.daysUnder5, res: t(r.fivePlus ? 'WF_5PLUS' : 'WF_UNDER5') }); } catch (e) { $('#wf-box').textContent = e.message; } };
  $('#wf-calc').onclick = wf; wf();
  $('#f-scale').onsubmit = e => {
    e.preventDefault(); const f = e.target;
    const bad = []; const publicHolidays = $('#hol-list').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const m = l.match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/); if (!m) bad.push(l); return m && { date: m[1], name: m[2] }; }).filter(Boolean);
    if (bad.length) return toast(t('HOL_BAD', { line: bad[0] }), 'error');
    if (f.fivePlus.checked !== !!s.fivePlus && !confirm(t(f.fivePlus.checked ? 'FIVE_ON_CONFIRM' : 'FIVE_OFF_CONFIRM'))) return;
    save({ settings: { fivePlus: f.fivePlus.checked, premiums: { ...Object.fromEntries($$('[data-prem]').map(i => [i.dataset.prem, i.value])), publicHolidayPay: f.publicHolidayPay.checked, laborDay: f.laborDay.checked }, publicHolidays } }, renderSettings);
  };
  $('#f-rules').onsubmit = e => {
    e.preventDefault(); const f = e.target;
    const minWages = Object.fromEntries($$('#mw [data-y]').map(i => [i.dataset.y, +i.value])); if ($('#mw-y').value && $('#mw-v').value) minWages[$('#mw-y').value] = +$('#mw-v').value;
    save({ settings: { breakAuto: f.breakAuto.checked, earlyFromSchedule: f.earlyFromSchedule.checked, rounding: f.rounding.value, payDay: f.payDay.value, payMethod: f.payMethod.value, durunuri: f.durunuri.checked, minWages, rates: Object.fromEntries($$('[data-rate]').map(i => [i.dataset.rate, i.value])) } }, renderSettings);
  };
  $('#f-pw').onsubmit = async e => { e.preventDefault(); try { await api('/api/owner/password', { method: 'POST', body: { current: e.target.current.value, next: e.target.next.value } }); e.target.reset(); toast(t('PW_CHANGED'), 'ok'); } catch (err) { toast(err.message, 'error'); } };
  $('#k-reg').onclick = async () => { await api('/api/owner/kiosk', { method: 'POST' }); toast(t('KIOSK_REG_DONE'), 'ok'); renderSettings(); };
  $('#k-reset').onclick = async () => { if (!confirm(t('KIOSK_RESET_CONFIRM'))) return; await api('/api/owner/kiosk/reset', { method: 'POST' }); renderSettings(); };
  $('#audit-btn').onclick = async () => { const rows = await api('/api/owner/audit'); $('#audit').innerHTML = `<div class="table-wrap" style="max-height:360px"><table><tbody>${rows.map(a => `<tr><td>${kstDate(a.at)} ${kstTime(a.at)}</td><td>${esc(a.who)}</td><td>${esc(a.what)}</td></tr>`).join('')}</tbody></table></div>`; };
}

document.addEventListener('DOMContentLoaded', boot);
