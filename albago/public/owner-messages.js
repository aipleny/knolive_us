'use strict';
// 사장님 ↔ 알바 소통 채널 (기록은 삭제·수정 불가)
let MSG_SEL = 'notice', MSG_DATA = null;
const OWNER_KINDS = ['instruction', 'general', 'warning', 'discipline', 'dismissal'];
const ACK_KINDS = new Set(['notice', 'instruction', 'warning', 'discipline', 'dismissal']);
const KIND_COLOR = { notice: '#2459e0', instruction: '#2459e0', general: '#5d6b7e', warning: '#d4570f', discipline: '#b42318', dismissal: '#b42318', suggestion: '#14966b', absence_reason: '#9a6700', schedule_request: '#6b4fd8' };
const kindPill = k => `<span class="pill" style="background:${KIND_COLOR[k]}1a;color:${KIND_COLOR[k]}">${t('MK_' + k)}</span>`;
const dt = iso => iso ? `${kstDate(iso)} ${kstTime(iso)}` : '';

async function renderMessages() {
  MSG_DATA = await api('/api/owner/messages?staffId=' + encodeURIComponent(MSG_SEL));
  const staff = O.staff.filter(s => s.status !== 'pending');
  const u = MSG_DATA.unread;
  const isNotice = MSG_SEL === 'notice', st = staffById(MSG_SEL);
  panel('messages').innerHTML = `
  <div class="spread section"><h2>${t('TAB_MESSAGES')}</h2><div class="row"><button class="btn" id="msg-verify">${t('CHAIN_CHECK')}</button><button class="btn" id="msg-xlsx">${t('EXCEL_MESSAGES')}</button></div></div>
  <div class="infobox">${t('MSG_RECORD_NOTE')}</div>
  <div class="msg-layout">
    <div class="card msg-list"><button class="msg-who ${isNotice ? 'active' : ''}" data-who="notice">📢 ${t('MK_notice')}</button>
      ${staff.map(s => `<button class="msg-who ${MSG_SEL === s.id ? 'active' : ''}" data-who="${s.id}"><span style="color:${esc(s.color || '#2459e0')}">●</span> ${esc(s.name)}${s.status === 'retired' ? ` <small class="muted">(${t('RETIRED')})</small>` : ''}${u[s.id] ? ` <span class="badge">${u[s.id]}</span>` : ''}</button>`).join('')}</div>
    <div>
      <form class="card section" id="msg-form"><h3>${isNotice ? t('NEW_NOTICE') : t('NEW_MSG_TO', { name: st ? st.name : '' })}</h3>
        <div class="grid g3" style="margin-top:10px">
          <label class="f"><span>${t('X_KIND')}</span><select name="kind" ${isNotice ? 'disabled' : ''}>${(isNotice ? ['notice'] : OWNER_KINDS).map(k => `<option value="${k}">${t('MK_' + k)}</option>`).join('')}</select></label>
          <label class="f"><span id="msg-date-label">${t('RELATED_DATE')}</span><input type="date" name="date"></label>
          <label class="f"><span>${t('X_TITLE')}</span><input name="title" maxlength="120"></label>
          <label class="f" style="grid-column:1/-1"><span>${t('X_BODY')}</span><textarea name="body" required maxlength="5000" style="min-height:110px"></textarea></label>
          <label class="f"><span>${t('ATTACH')}</span><input type="file" name="files" multiple accept="image/*,application/pdf"></label>
          <label class="chk" style="align-self:end"><input type="checkbox" name="requiresAck" checked> ${t('REQUIRE_ACK')}</label>
        </div>
        <div id="msg-guide"></div>
        <div class="row" style="margin-top:12px"><button class="btn primary">${t('SEND')}</button><span class="muted">${t('MSG_NO_EDIT')}</span></div>
      </form>
      <div id="msg-thread">${MSG_DATA.items.map(card).join('') || `<p class="muted">${t('NO_MESSAGES')}</p>`}</div>
    </div>
  </div>`;
  $$('[data-who]').forEach(b => b.onclick = () => { MSG_SEL = b.dataset.who; renderMessages(); });
  const f = $('#msg-form');
  const guide = () => { const k = isNotice ? 'notice' : f.kind.value; f.requiresAck.checked = ACK_KINDS.has(k); $('#msg-date-label').textContent = t(k === 'dismissal' ? 'DISMISS_DATE' : 'RELATED_DATE'); $('#msg-guide').innerHTML = ['warning', 'discipline', 'dismissal'].includes(k) ? `<div class="warnbox">${t('GUIDE_' + k.toUpperCase())}</div>` : ''; };
  if (!isNotice) f.kind.onchange = guide; guide();
  f.onsubmit = async e => {
    e.preventDefault();
    const files = [...f.files.files];
    if (files.length > 3) return toast(t('ATT_MAX'), 'error');
    if (files.some(x => x.size > 5 * 1024 * 1024)) return toast(t('ATT_SIZE'), 'error');
    const kind = isNotice ? 'notice' : f.kind.value;
    if (!confirm(t('SEND_CONFIRM', { kind: t('MK_' + kind) }))) return;
    const attachments = await Promise.all(files.map(x => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ name: x.name, type: x.type, data: String(r.result).split(',')[1] }); r.onerror = rej; r.readAsDataURL(x); })));
    try { await api('/api/owner/messages', { method: 'POST', body: { staffId: isNotice ? null : MSG_SEL, kind, title: f.title.value, body: f.body.value, date: f.date.value, requiresAck: f.requiresAck.checked, attachments } }); toast(t('SENT'), 'ok'); renderMessages(); }
    catch (err) { fail(err); }
  };
  $$('[data-att]').forEach(a => a.onclick = async e => { e.preventDefault(); const r = await fetch('/api/owner/attachments/' + a.dataset.att); if (!r.ok) return toast(t('NOT_FOUND'), 'error'); window.open(URL.createObjectURL(await r.blob()), '_blank'); });
  $$('[data-print]').forEach(b => b.onclick = () => printDoc(noticeHTML(MSG_DATA.items.find(m => m.id === b.dataset.print))));
  $('#msg-verify').onclick = async () => { const r = await api('/api/owner/messages/verify'); r.ok ? toast(t('CHAIN_OK_N', { n: r.count }), 'ok') : toast(t('CHAIN_BROKEN_AT', { at: dt(r.at) }), 'error'); };
  $('#msg-xlsx').onclick = () => download(`/api/owner/export/messages.xlsx?from=${addDays(O.today, -365)}&to=${O.today}`);
}
function card(m) {
  const fromOwner = m.from === 'owner', formal = ['notice', 'instruction', 'warning', 'discipline', 'dismissal', 'absence_reason'].includes(m.kind);
  const status = fromOwner
    ? (m.receipts ? `${t('READ_N', { n: m.receipts.filter(r => r.readAt).length, total: m.receipts.length })}${m.requiresAck ? ' · ' + t('ACK_N', { n: m.receipts.filter(r => r.ackAt).length, total: m.receipts.length }) : ''}`
      : `${m.readAt ? t('READ_AT', { at: dt(m.readAt) }) : t('UNREAD')}${m.requiresAck ? ' · ' + (m.ackAt ? `<b style="color:var(--in)">${t('ACK_AT', { at: dt(m.ackAt) })}</b>` : `<b style="color:var(--out)">${t('ACK_WAIT')}</b>`) : ''}`)
    : (m.ownerReadAt ? t('READ_AT', { at: dt(m.ownerReadAt) }) : t('UNREAD'));
  return `<div class="card section msg-card ${fromOwner ? 'mine' : 'theirs'}" style="border-left:5px solid ${KIND_COLOR[m.kind]}">
    <div class="spread"><div class="row">${kindPill(m.kind)} <b>${esc(m.title || '')}</b>${m.date ? `<span class="muted">· ${t(m.kind === 'dismissal' ? 'DISMISS_DATE' : 'RELATED_DATE')} ${esc(m.date)}</span>` : ''}</div>
    <div class="row">${formal ? `<button class="btn small" data-print="${m.id}">${t('PRINT')}</button>` : ''}</div></div>
    <p style="white-space:pre-wrap;margin:10px 0">${esc(m.body)}</p>
    ${m.attachments.length ? `<p>${m.attachments.map(a => `📎 <a href="#" data-att="${a.id}">${esc(a.name)}</a> <small class="muted">(${Math.ceil(a.size / 1024)}KB)</small>`).join(' &nbsp; ')}</p>` : ''}
    <p class="muted">${fromOwner ? t('FROM_OWNER') : esc(m.senderName)} · ${dt(m.createdAt)} · ${status} · <span title="${t('HASH_HELP')}">#${esc(m.hash)}</span></p>
    ${m.receipts ? `<details><summary class="muted">${t('RECEIPTS')}</summary><table style="margin-top:6px"><tbody>${m.receipts.map(r => `<tr><td>${esc(r.name)}</td><td>${r.readAt ? dt(r.readAt) : '-'}</td><td>${m.requiresAck ? (r.ackAt ? t('ACK_AT', { at: dt(r.ackAt) }) : t('ACK_WAIT')) : ''}</td></tr>`).join('')}</tbody></table></details>` : ''}
  </div>`;
}
// 인쇄용 서면 (경고장·징계 통보서·해고 통지서·지시서·사유서 등)
const DOC_TITLE = { notice: '공 지 문', instruction: '업 무 지 시 서', warning: '경 고 장', discipline: '징 계 통 보 서', dismissal: '해 고 통 지 서', absence_reason: '결 근 사 유 서', suggestion: '건 의 서', schedule_request: '근무 변경 요청서', general: '전 달 사 항' };
function noticeHTML(m) {
  const s = O.store, st = staffById(m.staffId) || {}, fromOwner = m.from === 'owner';
  const toName = m.staffId ? st.name : '전 직원';
  return `<div class="doc"><h1>${DOC_TITLE[m.kind]}</h1>
  <table><tr><th style="width:18%">${fromOwner ? '수 신' : '제출자'}</th><td class="l">${esc(fromOwner ? toName : m.senderName)}${st.position ? ` (${esc(st.position)})` : ''}</td><th style="width:18%">${fromOwner ? '발 신' : '수 신'}</th><td class="l">${esc(s.name)} 대표 ${esc(s.ownerName || '')}</td></tr>
  <tr><th>작성 일시</th><td class="l">${dt(m.createdAt)}</td><th>${m.kind === 'dismissal' ? '해고일' : '관련 일자'}</th><td class="l">${esc(m.date || '-')}</td></tr>
  <tr><th>제 목</th><td class="l" colspan="3">${esc(m.title || '-')}</td></tr>
  <tr><th>내 용</th><td class="l" colspan="3" style="white-space:pre-wrap;height:220px;vertical-align:top">${esc(m.body)}</td></tr>
  ${m.attachments.length ? `<tr><th>첨 부</th><td class="l" colspan="3">${m.attachments.map(a => esc(a.name)).join(', ')}</td></tr>` : ''}
  <tr><th>수령 확인</th><td class="l" colspan="3">${m.receipts ? m.receipts.map(r => `${esc(r.name)} ${r.ackAt ? dt(r.ackAt) : '(미확인)'}`).join(', ') : fromOwner ? (m.ackAt ? `앱에서 확인 ${dt(m.ackAt)}` : m.readAt ? `열람 ${dt(m.readAt)} (확인 전)` : '미열람') : (m.ownerReadAt ? `열람 ${dt(m.ownerReadAt)}` : '미열람')}</td></tr></table>
  ${m.kind === 'dismissal' ? '<p class="en" style="color:#000">※ 근로기준법 제27조에 따라 해고 사유와 해고 시기를 서면으로 통지합니다. 제26조에 따라 30일 전에 예고하지 않은 경우 30일분 이상의 통상임금(해고예고수당)을 지급합니다(계속 근로 3개월 미만 등 예외 있음).</p>' : ''}
  <p style="margin-top:22px">위 내용을 ${fromOwner ? '통지' : '제출'}합니다.</p>
  <table class="sign" style="border:0;width:100%;margin-top:14px"><tr><td>${fromOwner ? `사업주 : ${esc(s.ownerName || '')} (서명)` : `제출자 : ${esc(m.senderName)} (서명)`}</td><td>${fromOwner ? `수령인 : ${esc(toName)} (서명)` : `확인 : ${esc(s.ownerName || '')} (서명)`}</td></tr></table>
  <p class="en" style="color:#000;margin-top:16px">ALBAGO 알바고 기록 번호 #${esc(m.hash)} · 이 문서는 앱에 삭제·수정할 수 없는 기록으로 보관됩니다.</p></div>`;
}
