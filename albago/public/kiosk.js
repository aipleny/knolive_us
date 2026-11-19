'use strict';
// 매장 공용 기기(POS·사장님 폰·매장 폰) 출퇴근 기록부
let K = null, sel = null, pin = '';
function tick() {
  const n = nowKst();
  $('#clock').textContent = n.toISOString().slice(11, 19);
  $('#date').textContent = LANG === 'en' ? n.toISOString().slice(0, 10) + ' ' + DOWS()[n.getUTCDay()] : `${n.getUTCFullYear()}년 ${n.getUTCMonth() + 1}월 ${n.getUTCDate()}일 (${DOWS()[n.getUTCDay()]})`;
}
const pill = s => s.status === 'in' ? `<span class="pill in">${t('ST_IN')} · ${kstTime(s.since)}~</span>` : s.status === 'break' ? `<span class="pill" style="background:#efeafd;color:#6b4fd8">${t('ST_BREAK')} · ${kstTime(s.breakSince)}~</span>` : `<span class="pill">${t('ST_OFF')}</span>`;
async function load() {
  try { K = await api('/api/kiosk'); $('#unregistered').hidden = true; $('#main').hidden = false; render(); }
  catch (e) { if (e.code === 'KIOSK_REQUIRED') { $('#unregistered').hidden = false; $('#main').hidden = true; } else toast(e.message, 'error'); }
}
function render() {
  $('#store').textContent = K.store;
  $('#working').textContent = t('WORKING_NOW', { n: K.staff.filter(s => s.status !== 'off').length });
  $('#grid').innerHTML = K.staff.length ? K.staff.map(s => `<button class="staff-btn" data-id="${esc(s.id)}" style="border-left-color:${esc(s.color || '#2459e0')}"><b>${esc(s.name)}</b><span>${pill(s)}</span><span class="muted">${t('TODAY')} ${esc(shiftText(s.shift))}</span></button>`).join('') : `<p class="muted">${t('NO_STAFF')}</p>`;
  $$('.staff-btn').forEach(b => b.onclick = () => open(b.dataset.id));
  $('#week').innerHTML = `<thead><tr><th>${t('NAME')}</th>${K.days.map(d => `<th class="${d === K.today ? 'today' : ''}">${md(d)}</th>`).join('')}</tr></thead><tbody>${K.staff.map(s => `<tr><td><span style="color:${esc(s.color || '#2459e0')}">●</span> ${esc(s.name)}</td>${s.week.map((w, i) => `<td class="${K.days[i] === K.today ? 'today' : ''} ${w ? '' : 'off'}">${w ? esc(w.start + '~' + w.end) + (w.breaks.length ? `<br><small class="muted">${esc(brkText(w.breaks))}</small>` : '') : '—'}</td>`).join('')}</tr>`).join('')}</tbody>`;
}
function open(id) {
  sel = K.staff.find(s => s.id === id); pin = '';
  $('#dlg-name').textContent = sel.name;
  $('#dlg-shift').textContent = t('TODAY_SHIFT') + ': ' + shiftText(sel.shift);
  $('#pin-step').hidden = false; $('#act-step').hidden = true; $('#pin-err').textContent = sel.hasPin ? '' : t('NO_PIN_HELP');
  dots(); $('#dlg').showModal();
}
function dots() { $('#dots').innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<span class="${i < pin.length ? 'on' : ''}"></span>`).join(''); }
function pad() { $('#pad').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'DEL', '0', 'OK'].map(k => `<button type="button" data-k="${k}" ${k.length > 1 ? 'style="font-size:17px"' : ''}>${k === 'DEL' ? t('PIN_DEL') : k === 'OK' ? t('CONFIRM') : k}</button>`).join(''); }
$('#pad').onclick = e => { const k = e.target.dataset && e.target.dataset.k; if (k) press(k); };
document.addEventListener('keydown', e => { if (!$('#dlg').open || $('#pin-step').hidden) return; if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('DEL'); else if (e.key === 'Enter') press('OK'); });
function press(k) { if (k === 'DEL') pin = pin.slice(0, -1); else if (k === 'OK') return check(); else if (pin.length < 6) pin += k; $('#pin-err').textContent = ''; dots(); }
async function check() {
  if (pin.length < 4) return $('#pin-err').textContent = t('PIN_FORMAT');
  try {
    const r = await api('/api/kiosk/punch', { method: 'POST', body: { staffId: sel.id, pin, action: 'check' } });
    $('#pin-step').hidden = true; $('#act-step').hidden = false;
    $('#act-status').innerHTML = pill(r);
    const acts = r.status === 'off' ? [['in', 'in wide']] : r.status === 'in' ? [['break_start', 'brk'], ['out', 'out']] : [['break_end', 'brk'], ['out', 'out']];
    $('#acts').innerHTML = acts.map(([a, cls]) => `<button class="btn ${cls}" data-a="${a}">${t('ACT_' + a.toUpperCase())}</button>`).join('');
    $$('#acts [data-a]').forEach(b => b.onclick = () => doPunch(b.dataset.a));
  } catch (e) { pin = ''; dots(); $('#pin-err').textContent = e.message; }
}
async function doPunch(action) {
  try { const r = await api('/api/kiosk/punch', { method: 'POST', body: { staffId: sel.id, pin, action } }); $('#dlg').close(); toast(r.message, 'ok'); load(); }
  catch (e) { toast(e.message, 'error'); }
}
$('#dlg-close').onclick = () => $('#dlg').close();
$('#dlg').addEventListener('close', () => { pin = ''; sel = null; });
$('#exit').onclick = async () => {
  const pw = prompt(t('KIOSK_EXIT_PW')); if (!pw) return;
  try { await api('/api/kiosk/exit', { method: 'POST', body: { password: pw } }); location.href = '/owner'; } catch (e) { toast(e.message, 'error'); }
};
langButton(() => { pad(); tick(); if (K) render(); });
pad(); tick(); setInterval(tick, 1000); load(); setInterval(() => { if (!$('#dlg').open) load(); }, 60000);
