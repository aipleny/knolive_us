'use strict';
// 공용 도우미
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const won = n => (Math.round(n || 0)).toLocaleString('ko-KR') + '원';
const hours = m => { m = Math.round(m || 0); const h = Math.floor(m / 60), r = m % 60; return r ? `${h}시간 ${r}분` : `${h}시간`; };
const KST = 9 * 3600000;
const kstTime = iso => iso ? new Date(Date.parse(iso) + KST).toISOString().slice(11, 16) : '';
const kstDate = iso => iso ? new Date(Date.parse(iso) + KST).toISOString().slice(0, 10) : '';
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const dowOf = d => new Date(d + 'T00:00:00Z').getUTCDay();
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}(${DOW[dowOf(d)]})`;
const shiftText = s => s ? `${s.start}~${s.end}${s.brk ? ` (휴게 ${s.brk}분)` : ''}` : '휴무';
async function api(url, opts = {}) {
  const r = await fetch(url, { method: opts.method || 'GET', headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: 'same-origin' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || '요청에 실패했습니다.'); e.data = data; e.status = r.status; throw e; }
  return data;
}
function toast(msg, kind = '') {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.className = 'toast show ' + kind; t.textContent = msg;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = 'toast', 3500);
}
function nowKst() { return new Date(Date.now() + KST); }
