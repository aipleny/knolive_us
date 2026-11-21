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
  $('#status').innerHTML = H.status === 'in' ? `${t('SINCE_IN', { time: kstTime(H.since) })} · <span style="color:var(--in)">${t('ST_IN')}</span>` : H.status === 'break' ? `${t('SINCE_BREAK', { time: kstTime(H.breakSince) })} · <span style="color:var(--brk)">${t('ST_BREAK')}</span>` : `<span style="color:var(--sub)">${t('ST_OFF')}</span>`;
  const acts = H.status === 'off' ? [['in', 'in wide']] : H.status === 'in' ? [['break_start', 'brk'], ['out', 'out']] : [['break_end', 'brk'], ['out', 'out']];
  $('#acts').innerHTML = acts.map(([a, c]) => `<button class="btn ${c}" data-a="${a}">${t('ACT_' + a.toUpperCase())}</button>`).join('');
  $$('#acts [data-a]').forEach(b => b.onclick = () => punch(b.dataset.a, b));
  $('#today-shift').textContent = `${md(H.today.date)} · ${t('TODAY_SHIFT')} ${shiftText(H.today.shift)}`;
  $('#week3').innerHTML = H.shifts.filter(x => x.date > H.today.date).slice(0, 3).map(x => `<li><span>${md(x.date)}</span><span class="${x.shift ? '' : 'muted'}">${esc(shiftText(x.shift))}</span></li>`).join('');
  $('#shifts').innerHTML = H.shifts.map(s => `<li><span>${md(s.date)}${s.date === H.today.date ? ` <span class="pill warn">${t('TODAY')}</span>` : ''}</span><span class="${s.shift ? '' : 'muted'}">${esc(shiftText(s.shift))}</span></li>`).join('');
  const m = H.month;
  $('#pay-title').textContent = t('MONTH_PAY', { from: m.from.slice(5), to: m.to.slice(5) });
  $('#pay').innerHTML = `<div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:baseline;gap:10px"><span class="muted">${H.me.payType === 'monthly' ? t('MY_RATE_MONTHLY', { s: won(H.me.monthlySalary), r: '' }).replace(/ · .*$/, '') : t('MY_RATE_HOURLY', { w: won(H.me.hourlyWage) })} · ${hours(m.workedMin)}</span><b style="font-size:22px">${won(m.net)}</b></div>`;
  for (const id of ['#unread', '#tab-msg-badge']) { $(id).hidden = !H.unread; $(id).textContent = H.unread; }
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

// 내 급여 · 임금명세서 · 근로계약서 · 알림함
async function loadPay(month) {
  const r = await api('/api/staff/pay' + (month ? '?month=' + month : ''));
  $('#pay-rate').textContent = (r.payType === 'monthly' ? t('MY_RATE_MONTHLY', { s: won(r.monthlySalary), r: won(r.ordinaryRate) }) : t('MY_RATE_HOURLY', { w: won(r.hourlyWage) })) + ' · ' + t('PAYDAY_N', { d: r.payDay });
  $('#pay-detail').innerHTML = `${r.estimate ? `<span class="pill warn">${t('ESTIMATE')}</span>` : `<span class="pill in">${t('CONFIRMED')}</span>`}
    <ul class="list">${r.items.map(i => `<li><span>${esc(i.label)}<br><small class="muted">${esc(i.calc)}</small></span><span>${won(i.amount)}</span></li>`).join('')}
    <li><b>${t('GROSS')}</b><b>${won(r.gross)}</b></li>${r.deductions.map(d => `<li><span class="muted">− ${esc(d.label)}</span><span class="muted">${won(d.amount)}</span></li>`).join('')}
    <li><b>${t('NET')}</b><b style="font-size:20px">${won(r.net)}</b></li></ul>${r.payslipId ? `<a class="btn small" target="_blank" href="/api/staff/payslips/${r.payslipId}/html">${t('VIEW_PAYSLIP')}</a>` : `<p class="muted">${t('ESTIMATE_NOTE')}</p>`}`;
}
async function loadDocs() {
  const [months, slips, cts, nt, pf] = await Promise.all([api('/api/staff/pay/months'), api('/api/staff/payslips'), api('/api/staff/contracts'), api('/api/staff/notifications'), api('/api/staff/prefs')]);
  const sel = $('#pay-month'), cur = sel.value; sel.innerHTML = months.months.map(m => `<option>${m}</option>`).join(''); if (cur) sel.value = cur;
  sel.onchange = () => loadPay(sel.value); loadPay(sel.value);
  $('#slip-list').innerHTML = slips.items.map(x => `<li><a target="_blank" href="/api/staff/payslips/${x.id}/html">${x.from.slice(5)} ~ ${x.to.slice(5)}${x.viewedAt ? '' : ` <span class="pill warn">${t('NEW')}</span>`}</a><span>${won(x.net)}</span></li>`).join('') || `<li class="muted">${t('NO_RECORDS')}</li>`;
  $('#ct-list').innerHTML = cts.items.map(x => `<li><a target="_blank" href="/api/staff/contracts/${x.id}/html">${esc(x.title)}</a>${x.receivedAt ? `<span class="pill in">${t('CT_RECEIVED', { at: kstDate(x.receivedAt) })}</span>` : `<button class="btn small primary" data-rcv="${x.id}">${t('CT_RECEIVE_BTN')}</button>`}</li>`).join('') || `<li class="muted">${t('NO_RECORDS')}</li>`;
  $$('[data-rcv]').forEach(b => b.onclick = async () => { if (!confirm(t('CT_RECEIVE_CONFIRM'))) return; await api(`/api/staff/contracts/${b.dataset.rcv}/receive`, { method: 'POST' }); loadDocs(); });
  $('#notif-badge').hidden = !nt.unread; $('#notif-badge').textContent = nt.unread;
  $('#notif-list').innerHTML = nt.items.slice(0, 30).map(n => `<li style="${n.readAt ? 'opacity:.6' : 'font-weight:600'}"><span>${esc(n.title)}<br><small class="muted">${esc(n.body || '')}</small></span><small class="muted">${kstDate(n.createdAt).slice(5)} ${kstTime(n.createdAt)}</small></li>`).join('') || `<li class="muted">${t('NO_RECORDS')}</li>`;
  $('#prefs').innerHTML = `<label class="chk"><input type="checkbox" data-pref="shiftReminder" ${pf.shiftReminder ? 'checked' : ''}> ${t('PREF_SOON')}</label>
    <select data-pref="shiftReminderMin" style="width:auto">${[10, 30, 60].map(m => `<option value="${m}" ${+pf.shiftReminderMin === m ? 'selected' : ''}>${t('MIN_BEFORE', { m })}</option>`).join('')}</select>
    <label class="chk"><input type="checkbox" data-pref="outReminder" ${pf.outReminder ? 'checked' : ''}> ${t('PREF_NOOUT')}</label>
    <label class="chk"><input type="checkbox" data-pref="scheduleChange" ${pf.scheduleChange ? 'checked' : ''}> ${t('PREF_SCHEDULE')}</label>`;
  $$('[data-pref]').forEach(el => el.onchange = () => api('/api/staff/prefs', { method: 'PUT', body: { [el.dataset.pref]: el.type === 'checkbox' ? el.checked : el.value } }).then(() => toast(t('SAVED'), 'ok')));
}
$('#notif-all').onclick = async () => { await api('/api/staff/notifications/read', { method: 'POST', body: { all: true } }); loadDocs(); };
loadDocs().catch(e => toast(e.message, 'error'));

// 아래 탭 이동
function go(pane) {
  $$('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== pane);
  $$('.s-tabs [data-go]').forEach(b => b.classList.toggle('active', b.dataset.go === pane));
  window.scrollTo(0, 0);
  if (pane === 'msg') loadMsgs().then(() => { $('#tab-msg-badge').hidden = true; }).catch(e => toast(e.message, 'error'));
  if (pane === 'pay' || pane === 'notif' || pane === 'more') loadDocs().catch(e => toast(e.message, 'error'));
}
$$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
$('#bell').onclick = () => go('notif');
langButton(() => { if (H) render(); });
load();
