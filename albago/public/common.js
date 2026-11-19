'use strict';
// 공용 도우미 (언어·API·형식)
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LANG_SAVED = (() => { try { return localStorage.getItem('lang'); } catch { return null; } })();
let LANG = LANG_SAVED || (navigator.language || 'ko').slice(0, 2);
// 기기에 저장한 언어가 없으면 계정 언어를 따름
const adoptLang = l => { if (!LANG_SAVED && l && l !== LANG) setLang(l, false); };
if (LANG !== 'en') LANG = 'ko';
const t = (key, params) => I18N.t(LANG, key, params);
function setLang(l, persist = true) {
  LANG = l === 'en' ? 'en' : 'ko';
  try { localStorage.setItem('lang', LANG); } catch {}
  document.documentElement.lang = LANG;
  applyI18n();
  if (persist) fetch('/api/auth/lang', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Lang': LANG }, body: JSON.stringify({ lang: LANG }) }).catch(() => {});
}
function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  root.querySelectorAll('[data-i18n-html]').forEach(el => el.innerHTML = t(el.dataset.i18nHtml));
  root.querySelectorAll('[data-i18n-ph]').forEach(el => el.placeholder = t(el.dataset.i18nPh));
  $$('.lang-btn').forEach(b => b.textContent = LANG === 'ko' ? 'English' : '한국어');
}
function langButton(onChange) {
  $$('.lang-btn').forEach(b => b.onclick = () => { setLang(LANG === 'ko' ? 'en' : 'ko'); onChange && onChange(); });
}
const KST = 9 * 3600000;
const kstTime = iso => iso ? new Date(Date.parse(iso) + KST).toISOString().slice(11, 16) : '';
const kstDate = iso => iso ? new Date(Date.parse(iso) + KST).toISOString().slice(0, 10) : '';
const nowKst = () => new Date(Date.now() + KST);
const dowOf = d => new Date(d + 'T00:00:00Z').getUTCDay();
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const monthEnd = ym => addDays((+ym.slice(5, 7) === 12 ? `${+ym.slice(0, 4) + 1}-01` : `${ym.slice(0, 4)}-${String(+ym.slice(5, 7) + 1).padStart(2, '0')}`) + '-01', -1);
const weekStartOf = d => addDays(d, dowOf(d) === 0 ? -6 : 1 - dowOf(d));
const DOWS = () => t('DOWS').split(',');
const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}(${DOWS()[dowOf(d)]})`;
const won = n => LANG === 'en' ? '₩' + Math.round(n || 0).toLocaleString('en-US') : Math.round(n || 0).toLocaleString('ko-KR') + '원';
const hours = m => { m = Math.round(m || 0); return t(m % 60 ? 'HOURS' : 'HOURS_H', { h: Math.floor(m / 60), m: m % 60 }); };
const brkText = brs => (brs || []).map(b => `${b.start}~${b.end}`).join(', ');
const shiftText = s => s ? `${s.start}~${s.end}${s.breaks && s.breaks.length ? ` (${t('BREAK')} ${brkText(s.breaks)})` : ''}` : t('OFF_DAY');
async function api(url, opts = {}) {
  const r = await fetch(url, { method: opts.method || 'GET', headers: { 'X-Lang': LANG, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: 'same-origin' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.message || t('SERVER_ERROR')); e.code = data.code; e.status = r.status; e.data = data; throw e; }
  return data;
}
function toast(msg, kind = '') {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.className = 'toast show ' + kind; el.textContent = msg;
  clearTimeout(toast.h); toast.h = setTimeout(() => el.className = 'toast', 3800);
}
document.addEventListener('DOMContentLoaded', () => { document.documentElement.lang = LANG; applyI18n(); });
