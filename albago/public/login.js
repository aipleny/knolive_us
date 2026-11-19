'use strict';
langButton();
let otpId = null, resetId = null;
const dev = r => r.devCode ? toast(t('DEV_CODE', { code: r.devCode })) : null;
const go = role => location.href = role === 'staff' ? '/staff' : '/owner';
$('#f-login').onsubmit = async e => {
  e.preventDefault(); $('#err').textContent = '';
  try {
    const r = await api('/api/auth/login', { method: 'POST', body: { storeCode: $('#storeCode').value, loginId: $('#loginId').value, password: $('#password').value } });
    if (r.otp) { otpId = r.otpId; $('#f-login').hidden = true; $('#f-otp').hidden = false; $('#otp-help').textContent = t('OTP_HELP', { email: r.emailMasked }); $('#otp').focus(); dev(r); }
    else go(r.role);
  } catch (err) { $('#err').textContent = err.message; }
};
$('#f-otp').onsubmit = async e => {
  e.preventDefault(); $('#otp-err').textContent = '';
  try { const r = await api('/api/auth/otp', { method: 'POST', body: { otpId, code: $('#otp').value, remember: $('#remember').checked } }); go(r.role); }
  catch (err) { $('#otp-err').textContent = err.message; }
};
$('#forgot').onclick = e => { e.preventDefault(); $('#f-reset').hidden = false; $('#f-reset').scrollIntoView({ behavior: 'smooth' }); };
$('#reset-send').onclick = async () => {
  $('#reset-err').textContent = '';
  if (!$('#storeCode').value || !$('#loginId').value) return $('#reset-err').textContent = t('RESET_NEED_ID');
  try { const r = await api('/api/auth/reset/send', { method: 'POST', body: { storeCode: $('#storeCode').value, loginId: $('#loginId').value } }); resetId = r.id; toast(t('CODE_SENT_EMAIL')); dev(r); }
  catch (err) { $('#reset-err').textContent = err.message; }
};
$('#f-reset').onsubmit = async e => {
  e.preventDefault(); $('#reset-err').textContent = '';
  try { await api('/api/auth/reset', { method: 'POST', body: { id: resetId, code: $('#reset-code').value, password: $('#reset-pw').value } }); toast(t('PW_CHANGED'), 'ok'); $('#f-reset').hidden = true; }
  catch (err) { $('#reset-err').textContent = err.message; }
};
api('/api/auth/me').then(m => { if (m.role) go(m.role); }).catch(() => {});
