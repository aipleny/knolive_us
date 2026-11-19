'use strict';
langButton();
$('#f').onsubmit = async e => {
  e.preventDefault(); $('#err').textContent = '';
  try {
    const r = await api('/api/auth/staff-signup', { method: 'POST', body: { storeCode: $('#storeCode').value, name: $('#name').value, phone: $('#phone').value, loginId: $('#loginId').value, password: $('#pw').value, lang: LANG } });
    $('#ok').hidden = false; $('#ok').textContent = r.message; e.target.querySelector('button').disabled = true;
  } catch (err) { $('#err').textContent = err.message; }
};
