'use strict';
// 직원 개인 휴대폰 화면 (홈 화면에 추가하면 앱처럼 실행)
let M = null;
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {});

async function load() {
  try { M = await api('/api/me'); show(true); render(); }
  catch (e) { if (e.status === 401) show(false); else toast(e.message, 'error'); }
}
function show(app) { $('#app').hidden = !app; $('#login').hidden = app; $('#logout').hidden = !app; }
function render() {
  $('#store').textContent = M.store;
  $('#hello').textContent = `${M.name}님, 안녕하세요`;
  const t = M.shifts.find(s => s.date === M.today);
  $('#today-shift').textContent = '오늘 근무: ' + shiftText(t && t.shift);
  const working = M.status === 'in';
  $('#status').innerHTML = working ? `<span class="pill in">근무 중</span> ${kstTime(M.since)} 출근` : '<span class="pill">출근 전 / 퇴근</span>';
  const b = $('#punch'); b.className = 'btn big ' + (working ? 'out' : 'in'); b.textContent = working ? '퇴근하기' : '출근하기'; b.dataset.action = working ? 'out' : 'in';
  $('#shifts').innerHTML = M.shifts.map(s => `<li><span>${md(s.date)}${s.date === M.today ? ' <span class="pill warn">오늘</span>' : ''}</span><span class="${s.shift ? '' : 'muted'}">${esc(shiftText(s.shift))}</span></li>`).join('');
  const p = M.pay;
  $('#pay-title').textContent = `이번 달 예상 급여 (${p.from.slice(5)} ~ ${p.to.slice(5)})`;
  $('#pay').innerHTML = [['근무시간', hours(p.workedMin)], ['시급', won(M.wage)], ['기본급', won(p.base)], ['주휴수당', won(p.holidayPay)], ...(p.overtimePay || p.nightPay ? [['연장·야간 가산', won(p.overtimePay + p.nightPay)]] : []), ['세전 합계', won(p.gross)], ['공제 예상', won(p.deductionTotal)], ['실수령 예상', won(p.net)]]
    .map(([k, v]) => `<div class="stat"><span>${k}</span><strong>${v}</strong></div>`).join('');
  $('#records').innerHTML = M.records.length ? M.records.map(r => `<li><span>${md(r.date)}</span><span>${kstTime(r.in)} ~ ${r.out ? kstTime(r.out) : '<span class="pill in">근무 중</span>'}</span></li>`).join('') : '<li class="muted">아직 기록이 없습니다.</li>';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  $('#install-tip').textContent = standalone ? '' : '홈 화면에 추가하면 앱처럼 쓸 수 있어요. (아이폰: 공유 → 홈 화면에 추가 / 안드로이드: 메뉴 → 홈 화면에 추가)';
}
function position() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { enableHighAccuracy: true, timeout: 10000 });
  });
}
$('#punch').onclick = async () => {
  const action = $('#punch').dataset.action, btn = $('#punch');
  if (action === 'out' && !confirm('퇴근을 기록할까요?')) return;
  btn.disabled = true;
  try {
    const coords = M.needsLocation ? await position() : null;
    const r = await api('/api/me/punch', { method: 'POST', body: { action, coords } });
    toast(action === 'in' ? `출근 ${kstTime(r.at)} 기록됨` : `퇴근 ${kstTime(r.at)} · ${hours(r.workedMin)} 근무`, 'ok');
    await load();
  } catch (e) { toast(e.message, 'error'); }
  finally { btn.disabled = false; }
};
$('#login').onsubmit = async e => {
  e.preventDefault(); $('#login-err').textContent = '';
  try { await api('/api/me/login', { method: 'POST', body: { phone: $('#phone').value, pin: $('#pin').value } }); $('#pin').value = ''; load(); }
  catch (err) { $('#login-err').textContent = err.message; }
};
$('#logout').onclick = async () => { await api('/api/me/logout', { method: 'POST' }); show(false); };
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#app').hidden) load(); });
load();
