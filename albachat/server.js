'use strict';
// 알바챗 서버 — Node.js 18 이상, 외부 패키지 없음.
// 실행: node server.js  (기본 포트 8080, PORT 환경변수로 변경)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const calc = require('./calc');

const PORT = +process.env.PORT || 8080;
const DATA_DIR = process.env.ALBACHAT_DATA || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'albachat.json');
const KEY_FILE = path.join(DATA_DIR, 'secret.key');
const PUBLIC = path.join(__dirname, 'public');
const SECURE_COOKIE = process.env.ALBACHAT_SECURE_COOKIE === '1'; // HTTPS로 배포할 때 1

fs.mkdirSync(DATA_DIR, { recursive: true });

// ── 암호화 (주민등록번호·외국인등록번호·계좌번호: AES-256-GCM) ──────────────
function loadKey() {
  if (process.env.ALBACHAT_KEY) return Buffer.from(process.env.ALBACHAT_KEY, 'hex');
  if (!fs.existsSync(KEY_FILE)) fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
}
const KEY = loadKey();
function enc(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}
function dec(blob) {
  if (!blob) return '';
  try {
    const [, iv, tag, ct] = blob.split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  } catch { return '(복호화 실패)'; }
}
const hashSecret = (secret, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(String(secret), salt, 32).toString('hex') });
const checkSecret = (secret, rec) => !!rec && !!rec.hash && crypto.timingSafeEqual(Buffer.from(rec.hash, 'hex'), crypto.scryptSync(String(secret), rec.salt, 32));

// ── 저장소 (JSON 파일, 원자적 저장) ─────────────────────────────────────
const DEFAULT_SETTINGS = {
  store: { name: '', owner: '', bizNo: '', address: '', phone: '', industry: '', },
  minWages: { 2026: 10320, 2027: 10700 },
  fivePlus: false,          // 상시근로자 5인 이상: 연장·야간 가산(50%) 적용
  rounding: 1,              // 근무시간 계산 단위(분)
  breakAuto: true,          // 일정·기록에 휴게가 없으면 법정 최소 휴게 차감
  earlyFromSchedule: false, // 일찍 출근해도 예정 시작시각부터 인정
  payDay: 10,
  payMethod: 'account',
  insuranceRates: { pension: 4.75, health: 3.595, ltcOfHealth: 13.14, employment: 0.9 },
  allowedIps: [],           // 개인 휴대폰 출퇴근 허용 IP(매장 와이파이 공인 IP). 비우면 제한 없음
  geofence: { enabled: false, lat: '', lng: '', radius: 150 },
};
function load() {
  if (!fs.existsSync(DB_FILE)) return { version: 1, settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), staff: [], overrides: [], records: [], contracts: [], audit: [] };
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  db.settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...db.settings };
  for (const k of ['staff', 'overrides', 'records', 'contracts', 'audit']) db[k] = db[k] || [];
  return db;
}
let db = load();
if (!db.settings.sessionSecret) db.settings.sessionSecret = crypto.randomBytes(32).toString('hex');
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}
save();
function audit(who, what) {
  db.audit.push({ at: new Date().toISOString(), who, what });
  if (db.audit.length > 2000) db.audit.splice(0, db.audit.length - 2000);
}
const id = () => crypto.randomBytes(8).toString('hex');

// ── 토큰 (HMAC 서명 쿠키) ────────────────────────────────────────────────
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', db.settings.sessionSecret).update(body).digest('base64url');
}
function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const good = crypto.createHmac('sha256', db.settings.sessionSecret).update(body).digest('base64url');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp && p.exp > Date.now() ? p : null;
}
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
function setCookie(res, name, value, maxAgeSec) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
  if (SECURE_COOKIE) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [...prev, parts.join('; ')]);
}
const adminOf = req => { const p = verify(cookies(req).ac_admin); return p && p.role === 'admin' && p.v === db.settings.adminVersion ? p : null; };
const kioskOf = req => { const p = verify(cookies(req).ac_kiosk); return p && p.role === 'kiosk' && db.settings.kioskVersion === p.v ? p : null; };
function staffOf(req) {
  const p = verify(cookies(req).ac_staff);
  if (!p || p.role !== 'staff') return null;
  const s = db.staff.find(x => x.id === p.sid && x.active);
  return s && s.pinVersion === p.v ? s : null;
}

// ── PIN 시도 제한 ────────────────────────────────────────────────────────
const fails = new Map(); // key → {n, until}
function locked(key) { const f = fails.get(key); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 60000) : 0; }
function fail(key) { const f = fails.get(key) || { n: 0, until: 0 }; f.n++; if (f.n >= 5) { f.until = Date.now() + 5 * 60000; f.n = 0; } fails.set(key, f); }
const clientIp = req => (process.env.ALBACHAT_TRUST_PROXY === '1' && req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress || '').replace(/^::ffff:/, '');

// ── 공용 헬퍼 ───────────────────────────────────────────────────────────
const mask = rrn => { const d = String(rrn || '').replace(/\D/g, ''); return d ? d.slice(0, 6) + '-' + d.slice(6, 7) + '******' : ''; };
function publicStaff(s) {
  const { pin, pinSalt, pinHash, rrnEnc, alienNoEnc, accountEnc, ...rest } = s;
  return { ...rest, rrnMasked: mask(dec(rrnEnc)), alienNoMasked: mask(dec(alienNoEnc)), accountMasked: dec(accountEnc).replace(/\d(?=\d{4})/g, '*'), hasPin: !!pinHash };
}
const openRecord = sid => db.records.filter(r => r.staffId === sid && !r.out).sort((a, b) => b.in.localeCompare(a.in))[0];
function statusOf(s) {
  const o = openRecord(s.id);
  if (o && Date.now() - Date.parse(o.in) < 20 * 3600000) return { status: 'in', since: o.in };
  return { status: 'out' };
}
function weekSchedule(start) {
  const days = calc.datesBetween(start, calc.addDays(start, 6));
  return {
    start, days,
    rows: db.staff.filter(s => s.active).map(s => ({ id: s.id, name: s.name, color: s.color, shifts: days.map(d => calc.shiftFor(s, db.overrides, d)) }))
  };
}
function punch(staff, action, source) {
  const now = new Date().toISOString();
  const st = statusOf(staff);
  const today = calc.todayKst();
  const shift = calc.shiftFor(staff, db.overrides, today);
  if (action === 'in') {
    if (st.status === 'in') return { error: '이미 출근 상태입니다. 퇴근을 먼저 눌러 주세요.' };
    const rec = { id: id(), staffId: staff.id, date: today, in: now, out: null, brk: null, source, note: '' };
    db.records.push(rec);
    audit(staff.name, `출근 (${source})`); save();
    return { ok: true, action, at: now, name: staff.name, shift };
  }
  if (action === 'out') {
    const o = openRecord(staff.id);
    if (!o || st.status !== 'in') return { error: '출근 기록이 없습니다. 출근을 먼저 눌러 주세요. 출근을 잊었다면 관리자에게 알려 주세요.' };
    o.out = now; o.outSource = source;
    const m = calc.recordMinutes(o, staff, db.overrides, db.settings);
    audit(staff.name, `퇴근 (${source})`); save();
    return { ok: true, action, at: now, name: staff.name, workedMin: m.worked, brk: m.brk };
  }
  return { error: '알 수 없는 요청입니다.' };
}
function distanceM(a, b) {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function mobileAllowed(req, coords) {
  const s = db.settings;
  if (s.allowedIps && s.allowedIps.length && !s.allowedIps.includes(clientIp(req))) return '매장 와이파이에 연결된 상태에서만 출퇴근할 수 있습니다.';
  if (s.geofence && s.geofence.enabled) {
    if (!coords || coords.lat == null) return '위치 정보가 필요합니다. 위치 권한을 허용해 주세요.';
    const d = distanceM({ lat: +s.geofence.lat, lng: +s.geofence.lng }, coords);
    if (d > (+s.geofence.radius || 150)) return `매장에서 ${Math.round(d)}m 떨어져 있습니다. 매장 안에서 눌러 주세요.`;
  }
  return '';
}
const clean = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const validTime = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');
function cleanSchedule(sch) {
  const out = {};
  for (let d = 0; d < 7; d++) {
    const x = sch && sch[d];
    if (x && validTime(x.start) && validTime(x.end)) out[d] = { start: x.start, end: x.end, brk: Math.max(0, Math.min(600, parseInt(x.brk) || 0)) };
  }
  return out;
}
const STAFF_FIELDS = ['name', 'phone', 'emergencyName', 'emergencyRelation', 'emergencyPhone', 'birth', 'gender', 'nationality', 'country', 'homeAddress', 'address', 'visa', 'visaExpiry', 'bank', 'accountHolder', 'startDate', 'endDate', 'position', 'jobDesc', 'deduction', 'color', 'memo', 'healthCert'];
function applyStaff(s, b) {
  for (const k of STAFF_FIELDS) if (k in b) s[k] = clean(b[k], k === 'memo' || k === 'jobDesc' ? 1000 : 200);
  if ('hourlyWage' in b) s.hourlyWage = Math.max(0, parseInt(b.hourlyWage) || 0);
  if (b.rrn !== undefined && b.rrn !== '') s.rrnEnc = enc(clean(b.rrn, 20));
  if (b.alienNo !== undefined && b.alienNo !== '') s.alienNoEnc = enc(clean(b.alienNo, 20));
  if (b.account !== undefined && b.account !== '') s.accountEnc = enc(clean(b.account, 40));
  if (b.pin) {
    if (!/^\d{4,6}$/.test(b.pin)) return 'PIN은 숫자 4~6자리로 정해 주세요.';
    const h = hashSecret(b.pin); s.pinSalt = h.salt; s.pinHash = h.hash; s.pinVersion = id();
  }
  if (b.schedule) s.schedule = cleanSchedule(b.schedule);
  if (!s.name) return '이름을 입력해 주세요.';
  const phone = String(s.phone || '').replace(/\D/g, '');
  if (phone && db.staff.some(x => x.id !== s.id && x.active && String(x.phone || '').replace(/\D/g, '') === phone)) return '같은 연락처의 직원이 이미 있습니다.';
  return '';
}

// ── HTTP ────────────────────────────────────────────────────────────────
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 2e6) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(new Error('bad json')); } });
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };
function serveStatic(req, res, pathname) {
  const routes = { '/': 'index.html', '/me': 'me.html', '/admin': 'admin.html' };
  const file = path.normalize(path.join(PUBLIC, routes[pathname] || pathname));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  fs.createReadStream(file).pipe(res);
}

const routes = [];
const route = (method, pattern, auth, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), auth, fn });

// 키오스크(매장 POS)
route('GET', '/api/kiosk', 'kiosk', () => {
  const today = calc.todayKst();
  return {
    store: db.settings.store.name || '알바챗', today,
    staff: db.staff.filter(s => s.active).sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(s => ({ id: s.id, name: s.name, color: s.color, ...statusOf(s), shift: calc.shiftFor(s, db.overrides, today) })),
    week: weekSchedule(calc.weekStart(today)),
  };
});
route('POST', '/api/kiosk/punch', 'kiosk', (req, b) => {
  const s = db.staff.find(x => x.id === b.staffId && x.active);
  if (!s) return [404, { error: '직원을 찾을 수 없습니다.' }];
  const key = 'pin:' + s.id, wait = locked(key);
  if (wait) return [429, { error: `PIN을 여러 번 틀렸습니다. ${wait}분 뒤 다시 시도하세요.` }];
  if (!checkSecret(b.pin, { salt: s.pinSalt, hash: s.pinHash })) { fail(key); return [401, { error: 'PIN이 맞지 않습니다.' }]; }
  fails.delete(key);
  if (b.action === 'check') return { ok: true, name: s.name, ...statusOf(s), shift: calc.shiftFor(s, db.overrides, calc.todayKst()) };
  const r = punch(s, b.action, 'kiosk');
  return r.error ? [409, r] : r;
});

// 직원 개인 휴대폰(PWA)
route('POST', '/api/me/login', null, (req, b) => {
  const phone = String(b.phone || '').replace(/\D/g, '');
  const ipKey = 'ip:' + clientIp(req), wait = locked(ipKey);
  if (wait) return [429, { error: `여러 번 틀렸습니다. ${wait}분 뒤 다시 시도하세요.` }];
  const s = db.staff.find(x => x.active && phone && String(x.phone || '').replace(/\D/g, '') === phone);
  if (!s || !checkSecret(b.pin, { salt: s.pinSalt, hash: s.pinHash })) { fail(ipKey); return [401, { error: '연락처 또는 PIN이 맞지 않습니다.' }]; }
  fails.delete(ipKey);
  return { ok: true, _cookie: ['ac_staff', sign({ role: 'staff', sid: s.id, v: s.pinVersion, exp: Date.now() + 180 * 86400000 }), 180 * 86400] };
});
route('POST', '/api/me/logout', null, () => ({ ok: true, _cookie: ['ac_staff', '', 0] }));
route('GET', '/api/me', 'staff', (req, b, s) => {
  const today = calc.todayKst(), month = today.slice(0, 7);
  const from = month + '-01', to = calc.addDays(calc.addDays(from, 32).slice(0, 7) + '-01', -1);
  const recs = db.records.filter(r => r.staffId === s.id && r.date >= calc.addDays(from, -7) && r.date <= calc.addDays(to, 7));
  const pay = calc.payroll({ staff: s, records: recs, overrides: db.overrides, settings: db.settings, from, to });
  const ws = calc.weekStart(today);
  return {
    store: db.settings.store.name || '알바챗', name: s.name, today, ...statusOf(s), wage: s.hourlyWage,
    shifts: calc.datesBetween(ws, calc.addDays(ws, 13)).map(d => ({ date: d, shift: calc.shiftFor(s, db.overrides, d) })),
    records: recs.filter(r => r.date >= from && r.date <= to).sort((a, b) => b.in.localeCompare(a.in)).map(r => ({ date: r.date, in: r.in, out: r.out })),
    pay: { from, to, workedMin: pay.workedMin, base: pay.base, holidayPay: pay.holidayPay, overtimePay: pay.overtimePay, nightPay: pay.nightPay, gross: pay.gross, net: pay.net, deductionTotal: pay.deductionTotal, weeks: pay.weeks },
    needsLocation: !!(db.settings.geofence && db.settings.geofence.enabled),
  };
});
route('POST', '/api/me/punch', 'staff', (req, b, s) => {
  const why = mobileAllowed(req, b.coords);
  if (why) return [403, { error: why }];
  const r = punch(s, b.action, 'mobile');
  return r.error ? [409, r] : r;
});

// 관리자
route('GET', '/api/admin/state', null, req => ({ setup: !!(db.settings.admin && db.settings.admin.hash), loggedIn: !!adminOf(req), kiosk: !!kioskOf(req), store: db.settings.store.name }));
route('POST', '/api/admin/setup', null, (req, b) => {
  if (db.settings.admin && db.settings.admin.hash) return [409, { error: '이미 설정되었습니다.' }];
  if (String(b.password || '').length < 8) return [400, { error: '관리자 비밀번호는 8자 이상으로 정해 주세요.' }];
  db.settings.admin = hashSecret(b.password); db.settings.adminVersion = id();
  db.settings.store.name = clean(b.storeName) || db.settings.store.name;
  audit('관리자', '최초 설정'); save();
  return { ok: true, _cookie: ['ac_admin', sign({ role: 'admin', v: db.settings.adminVersion, exp: Date.now() + 12 * 3600000 }), 12 * 3600] };
});
route('POST', '/api/admin/login', null, (req, b) => {
  const key = 'admin:' + clientIp(req), wait = locked(key);
  if (wait) return [429, { error: `여러 번 틀렸습니다. ${wait}분 뒤 다시 시도하세요.` }];
  if (!checkSecret(b.password, db.settings.admin)) { fail(key); return [401, { error: '비밀번호가 맞지 않습니다.' }]; }
  fails.delete(key);
  return { ok: true, _cookie: ['ac_admin', sign({ role: 'admin', v: db.settings.adminVersion, exp: Date.now() + 12 * 3600000 }), 12 * 3600] };
});
route('POST', '/api/admin/logout', null, () => ({ ok: true, _cookie: ['ac_admin', '', 0] }));
route('POST', '/api/admin/password', 'admin', (req, b) => {
  if (!checkSecret(b.current, db.settings.admin)) return [401, { error: '현재 비밀번호가 맞지 않습니다.' }];
  if (String(b.next || '').length < 8) return [400, { error: '새 비밀번호는 8자 이상이어야 합니다.' }];
  db.settings.admin = hashSecret(b.next); db.settings.adminVersion = id(); audit('관리자', '비밀번호 변경'); save();
  return { ok: true, _cookie: ['ac_admin', sign({ role: 'admin', v: db.settings.adminVersion, exp: Date.now() + 12 * 3600000 }), 12 * 3600] };
});
route('POST', '/api/admin/kiosk', 'admin', (req, b) => {
  if (!db.settings.kioskVersion) db.settings.kioskVersion = id();
  save();
  return { ok: true, _cookie: ['ac_kiosk', sign({ role: 'kiosk', v: db.settings.kioskVersion, exp: Date.now() + 3650 * 86400000 }), 3650 * 86400] };
});
route('POST', '/api/admin/kiosk/reset', 'admin', () => { db.settings.kioskVersion = id(); audit('관리자', '모든 출퇴근 단말기 등록 해제'); save(); return { ok: true }; });
route('GET', '/api/admin/data', 'admin', req => {
  const { admin, sessionSecret, kioskVersion, adminVersion, ...settings } = db.settings;
  const today = calc.todayKst();
  return {
    settings, today, clientIp: clientIp(req),
    staff: db.staff.map(s => ({ ...publicStaff(s), ...statusOf(s) })),
    overrides: db.overrides, contracts: db.contracts.map(c => ({ id: c.id, staffId: c.staffId, type: c.type, createdAt: c.createdAt, title: c.title })),
  };
});
route('PUT', '/api/admin/settings', 'admin', (req, b) => {
  const s = db.settings;
  if (b.store) for (const k of ['name', 'owner', 'bizNo', 'address', 'phone', 'industry']) if (k in b.store) s.store[k] = clean(b.store[k]);
  if (b.minWages) s.minWages = Object.fromEntries(Object.entries(b.minWages).filter(([y, v]) => /^\d{4}$/.test(y) && +v > 0).map(([y, v]) => [y, +v]));
  for (const k of ['fivePlus', 'breakAuto', 'earlyFromSchedule']) if (k in b) s[k] = !!b[k];
  if ('rounding' in b) s.rounding = [1, 5, 10, 15, 30].includes(+b.rounding) ? +b.rounding : 1;
  if ('payDay' in b) s.payDay = Math.min(31, Math.max(1, parseInt(b.payDay) || 10));
  if ('payMethod' in b) s.payMethod = b.payMethod === 'direct' ? 'direct' : 'account';
  if (b.insuranceRates) for (const k of Object.keys(DEFAULT_SETTINGS.insuranceRates)) if (k in b.insuranceRates) s.insuranceRates[k] = Math.max(0, +b.insuranceRates[k] || 0);
  if (Array.isArray(b.allowedIps)) s.allowedIps = b.allowedIps.map(x => clean(x, 60)).filter(Boolean).slice(0, 20);
  if (b.geofence) s.geofence = { enabled: !!b.geofence.enabled, lat: clean(b.geofence.lat, 20), lng: clean(b.geofence.lng, 20), radius: Math.max(30, parseInt(b.geofence.radius) || 150) };
  audit('관리자', '설정 변경'); save();
  return { ok: true };
});
route('POST', '/api/admin/staff', 'admin', (req, b) => {
  const s = { id: id(), active: true, schedule: {}, nationality: 'KR', deduction: 'none', createdAt: new Date().toISOString() };
  const err = applyStaff(s, b);
  if (err) return [400, { error: err }];
  db.staff.push(s); audit('관리자', `직원 등록: ${s.name}`); save();
  return { ok: true, id: s.id };
});
route('PUT', '/api/admin/staff/:id', 'admin', (req, b, _, p) => {
  const s = db.staff.find(x => x.id === p.id);
  if (!s) return [404, { error: '직원을 찾을 수 없습니다.' }];
  const copy = JSON.parse(JSON.stringify(s));
  const err = applyStaff(copy, b);
  if (err) return [400, { error: err }];
  if ('active' in b) copy.active = !!b.active;
  Object.assign(s, copy); audit('관리자', `직원 수정: ${s.name}`); save();
  return { ok: true };
});
route('GET', '/api/admin/staff/:id/sensitive', 'admin', (req, b, _, p) => {
  const s = db.staff.find(x => x.id === p.id);
  if (!s) return [404, { error: '직원을 찾을 수 없습니다.' }];
  audit('관리자', `개인정보 열람: ${s.name}`); save();
  return { rrn: dec(s.rrnEnc), alienNo: dec(s.alienNoEnc), account: dec(s.accountEnc) };
});
route('DELETE', '/api/admin/staff/:id', 'admin', (req, b, _, p) => {
  const s = db.staff.find(x => x.id === p.id);
  if (!s) return [404, { error: '직원을 찾을 수 없습니다.' }];
  if (db.records.some(r => r.staffId === s.id)) return [409, { error: '출퇴근 기록이 있는 직원은 삭제할 수 없습니다. 퇴사 처리를 해 주세요. (근로기준법상 근로자명부·임금대장은 3년 보존)' }];
  db.staff = db.staff.filter(x => x.id !== s.id); db.overrides = db.overrides.filter(o => o.staffId !== s.id);
  audit('관리자', `직원 삭제: ${s.name}`); save();
  return { ok: true };
});
route('GET', '/api/admin/week', 'admin', req => {
  const q = new URL(req.url, 'http://x').searchParams;
  const d = validDate(q.get('date')) ? q.get('date') : calc.todayKst();
  return weekSchedule(calc.weekStart(d));
});
route('POST', '/api/admin/overrides', 'admin', (req, b) => {
  if (!db.staff.some(s => s.id === b.staffId) || !validDate(b.date)) return [400, { error: '직원과 날짜를 확인해 주세요.' }];
  db.overrides = db.overrides.filter(o => !(o.staffId === b.staffId && o.date === b.date));
  if (b.mode === 'reset') { save(); return { ok: true }; }
  if (b.mode === 'off') db.overrides.push({ id: id(), staffId: b.staffId, date: b.date, off: true });
  else {
    if (!validTime(b.start) || !validTime(b.end)) return [400, { error: '시작·종료 시각을 확인해 주세요.' }];
    db.overrides.push({ id: id(), staffId: b.staffId, date: b.date, start: b.start, end: b.end, brk: Math.max(0, parseInt(b.brk) || 0) });
  }
  save(); return { ok: true };
});
route('GET', '/api/admin/records', 'admin', req => {
  const q = new URL(req.url, 'http://x').searchParams;
  const from = validDate(q.get('from')) ? q.get('from') : calc.todayKst(), to = validDate(q.get('to')) ? q.get('to') : from;
  const rows = db.records.filter(r => r.date >= from && r.date <= to && (!q.get('staffId') || r.staffId === q.get('staffId')))
    .sort((a, b) => b.in.localeCompare(a.in))
    .map(r => { const s = db.staff.find(x => x.id === r.staffId); return { ...r, name: s ? s.name : '(삭제됨)', calc: s ? calc.recordMinutes(r, s, db.overrides, db.settings) : null, shift: s ? calc.shiftFor(s, db.overrides, r.date) : null }; });
  return { from, to, rows };
});
function recordFromBody(r, b) {
  if (!validDate(b.date) || !validTime(b.inTime)) return '날짜와 출근 시각을 확인해 주세요.';
  r.date = b.date;
  r.in = new Date(calc.kstEpoch(b.date, calc.hm(b.inTime))).toISOString();
  if (b.outTime) {
    if (!validTime(b.outTime)) return '퇴근 시각을 확인해 주세요.';
    let out = calc.kstEpoch(b.date, calc.hm(b.outTime));
    if (out <= Date.parse(r.in)) out += 86400000; // 다음 날 퇴근
    r.out = new Date(out).toISOString();
  } else r.out = null;
  r.brk = b.brk === '' || b.brk == null ? null : Math.max(0, parseInt(b.brk) || 0);
  r.note = clean(b.note, 300);
  r.edited = true;
  return '';
}
route('POST', '/api/admin/records', 'admin', (req, b) => {
  const s = db.staff.find(x => x.id === b.staffId);
  if (!s) return [400, { error: '직원을 선택해 주세요.' }];
  const r = { id: id(), staffId: s.id, source: 'admin' };
  const err = recordFromBody(r, b);
  if (err) return [400, { error: err }];
  db.records.push(r); audit('관리자', `기록 추가: ${s.name} ${r.date}`); save();
  return { ok: true };
});
route('PUT', '/api/admin/records/:id', 'admin', (req, b, _, p) => {
  const r = db.records.find(x => x.id === p.id);
  if (!r) return [404, { error: '기록을 찾을 수 없습니다.' }];
  const before = JSON.stringify({ in: r.in, out: r.out, brk: r.brk });
  const copy = { ...r };
  const err = recordFromBody(copy, b);
  if (err) return [400, { error: err }];
  Object.assign(r, copy); r.history = [...(r.history || []), { at: new Date().toISOString(), before }];
  audit('관리자', `기록 수정: ${r.date}`); save();
  return { ok: true };
});
route('DELETE', '/api/admin/records/:id', 'admin', (req, b, _, p) => {
  const r = db.records.find(x => x.id === p.id);
  if (!r) return [404, { error: '기록을 찾을 수 없습니다.' }];
  db.records = db.records.filter(x => x.id !== p.id); audit('관리자', `기록 삭제: ${r.date} ${r.in}`); save();
  return { ok: true };
});
route('GET', '/api/admin/payroll', 'admin', req => {
  const q = new URL(req.url, 'http://x').searchParams;
  const from = q.get('from'), to = q.get('to');
  if (!validDate(from) || !validDate(to) || from > to) return [400, { error: '기간을 확인해 주세요.' }];
  const lo = calc.addDays(from, -7), hi = calc.addDays(to, 7);
  const recs = db.records.filter(r => r.date >= lo && r.date <= hi);
  const list = db.staff.filter(s => s.active || recs.some(r => r.staffId === s.id && r.date >= from && r.date <= to))
    .filter(s => !q.get('staffId') || s.id === q.get('staffId'))
    .map(s => ({ ...calc.payroll({ staff: s, records: recs, overrides: db.overrides, settings: db.settings, from, to }), deduction: s.deduction, bank: s.bank, accountMasked: dec(s.accountEnc).replace(/\d(?=\d{4})/g, '*'), birth: s.birth, position: s.position, startDate: s.startDate }));
  return { from, to, list, store: db.settings.store, settings: { fivePlus: db.settings.fivePlus, payDay: db.settings.payDay } };
});
route('POST', '/api/admin/contracts', 'admin', (req, b) => {
  const s = db.staff.find(x => x.id === b.staffId);
  if (!s) return [400, { error: '직원을 선택해 주세요.' }];
  const c = { id: id(), staffId: s.id, type: clean(b.type, 30), title: clean(b.title, 100), fields: b.fields || {}, createdAt: new Date().toISOString() };
  db.contracts.push(c); audit('관리자', `근로계약서 작성: ${s.name} (${c.title})`); save();
  return { ok: true, id: c.id };
});
route('GET', '/api/admin/contracts/:id', 'admin', (req, b, _, p) => db.contracts.find(c => c.id === p.id) || [404, { error: '없음' }]);
route('DELETE', '/api/admin/contracts/:id', 'admin', (req, b, _, p) => { db.contracts = db.contracts.filter(c => c.id !== p.id); save(); return { ok: true }; });
route('GET', '/api/admin/audit', 'admin', () => db.audit.slice(-300).reverse());
route('GET', '/api/admin/backup', 'admin', (req, b, _, p, res) => {
  audit('관리자', '백업 내려받기'); save();
  res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="albachat-backup-${calc.todayKst()}.json"` });
  res.end(JSON.stringify(db));
  return null;
});

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);
  const r = routes.find(x => x.method === req.method && x.re.test(pathname));
  if (!r) return send(res, 404, { error: '없는 주소입니다.' });
  if (req.method !== 'GET') {
    // 다른 사이트에서 보낸 요청 차단 (CSRF)
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: '허용되지 않은 요청입니다.' });
  }
  let who = null;
  if (r.auth === 'admin' && !(who = adminOf(req))) return send(res, 401, { error: '관리자 로그인이 필요합니다.', login: true });
  if (r.auth === 'kiosk' && !(who = kioskOf(req))) return send(res, 401, { error: '이 기기는 출퇴근 단말기로 등록되지 않았습니다.', kiosk: true });
  if (r.auth === 'staff' && !(who = staffOf(req))) return send(res, 401, { error: '로그인이 필요합니다.', login: true });
  try {
    const body = req.method === 'GET' ? {} : await readBody(req);
    let out = await r.fn(req, body, who, r.re.exec(pathname).groups || {}, res);
    if (out === null) return;
    let code = 200;
    if (Array.isArray(out)) [code, out] = out;
    if (out && out._cookie) { setCookie(res, ...out._cookie); delete out._cookie; }
    send(res, code, out);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: '처리 중 오류가 발생했습니다.' });
  }
});
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`알바챗 실행 중: http://localhost:${PORT}`);
    console.log(`  출퇴근(POS): http://localhost:${PORT}/   관리자: http://localhost:${PORT}/admin   직원 휴대폰: http://localhost:${PORT}/me`);
  });
}
module.exports = { server };
