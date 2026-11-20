'use strict';
// 알바고 서버 — Node.js 22.13 이상 (내장 node:sqlite 사용), 외부 패키지 없음.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const C = require('./lib/calc');
const INS = require('./lib/insurance');
const XLSX = require('./lib/xlsx');
const SV = require('./lib/services');
const { t } = require('./public/i18n');

const PORT = +process.env.PORT || 8080;
const DATA = process.env.ALBAGO_DATA || path.join(__dirname, 'data');
const PUBLIC = path.join(__dirname, 'public');
const SECURE = process.env.ALBAGO_SECURE_COOKIE === '1';
const TRUST_PROXY = process.env.ALBAGO_TRUST_PROXY === '1';
fs.mkdirSync(DATA, { recursive: true });

// ── 비밀키 (토큰 서명·개인정보 암호화) ──
const KEY_FILE = path.join(DATA, 'secret.key');
if (!process.env.ALBAGO_KEY && !fs.existsSync(KEY_FILE)) fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const MASTER = Buffer.from(process.env.ALBAGO_KEY || fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
const derive = label => crypto.createHmac('sha256', MASTER).update(label).digest();
const ENC_KEY = derive('enc'), SIGN_KEY = derive('sign'), CODE_KEY = derive('code');
function enc(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}
function dec(blob) {
  if (!blob) return '';
  try { const [, iv, tag, ct] = blob.split(':'); const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64')); return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8'); }
  catch { return ''; }
}
const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(String(pw), salt, 32).toString('hex') });
const checkPw = (pw, salt, hash) => !!(salt && hash) && crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(String(pw), salt, 32));
const codeHash = code => crypto.createHmac('sha256', CODE_KEY).update(String(code)).digest('hex');
const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const uid = () => crypto.randomBytes(9).toString('base64url');
function sign(p) { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return b + '.' + crypto.createHmac('sha256', SIGN_KEY).update(b).digest('base64url'); }
function verify(tok) {
  if (!tok || typeof tok !== 'string' || !tok.includes('.')) return null;
  const [b, s] = tok.split('.'), g = crypto.createHmac('sha256', SIGN_KEY).update(b).digest('base64url');
  if (!s || s.length !== g.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(g))) return null;
  try { const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}

// ── DB ──
const db = new DatabaseSync(path.join(DATA, 'albago.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS stores(id TEXT PRIMARY KEY, biz_no TEXT UNIQUE NOT NULL, name TEXT, owner_name TEXT, address TEXT, phone TEXT, industry TEXT, lat REAL, lng REAL, settings TEXT NOT NULL DEFAULT '{}', created_at TEXT);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), role TEXT NOT NULL, login_id TEXT NOT NULL, pw_salt TEXT, pw_hash TEXT, email TEXT, phone TEXT, lang TEXT DEFAULT 'ko', sess_ver TEXT, created_at TEXT, UNIQUE(store_id, login_id));
CREATE TABLE IF NOT EXISTS staff(id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), status TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, login_id TEXT, pw_salt TEXT, pw_hash TEXT, pin_salt TEXT, pin_hash TEXT, lang TEXT DEFAULT 'ko', sess_ver TEXT, data TEXT NOT NULL DEFAULT '{}', created_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS staff_login ON staff(store_id, login_id) WHERE login_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS shifts(id TEXT PRIMARY KEY, store_id TEXT NOT NULL, staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE, date TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, breaks TEXT NOT NULL DEFAULT '[]', UNIQUE(staff_id, date));
CREATE INDEX IF NOT EXISTS shifts_store_date ON shifts(store_id, date);
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, store_id TEXT NOT NULL, staff_id TEXT NOT NULL REFERENCES staff(id), date TEXT NOT NULL, in_at TEXT NOT NULL, out_at TEXT, breaks TEXT NOT NULL DEFAULT '[]', brk INTEGER, note TEXT, edited INTEGER DEFAULT 0, history TEXT DEFAULT '[]', src_in TEXT, src_out TEXT, exit_at TEXT);
CREATE INDEX IF NOT EXISTS records_store_date ON records(store_id, date);
CREATE INDEX IF NOT EXISTS records_staff ON records(staff_id, in_at);
CREATE TABLE IF NOT EXISTS contracts(id TEXT PRIMARY KEY, store_id TEXT NOT NULL, staff_id TEXT NOT NULL, type TEXT, title TEXT, fields TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS codes(id TEXT PRIMARY KEY, kind TEXT NOT NULL, target TEXT NOT NULL, code_hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER DEFAULT 0, used INTEGER DEFAULT 0, meta TEXT, created_at INTEGER);
CREATE INDEX IF NOT EXISTS codes_target ON codes(target, created_at);
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, store_id TEXT NOT NULL, staff_id TEXT, sender TEXT NOT NULL, sender_name TEXT, kind TEXT NOT NULL, title TEXT, body TEXT NOT NULL, date TEXT, requires_ack INTEGER DEFAULT 0, created_at TEXT NOT NULL, owner_read_at TEXT, ip TEXT, prev_hash TEXT, hash TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS messages_store ON messages(store_id, created_at);
CREATE TABLE IF NOT EXISTS msg_receipts(message_id TEXT NOT NULL, staff_id TEXT NOT NULL, read_at TEXT, ack_at TEXT, ack_ip TEXT, PRIMARY KEY(message_id, staff_id));
CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY, message_id TEXT NOT NULL, store_id TEXT NOT NULL, name TEXT, type TEXT, size INTEGER, sha256 TEXT, data BLOB);
CREATE TABLE IF NOT EXISTS push_tokens(token TEXT PRIMARY KEY, staff_id TEXT NOT NULL, updated_at TEXT);
CREATE TABLE IF NOT EXISTS payslips(id TEXT PRIMARY KEY, store_id TEXT NOT NULL, staff_id TEXT NOT NULL, period_from TEXT NOT NULL, period_to TEXT NOT NULL, pay_date TEXT, data TEXT NOT NULL, gross INTEGER, net INTEGER, issued_at TEXT NOT NULL, viewed_at TEXT, superseded_at TEXT);
CREATE INDEX IF NOT EXISTS payslips_staff ON payslips(staff_id, period_from);
CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY, store_id TEXT NOT NULL, staff_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT, body TEXT, data TEXT, created_at TEXT NOT NULL, read_at TEXT);
CREATE INDEX IF NOT EXISTS notifications_staff ON notifications(staff_id, created_at);
CREATE TABLE IF NOT EXISTS notif_sent(key TEXT PRIMARY KEY, at TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT, at TEXT, who TEXT, what TEXT);`);
for (const col of ['shared_at', 'received_at', 'viewed_at']) { try { db.exec(`ALTER TABLE contracts ADD COLUMN ${col} TEXT`); } catch {} }
const q = (sql, ...a) => db.prepare(sql).all(...a);
const q1 = (sql, ...a) => db.prepare(sql).get(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);
const tx = fn => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const nowIso = () => new Date().toISOString();
const audit = (storeId, who, what) => run('INSERT INTO audit(store_id,at,who,what) VALUES(?,?,?,?)', storeId, nowIso(), who, what);

const DEFAULT_SETTINGS = {
  fivePlus: false, rounding: 1, breakAuto: true, earlyFromSchedule: false, payDay: 10, payMethod: 'account',
  minWages: { 2026: 10320, 2027: 10700 }, rates: { ...INS.DEFAULT_RATES }, durunuri: false,
  geo: { auto: true, requireLocation: false, radius: 100, earlyMin: 30, lateOutMin: 10, exitGraceMin: 15 },
  premiums: {}, publicHolidays: [],
  kioskVer: '',
};
function storeSettings(store) {
  const s = JSON.parse(store.settings || '{}');
  return { ...DEFAULT_SETTINGS, ...s, rates: { ...DEFAULT_SETTINGS.rates, ...(s.rates || {}) }, geo: { ...DEFAULT_SETTINGS.geo, ...(s.geo || {}) }, minWages: { ...DEFAULT_SETTINGS.minWages, ...(s.minWages || {}) } };
}
const saveSettings = (storeId, s) => run('UPDATE stores SET settings=? WHERE id=?', JSON.stringify(s), storeId);
function staffObj(row) {
  if (!row) return null;
  const d = JSON.parse(row.data || '{}');
  return { ...d, id: row.id, storeId: row.store_id, status: row.status, name: row.name, phone: row.phone, loginId: row.login_id, lang: row.lang, hasPin: !!row.pin_hash, hasLogin: !!row.pw_hash, sessVer: row.sess_ver, createdAt: row.created_at };
}
const getStaff = (storeId, id) => staffObj(q1('SELECT * FROM staff WHERE id=? AND store_id=?', id, storeId));
const parseRec = r => r && ({ id: r.id, staffId: r.staff_id, date: r.date, in: r.in_at, out: r.out_at, breaks: JSON.parse(r.breaks || '[]'), brk: r.brk, note: r.note, edited: !!r.edited, srcIn: r.src_in, srcOut: r.src_out, exitAt: r.exit_at, history: JSON.parse(r.history || '[]') });
const parseShift = r => r && { start: r.start, end: r.end, breaks: JSON.parse(r.breaks || '[]') };
const shiftOfFn = (staffId, from, to) => { const m = new Map(q('SELECT * FROM shifts WHERE staff_id=? AND date BETWEEN ? AND ?', staffId, from, to).map(r => [r.date, parseShift(r)])); return d => m.get(d) || null; };
const shiftOn = (staffId, date) => parseShift(q1('SELECT * FROM shifts WHERE staff_id=? AND date=?', staffId, date));

// ── 쿠키·토큰·요청 ──
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
function setCookie(res, name, val, maxAge) {
  const c = [`${name}=${encodeURIComponent(val)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]; if (SECURE) c.push('Secure');
  res.setHeader('Set-Cookie', [...(res.getHeader('Set-Cookie') || []), c.join('; ')]);
}
const clientIp = req => (TRUST_PROXY && req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress || '').replace(/^::ffff:/, '');
function session(req) {
  const h = req.headers.authorization || '';
  const p = verify(h.startsWith('Bearer ') ? h.slice(7) : cookies(req).ag_s);
  if (!p) return null;
  if (p.typ === 'owner') {
    const u = q1('SELECT * FROM users WHERE id=?', p.uid);
    return u && u.sess_ver === p.v ? { role: 'owner', user: u, storeId: u.store_id, lang: u.lang } : null;
  }
  if (p.typ === 'staff') {
    const s = q1('SELECT * FROM staff WHERE id=?', p.uid);
    return s && s.status === 'active' && s.sess_ver === p.v ? { role: 'staff', staff: staffObj(s), storeId: s.store_id, lang: s.lang } : null;
  }
  return null;
}
function kioskOf(req) {
  const p = verify(cookies(req).ag_k);
  if (!p || p.typ !== 'kiosk') return null;
  const st = q1('SELECT * FROM stores WHERE id=?', p.sid);
  return st && storeSettings(st).kioskVer === p.v ? { storeId: st.id, store: st } : null;
}

// ── 시도 제한 ──
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), h = (hits.get(key) || []).filter(x => now - x < windowMs);
  if (h.length >= max) { hits.set(key, h); return Math.ceil((windowMs - (now - h[0])) / 60000); }
  h.push(now); hits.set(key, h); return 0;
}
const clearHits = key => hits.delete(key);
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(x => now - x < 3600000)) hits.delete(k); }, 600000).unref();

// ── 오류 ──
class AppError extends Error { constructor(status, code, params) { super(code); this.status = status; this.code = code; this.params = params; } }
const fail = (status, code, params) => { throw new AppError(status, code, params); };
const clean = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const isTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '');
const digits = s => String(s || '').replace(/\D/g, '');
const cleanBreaks = arr => (Array.isArray(arr) ? arr : []).filter(b => b && isTime(b.start) && isTime(b.end) && b.start !== b.end).slice(0, 4).map(b => ({ start: b.start, end: b.end }));
const maskEmail = e => String(e).replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(5, b.length)) + c);

// ── 인증번호 ──
async function sendCode(kind, target, lang, meta) {
  const recent = q1('SELECT created_at FROM codes WHERE target=? AND kind=? ORDER BY created_at DESC LIMIT 1', target, kind);
  if (recent && Date.now() - recent.created_at < 60000) fail(429, 'CODE_WAIT');
  const day = q1('SELECT count(*) n FROM codes WHERE target=? AND created_at>?', target, Date.now() - 86400000).n;
  if (day >= 10) fail(429, 'CODE_DAILY');
  const code = newCode(), id = uid();
  run('INSERT INTO codes(id,kind,target,code_hash,expires,meta,created_at) VALUES(?,?,?,?,?,?,?)', id, kind, target, codeHash(code), Date.now() + (kind === 'login' ? 10 : 5) * 60000, JSON.stringify(meta || {}), Date.now());
  const text = t(lang, 'MSG_CODE', { code });
  let r;
  if (kind === 'sms') r = await SV.sendSms(target, text);
  else r = await SV.sendEmail(kind === 'login' || kind === 'reset' ? meta.email : target, t(lang, kind === 'login' ? 'MAIL_LOGIN_SUBJECT' : kind === 'reset' ? 'MAIL_RESET_SUBJECT' : 'MAIL_VERIFY_SUBJECT'), text + '\n\n' + t(lang, 'MAIL_FOOTER'));
  return { id, devCode: r.dev && SV.DEV ? code : undefined };
}
function checkCode(id, kind, code) {
  const c = q1('SELECT * FROM codes WHERE id=? AND kind=?', id, kind);
  if (!c || c.used || c.expires < Date.now()) fail(400, 'CODE_EXPIRED');
  if (c.attempts >= 5) fail(429, 'CODE_TOO_MANY');
  if (!crypto.timingSafeEqual(Buffer.from(codeHash(digits(code))), Buffer.from(c.code_hash))) { run('UPDATE codes SET attempts=attempts+1 WHERE id=?', id); fail(400, 'CODE_WRONG'); }
  run('UPDATE codes SET used=1 WHERE id=?', id);
  return { target: c.target, meta: JSON.parse(c.meta || '{}') };
}

// ── 출퇴근 핵심 ──
function openRecord(staffId) {
  const r = parseRec(q1('SELECT * FROM records WHERE staff_id=? AND out_at IS NULL ORDER BY in_at DESC LIMIT 1', staffId));
  return r && Date.now() - Date.parse(r.in) < 20 * 3600000 ? r : null;
}
function statusOf(staffId) {
  const o = openRecord(staffId);
  if (!o) return { status: 'off' };
  const b = o.breaks.find(x => !x.end);
  return { status: b ? 'break' : 'in', since: o.in, breakSince: b ? b.start : null, exitPending: o.exitAt || null, recordId: o.id };
}
const hhmm = iso => new Date(Date.parse(iso) + C.KST).toISOString().slice(11, 16);
function punch(storeId, staff, action, src, at = nowIso()) {
  const o = openRecord(staff.id), lang = staff.lang, settings = storeSettings(q1('SELECT settings FROM stores WHERE id=?', storeId));
  if (action === 'in') {
    if (o) fail(409, 'ALREADY_IN');
    const date = C.kstDateOf(at);
    run('INSERT INTO records(id,store_id,staff_id,date,in_at,src_in) VALUES(?,?,?,?,?,?)', uid(), storeId, staff.id, date, at, src);
    audit(storeId, staff.name, `IN ${src}`);
    return { ok: true, action, at, message: t(lang, 'MSG_IN', { name: staff.name, time: hhmm(at) }) };
  }
  if (!o) fail(409, 'NOT_IN');
  const breaks = o.breaks, openB = breaks.find(b => !b.end);
  if (action === 'break_start') {
    if (openB) fail(409, 'ALREADY_BREAK');
    breaks.push({ start: at }); run('UPDATE records SET breaks=? WHERE id=?', JSON.stringify(breaks), o.id);
    return { ok: true, action, at, message: t(lang, 'MSG_BREAK_START', { time: hhmm(at) }) };
  }
  if (action === 'break_end') {
    if (!openB) fail(409, 'NOT_BREAK');
    openB.end = at; run('UPDATE records SET breaks=? WHERE id=?', JSON.stringify(breaks), o.id);
    return { ok: true, action, at, message: t(lang, 'MSG_BREAK_END', { time: hhmm(at) }) };
  }
  if (action === 'out') {
    if (openB) openB.end = at;
    run('UPDATE records SET out_at=?, breaks=?, src_out=?, exit_at=NULL WHERE id=?', at, JSON.stringify(breaks), src, o.id);
    const m = C.recordMinutes({ ...o, out: at, breaks }, shiftOn(staff.id, o.date), settings);
    audit(storeId, staff.name, `OUT ${src}`);
    return { ok: true, action, at, workedMin: m.worked, message: t(lang, 'MSG_OUT', { name: staff.name, time: hhmm(at), hours: t(lang, 'HOURS', { h: Math.floor(m.worked / 60), m: m.worked % 60 }) }) };
  }
  fail(400, 'BAD_REQUEST');
}
function locationCheck(store, settings, body, required) {
  if (!required) return;
  if (store.lat == null || store.lng == null) return;
  if (body.lat == null || body.lng == null) fail(403, 'NEED_LOCATION');
  const d = SV.distanceM({ lat: store.lat, lng: store.lng }, { lat: +body.lat, lng: +body.lng });
  const slack = Math.min(100, Math.max(0, +body.accuracy || 0));
  if (d > settings.geo.radius + slack) fail(403, 'OUT_OF_RANGE', { m: Math.round(d) });
}
// 지오펜스 이벤트 처리
function geoEvent(store, staff, ev, at) {
  const s = storeSettings(store), g = s.geo, lang = staff.lang;
  const res = (action, message, notify = true) => ({ action, message, notify, at });
  if (!g.auto) return res('none', '', false);
  const o = openRecord(staff.id);
  const date = C.kstDateOf(at), now = Date.parse(at);
  // 자정 넘는 근무를 위해 어제 근무도 확인
  const cand = [date, C.addDays(date, -1)].map(d => ({ d, sh: shiftOn(staff.id, d) })).filter(x => x.sh).map(x => ({ ...x, sp: C.shiftSpan(x.d, x.sh) }));
  const cur = cand.find(x => now >= x.sp.s - g.earlyMin * 60000 && now < x.sp.e);
  if (ev === 'enter') {
    if (o && o.exitAt) { run('UPDATE records SET exit_at=NULL WHERE id=?', o.id); return res('returned', t(lang, 'GEO_RETURNED'), false); }
    if (o) return res('none', '', false);
    if (!cur) return res('none', t(lang, cand.length || shiftOn(staff.id, date) ? 'GEO_NOT_TIME' : 'GEO_NO_SHIFT'));
    const r = punch(store.id, staff, 'in', 'geo', at);
    return res('in', t(lang, 'GEO_IN', { time: hhmm(at) }));
  }
  if (ev === 'exit') {
    if (!o) return res('none', '', false);
    const sh = shiftOn(staff.id, o.date), sp = sh ? C.shiftSpan(o.date, sh) : null;
    if (!sp || now >= sp.e - g.lateOutMin * 60000) { punch(store.id, staff, 'out', 'geo', at); return res('out', t(lang, 'GEO_OUT', { time: hhmm(at) })); }
    run('UPDATE records SET exit_at=? WHERE id=?', at, o.id);
    return res('exit_pending', t(lang, 'GEO_EXIT_PENDING', { min: g.exitGraceMin }));
  }
  fail(400, 'BAD_REQUEST');
}
// 매장을 벗어난 뒤 돌아오지 않으면 나간 시각으로 퇴근 처리 (1분마다)
function sweep() {
  for (const r of q('SELECT r.*, s.settings FROM records r JOIN stores s ON s.id=r.store_id WHERE r.out_at IS NULL AND r.exit_at IS NOT NULL')) {
    const g = storeSettings(r).geo;
    if (Date.parse(r.exit_at) + g.exitGraceMin * 60000 < Date.now()) {
      const st = staffObj(q1('SELECT * FROM staff WHERE id=?', r.staff_id));
      try { punch(r.store_id, st, 'out', 'geo-timeout', r.exit_at); } catch (e) { console.error('sweep', e.message); }
    }
  }
}
setInterval(() => { sweep(); try { reminders(); } catch (e) { console.error('reminders', e.message); } }, 60000).unref();

// ── 급여 ──
function payFor(store, staff, from, to) {
  const s = storeSettings(store);
  const lo = C.addDays(from, -7), hi = C.addDays(to, 7);
  const recs = q('SELECT * FROM records WHERE staff_id=? AND date BETWEEN ? AND ?', staff.id, lo, hi).map(parseRec);
  const shiftOf = shiftOfFn(staff.id, lo, hi);
  const p = C.payroll({ staff, records: recs, shiftOf, settings: s, from, to });
  const monthly = /-01$/.test(from) && to === C.monthEnd(from.slice(0, 7));
  const monthHours = (p.scheduledMin || p.workedMin) / 60;
  const d = INS.deductions(staff, p, { monthly, monthHours, date: to, rates: s.rates, durunuri: s.durunuri });
  return { ...p, monthly, monthHours, deductions: d.list, deductionTotal: d.total, insurance: d.insurance, employerCost: d.employerCost, net: p.gross - d.total, totalCost: p.gross + d.employerCost, deduction: staff.deduction || 'none', birth: staff.birth, position: staff.position, startDate: staff.startDate, bank: staff.bank, accountMasked: dec(staff.accountEnc).replace(/\d(?=\d{4})/g, '*') };
}

// ── 응답 도우미 ──
function send(res, code, obj, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}
function readBody(req, max = 2e6) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > max) { reject(new AppError(413, 'BAD_REQUEST')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { reject(new AppError(400, 'BAD_REQUEST')); } });
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const PAGES = { '/': 'index.html', '/login': 'login.html', '/signup': 'signup.html', '/owner': 'owner.html', '/kiosk': 'kiosk.html', '/staff': 'staff.html', '/join': 'join.html' };
function serveStatic(req, res, p) {
  const file = path.normalize(path.join(PUBLIC, PAGES[p] || p));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': path.extname(file) === '.woff2' ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
  fs.createReadStream(file).pipe(res);
}
const routes = [];
const route = (method, pattern, auth, fn, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), auth, fn, ...opts });
const issueOwner = (res, u, client) => { const tok = sign({ typ: 'owner', uid: u.id, v: u.sess_ver, exp: Date.now() + (client === 'app' ? 30 : 0.5) * 86400000 }); if (client !== 'app') setCookie(res, 'ag_s', tok, 12 * 3600); return tok; };
const issueStaff = (res, s, client) => { const days = client === 'app' ? 365 : 30; const tok = sign({ typ: 'staff', uid: s.id, v: s.sess_ver, exp: Date.now() + days * 86400000 }); if (client !== 'app') setCookie(res, 'ag_s', tok, days * 86400); return tok; };

// ════════ 인증 ════════
route('POST', '/api/auth/biz-check', null, async (c) => {
  const no = digits(c.body.bizNo);
  if (!SV.bizNoValid(no)) fail(400, 'BIZ_INVALID');
  if (q1('SELECT 1 FROM stores WHERE biz_no=?', no)) fail(409, 'BIZ_TAKEN');
  let st = { checked: false };
  try { st = await SV.bizStatus(no); } catch (e) { console.error(e.message); }
  if (st.checked && !st.active) fail(400, st.code ? 'BIZ_CLOSED' : 'BIZ_UNREGISTERED', { status: st.status });
  return { ok: true, formatted: SV.formatBizNo(no), ntsChecked: st.checked };
});
route('POST', '/api/auth/verify/send', null, async (c) => {
  const kind = c.body.kind === 'sms' ? 'sms' : 'email';
  const target = kind === 'sms' ? digits(c.body.target) : clean(c.body.target, 120).toLowerCase();
  if (kind === 'sms' && !/^01\d{8,9}$/.test(target)) fail(400, 'PHONE_INVALID');
  if (kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) fail(400, 'EMAIL_INVALID');
  const w = limited('send:' + c.ip, 20, 3600000); if (w) fail(429, 'TOO_MANY', { min: w });
  const r = await sendCode(kind, target, c.lang);
  return { ok: true, id: r.id, devCode: r.devCode };
});
route('POST', '/api/auth/verify/check', null, (c) => {
  const kind = c.body.kind === 'sms' ? 'sms' : 'email';
  const { target } = checkCode(c.body.id, kind, c.body.code);
  return { ok: true, ticket: sign({ typ: 'ticket', kind, target, exp: Date.now() + 30 * 60000 }) };
});
route('POST', '/api/auth/signup', null, async (c) => {
  const b = c.body, no = digits(b.bizNo);
  if (!SV.bizNoValid(no)) fail(400, 'BIZ_INVALID');
  if (q1('SELECT 1 FROM stores WHERE biz_no=?', no)) fail(409, 'BIZ_TAKEN');
  try { const st = await SV.bizStatus(no); if (st.checked && !st.active) fail(400, 'BIZ_CLOSED', { status: st.status }); } catch (e) { if (e instanceof AppError) throw e; }
  const pt = verify(b.phoneTicket), et = verify(b.emailTicket);
  if (!pt || pt.typ !== 'ticket' || pt.kind !== 'sms' || pt.target !== digits(b.phone)) fail(400, 'PHONE_NOT_VERIFIED');
  if (!et || et.typ !== 'ticket' || et.kind !== 'email' || et.target !== clean(b.email, 120).toLowerCase()) fail(400, 'EMAIL_NOT_VERIFIED');
  const loginId = clean(b.loginId, 40);
  if (!/^[a-zA-Z0-9._-]{4,40}$/.test(loginId)) fail(400, 'ID_INVALID');
  if (String(b.password || '').length < 8 || !/[a-zA-Z]/.test(b.password) || !/\d/.test(b.password)) fail(400, 'PW_WEAK');
  if (!clean(b.storeName)) fail(400, 'REQUIRED', { field: 'storeName' });
  const storeId = uid(), userId = uid(), h = hashPw(b.password), lang = b.lang === 'en' ? 'en' : 'ko';
  tx(() => {
    run('INSERT INTO stores(id,biz_no,name,owner_name,address,phone,industry,settings,created_at) VALUES(?,?,?,?,?,?,?,?,?)', storeId, no, clean(b.storeName), clean(b.ownerName), clean(b.address), clean(b.storePhone || b.phone), clean(b.industry), JSON.stringify({}), nowIso());
    run('INSERT INTO users(id,store_id,role,login_id,pw_salt,pw_hash,email,phone,lang,sess_ver,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', userId, storeId, 'owner', loginId, h.salt, h.hash, et.target, pt.target, lang, uid(), nowIso());
  });
  audit(storeId, loginId, 'SIGNUP');
  if (b.address) { try { const g = await SV.geocode(b.address); if (g) run('UPDATE stores SET lat=?, lng=? WHERE id=?', g.lat, g.lng, storeId); } catch (e) { console.error(e.message); } }
  return { ok: true, storeCode: no };
});
route('POST', '/api/auth/login', null, async (c) => {
  const b = c.body, no = digits(b.storeCode), loginId = clean(b.loginId, 40);
  const key = 'login:' + no + ':' + loginId.toLowerCase();
  const w = limited(key, 8, 15 * 60000) || limited('loginip:' + c.ip, 40, 15 * 60000); if (w) fail(429, 'TOO_MANY', { min: w });
  const store = q1('SELECT * FROM stores WHERE biz_no=?', no);
  if (!store) fail(401, 'LOGIN_FAIL');
  const u = q1('SELECT * FROM users WHERE store_id=? AND login_id=?', store.id, loginId);
  if (u && checkPw(b.password, u.pw_salt, u.pw_hash)) {
    clearHits(key);
    const trust = verify(cookies(c.req).ag_t);
    if (trust && trust.typ === 'trust' && trust.uid === u.id && trust.v === u.sess_ver) { const tok = issueOwner(c.res, u, b.client); return { ok: true, role: 'owner', token: b.client === 'app' ? tok : undefined }; }
    // 1분 안에 이미 보낸 인증번호가 있으면 그 번호를 그대로 쓰게 함
    const recent = q1('SELECT id FROM codes WHERE kind=? AND target=? AND used=0 AND expires>? AND created_at>? ORDER BY created_at DESC LIMIT 1', 'login', u.id, Date.now(), Date.now() - 60000);
    if (recent) return { otp: true, otpId: recent.id, emailMasked: maskEmail(u.email), reused: true };
    const r = await sendCode('login', u.id, u.lang, { email: u.email });
    return { otp: true, otpId: r.id, emailMasked: maskEmail(u.email), devCode: r.devCode };
  }
  const s = q1('SELECT * FROM staff WHERE store_id=? AND login_id=?', store.id, loginId);
  if (s && checkPw(b.password, s.pw_salt, s.pw_hash)) {
    clearHits(key);
    if (s.status === 'pending') fail(403, 'STAFF_PENDING');
    if (s.status !== 'active') fail(403, 'STAFF_INACTIVE');
    const tok = issueStaff(c.res, s, b.client);
    return { ok: true, role: 'staff', token: b.client === 'app' ? tok : undefined };
  }
  fail(401, 'LOGIN_FAIL');
});
route('POST', '/api/auth/otp', null, (c) => {
  const { target } = checkCode(c.body.otpId, 'login', c.body.code);
  const u = q1('SELECT * FROM users WHERE id=?', target);
  if (!u) fail(401, 'LOGIN_FAIL');
  if (c.body.remember) setCookie(c.res, 'ag_t', sign({ typ: 'trust', uid: u.id, v: u.sess_ver, exp: Date.now() + 30 * 86400000 }), 30 * 86400);
  const tok = issueOwner(c.res, u, c.body.client);
  audit(u.store_id, u.login_id, 'LOGIN');
  return { ok: true, role: 'owner', token: c.body.client === 'app' ? tok : undefined };
});
route('POST', '/api/auth/reset/send', null, async (c) => {
  const store = q1('SELECT * FROM stores WHERE biz_no=?', digits(c.body.storeCode));
  const u = store && q1('SELECT * FROM users WHERE store_id=? AND login_id=?', store.id, clean(c.body.loginId, 40));
  const w = limited('reset:' + c.ip, 10, 3600000); if (w) fail(429, 'TOO_MANY', { min: w });
  if (!u) return { ok: true, id: uid() }; // 존재 여부를 드러내지 않음
  const r = await sendCode('reset', u.id, u.lang, { email: u.email });
  return { ok: true, id: r.id, emailMasked: maskEmail(u.email), devCode: r.devCode };
});
route('POST', '/api/auth/reset', null, (c) => {
  const { target } = checkCode(c.body.id, 'reset', c.body.code);
  const pw = String(c.body.password || '');
  if (pw.length < 8 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) fail(400, 'PW_WEAK');
  const h = hashPw(pw);
  run('UPDATE users SET pw_salt=?, pw_hash=?, sess_ver=? WHERE id=?', h.salt, h.hash, uid(), target);
  return { ok: true };
});
route('POST', '/api/auth/staff-signup', null, (c) => {
  const b = c.body, store = q1('SELECT * FROM stores WHERE biz_no=?', digits(b.storeCode));
  if (!store) fail(404, 'STORE_NOT_FOUND');
  const w = limited('ssign:' + c.ip, 10, 3600000); if (w) fail(429, 'TOO_MANY', { min: w });
  const loginId = clean(b.loginId, 40);
  if (!/^[a-zA-Z0-9._-]{4,40}$/.test(loginId)) fail(400, 'ID_INVALID');
  if (String(b.password || '').length < 8) fail(400, 'PW_WEAK');
  if (!clean(b.name)) fail(400, 'REQUIRED', { field: 'name' });
  if (q1('SELECT 1 FROM staff WHERE store_id=? AND login_id=?', store.id, loginId) || q1('SELECT 1 FROM users WHERE store_id=? AND login_id=?', store.id, loginId)) fail(409, 'ID_TAKEN');
  const h = hashPw(b.password);
  run('INSERT INTO staff(id,store_id,status,name,phone,login_id,pw_salt,pw_hash,lang,sess_ver,data,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', uid(), store.id, 'pending', clean(b.name, 60), digits(b.phone), loginId, h.salt, h.hash, b.lang === 'en' ? 'en' : 'ko', uid(), JSON.stringify({ nationality: b.lang === 'en' ? 'FOREIGN' : 'KR' }), nowIso());
  audit(store.id, loginId, 'STAFF_SIGNUP');
  return { ok: true, pending: true, message: t(c.lang, 'MSG_PENDING', { store: store.name }) };
});
route('POST', '/api/auth/logout', null, (c) => { setCookie(c.res, 'ag_s', '', 0); return { ok: true }; });
route('GET', '/api/auth/me', null, (c) => {
  const s = session(c.req), k = kioskOf(c.req);
  if (!s) return { role: null, kiosk: !!k };
  const st = q1('SELECT id,biz_no,name FROM stores WHERE id=?', s.storeId);
  return { role: s.role, lang: s.lang, kiosk: !!k, store: { name: st.name, code: st.biz_no }, name: s.role === 'owner' ? s.user.login_id : s.staff.name };
});
route('PUT', '/api/auth/lang', 'any', (c) => {
  const lang = c.body.lang === 'en' ? 'en' : 'ko';
  if (c.s.role === 'owner') run('UPDATE users SET lang=? WHERE id=?', lang, c.s.user.id); else run('UPDATE staff SET lang=? WHERE id=?', lang, c.s.staff.id);
  return { ok: true };
});

// ════════ 직원(알바) ════════
function staffHome(s) {
  const store = q1('SELECT * FROM stores WHERE id=?', s.storeId), set = storeSettings(store), me = s.staff;
  const today = C.todayKst(), from = today.slice(0, 7) + '-01', to = C.monthEnd(today.slice(0, 7));
  const pay = payFor(store, me, from, to);
  const shiftOf = shiftOfFn(me.id, C.addDays(today, -1), C.addDays(today, 31));
  return {
    store: { name: store.name, lat: store.lat, lng: store.lng, radius: set.geo.radius, autoGeo: set.geo.auto, requireLocation: set.geo.requireLocation },
    me: { id: me.id, name: me.name, lang: me.lang, hasPin: me.hasPin, payType: me.payType === 'monthly' ? 'monthly' : 'hourly', hourlyWage: +me.hourlyWage || 0, monthlySalary: +me.monthlySalary || 0 }, ...statusOf(me.id),
    today: { date: today, shift: shiftOf(today) },
    shifts: C.datesBetween(today, C.addDays(today, 13)).map(d => ({ date: d, shift: shiftOf(d) })),
    month: { from, to, workedMin: pay.workedMin, base: pay.base, holidayPay: pay.holidayPay, overtimePay: pay.overtimePay, nightPay: pay.nightPay, gross: pay.gross, deductionTotal: pay.deductionTotal, net: pay.net },
    unread: unreadForStaff(me), notifUnread: q1('SELECT count(*) n FROM notifications WHERE staff_id=? AND read_at IS NULL', me.id).n,
    records: q('SELECT * FROM records WHERE staff_id=? AND date BETWEEN ? AND ? ORDER BY in_at DESC', me.id, from, to).map(parseRec).map(r => ({ date: r.date, in: r.in, out: r.out, breaks: r.breaks })),
  };
}
route('GET', '/api/staff/home', 'staff', (c) => staffHome(c.s));
route('POST', '/api/staff/punch', 'staff', (c) => {
  const store = q1('SELECT * FROM stores WHERE id=?', c.s.storeId), set = storeSettings(store);
  if (!['in', 'out', 'break_start', 'break_end'].includes(c.body.action)) fail(400, 'BAD_REQUEST');
  locationCheck(store, set, c.body, set.geo.requireLocation && (c.body.action === 'in' || c.body.action === 'out'));
  return punch(store.id, { ...c.s.staff, lang: c.lang }, c.body.action, 'app');
});
route('POST', '/api/staff/geo', 'staff', (c) => {
  const store = q1('SELECT * FROM stores WHERE id=?', c.s.storeId);
  let at = Date.parse(c.body.at || '') || Date.now();
  at = Math.min(Date.now(), Math.max(Date.now() - 30 * 60000, at)); // 최근 30분 이내만 인정
  if (!['enter', 'exit'].includes(c.body.event)) fail(400, 'BAD_REQUEST');
  if (store.lat != null && c.body.lat != null && c.body.event === 'enter') {
    const d = SV.distanceM({ lat: store.lat, lng: store.lng }, { lat: +c.body.lat, lng: +c.body.lng });
    if (d > storeSettings(store).geo.radius + Math.min(150, +c.body.accuracy || 0) + 50) return { action: 'none', message: '', notify: false, at: new Date(at).toISOString() };
  }
  return geoEvent(store, { ...c.s.staff, lang: c.lang }, c.body.event, new Date(at).toISOString());
});
route('PUT', '/api/staff/pin', 'staff', (c) => {
  if (!/^\d{4,6}$/.test(c.body.pin || '')) fail(400, 'PIN_FORMAT');
  const h = hashPw(c.body.pin); run('UPDATE staff SET pin_salt=?, pin_hash=? WHERE id=?', h.salt, h.hash, c.s.staff.id);
  return { ok: true };
});

// ════════ 출퇴근 기록부 (매장 공용 기기) ════════
route('GET', '/api/kiosk', 'kiosk', (c) => {
  const store = c.k.store, today = C.todayKst(), ws = C.weekStart(today), days = C.datesBetween(ws, C.addDays(ws, 6));
  const staff = q('SELECT * FROM staff WHERE store_id=? AND status=? ORDER BY name', store.id, 'active').map(staffObj);
  const shifts = q('SELECT * FROM shifts WHERE store_id=? AND date BETWEEN ? AND ?', store.id, days[0], days[6]);
  const sh = (sid, d) => parseShift(shifts.find(x => x.staff_id === sid && x.date === d));
  return { store: store.name, today, days, staff: staff.map(s => ({ id: s.id, name: s.name, color: s.color, hasPin: s.hasPin, ...statusOf(s.id), shift: sh(s.id, today), week: days.map(d => sh(s.id, d)) })) };
});
route('POST', '/api/kiosk/punch', 'kiosk', (c) => {
  const s = getStaff(c.k.storeId, c.body.staffId);
  if (!s || s.status !== 'active') fail(404, 'NOT_FOUND');
  const row = q1('SELECT pin_salt, pin_hash FROM staff WHERE id=?', s.id);
  if (!row.pin_hash) fail(400, 'NO_PIN');
  const w = limited('pin:' + s.id, 5, 5 * 60000); if (w) fail(429, 'TOO_MANY', { min: w });
  if (!checkPw(c.body.pin, row.pin_salt, row.pin_hash)) fail(401, 'PIN_WRONG');
  clearHits('pin:' + s.id);
  if (c.body.action === 'check') return { ok: true, name: s.name, ...statusOf(s.id), shift: shiftOn(s.id, C.todayKst()) };
  return punch(c.k.storeId, { ...s, lang: c.lang }, c.body.action, 'kiosk');
});
route('POST', '/api/kiosk/exit', 'kiosk', (c) => {
  const u = q1('SELECT * FROM users WHERE store_id=? AND role=?', c.k.storeId, 'owner');
  if (!checkPw(c.body.password, u.pw_salt, u.pw_hash)) fail(401, 'PW_WRONG');
  setCookie(c.res, 'ag_k', '', 0); return { ok: true };
});

// ════════ 사장님 ════════
const STAFF_FIELDS = ['name', 'phone', 'emergencyName', 'emergencyRelation', 'emergencyPhone', 'birth', 'gender', 'nationality', 'country', 'homeAddress', 'address', 'visa', 'visaExpiry', 'bank', 'accountHolder', 'startDate', 'endDate', 'position', 'jobDesc', 'deduction', 'color', 'memo', 'healthCert'];
function publicStaff(s) {
  const { rrnEnc, alienNoEnc, accountEnc, sessVer, ...rest } = s;
  const mask = v => { const d = digits(v); return d ? d.slice(0, 6) + '-' + d.slice(6, 7) + '******' : ''; };
  return { ...rest, rrnMasked: mask(dec(rrnEnc)), alienNoMasked: mask(dec(alienNoEnc)), accountMasked: dec(accountEnc).replace(/\d(?=\d{4})/g, '*'), work: statusOf(s.id) };
}
function writeStaff(storeId, s, b) {
  for (const k of STAFF_FIELDS) if (k in b) s[k] = clean(b[k], k === 'memo' || k === 'jobDesc' ? 1000 : 200);
  for (const k of ['hourlyWage', 'monthlySalary', 'monthlyHours', 'monthlyAllowance', 'nonTaxable', 'incomeTax']) if (k in b) s[k] = Math.max(0, parseInt(b[k]) || 0);
  if ('payType' in b) s.payType = b.payType === 'monthly' ? 'monthly' : 'hourly';
  if ('weeklyHoliday' in b) s.weeklyHoliday = /^[0-6]$/.test(String(b.weeklyHoliday)) ? +b.weeklyHoliday : 0;
  if ('durunuri' in b) s.durunuri = !!b.durunuri;
  if (b.insurance) s.insurance = Object.fromEntries(['pension', 'health', 'employment', 'industrial'].map(k => [k, ['yes', 'no'].includes(b.insurance[k]) ? b.insurance[k] : 'auto']));
  if (b.pattern) s.pattern = Object.fromEntries(Object.entries(b.pattern).filter(([d, x]) => /^[0-6]$/.test(d) && x && isTime(x.start) && isTime(x.end)).map(([d, x]) => [d, { start: x.start, end: x.end, breaks: cleanBreaks(x.breaks) }]));
  if (b.rrn) s.rrnEnc = enc(clean(b.rrn, 20));
  if (b.alienNo) s.alienNoEnc = enc(clean(b.alienNo, 20));
  if (b.account) s.accountEnc = enc(clean(b.account, 40));
  if (!s.name) fail(400, 'REQUIRED', { field: 'name' });
  const { id, storeId: _, status, name, phone, loginId, lang, hasPin, hasLogin, sessVer, createdAt, ...data } = s;
  const cols = { name: s.name, phone: digits(s.phone), data: JSON.stringify(data) };
  if (b.pin) { if (!/^\d{4,6}$/.test(b.pin)) fail(400, 'PIN_FORMAT'); const h = hashPw(b.pin); cols.pin_salt = h.salt; cols.pin_hash = h.hash; }
  if (b.loginId !== undefined && b.loginId !== (s.loginId || '')) {
    const li = clean(b.loginId, 40);
    if (li && !/^[a-zA-Z0-9._-]{4,40}$/.test(li)) fail(400, 'ID_INVALID');
    if (li && (q1('SELECT 1 FROM staff WHERE store_id=? AND login_id=? AND id<>?', storeId, li, s.id || '') || q1('SELECT 1 FROM users WHERE store_id=? AND login_id=?', storeId, li))) fail(409, 'ID_TAKEN');
    cols.login_id = li || null;
  }
  if (b.password) { if (String(b.password).length < 8) fail(400, 'PW_WEAK'); const h = hashPw(b.password); cols.pw_salt = h.salt; cols.pw_hash = h.hash; cols.sess_ver = uid(); }
  return cols;
}
route('GET', '/api/owner/bootstrap', 'owner', (c) => {
  const store = q1('SELECT * FROM stores WHERE id=?', c.s.storeId), { kioskVer, ...settings } = storeSettings(store);
  return {
    today: C.todayKst(), clientIp: c.ip, kiosk: !!kioskOf(c.req), user: { loginId: c.s.user.login_id, email: maskEmail(c.s.user.email), lang: c.s.user.lang },
    store: { name: store.name, bizNo: store.biz_no, ownerName: store.owner_name, address: store.address, phone: store.phone, industry: store.industry, lat: store.lat, lng: store.lng, settings },
    staff: q('SELECT * FROM staff WHERE store_id=? ORDER BY status, name', store.id).map(staffObj).map(publicStaff),
    contracts: q('SELECT id,staff_id,type,title,created_at,shared_at,received_at,viewed_at FROM contracts WHERE store_id=? ORDER BY created_at DESC', store.id).map(r => ({ id: r.id, staffId: r.staff_id, type: r.type, title: r.title, createdAt: r.created_at, sharedAt: r.shared_at, receivedAt: r.received_at, viewedAt: r.viewed_at })),
  };
});
route('PUT', '/api/owner/store', 'owner', async (c) => {
  const b = c.body, st = q1('SELECT * FROM stores WHERE id=?', c.s.storeId), s = storeSettings(st);
  if (b.store) {
    const x = b.store;
    run('UPDATE stores SET name=?, owner_name=?, address=?, phone=?, industry=? WHERE id=?', clean(x.name) || st.name, clean(x.ownerName), clean(x.address), clean(x.phone), clean(x.industry), st.id);
    if ('lat' in x && 'lng' in x) {
      if (x.lat === '' || x.lat == null) run('UPDATE stores SET lat=NULL, lng=NULL WHERE id=?', st.id);
      else if (Math.abs(+x.lat) <= 90 && Math.abs(+x.lng) <= 180) run('UPDATE stores SET lat=?, lng=? WHERE id=?', +x.lat, +x.lng, st.id);
    }
  }
  if (b.settings) {
    const x = b.settings;
    for (const k of ['fivePlus', 'breakAuto', 'earlyFromSchedule', 'durunuri']) if (k in x) s[k] = !!x[k];
    if ('rounding' in x) s.rounding = [1, 5, 10, 15, 30].includes(+x.rounding) ? +x.rounding : 1;
    if ('payDay' in x) s.payDay = Math.min(31, Math.max(1, parseInt(x.payDay) || 10));
    if ('payMethod' in x) s.payMethod = x.payMethod === 'direct' ? 'direct' : 'account';
    if (x.minWages) s.minWages = Object.fromEntries(Object.entries(x.minWages).filter(([y, v]) => /^\d{4}$/.test(y) && +v > 0).map(([y, v]) => [y, +v]));
    if (x.rates) for (const k of Object.keys(INS.DEFAULT_RATES)) if (k in x.rates && x.rates[k] !== '') s.rates[k] = Math.max(0, +x.rates[k] || 0);
    if (x.premiums) {
      const p = {};
      for (const k of ['overtime', 'night', 'holiday', 'holidayOver8', 'partTimeExcess']) if (k in x.premiums && x.premiums[k] !== '' && x.premiums[k] != null) p[k] = Math.min(300, Math.max(0, +x.premiums[k] || 0));
      if ('publicHolidayPay' in x.premiums) p.publicHolidayPay = !!x.premiums.publicHolidayPay;
      s.premiums = p;
    }
    if (s.fivePlus) { // 5인 이상: 법정 최소 미만으로 정할 수 없음
      const MIN = { overtime: 50, night: 50, holiday: 50, holidayOver8: 100, partTimeExcess: 50 };
      for (const k of Object.keys(MIN)) if (s.premiums[k] !== undefined && s.premiums[k] < MIN[k]) s.premiums[k] = MIN[k];
      s.premiums.publicHolidayPay = true;
    }
    if (Array.isArray(x.publicHolidays)) s.publicHolidays = x.publicHolidays.filter(h => h && isDate(h.date)).map(h => ({ date: h.date, name: clean(h.name, 40) })).sort((a, b) => a.date.localeCompare(b.date)).filter((h, i, a) => !i || a[i - 1].date !== h.date).slice(0, 200);
    if (x.geo) {
      const g = x.geo;
      for (const k of ['auto', 'requireLocation']) if (k in g) s.geo[k] = !!g[k];
      if ('radius' in g) s.geo.radius = Math.min(1000, Math.max(30, parseInt(g.radius) || 100));
      for (const [k, lo, hi] of [['earlyMin', 0, 120], ['lateOutMin', 0, 120], ['exitGraceMin', 5, 120]]) if (k in g) s.geo[k] = Math.min(hi, Math.max(lo, parseInt(g[k]) || 0));
    }
    saveSettings(st.id, s);
  }
  audit(st.id, c.s.user.login_id, 'SETTINGS');
  return { ok: true };
});
route('POST', '/api/owner/geocode', 'owner', async (c) => {
  const g = await SV.geocode(clean(c.body.address, 200)).catch(() => null);
  if (!g) fail(404, 'GEOCODE_FAIL');
  return g;
});
route('POST', '/api/owner/staff', 'owner', (c) => {
  const s = { id: uid(), nationality: 'KR', deduction: 'none', insurance: {}, pattern: {} };
  const cols = writeStaff(c.s.storeId, s, c.body);
  run('INSERT INTO staff(id,store_id,status,name,phone,login_id,pw_salt,pw_hash,pin_salt,pin_hash,lang,sess_ver,data,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', s.id, c.s.storeId, 'active', cols.name, cols.phone, cols.login_id || null, cols.pw_salt || null, cols.pw_hash || null, cols.pin_salt || null, cols.pin_hash || null, c.body.lang === 'en' ? 'en' : 'ko', uid(), cols.data, nowIso());
  audit(c.s.storeId, c.s.user.login_id, 'STAFF_ADD ' + cols.name);
  return { ok: true, id: s.id };
});
route('PUT', '/api/owner/staff/:id', 'owner', (c) => {
  const s = getStaff(c.s.storeId, c.p.id); if (!s) fail(404, 'NOT_FOUND');
  const cols = writeStaff(c.s.storeId, s, c.body);
  if (c.body.status && ['active', 'retired', 'pending'].includes(c.body.status)) { cols.status = c.body.status; if (c.body.status !== 'active') cols.sess_ver = uid(); }
  if (c.body.lang) cols.lang = c.body.lang === 'en' ? 'en' : 'ko';
  const keys = Object.keys(cols);
  run(`UPDATE staff SET ${keys.map(k => k + '=?').join(',')} WHERE id=? AND store_id=?`, ...keys.map(k => cols[k]), s.id, c.s.storeId);
  audit(c.s.storeId, c.s.user.login_id, 'STAFF_EDIT ' + cols.name);
  return { ok: true };
});
route('GET', '/api/owner/staff/:id/sensitive', 'owner', (c) => {
  const s = getStaff(c.s.storeId, c.p.id); if (!s) fail(404, 'NOT_FOUND');
  audit(c.s.storeId, c.s.user.login_id, 'VIEW_PII ' + s.name);
  return { rrn: dec(s.rrnEnc), alienNo: dec(s.alienNoEnc), account: dec(s.accountEnc) };
});
route('DELETE', '/api/owner/staff/:id', 'owner', (c) => {
  const s = getStaff(c.s.storeId, c.p.id); if (!s) fail(404, 'NOT_FOUND');
  if (q1('SELECT 1 FROM records WHERE staff_id=?', s.id)) fail(409, 'HAS_RECORDS');
  tx(() => { run('DELETE FROM shifts WHERE staff_id=?', s.id); run('DELETE FROM contracts WHERE staff_id=?', s.id); run('DELETE FROM staff WHERE id=?', s.id); });
  audit(c.s.storeId, c.s.user.login_id, 'STAFF_DEL ' + s.name);
  return { ok: true };
});

// 근무표
route('GET', '/api/owner/shifts', 'owner', (c) => {
  const from = c.query.get('from'), to = c.query.get('to');
  if (!isDate(from) || !isDate(to) || from > to || C.datesBetween(from, to).length > 93) fail(400, 'BAD_RANGE');
  return { from, to, shifts: q('SELECT * FROM shifts WHERE store_id=? AND date BETWEEN ? AND ?', c.s.storeId, from, to).map(r => ({ staffId: r.staff_id, date: r.date, ...parseShift(r) })) };
});
route('PUT', '/api/owner/shifts', 'owner', (c) => {
  const b = c.body, s = getStaff(c.s.storeId, b.staffId); if (!s || !isDate(b.date)) fail(400, 'BAD_REQUEST');
  if (b.off) { if (run('DELETE FROM shifts WHERE staff_id=? AND date=?', s.id, b.date).changes) notifySchedule(c.s.storeId, s.id, [b.date]); return { ok: true }; }
  if (!isTime(b.start) || !isTime(b.end)) fail(400, 'TIME_INVALID');
  run('INSERT INTO shifts(id,store_id,staff_id,date,start,end,breaks) VALUES(?,?,?,?,?,?,?) ON CONFLICT(staff_id,date) DO UPDATE SET start=excluded.start, end=excluded.end, breaks=excluded.breaks', uid(), c.s.storeId, s.id, b.date, b.start, b.end, JSON.stringify(cleanBreaks(b.breaks)));
  notifySchedule(c.s.storeId, s.id, [b.date]);
  return { ok: true };
});
// 일괄 등록·수정·삭제: mode = set(지정 시간) | pattern(직원별 기본 근무) | delete
route('POST', '/api/owner/shifts/bulk', 'owner', (c) => {
  const b = c.body, ids = Array.isArray(b.staffIds) ? b.staffIds : [];
  if (!isDate(b.from) || !isDate(b.to) || b.from > b.to || C.datesBetween(b.from, b.to).length > 186) fail(400, 'BAD_RANGE');
  const wd = new Set((b.weekdays || []).map(Number));
  const dates = (b.dates && b.dates.length ? b.dates.filter(isDate) : C.datesBetween(b.from, b.to)).filter(d => !wd.size || wd.has(C.dow(d)));
  if (b.mode === 'set' && (!isTime(b.start) || !isTime(b.end))) fail(400, 'TIME_INVALID');
  let n = 0; const changed = {};
  tx(() => {
    for (const id of ids) {
      const s = getStaff(c.s.storeId, id); if (!s) continue;
      const mark = d => (changed[s.id] = changed[s.id] || []).push(d);
      for (const d of dates) {
        if (s.startDate && d < s.startDate || s.endDate && d > s.endDate) continue;
        if (b.mode === 'delete') { const k = Number(run('DELETE FROM shifts WHERE staff_id=? AND date=?', s.id, d).changes); if (k) mark(d); n += k; continue; }
        const sh = b.mode === 'pattern' ? (s.pattern || {})[C.dow(d)] : { start: b.start, end: b.end, breaks: cleanBreaks(b.breaks) };
        if (!sh) continue;
        if (!b.overwrite && q1('SELECT 1 FROM shifts WHERE staff_id=? AND date=?', s.id, d)) continue;
        run('INSERT INTO shifts(id,store_id,staff_id,date,start,end,breaks) VALUES(?,?,?,?,?,?,?) ON CONFLICT(staff_id,date) DO UPDATE SET start=excluded.start, end=excluded.end, breaks=excluded.breaks', uid(), c.s.storeId, s.id, d, sh.start, sh.end, JSON.stringify(sh.breaks || []));
        n++; mark(d);
      }
    }
  });
  for (const [sid, ds] of Object.entries(changed)) notifySchedule(c.s.storeId, sid, ds);
  audit(c.s.storeId, c.s.user.login_id, `SHIFT_BULK ${b.mode} ${n}`);
  return { ok: true, count: n };
});

// 출퇴근 기록
function recRows(storeId, from, to, staffId) {
  const staff = new Map(q('SELECT * FROM staff WHERE store_id=?', storeId).map(r => [r.id, staffObj(r)]));
  const settings = storeSettings(q1('SELECT settings FROM stores WHERE id=?', storeId));
  const shifts = new Map(q('SELECT * FROM shifts WHERE store_id=? AND date BETWEEN ? AND ?', storeId, from, to).map(r => [r.staff_id + r.date, parseShift(r)]));
  return q(`SELECT * FROM records WHERE store_id=? AND date BETWEEN ? AND ? ${staffId ? 'AND staff_id=?' : ''} ORDER BY date, in_at`, storeId, from, to, ...(staffId ? [staffId] : [])).map(parseRec).map(r => {
    const sh = shifts.get(r.staffId + r.date) || null;
    return { ...r, name: (staff.get(r.staffId) || {}).name || '?', shift: sh, calc: C.recordMinutes(r, sh, settings) };
  });
}
route('GET', '/api/owner/records', 'owner', (c) => {
  const from = c.query.get('from'), to = c.query.get('to');
  if (!isDate(from) || !isDate(to) || from > to) fail(400, 'BAD_RANGE');
  return { from, to, rows: recRows(c.s.storeId, from, to, c.query.get('staffId')) };
});
function recFromBody(r, b) {
  if (!isDate(b.date) || !isTime(b.inTime)) fail(400, 'TIME_INVALID');
  r.date = b.date; r.in = new Date(C.kstEpoch(b.date, C.hm(b.inTime))).toISOString();
  const abs = t0 => { let x = C.kstEpoch(b.date, C.hm(t0)); if (x < Date.parse(r.in)) x += 86400000; return new Date(x).toISOString(); };
  if (b.outTime) { if (!isTime(b.outTime)) fail(400, 'TIME_INVALID'); let o = C.kstEpoch(b.date, C.hm(b.outTime)); if (o <= Date.parse(r.in)) o += 86400000; r.out = new Date(o).toISOString(); } else r.out = null;
  r.breaks = cleanBreaks(b.breaks).map(x => ({ start: abs(x.start), end: abs(x.end) }));
  r.brk = b.brk === '' || b.brk == null ? null : Math.max(0, parseInt(b.brk) || 0);
  r.note = clean(b.note, 300);
}
route('POST', '/api/owner/records', 'owner', (c) => {
  const s = getStaff(c.s.storeId, c.body.staffId); if (!s) fail(400, 'BAD_REQUEST');
  const r = {}; recFromBody(r, c.body);
  run('INSERT INTO records(id,store_id,staff_id,date,in_at,out_at,breaks,brk,note,edited,src_in,src_out) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)', uid(), c.s.storeId, s.id, r.date, r.in, r.out, JSON.stringify(r.breaks), r.brk, r.note, 'owner', r.out ? 'owner' : null);
  audit(c.s.storeId, c.s.user.login_id, `REC_ADD ${s.name} ${r.date}`);
  return { ok: true };
});
route('PUT', '/api/owner/records/:id', 'owner', (c) => {
  const old = parseRec(q1('SELECT * FROM records WHERE id=? AND store_id=?', c.p.id, c.s.storeId)); if (!old) fail(404, 'NOT_FOUND');
  const r = {}; recFromBody(r, c.body);
  const hist = [...old.history, { at: nowIso(), by: c.s.user.login_id, before: { in: old.in, out: old.out, breaks: old.breaks, brk: old.brk } }];
  run('UPDATE records SET date=?, in_at=?, out_at=?, breaks=?, brk=?, note=?, edited=1, history=?, exit_at=NULL, src_out=COALESCE(src_out, ?) WHERE id=?', r.date, r.in, r.out, JSON.stringify(r.breaks), r.brk, r.note, JSON.stringify(hist), r.out ? 'owner' : null, old.id);
  audit(c.s.storeId, c.s.user.login_id, `REC_EDIT ${old.date}`);
  return { ok: true };
});
route('DELETE', '/api/owner/records/:id', 'owner', (c) => {
  const r = q1('SELECT * FROM records WHERE id=? AND store_id=?', c.p.id, c.s.storeId); if (!r) fail(404, 'NOT_FOUND');
  run('DELETE FROM records WHERE id=?', r.id); audit(c.s.storeId, c.s.user.login_id, `REC_DEL ${r.date} ${r.in_at}`);
  return { ok: true };
});

// 급여
function payrollAll(storeId, from, to, staffId) {
  const store = q1('SELECT * FROM stores WHERE id=?', storeId);
  return q('SELECT * FROM staff WHERE store_id=? AND status<>?', storeId, 'pending').map(staffObj)
    .filter(s => (!staffId || s.id === staffId) && (s.status === 'active' || q1('SELECT 1 FROM records WHERE staff_id=? AND date BETWEEN ? AND ?', s.id, from, to)))
    .map(s => payFor(store, s, from, to));
}
route('GET', '/api/owner/payroll', 'owner', (c) => {
  const from = c.query.get('from'), to = c.query.get('to');
  if (!isDate(from) || !isDate(to) || from > to) fail(400, 'BAD_RANGE');
  const store = q1('SELECT * FROM stores WHERE id=?', c.s.storeId);
  return { from, to, list: payrollAll(c.s.storeId, from, to, c.query.get('staffId')), store: { name: store.name, ownerName: store.owner_name, bizNo: SV.formatBizNo(store.biz_no), address: store.address } };
});

// 엑셀
route('GET', '/api/owner/export/:kind', 'owner', (c) => {
  const from = c.query.get('from'), to = c.query.get('to'), L = c.lang, T = k => t(L, k);
  if (!isDate(from) || !isDate(to) || from > to) fail(400, 'BAD_RANGE');
  const store = q1('SELECT * FROM stores WHERE id=?', c.s.storeId);
  const hhmm2 = iso => iso ? hhmm(iso) : '';
  const hrs = m => Math.round(m / 60 * 100) / 100;
  let sheets, fname;
  if (c.p.kind === 'records.xlsx') {
    const rows = recRows(c.s.storeId, from, to);
    const staffNames = [...new Set(rows.map(r => r.name))].sort();
    const dates = C.datesBetween(from, to);
    sheets = [{
      name: T('X_ATTENDANCE'), widths: [12, 12, 14, 9, 9, 22, 10, 10, 10, 24],
      rows: [[`${store.name} · ${T('X_ATTENDANCE')} · ${from} ~ ${to}`], [T('X_DATE'), T('X_NAME'), T('X_SCHEDULE'), T('X_IN'), T('X_OUT'), T('X_BREAKS'), T('X_BREAK_MIN'), T('X_WORK_H'), T('X_NIGHT_H'), T('X_NOTE')].map(v => ({ v, bold: true })),
        ...rows.map(r => [r.date, r.name, r.shift ? `${r.shift.start}~${r.shift.end}` : '', hhmm2(r.in), hhmm2(r.out), r.breaks.map(b => `${hhmm2(b.start)}~${hhmm2(b.end)}`).join(', '), r.calc ? r.calc.brk : '', r.calc ? { v: hrs(r.calc.worked), num: 'hours' } : '', r.calc ? { v: hrs(r.calc.night), num: 'hours' } : '', [r.edited ? T('X_EDITED') : '', r.note || ''].filter(Boolean).join(' ')])],
      freeze: 2,
    }, {
      name: T('X_WORKLOG'), widths: [14, ...dates.map(() => 7), 10],
      rows: [[`${store.name} · ${T('X_WORKLOG')} (${T('X_HOURS_UNIT')})`], [{ v: T('X_NAME'), bold: true }, ...dates.map(d => ({ v: d.slice(5), bold: true })), { v: T('X_TOTAL'), bold: true }],
        ...staffNames.map(n => { const per = dates.map(d => rows.filter(r => r.name === n && r.date === d).reduce((s, r) => s + (r.calc ? r.calc.worked : 0), 0)); return [n, ...per.map(m => m ? { v: hrs(m), num: 'hours' } : ''), { v: hrs(per.reduce((a, b) => a + b, 0)), num: 'hours' }]; })],
      freeze: 2,
    }];
    fname = `albago_attendance_${from}_${to}.xlsx`;
  } else if (c.p.kind === 'payroll.xlsx') {
    const list = payrollAll(c.s.storeId, from, to);
    const dk = ['pension', 'health', 'ltc', 'employment', 'incomeTax', 'localTax', 'bizTax'];
    sheets = [{
      name: T('X_PAYROLL'), widths: [12, 10, 10, 10, 12, 12, 12, 12, 12, ...dk.map(() => 11), 12, 12, 12, 14],
      rows: [[`${store.name} · ${T('X_PAYROLL')} · ${from} ~ ${to}`], [T('X_NAME'), T('X_WAGE'), T('X_WORK_H'), T('X_DAYS'), T('X_BASE'), T('X_HOLIDAY'), T('X_OT'), T('X_NIGHT'), T('X_GROSS'), ...dk.map(k => T('D_' + k)), T('X_DED_TOTAL'), T('X_NET'), T('X_EMPLOYER_INS'), T('X_TOTAL_COST')].map(v => ({ v, bold: true })),
        ...list.map(p => [p.name, p.wage, { v: hrs(p.workedMin), num: 'hours' }, p.days, p.base, p.holidayPay, p.overtimePay, p.nightPay, p.gross, ...dk.map(k => p.deductions.filter(d => d.key === k).reduce((s, d) => s + d.amount, 0)), p.deductionTotal, p.net, p.employerCost, p.totalCost]),
        ['', '', '', '', ...['base', 'holidayPay', 'overtimePay', 'nightPay', 'gross'].map(k => list.reduce((s, p) => s + p[k], 0)), ...dk.map(k => list.reduce((s, p) => s + p.deductions.filter(d => d.key === k).reduce((a, d) => a + d.amount, 0), 0)), ...['deductionTotal', 'net', 'employerCost', 'totalCost'].map(k => list.reduce((s, p) => s + p[k], 0))].map((v, i) => i === 0 ? { v: T('X_TOTAL'), bold: true } : v)],
      freeze: 2,
    }, {
      name: T('X_INSURANCE'), widths: [12, 12, 12, 14, 14, 14, 14, 16],
      rows: [[T('X_INSURANCE') + ` · ${from} ~ ${to}`], [T('X_NAME'), T('X_KIND'), T('X_APPLY'), T('X_REASON'), T('X_EMPLOYEE'), T('X_EMPLOYER'), T('X_SUPPORT'), ''].map(v => ({ v, bold: true })),
        ...list.flatMap(p => p.insurance ? ['pension', 'health', 'employment', 'industrial'].map(k => { const e = p.insurance.eligibility[k], items = p.insurance.items.filter(i => i.key === k || (k === 'health' && i.key === 'ltc')); return [p.name, T('D_' + k), e.apply ? 'O' : 'X', T(e.reason), items.reduce((s, i) => s + i.employee, 0), items.reduce((s, i) => s + i.employer, 0), items.reduce((s, i) => s + (i.supportEmployee || 0) + (i.supportEmployer || 0), 0), e.check ? T('INS_CHECK') : '']; }) : [[p.name, T(p.monthly ? 'X_NO_INS' : 'X_MONTHLY_ONLY')]])],
      freeze: 2,
    }];
    fname = `albago_payroll_${from}_${to}.xlsx`;
  } else if (c.p.kind === 'messages.xlsx') {
    const staffN = new Map(q('SELECT id,name FROM staff WHERE store_id=?', c.s.storeId).map(r => [r.id, r.name]));
    const rows = q('SELECT * FROM messages WHERE store_id=? AND substr(created_at,1,10) BETWEEN ? AND ? ORDER BY rowid', c.s.storeId, C.addDays(from, -1), to);
    const v = verifyChain(c.s.storeId);
    sheets = [{ name: T('X_MESSAGES'), widths: [17, 10, 12, 14, 14, 24, 60, 12, 17, 17, 14],
      rows: [[`${store.name} · ${T('X_MESSAGES')} · ${from} ~ ${to} · ${T(v.ok ? 'CHAIN_OK' : 'CHAIN_BROKEN')}`], [T('X_SENT_AT'), T('X_FROM'), T('X_NAME'), T('X_KIND'), T('X_RELATED_DATE'), T('X_TITLE'), T('X_BODY'), T('X_ATTACH'), T('X_READ_AT'), T('X_ACK_AT'), 'hash'].map(v2 => ({ v: v2, bold: true })),
        ...rows.map(r => { const rc = r.staff_id ? q1('SELECT read_at, ack_at FROM msg_receipts WHERE message_id=? AND staff_id=?', r.id, r.staff_id) : null; const kd = iso => iso ? C.kstDateOf(iso) + ' ' + hhmm(iso) : '';
          return [kd(r.created_at), T(r.sender === 'owner' ? 'X_OWNER' : 'X_STAFF'), r.staff_id ? staffN.get(r.staff_id) || '' : T('X_ALL_STAFF'), T('MK_' + r.kind), r.date || '', r.title || '', r.body, attList(r.id).map(a => a.name).join(', '), r.sender === 'owner' ? kd(rc && rc.read_at) : kd(r.owner_read_at), kd(rc && rc.ack_at), r.hash.slice(0, 12)]; })] }];
    fname = `albago_messages_${from}_${to}.xlsx`;
  } else fail(404, 'NOT_FOUND');
  audit(c.s.storeId, c.s.user.login_id, 'EXPORT ' + c.p.kind);
  const buf = XLSX.build(sheets);
  c.res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${fname}"`, 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
  c.res.end(buf);
  return null;
});

// 근로계약서
route('POST', '/api/owner/contracts', 'owner', (c) => {
  const s = getStaff(c.s.storeId, c.body.staffId); if (!s) fail(400, 'BAD_REQUEST');
  const id = uid(); run('INSERT INTO contracts(id,store_id,staff_id,type,title,fields,created_at) VALUES(?,?,?,?,?,?,?)', id, c.s.storeId, s.id, clean(c.body.type, 30), clean(c.body.title, 120), JSON.stringify(c.body.fields || {}), nowIso());
  audit(c.s.storeId, c.s.user.login_id, 'CONTRACT ' + s.name);
  if (c.body.share) shareContract(c.s.storeId, id);
  return { ok: true, id };
});
route('GET', '/api/owner/contracts/:id', 'owner', (c) => { const r = q1('SELECT * FROM contracts WHERE id=? AND store_id=?', c.p.id, c.s.storeId); if (!r) fail(404, 'NOT_FOUND'); return { ...r, fields: JSON.parse(r.fields) }; });
route('DELETE', '/api/owner/contracts/:id', 'owner', (c) => { const r = q1('SELECT shared_at FROM contracts WHERE id=? AND store_id=?', c.p.id, c.s.storeId); if (r && r.shared_at) fail(409, 'CONTRACT_SHARED'); run('DELETE FROM contracts WHERE id=? AND store_id=?', c.p.id, c.s.storeId); return { ok: true }; });

// ════════ 소통 채널 (기록 보존: 삭제·수정 불가, 매장별 해시 체인) ════════
const OWNER_KINDS = ['notice', 'instruction', 'general', 'warning', 'discipline', 'dismissal'];
const STAFF_KINDS = ['general', 'suggestion', 'absence_reason', 'schedule_request'];
const ACK_DEFAULT = new Set(['notice', 'instruction', 'warning', 'discipline', 'dismissal']);
const ATT_TYPES = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function createMessage(storeId, m, attachments, ip) {
  const atts = (Array.isArray(attachments) ? attachments : []).slice(0, 3).map(a => {
    const type = clean(a.type, 60).toLowerCase(), data = Buffer.from(String(a.data || ''), 'base64');
    if (!ATT_TYPES.test(type)) fail(400, 'ATT_TYPE');
    if (!data.length || data.length > 5 * 1024 * 1024) fail(400, 'ATT_SIZE');
    return { id: uid(), name: clean(a.name, 120) || 'file', type, size: data.length, sha256: sha(data), data };
  });
  return tx(() => {
    const prev = q1('SELECT hash FROM messages WHERE store_id=? ORDER BY rowid DESC LIMIT 1', storeId);
    const row = { id: uid(), store_id: storeId, staff_id: m.staffId || null, sender: m.sender, sender_name: m.senderName, kind: m.kind, title: clean(m.title, 120), body: clean(m.body, 5000), date: isDate(m.date) ? m.date : null, requires_ack: m.requiresAck ? 1 : 0, created_at: nowIso(), ip, prev_hash: prev ? prev.hash : '' };
    row.hash = sha(JSON.stringify([row.prev_hash, row.id, row.staff_id, row.sender, row.sender_name, row.kind, row.title, row.body, row.date, row.requires_ack, row.created_at, atts.map(a => a.sha256)]));
    run('INSERT INTO messages(id,store_id,staff_id,sender,sender_name,kind,title,body,date,requires_ack,created_at,ip,prev_hash,hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', row.id, storeId, row.staff_id, row.sender, row.sender_name, row.kind, row.title, row.body, row.date, row.requires_ack, row.created_at, ip, row.prev_hash, row.hash);
    for (const a of atts) run('INSERT INTO attachments(id,message_id,store_id,name,type,size,sha256,data) VALUES(?,?,?,?,?,?,?,?)', a.id, row.id, storeId, a.name, a.type, a.size, a.sha256, a.data);
    return row;
  });
}
function verifyChain(storeId) {
  let prev = '', i = 0;
  for (const r of q('SELECT * FROM messages WHERE store_id=? ORDER BY rowid', storeId)) {
    const atts = q('SELECT sha256, data FROM attachments WHERE message_id=? ORDER BY rowid', r.id);
    if (atts.some(a => sha(a.data) !== a.sha256)) return { ok: false, at: r.created_at, id: r.id };
    const h = sha(JSON.stringify([r.prev_hash, r.id, r.staff_id, r.sender, r.sender_name, r.kind, r.title, r.body, r.date, r.requires_ack, r.created_at, atts.map(a => a.sha256)]));
    if (r.prev_hash !== prev || h !== r.hash) return { ok: false, at: r.created_at, id: r.id };
    prev = r.hash; i++;
  }
  return { ok: true, count: i, last: prev.slice(0, 12) };
}
const attList = id => q('SELECT id,name,type,size FROM attachments WHERE message_id=? ORDER BY rowid', id);
function msgOut(r, staffId) {
  const rc = staffId ? q1('SELECT read_at, ack_at FROM msg_receipts WHERE message_id=? AND staff_id=?', r.id, staffId) : null;
  return { id: r.id, staffId: r.staff_id, from: r.sender, senderName: r.sender_name, kind: r.kind, title: r.title, body: r.body, date: r.date, requiresAck: !!r.requires_ack, createdAt: r.created_at, ownerReadAt: r.owner_read_at, readAt: rc ? rc.read_at : null, ackAt: rc ? rc.ack_at : null, attachments: attList(r.id), hash: r.hash.slice(0, 12) };
}
function unreadForStaff(me) {
  return q1(`SELECT count(*) n FROM messages m LEFT JOIN msg_receipts r ON r.message_id=m.id AND r.staff_id=? WHERE m.store_id=? AND m.sender='owner' AND (m.staff_id=? OR m.staff_id IS NULL) AND m.created_at>=? AND r.read_at IS NULL`, me.id, me.storeId, me.id, me.createdAt || '').n;
}
async function pushTo(staffIds, title, body, data) {
  const tokens = staffIds.length ? q(`SELECT token FROM push_tokens WHERE staff_id IN (${staffIds.map(() => '?').join(',')})`, ...staffIds).map(r => r.token) : [];
  if (!tokens.length) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(tokens.map(to => ({ to, title, body, data, sound: 'default' }))), signal: AbortSignal.timeout(8000) });
  } catch (e) { console.error('push', e.message); }
}
route('GET', '/api/staff/messages', 'staff', (c) => {
  const me = c.s.staff;
  const rows = q(`SELECT * FROM messages WHERE store_id=? AND (staff_id=? OR (staff_id IS NULL AND created_at>=?)) ORDER BY created_at DESC LIMIT 300`, me.storeId, me.id, me.createdAt || '');
  const now = nowIso();
  for (const r of rows) if (r.sender === 'owner') run('INSERT INTO msg_receipts(message_id,staff_id,read_at) VALUES(?,?,?) ON CONFLICT(message_id,staff_id) DO UPDATE SET read_at=COALESCE(read_at, excluded.read_at)', r.id, me.id, now);
  return { items: rows.map(r => msgOut(r, me.id)), unread: 0 };
});
route('POST', '/api/staff/messages', 'staff', (c) => {
  const b = c.body, me = c.s.staff;
  if (!STAFF_KINDS.includes(b.kind)) fail(400, 'BAD_REQUEST');
  if (!clean(b.body)) fail(400, 'REQUIRED', { field: 'body' });
  const w = limited('msg:' + me.id, 30, 3600000); if (w) fail(429, 'TOO_MANY', { min: w });
  const row = createMessage(me.storeId, { staffId: me.id, sender: 'staff', senderName: me.name, kind: b.kind, title: b.title, body: b.body, date: b.date }, b.attachments, c.ip);
  audit(me.storeId, me.name, 'MSG ' + b.kind);
  return { ok: true, id: row.id };
}, { maxBody: 22e6 });
route('POST', '/api/staff/messages/:id/ack', 'staff', (c) => {
  const me = c.s.staff, m = q1('SELECT * FROM messages WHERE id=? AND store_id=? AND sender=? AND (staff_id=? OR staff_id IS NULL)', c.p.id, me.storeId, 'owner', me.id);
  if (!m) fail(404, 'NOT_FOUND');
  const at = nowIso();
  run('INSERT INTO msg_receipts(message_id,staff_id,read_at,ack_at,ack_ip) VALUES(?,?,?,?,?) ON CONFLICT(message_id,staff_id) DO UPDATE SET read_at=COALESCE(read_at, excluded.read_at), ack_at=COALESCE(ack_at, excluded.ack_at), ack_ip=COALESCE(ack_ip, excluded.ack_ip)', m.id, me.id, at, at, c.ip);
  audit(me.storeId, me.name, 'ACK ' + m.kind);
  return { ok: true, ackAt: q1('SELECT ack_at FROM msg_receipts WHERE message_id=? AND staff_id=?', m.id, me.id).ack_at };
});
function sendAttachment(c, a) {
  if (!a) fail(404, 'NOT_FOUND');
  c.res.writeHead(200, { 'Content-Type': a.type, 'Content-Length': a.size, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(a.name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" });
  c.res.end(a.data); return null;
}
route('GET', '/api/staff/attachments/:id', 'staff', (c) => {
  const me = c.s.staff;
  return sendAttachment(c, q1('SELECT a.* FROM attachments a JOIN messages m ON m.id=a.message_id WHERE a.id=? AND m.store_id=? AND (m.staff_id=? OR m.staff_id IS NULL)', c.p.id, me.storeId, me.id));
});
route('POST', '/api/staff/push-token', 'staff', (c) => {
  const tok = clean(c.body.token, 200);
  if (!/^Expo(nent)?PushToken\[.+\]$/.test(tok)) fail(400, 'BAD_REQUEST');
  run('INSERT INTO push_tokens(token,staff_id,updated_at) VALUES(?,?,?) ON CONFLICT(token) DO UPDATE SET staff_id=excluded.staff_id, updated_at=excluded.updated_at', tok, c.s.staff.id, nowIso());
  return { ok: true };
});
route('GET', '/api/owner/messages', 'owner', (c) => {
  const sid = c.query.get('staffId') || '';
  const rows = sid === 'notice' ? q('SELECT * FROM messages WHERE store_id=? AND staff_id IS NULL ORDER BY created_at DESC LIMIT 500', c.s.storeId)
    : sid ? q('SELECT * FROM messages WHERE store_id=? AND staff_id=? ORDER BY created_at DESC LIMIT 500', c.s.storeId, sid)
    : q('SELECT * FROM messages WHERE store_id=? ORDER BY created_at DESC LIMIT 200', c.s.storeId);
  if (sid && sid !== 'notice') run("UPDATE messages SET owner_read_at=? WHERE store_id=? AND staff_id=? AND sender='staff' AND owner_read_at IS NULL", nowIso(), c.s.storeId, sid);
  const staff = q('SELECT id,name,created_at FROM staff WHERE store_id=? AND status<>?', c.s.storeId, 'pending');
  const items = rows.map(r => {
    const o = msgOut(r, r.staff_id);
    if (!r.staff_id) { const rc = q('SELECT staff_id, read_at, ack_at FROM msg_receipts WHERE message_id=?', r.id); o.receipts = staff.filter(s => s.created_at <= r.created_at).map(s => { const x = rc.find(y => y.staff_id === s.id) || {}; return { staffId: s.id, name: s.name, readAt: x.read_at || null, ackAt: x.ack_at || null }; }); }
    return o;
  });
  const unread = Object.fromEntries(q("SELECT staff_id, count(*) n FROM messages WHERE store_id=? AND sender='staff' AND owner_read_at IS NULL GROUP BY staff_id", c.s.storeId).map(r => [r.staff_id, r.n]));
  return { items, unread };
});
route('POST', '/api/owner/messages', 'owner', async (c) => {
  const b = c.body;
  if (!OWNER_KINDS.includes(b.kind)) fail(400, 'BAD_REQUEST');
  if (!clean(b.body)) fail(400, 'REQUIRED', { field: 'body' });
  const notice = b.kind === 'notice' || !b.staffId;
  const st = notice ? null : getStaff(c.s.storeId, b.staffId);
  if (!notice && !st) fail(404, 'NOT_FOUND');
  const owner = q1('SELECT owner_name, name FROM stores WHERE id=?', c.s.storeId);
  const row = createMessage(c.s.storeId, { staffId: notice ? null : st.id, sender: 'owner', senderName: owner.owner_name || c.s.user.login_id, kind: notice ? 'notice' : b.kind, title: b.title, body: b.body, date: b.date, requiresAck: b.requiresAck ?? ACK_DEFAULT.has(b.kind) }, b.attachments, c.ip);
  audit(c.s.storeId, c.s.user.login_id, `MSG ${row.kind} ${st ? st.name : 'ALL'}`);
  const targets = notice ? q('SELECT id, lang FROM staff WHERE store_id=? AND status=?', c.s.storeId, 'active') : [{ id: st.id, lang: st.lang }];
  notify(c.s.storeId, targets.map(x => x.id), 'message', lang => ({ title: `[${t(lang, 'MK_' + row.kind)}] ${row.title || t(lang, 'N_MESSAGE_NEW')}`, body: row.body.slice(0, 80) }), { id: row.id });
  return { ok: true, id: row.id };
}, { maxBody: 22e6 });
route('GET', '/api/owner/attachments/:id', 'owner', (c) => sendAttachment(c, q1('SELECT * FROM attachments WHERE id=? AND store_id=?', c.p.id, c.s.storeId)));
route('GET', '/api/owner/messages/verify', 'owner', (c) => verifyChain(c.s.storeId));

// 상시근로자 수 계산 (참고용)
route('GET', '/api/owner/workforce', 'owner', (c) => {
  const to = isDate(c.query.get('to')) ? c.query.get('to') : C.addDays(C.todayKst(), -1);
  const [y, m, d] = to.split('-').map(Number);
  const from = C.addDays(new Date(Date.UTC(y, m - 2, Math.min(d, 28))).toISOString().slice(0, 10), 1);
  const counts = {};
  for (const r of q('SELECT date, count(DISTINCT staff_id) n FROM records WHERE store_id=? AND date BETWEEN ? AND ? GROUP BY date', c.s.storeId, from, to)) counts[r.date] = r.n;
  return { from, to, extra: Math.max(0, parseInt(c.query.get('extra')) || 0), ...C.workforce(counts, Math.max(0, parseInt(c.query.get('extra')) || 0)) };
});

// ════════ v3: 알림함 · 내 급여 · 임금명세서 · 근로계약서 전달 ════════
const PREF_DEFAULT = { shiftReminder: true, shiftReminderMin: 30, outReminder: true, scheduleChange: true };
const prefsOf = st => ({ ...PREF_DEFAULT, ...((st && st.prefs) || {}) });
const fmtWon = (lang, n) => lang === 'en' ? '₩' + Math.round(n || 0).toLocaleString('en-US') : Math.round(n || 0).toLocaleString('ko-KR') + '원';
const hrsText = (lang, m) => { m = Math.round(m || 0); return t(lang, m % 60 ? 'HOURS' : 'HOURS_H', { h: Math.floor(m / 60), m: m % 60 }); };
const mdText = (lang, d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}(${t(lang, 'DOWS').split(',')[C.dow(d)]})`;
// 알림함에 저장하고 푸시. text(lang) → { title, body }
function notify(storeId, staffIds, kind, text, data = {}) {
  for (const sid of staffIds) {
    const st = q1('SELECT id, lang, status FROM staff WHERE id=? AND store_id=?', sid, storeId);
    if (!st || st.status !== 'active') continue;
    const { title, body } = text(st.lang || 'ko'), id = uid();
    run('INSERT INTO notifications(id,store_id,staff_id,kind,title,body,data,created_at) VALUES(?,?,?,?,?,?,?,?)', id, storeId, sid, kind, title, body, JSON.stringify(data), nowIso());
    pushTo([sid], title, body, { type: kind, ...data, notificationId: id });
  }
  run('DELETE FROM notifications WHERE created_at < ?', new Date(Date.now() - 180 * 86400000).toISOString());
}
function notifySchedule(storeId, staffId, dates) {
  const today = C.todayKst(), soon = [...new Set(dates)].filter(d => d >= today && d <= C.addDays(today, 14)).sort();
  if (!soon.length) return;
  const st = getStaff(storeId, staffId); if (!st || !prefsOf(st).scheduleChange) return;
  notify(storeId, [staffId], 'schedule', lang => ({ title: t(lang, 'N_SCHEDULE_T'), body: t(lang, soon.length > 1 ? 'N_SCHEDULE_B_N' : 'N_SCHEDULE_B', { date: mdText(lang, soon[0]), n: soon.length - 1 }) }), { date: soon[0] });
}
const sentOnce = key => Number(run('INSERT OR IGNORE INTO notif_sent(key, at) VALUES(?,?)', key, nowIso()).changes) > 0;
// 근무 시작 전 알림, 퇴근 미기록 알림 (1분마다)
function reminders(now = Date.now()) {
  const today = C.todayKst(now), yday = C.addDays(today, -1);
  for (const r of q("SELECT sh.*, st.data sdata, st.status FROM shifts sh JOIN staff st ON st.id=sh.staff_id WHERE sh.date IN (?, ?) AND st.status='active'", today, yday)) {
    const pref = prefsOf(JSON.parse(r.sdata || '{}')), sp = C.shiftSpan(r.date, parseShift(r)), key = r.staff_id + ':' + r.date;
    const lead = Math.min(120, Math.max(10, +pref.shiftReminderMin || 30)) * 60000;
    if (pref.shiftReminder && r.date === today && now >= sp.s - lead && now < sp.s && !openRecord(r.staff_id) && sentOnce('soon:' + key))
      notify(r.store_id, [r.staff_id], 'shift_soon', lang => ({ title: t(lang, 'N_SOON_T'), body: t(lang, 'N_SOON_B', { time: r.start, min: Math.round((sp.s - now) / 60000) }) }), { date: r.date });
    if (pref.outReminder && now >= sp.e + 30 * 60000 && now < sp.e + 3 * 3600000 && q1('SELECT 1 FROM records WHERE staff_id=? AND date=? AND out_at IS NULL', r.staff_id, r.date) && sentOnce('noout:' + key))
      notify(r.store_id, [r.staff_id], 'no_out', lang => ({ title: t(lang, 'N_NOOUT_T'), body: t(lang, 'N_NOOUT_B', { end: r.end }) }), { date: r.date });
  }
  run('DELETE FROM notif_sent WHERE at < ?', new Date(now - 7 * 86400000).toISOString());
}
route('GET', '/api/staff/notifications', 'staff', (c) => {
  const items = q('SELECT * FROM notifications WHERE staff_id=? ORDER BY created_at DESC LIMIT 100', c.s.staff.id).map(r => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, data: JSON.parse(r.data || '{}'), createdAt: r.created_at, readAt: r.read_at }));
  return { items, unread: items.filter(i => !i.readAt).length };
});
route('POST', '/api/staff/notifications/read', 'staff', (c) => {
  if (c.body.all) run('UPDATE notifications SET read_at=? WHERE staff_id=? AND read_at IS NULL', nowIso(), c.s.staff.id);
  else for (const id of (Array.isArray(c.body.ids) ? c.body.ids : []).slice(0, 200)) run('UPDATE notifications SET read_at=COALESCE(read_at, ?) WHERE id=? AND staff_id=?', nowIso(), String(id), c.s.staff.id);
  return { ok: true };
});
route('GET', '/api/staff/prefs', 'staff', (c) => prefsOf(c.s.staff));
route('PUT', '/api/staff/prefs', 'staff', (c) => {
  const p = prefsOf(c.s.staff), b = c.body;
  for (const k of ['shiftReminder', 'outReminder', 'scheduleChange']) if (k in b) p[k] = !!b[k];
  if ('shiftReminderMin' in b) p.shiftReminderMin = Math.min(120, Math.max(10, parseInt(b.shiftReminderMin) || 30));
  const row = q1('SELECT data FROM staff WHERE id=?', c.s.staff.id), d = JSON.parse(row.data || '{}'); d.prefs = p;
  run('UPDATE staff SET data=? WHERE id=?', JSON.stringify(d), c.s.staff.id);
  return p;
});

// 내 급여 (항목별)
function payItems(p, lang) {
  const R = p.rates || {}, w = fmtWon(lang, p.wage), items = [];
  const add = (key, label, amount, calc = '') => { if (amount) items.push({ key, label: t(lang, label), amount: Math.round(amount), calc }); };
  if (p.payType === 'monthly') add('base', 'BASE_PAY', p.base, t(lang, 'BASE_MONTHLY', { s: fmtWon(lang, p.monthlySalary), h: p.stdHours, r: w }));
  else add('base', 'BASE_PAY', p.base, `${hrsText(lang, p.workedMin)} × ${w}`);
  add('holidayPay', 'HOLIDAY_PAY', p.holidayPay, t(lang, 'CALC_HOLIDAY'));
  add('overtimePay', 'OT_PAY', p.overtimePay, `${hrsText(lang, p.overtimeMin)} × ${w} × ${R.overtime}%`);
  add('nightPay', 'NIGHT_PAY', p.nightPay, `${hrsText(lang, p.nightMin)} × ${w} × ${R.night}%`);
  add('holidayWorkPay', 'HOLIDAY_WORK_PAY', p.holidayWorkPay, `${hrsText(lang, p.holidayMin)} × ${R.holiday}% + ${hrsText(lang, p.holidayOver8Min)} × ${R.holidayOver8}%`);
  add('excessPay', 'EXCESS_PAY', p.excessPay, `${hrsText(lang, p.excessMin)} × ${w} × ${R.partTimeExcess}%`);
  add('publicHolidayPay', 'PAID_HOLIDAY', p.publicHolidayPay, (p.paidHolidays || []).map(h => mdText(lang, h.date)).join(', '));
  add('allowance', 'ALLOWANCE', p.allowance);
  return items;
}
const activePayslip = (staffId, from, to) => q1('SELECT * FROM payslips WHERE staff_id=? AND period_from=? AND period_to=? AND superseded_at IS NULL ORDER BY issued_at DESC LIMIT 1', staffId, from, to);
route('GET', '/api/staff/pay/months', 'staff', (c) => {
  const me = c.s.staff, cur = C.todayKst().slice(0, 7), start = (me.startDate || me.createdAt || cur).slice(0, 7), months = [];
  for (let m = cur; m >= start && months.length < 24; m = C.addDays(m + '-01', -1).slice(0, 7)) months.push(m);
  return { months };
});
route('GET', '/api/staff/pay', 'staff', (c) => {
  const me = c.s.staff, month = /^\d{4}-\d{2}$/.test(c.query.get('month') || '') ? c.query.get('month') : C.todayKst().slice(0, 7);
  if (month > C.todayKst().slice(0, 7)) fail(400, 'BAD_RANGE');
  const from = month + '-01', to = C.monthEnd(month), store = q1('SELECT * FROM stores WHERE id=?', me.storeId);
  const ps = activePayslip(me.id, from, to);
  const p = ps ? JSON.parse(ps.data) : payFor(store, me, from, to);
  return {
    month, from, to, payDay: storeSettings(store).payDay, payType: p.payType, hourlyWage: +me.hourlyWage || 0, monthlySalary: p.monthlySalary || 0, ordinaryRate: p.wage,
    workedMin: p.workedMin, days: p.days, items: payItems(p, c.lang), gross: p.gross,
    deductions: p.deductions.map(d => ({ key: d.key, label: t(c.lang, 'D_' + d.key), amount: d.amount })), deductionTotal: p.deductionTotal, net: p.net,
    estimate: !ps, payslipId: ps ? ps.id : null,
  };
});

// 임금명세서 확정·발송
route('POST', '/api/owner/payslips', 'owner', (c) => {
  const b = c.body;
  if (!isDate(b.from) || !isDate(b.to) || b.from > b.to) fail(400, 'BAD_RANGE');
  const store = q1('SELECT * FROM stores WHERE id=?', c.s.storeId);
  const want = Array.isArray(b.staffIds) && b.staffIds.length ? new Set(b.staffIds) : null;
  const list = payrollAll(c.s.storeId, b.from, b.to).filter(p => (!want || want.has(p.staffId)) && p.gross > 0);
  const storeInfo = { name: store.name, ownerName: store.owner_name, bizNo: SV.formatBizNo(store.biz_no), address: store.address };
  const issued = [];
  tx(() => {
    for (const p of list) {
      const st = getStaff(c.s.storeId, p.staffId);
      run('UPDATE payslips SET superseded_at=? WHERE staff_id=? AND period_from=? AND period_to=? AND superseded_at IS NULL', nowIso(), p.staffId, b.from, b.to);
      const id = uid(), data = { ...p, store: storeInfo, payDate: isDate(b.payDate) ? b.payDate : null, bilingual: st.nationality === 'FOREIGN' };
      run('INSERT INTO payslips(id,store_id,staff_id,period_from,period_to,pay_date,data,gross,net,issued_at) VALUES(?,?,?,?,?,?,?,?,?,?)', id, c.s.storeId, p.staffId, b.from, b.to, data.payDate, JSON.stringify(data), p.gross, p.net, nowIso());
      issued.push({ id, staffId: p.staffId, net: p.net });
    }
  });
  for (const x of issued) notify(c.s.storeId, [x.staffId], 'payslip', lang => ({ title: t(lang, 'N_PAYSLIP_T'), body: t(lang, 'N_PAYSLIP_B', { from: b.from.slice(5), to: b.to.slice(5), net: fmtWon(lang, x.net) }) }), { id: x.id });
  audit(c.s.storeId, c.s.user.login_id, `PAYSLIP ${b.from}~${b.to} ${issued.length}`);
  return { ok: true, count: issued.length };
});
route('GET', '/api/owner/payslips', 'owner', (c) => {
  const from = c.query.get('from'), to = c.query.get('to');
  return { items: q('SELECT p.id, p.staff_id, p.period_from, p.period_to, p.pay_date, p.net, p.issued_at, p.viewed_at, s.name FROM payslips p JOIN staff s ON s.id=p.staff_id WHERE p.store_id=? AND p.superseded_at IS NULL AND (? IS NULL OR (p.period_from=? AND p.period_to=?)) ORDER BY p.issued_at DESC LIMIT 300', c.s.storeId, from || null, from, to)
    .map(r => ({ id: r.id, staffId: r.staff_id, name: r.name, from: r.period_from, to: r.period_to, payDate: r.pay_date, net: r.net, issuedAt: r.issued_at, viewedAt: r.viewed_at })) };
});
route('GET', '/api/staff/payslips', 'staff', (c) => ({ items: q('SELECT * FROM payslips WHERE staff_id=? AND superseded_at IS NULL ORDER BY period_from DESC, issued_at DESC LIMIT 60', c.s.staff.id)
  .map(r => ({ id: r.id, from: r.period_from, to: r.period_to, payDate: r.pay_date, gross: r.gross, net: r.net, issuedAt: r.issued_at, viewedAt: r.viewed_at })) }));

// 인쇄용 문서(HTML) — 웹과 같은 docs.js 로 그립니다
// docs.js(웹과 같은 문서 코드)를 서버에서 실행해 완성된 HTML을 만듭니다 — 앱 WebView·PDF 저장에서 자바스크립트 없이 보입니다.
const vm = require('vm');
let DOCS = null;
function docsContext() {
  const src = fs.readFileSync(path.join(PUBLIC, 'docs.js'), 'utf8'), mtime = fs.statSync(path.join(PUBLIC, 'docs.js')).mtimeMs;
  if (DOCS && DOCS.mtime === mtime) return DOCS.ctx;
  const ctx = vm.createContext({
    $: () => null,
    esc: v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]),
    kstTime: iso => iso ? new Date(Date.parse(iso) + C.KST).toISOString().slice(11, 16) : '',
    dowOf: d => new Date(d + 'T00:00:00Z').getUTCDay(),
  });
  vm.runInContext(src + '\n;globalThis.__docs = { payslipHTML, contractHTML };', ctx, { timeout: 1000 });
  DOCS = { mtime, ctx }; return ctx;
}
function docPage(fn, args, title) {
  const css = fs.readFileSync(path.join(PUBLIC, 'style.css'), 'utf8');
  const body = docsContext().__docs[fn](...JSON.parse(JSON.stringify(args)));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/[<>&"]/g, '')}</title><style>${css}</style><style>body{background:#fff;margin:0;padding:14px}.doc{max-width:190mm}@media print{body{padding:0}}</style></head><body>${body}</body></html>`;
}
function sendHtml(c, html) {
  c.res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:" });
  c.res.end(html); return null;
}
const payslipDoc = r => { const d = JSON.parse(r.data); return docPage('payslipHTML', [d, d.store, d.payDate, d.bilingual], `임금명세서 ${r.period_from}~${r.period_to}`); };
route('GET', '/api/staff/payslips/:id/html', 'staff', (c) => {
  const r = q1('SELECT * FROM payslips WHERE id=? AND staff_id=?', c.p.id, c.s.staff.id); if (!r) fail(404, 'NOT_FOUND');
  run('UPDATE payslips SET viewed_at=COALESCE(viewed_at, ?) WHERE id=?', nowIso(), r.id);
  return sendHtml(c, payslipDoc(r));
});
route('GET', '/api/owner/payslips/:id/html', 'owner', (c) => { const r = q1('SELECT * FROM payslips WHERE id=? AND store_id=?', c.p.id, c.s.storeId); if (!r) fail(404, 'NOT_FOUND'); return sendHtml(c, payslipDoc(r)); });

// 근로계약서 앱 전달·교부 확인
function shareContract(storeId, id) {
  const r = q1('SELECT * FROM contracts WHERE id=? AND store_id=?', id, storeId); if (!r) fail(404, 'NOT_FOUND');
  run('UPDATE contracts SET shared_at=COALESCE(shared_at, ?) WHERE id=?', nowIso(), id);
  notify(storeId, [r.staff_id], 'contract', lang => ({ title: t(lang, 'N_CONTRACT_T'), body: t(lang, 'N_CONTRACT_B', { title: r.title }) }), { id });
}
route('POST', '/api/owner/contracts/:id/share', 'owner', (c) => { shareContract(c.s.storeId, c.p.id); audit(c.s.storeId, c.s.user.login_id, 'CONTRACT_SHARE'); return { ok: true }; });
route('GET', '/api/staff/contracts', 'staff', (c) => ({ items: q('SELECT id,title,created_at,shared_at,received_at FROM contracts WHERE staff_id=? AND shared_at IS NOT NULL ORDER BY created_at DESC', c.s.staff.id).map(r => ({ id: r.id, title: r.title, createdAt: r.created_at, sharedAt: r.shared_at, receivedAt: r.received_at })) }));
route('GET', '/api/staff/contracts/:id/html', 'staff', (c) => {
  const r = q1('SELECT * FROM contracts WHERE id=? AND staff_id=? AND shared_at IS NOT NULL', c.p.id, c.s.staff.id); if (!r) fail(404, 'NOT_FOUND');
  run('UPDATE contracts SET viewed_at=COALESCE(viewed_at, ?) WHERE id=?', nowIso(), r.id);
  return sendHtml(c, docPage('contractHTML', [JSON.parse(r.fields)], r.title));
});
route('POST', '/api/staff/contracts/:id/receive', 'staff', (c) => {
  const r = q1('SELECT * FROM contracts WHERE id=? AND staff_id=? AND shared_at IS NOT NULL', c.p.id, c.s.staff.id); if (!r) fail(404, 'NOT_FOUND');
  run('UPDATE contracts SET received_at=COALESCE(received_at, ?), viewed_at=COALESCE(viewed_at, ?) WHERE id=?', nowIso(), nowIso(), r.id);
  audit(c.s.storeId, c.s.staff.name, 'CONTRACT_RECEIVED');
  return { ok: true, receivedAt: q1('SELECT received_at FROM contracts WHERE id=?', r.id).received_at };
});

// 기록부 기기 등록·감사 기록·비밀번호
route('POST', '/api/owner/kiosk', 'owner', (c) => {
  const st = q1('SELECT * FROM stores WHERE id=?', c.s.storeId), s = storeSettings(st);
  if (!s.kioskVer) { s.kioskVer = uid(); saveSettings(st.id, s); }
  setCookie(c.res, 'ag_k', sign({ typ: 'kiosk', sid: st.id, v: s.kioskVer, exp: Date.now() + 3650 * 86400000 }), 3650 * 86400);
  return { ok: true };
});
route('POST', '/api/owner/kiosk/reset', 'owner', (c) => { const st = q1('SELECT * FROM stores WHERE id=?', c.s.storeId), s = storeSettings(st); s.kioskVer = uid(); saveSettings(st.id, s); return { ok: true }; });
route('GET', '/api/owner/audit', 'owner', (c) => q('SELECT at,who,what FROM audit WHERE store_id=? ORDER BY id DESC LIMIT 300', c.s.storeId));
route('POST', '/api/owner/password', 'owner', (c) => {
  const u = c.s.user;
  if (!checkPw(c.body.current, u.pw_salt, u.pw_hash)) fail(401, 'PW_WRONG');
  const pw = String(c.body.next || ''); if (pw.length < 8 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) fail(400, 'PW_WEAK');
  const h = hashPw(pw), v = uid(); run('UPDATE users SET pw_salt=?, pw_hash=?, sess_ver=? WHERE id=?', h.salt, h.hash, v, u.id);
  issueOwner(c.res, { ...u, sess_ver: v }); return { ok: true };
});

// ── HTTP 서버 ──
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
  const lang = (req.headers['x-lang'] || '').startsWith('en') ? 'en' : 'ko';
  try {
    const r = routes.find(x => x.method === req.method && x.re.test(url.pathname));
    if (!r) fail(404, 'NOT_FOUND');
    if (req.method !== 'GET' && req.headers.origin) { let h = ''; try { h = new URL(req.headers.origin).host; } catch {} if (h !== req.headers.host) fail(403, 'FORBIDDEN'); }
    const c = { req, res, lang, ip: clientIp(req), query: url.searchParams, p: r.re.exec(url.pathname).groups || {} };
    if (r.auth === 'kiosk') { c.k = kioskOf(req); if (!c.k) fail(401, 'KIOSK_REQUIRED'); }
    else if (r.auth) { c.s = session(req); if (!c.s || (r.auth !== 'any' && c.s.role !== r.auth)) fail(401, 'LOGIN_REQUIRED'); }
    c.body = req.method === 'GET' ? {} : await readBody(req, r.maxBody);
    let out = await r.fn(c);
    if (out === null) return;
    send(res, 200, out);
  } catch (e) {
    if (e instanceof AppError) return send(res, e.status, { code: e.code, params: e.params, message: t(lang, e.code, e.params) });
    console.error(e); send(res, 500, { code: 'SERVER_ERROR', message: t(lang, 'SERVER_ERROR') });
  }
});
if (require.main === module) server.listen(PORT, () => console.log(`알바고 실행 중: http://localhost:${PORT}${SV.DEV ? ' (개발 모드: 인증번호가 이 창에 표시됩니다)' : ''}`));
module.exports = { server, db, sweep, reminders };
