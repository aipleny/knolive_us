'use strict';
// 매장 POS 출퇴근 화면
let K = null, sel = null, pin = '';
const PIN_MAX = 6;

function tick() {
  const n = nowKst();
  $('#clock').textContent = n.toISOString().slice(11, 19);
  $('#date').textContent = `${n.getUTCFullYear()}년 ${n.getUTCMonth() + 1}월 ${n.getUTCDate()}일 (${DOW[n.getUTCDay()]})`;
}
async function load() {
  try {
    K = await api('/api/kiosk');
    $('#unregistered').hidden = true; $('#main').hidden = false;
    render();
  } catch (e) {
    if (e.data && e.data.kiosk) { $('#unregistered').hidden = false; $('#main').hidden = true; }
    else toast(e.message, 'error');
  }
}
function render() {
  $('#store').textContent = K.store;
  const working = K.staff.filter(s => s.status === 'in');
  $('#working').textContent = `지금 근무 중 ${working.length}명`;
  $('#grid').innerHTML = K.staff.length ? K.staff.map(s => `
    <button class="staff-btn" data-id="${esc(s.id)}" style="border-left-color:${esc(s.color || '#2b5ce6')}">
      <b>${esc(s.name)}</b>
      <span>${s.status === 'in' ? `<span class="pill in">근무 중 · ${kstTime(s.since)}~</span>` : '<span class="pill">퇴근</span>'}</span>
      <span class="muted">오늘 ${esc(shiftText(s.shift))}</span>
    </button>`).join('') : '<p class="muted">등록된 직원이 없습니다. 관리자 화면에서 직원을 등록해 주세요.</p>';
  $$('.staff-btn').forEach(b => b.onclick = () => open(b.dataset.id));
  const w = K.week;
  $('#week').innerHTML = `<thead><tr><th>이름</th>${w.days.map(d => `<th class="${d === K.today ? 'today' : ''}">${md(d)}</th>`).join('')}</tr></thead><tbody>${
    w.rows.map(r => `<tr><td><span style="color:${esc(r.color || '#2b5ce6')}">●</span> ${esc(r.name)}</td>${r.shifts.map((s, i) => `<td class="${w.days[i] === K.today ? 'today' : ''} ${s ? '' : 'off'}">${s ? esc(s.start + '~' + s.end) : '—'}</td>`).join('')}</tr>`).join('')}</tbody>`;
}
function open(id) {
  sel = K.staff.find(s => s.id === id); pin = '';
  $('#dlg-name').textContent = sel.name + '님';
  $('#dlg-shift').textContent = '오늘 근무: ' + shiftText(sel.shift);
  $('#pin-step').hidden = false; $('#act-step').hidden = true; $('#pin-err').textContent = '';
  dots(); $('#dlg').showModal();
}
function dots() { $('#dots').innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<span class="${i < pin.length ? 'on' : ''}"></span>`).join(''); }
$('#pad').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '지움', '0', '확인'].map(k => `<button type="button" data-k="${k}" ${k.length > 1 ? 'style="font-size:17px"' : ''}>${k}</button>`).join('');
$('#pad').onclick = e => { const k = e.target.dataset && e.target.dataset.k; if (k) press(k); };
document.addEventListener('keydown', e => {
  if (!$('#dlg').open || $('#pin-step').hidden) return;
  if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('지움'); else if (e.key === 'Enter') press('확인');
});
async function press(k) {
  if (k === '지움') pin = pin.slice(0, -1);
  else if (k === '확인') return check();
  else if (pin.length < PIN_MAX) pin += k;
  $('#pin-err').textContent = ''; dots();
}
async function check() {
  if (pin.length < 4) { $('#pin-err').textContent = 'PIN 4자리 이상을 입력하세요.'; return; }
  try {
    const r = await api('/api/kiosk/punch', { method: 'POST', body: { staffId: sel.id, pin, action: 'check' } });
    $('#pin-step').hidden = true; $('#act-step').hidden = false;
    $('#act-status').innerHTML = r.status === 'in' ? `<span class="pill in">근무 중</span> ${kstTime(r.since)} 출근` : '<span class="pill">출근 전</span>';
    $('#do-in').disabled = r.status === 'in'; $('#do-out').disabled = r.status !== 'in';
    (r.status === 'in' ? $('#do-out') : $('#do-in')).focus();
  } catch (e) { pin = ''; dots(); $('#pin-err').textContent = e.message; }
}
async function doPunch(action) {
  try {
    const r = await api('/api/kiosk/punch', { method: 'POST', body: { staffId: sel.id, pin, action } });
    $('#dlg').close();
    toast(action === 'in' ? `${r.name}님 출근 ${kstTime(r.at)} · 오늘도 화이팅!` : `${r.name}님 퇴근 ${kstTime(r.at)} · 오늘 ${hours(r.workedMin)} 근무 · 수고하셨어요!`, 'ok');
    load();
  } catch (e) { toast(e.message, 'error'); }
}
$('#do-in').onclick = () => doPunch('in');
$('#do-out').onclick = () => doPunch('out');
$('#dlg-close').onclick = () => $('#dlg').close();
$('#dlg').addEventListener('close', () => { pin = ''; sel = null; });
// 화면을 오래 켜둬도 상태가 맞도록 주기적으로 새로 고침
tick(); setInterval(tick, 1000); load(); setInterval(() => { if (!$('#dlg').open) load(); }, 60000);
