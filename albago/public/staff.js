'use strict';
// 알바 웹 화면 (앱을 설치하지 않았을 때). 자동 출퇴근은 앱에서만 동작합니다.
let H = null;
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {});
async function load() {
  try { H = await api('/api/staff/home'); adoptLang(H.me.lang); render(); }
  catch (e) { if (e.status === 401) location.href = '/login'; else toast(e.message, 'error'); }
}
function render() {
  $('#store').textContent = H.store.name;
  $('#hello').textContent = t('HELLO', { name: H.me.name });
  $('#status').innerHTML = H.status === 'in' ? `<span class="pill in">${t('ST_IN')}</span> ${t('SINCE', { time: kstTime(H.since) })}` : H.status === 'break' ? `<span class="pill" style="background:#efeafd;color:#6b4fd8">${t('ST_BREAK')}</span> ${t('SINCE', { time: kstTime(H.breakSince) })}` : `<span class="pill">${t('ST_OFF')}</span>`;
  const acts = H.status === 'off' ? [['in', 'in wide']] : H.status === 'in' ? [['break_start', 'brk'], ['out', 'out']] : [['break_end', 'brk'], ['out', 'out']];
  $('#acts').innerHTML = acts.map(([a, c]) => `<button class="btn ${c}" data-a="${a}">${t('ACT_' + a.toUpperCase())}</button>`).join('');
  $$('#acts [data-a]').forEach(b => b.onclick = () => punch(b.dataset.a, b));
  $('#today-shift').textContent = t('TODAY_SHIFT') + ': ' + shiftText(H.today.shift);
  $('#shifts').innerHTML = H.shifts.map(s => `<li><span>${md(s.date)}${s.date === H.today.date ? ` <span class="pill warn">${t('TODAY')}</span>` : ''}</span><span class="${s.shift ? '' : 'muted'}">${esc(shiftText(s.shift))}</span></li>`).join('');
  const m = H.month;
  $('#pay-title').textContent = t('MONTH_PAY', { from: m.from.slice(5), to: m.to.slice(5) });
  $('#pay').innerHTML = [['WORK_HOURS', hours(m.workedMin)], ['BASE_PAY', won(m.base)], ['HOLIDAY_PAY', won(m.holidayPay)], ['EXTRA_PAY', won(m.overtimePay + m.nightPay)], ['GROSS', won(m.gross)], ['NET_EST', won(m.net)]].map(([k, v]) => `<div class="stat"><span>${t(k)}</span><strong>${v}</strong></div>`).join('');
  $('#records').innerHTML = H.records.length ? H.records.map(r => `<li><span>${md(r.date)}</span><span>${kstTime(r.in)} ~ ${r.out ? kstTime(r.out) : `<span class="pill in">${t('ST_IN')}</span>`}${r.breaks.length ? ` <small class="muted">(${t('BREAK')} ${r.breaks.map(b => kstTime(b.start) + '~' + kstTime(b.end)).join(', ')})</small>` : ''}</span></li>`).join('') : `<li class="muted">${t('NO_RECORDS')}</li>`;
}
const position = () => new Promise(res => { if (!navigator.geolocation) return res({}); navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => res({}), { enableHighAccuracy: true, timeout: 10000 }); });
async function punch(action, btn) {
  if (action === 'out' && !confirm(t('CONFIRM_OUT'))) return;
  btn.disabled = true;
  try { const pos = H.store.requireLocation || H.store.lat != null ? await position() : {}; const r = await api('/api/staff/punch', { method: 'POST', body: { action, ...pos } }); toast(r.message, 'ok'); await load(); }
  catch (e) { toast(e.message, 'error'); }
  finally { btn.disabled = false; }
}
$('#pin-form').onsubmit = async e => { e.preventDefault(); try { await api('/api/staff/pin', { method: 'PUT', body: { pin: $('#pin').value } }); $('#pin').value = ''; toast(t('SAVED'), 'ok'); } catch (err) { toast(err.message, 'error'); } };
$('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.href = '/login'; };
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
langButton(() => { if (H) render(); });
load();
