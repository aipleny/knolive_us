'use strict';
// 외부 연동: 이메일(SMTP), 문자(솔라피), 국세청 사업자 상태조회, 카카오 주소→좌표.
// 설정이 없으면 개발 모드로 동작합니다(인증번호를 서버 로그에 출력).
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const env = process.env;
const DEV = env.ALBAGO_DEV === '1';

// ── 사업자등록번호 형식·검증번호 확인 ──
function bizNoValid(no) {
  const d = String(no || '').replace(/\D/g, '');
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let s = w.reduce((a, k, i) => a + k * +d[i], 0);
  s += Math.floor(+d[8] * 5 / 10);
  return (10 - (s % 10)) % 10 === +d[9];
}
const formatBizNo = no => { const d = String(no).replace(/\D/g, ''); return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`; };

// ── 국세청 사업자등록 상태조회 (공공데이터포털 serviceKey 필요) ──
async function bizStatus(no) {
  const d = String(no).replace(/\D/g, '');
  if (!env.NTS_SERVICE_KEY) return { checked: false };
  const r = await fetch(`https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(env.NTS_SERVICE_KEY)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ b_no: [d] }), signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('NTS ' + r.status);
  const item = ((await r.json()).data || [])[0] || {};
  // b_stt_cd: 01 계속사업자, 02 휴업자, 03 폐업자, 빈 값: 등록되지 않은 번호
  return { checked: true, code: item.b_stt_cd || '', active: item.b_stt_cd === '01', status: item.b_stt || item.tax_type || '' };
}

// ── 이메일 (SMTP: 465 SSL 또는 587 STARTTLS) ──
function smtpSend({ to, subject, text }) {
  const host = env.SMTP_HOST, port = +env.SMTP_PORT || 465, user = env.SMTP_USER, pass = env.SMTP_PASS, from = env.SMTP_FROM || user;
  const secure = env.SMTP_SECURE || (port === 465 ? 'ssl' : port === 587 ? 'starttls' : 'none');
  return new Promise((resolve, reject) => {
    let sock, buf = '', step = 0;
    const timer = setTimeout(() => { sock && sock.destroy(); reject(new Error('SMTP timeout')); }, 20000);
    const b64 = s => Buffer.from(s, 'utf8').toString('base64');
    const msg = [`From: 알바고 <${from}>`, `To: <${to}>`, `Subject: =?UTF-8?B?${b64(subject)}?=`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@albago>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text).replace(/.{76}/g, '$&\r\n'), '.'].join('\r\n');
    const plan = () => [
      ['EHLO albago.kr', 250],
      ...(secure === 'starttls' && !sock.encrypted ? [['STARTTLS', 220, 'upgrade']] : []),
      ...(user ? [['AUTH LOGIN', 334], [b64(user), 334], [b64(pass), 235]] : []),
      [`MAIL FROM:<${from}>`, 250], [`RCPT TO:<${to}>`, 250], ['DATA', 354], [msg, 250], ['QUIT', 221],
    ];
    let cmds = null;
    const write = () => { const c = cmds[step]; sock.write(c[0] + '\r\n'); };
    const onData = chunk => {
      buf += chunk.toString();
      const lines = buf.split('\r\n'); if (!/^\d{3} /m.test(lines.filter(Boolean).slice(-1)[0] || '')) return;
      const last = lines.filter(Boolean).slice(-1)[0]; buf = '';
      const code = +last.slice(0, 3);
      if (cmds === null) { if (code !== 220) return fail(last); cmds = plan(); return write(); }
      const [, expect, action] = cmds[step];
      if (code !== expect) return fail(last);
      if (action === 'upgrade') {
        sock.removeAllListeners('data');
        sock = tls.connect({ socket: sock, servername: host }, () => { cmds = plan().filter(c => c[0] !== 'STARTTLS'); step = 0; write(); });
        sock.on('data', onData); sock.on('error', fail); return;
      }
      step++;
      if (step >= cmds.length) { clearTimeout(timer); sock.end(); return resolve(true); }
      write();
    };
    const fail = e => { clearTimeout(timer); try { sock.destroy(); } catch {} reject(e instanceof Error ? e : new Error('SMTP: ' + e)); };
    sock = secure === 'ssl' ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    sock.on('data', onData); sock.on('error', fail);
  });
}
async function sendEmail(to, subject, text) {
  if (!env.SMTP_HOST) { console.log(`[개발 모드 이메일] ${to} · ${subject}\n${text}`); return { dev: true }; }
  await smtpSend({ to, subject, text }); return { dev: false };
}

// ── 문자 (솔라피 SOLAPI_KEY / SOLAPI_SECRET / SOLAPI_SENDER) ──
async function sendSms(to, text) {
  if (!env.SOLAPI_KEY) { console.log(`[개발 모드 문자] ${to} · ${text}`); return { dev: true }; }
  const date = new Date().toISOString(), salt = crypto.randomBytes(16).toString('hex');
  const signature = crypto.createHmac('sha256', env.SOLAPI_SECRET).update(date + salt).digest('hex');
  const r = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/json', Authorization: `HMAC-SHA256 apiKey=${env.SOLAPI_KEY}, date=${date}, salt=${salt}, signature=${signature}` },
    body: JSON.stringify({ message: { to: to.replace(/\D/g, ''), from: env.SOLAPI_SENDER, text } }),
  });
  if (!r.ok) throw new Error('SMS ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return { dev: false };
}

// ── 카카오 로컬: 주소 → 좌표 (KAKAO_REST_KEY) ──
async function geocode(address) {
  if (!env.KAKAO_REST_KEY) return null;
  const r = await fetch('https://dapi.kakao.com/v2/local/search/address.json?query=' + encodeURIComponent(address), { headers: { Authorization: 'KakaoAK ' + env.KAKAO_REST_KEY }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('KAKAO ' + r.status);
  const doc = ((await r.json()).documents || [])[0];
  return doc ? { lat: +doc.y, lng: +doc.x, address: doc.address_name } : null;
}

function distanceM(a, b) {
  const R = 6371000, rad = v => v * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

module.exports = { DEV, bizNoValid, formatBizNo, bizStatus, sendEmail, smtpSend, sendSms, geocode, distanceM };
