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
  if (H.unread) { $('#unread').hidden = false; $('#unread').textContent = H.unread; }
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
// 소통 채널
const MCOL = { notice: '#2459e0', instruction: '#2459e0', general: '#5d6b7e', warning: '#d4570f', discipline: '#b42318', dismissal: '#b42318', suggestion: '#14966b', absence_reason: '#9a6700', schedule_request: '#6b4fd8' };
async function loadMsgs() {
  const r = await api('/api/staff/messages'); $('#msg-box').hidden = false; $('#unread').hidden = true;
  $('#msg-list').innerHTML = r.items.map(m => `<div class="card section" style="border-left:5px solid ${MCOL[m.kind]};padding:14px">
    <div><span class="pill" style="background:${MCOL[m.kind]}1a;color:${MCOL[m.kind]}">${t('MK_' + m.kind)}</span> <b>${esc(m.title || '')}</b> ${m.date ? `<span class="muted">${esc(m.date)}</span>` : ''}</div>
    <p style="white-space:pre-wrap;margin:8px 0">${esc(m.body)}</p>
    ${m.attachments.map(a => `📎 <a href="/api/staff/attachments/${a.id}" target="_blank" rel="noopener">${esc(a.name)}</a>`).join(' ')}
    <p class="muted">${m.from === 'owner' ? t('FROM_OWNER') : t('SENT')} · ${kstDate(m.createdAt)} ${kstTime(m.createdAt)}${m.from === 'staff' ? ' · ' + (m.ownerReadAt ? t('READ_AT', { at: kstTime(m.ownerReadAt) }) : t('UNREAD')) : ''}</p>
    ${m.from === 'owner' && m.requiresAck ? (m.ackAt ? `<p style="color:var(--in);font-weight:700">${t('ACK_AT', { at: kstDate(m.ackAt) + ' ' + kstTime(m.ackAt) })}</p>` : `<button class="btn primary small" data-ack="${m.id}">${t('ACK_BTN')}</button>`) : ''}</div>`).join('') || `<p class="muted">${t('NO_MESSAGES')}</p>`;
  $$('[data-ack]').forEach(b => b.onclick = async () => { if (!confirm(t('ACK_CONFIRM'))) return; await api(`/api/staff/messages/${b.dataset.ack}/ack`, { method: 'POST' }); loadMsgs(); });
}
$('#msg-load').onclick = () => loadMsgs().catch(e => toast(e.message, 'error'));
$('#msg-form').onsubmit = async e => {
  e.preventDefault(); const f = e.target, files = [...f.files.files];
  if (files.length > 3) return toast(t('ATT_MAX'), 'error');
  if (files.some(x => x.size > 5 * 1024 * 1024)) return toast(t('ATT_SIZE'), 'error');
  if (!confirm(t('SEND_CONFIRM', { kind: t('MK_' + f.kind.value) }))) return;
  const attachments = await Promise.all(files.map(x => new Promise(res => { const r = new FileReader(); r.onload = () => res({ name: x.name, type: x.type, data: String(r.result).split(',')[1] }); r.readAsDataURL(x); })));
  try { await api('/api/staff/messages', { method: 'POST', body: { kind: f.kind.value, title: f.title.value, body: f.body.value, date: f.date.value, attachments } }); f.reset(); toast(t('SENT'), 'ok'); loadMsgs(); } catch (err) { toast(err.message, 'error'); }
};

langButton(() => { if (H) render(); });
load();
