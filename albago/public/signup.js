'use strict';
langButton();
let step = 1, smsId, mailId, phoneTicket, emailTicket;
function show(n) { step = n; $$('[data-step]').forEach(s => s.hidden = +s.dataset.step !== n); $$('.steps span').forEach((s, i) => s.classList.toggle('on', i < n)); $('#err').textContent = ''; }
const err = e => $('#err').textContent = e.message || e;
const dev = r => r.devCode ? toast(t('DEV_CODE', { code: r.devCode })) : null;
show(1);
$('#s1').onclick = async () => {
  if (!$('#storeName').value.trim() || !$('#ownerName').value.trim()) return err(t('FILL_REQUIRED'));
  try { const r = await api('/api/auth/biz-check', { method: 'POST', body: { bizNo: $('#bizNo').value } }); $('#bizNo').value = r.formatted; show(2); } catch (e) { err(e); }
};
$('#sms-send').onclick = async () => { try { const r = await api('/api/auth/verify/send', { method: 'POST', body: { kind: 'sms', target: $('#phone').value } }); smsId = r.id; toast(t('CODE_SENT_SMS')); dev(r); } catch (e) { err(e); } };
$('#s2').onclick = async () => { try { phoneTicket = (await api('/api/auth/verify/check', { method: 'POST', body: { kind: 'sms', id: smsId, code: $('#sms-code').value } })).ticket; show(3); } catch (e) { err(e); } };
$('#mail-send').onclick = async () => { try { const r = await api('/api/auth/verify/send', { method: 'POST', body: { kind: 'email', target: $('#email').value } }); mailId = r.id; toast(t('CODE_SENT_EMAIL')); dev(r); } catch (e) { err(e); } };
$('#s3').onclick = async () => { try { emailTicket = (await api('/api/auth/verify/check', { method: 'POST', body: { kind: 'email', id: mailId, code: $('#mail-code').value } })).ticket; show(4); } catch (e) { err(e); } };
$('#f').onsubmit = async e => {
  e.preventDefault(); if (step !== 4) return;
  if ($('#pw').value !== $('#pw2').value) return err(t('PW_MISMATCH'));
  if (!$('#agree').checked) return err(t('AGREE_REQUIRED'));
  try {
    const r = await api('/api/auth/signup', { method: 'POST', body: { bizNo: $('#bizNo').value, storeName: $('#storeName').value, ownerName: $('#ownerName').value, address: $('#address').value, phone: $('#phone').value, email: $('#email').value, phoneTicket, emailTicket, loginId: $('#loginId').value, password: $('#pw').value, lang: LANG } });
    $('#done-msg').textContent = t('SIGNUP_DONE_MSG', { code: r.storeCode }); show(5);
  } catch (e2) { err(e2); }
};
