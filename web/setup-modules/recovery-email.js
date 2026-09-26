async function registerRecoveryEmail(confirm) {
  var email  = document.getElementById('recoveryEmail').value.trim();
  var btn    = document.getElementById('registerEmailBtn');
  var result = document.getElementById('emailRegResult');
  var token  = document.getElementById('tokenDisplay') ? document.getElementById('tokenDisplay').textContent.trim() : '';
  if (!email) { result.style.color='#f87171'; result.textContent=umT('setup.summaryModal.pleaseEnterYourEmail', 'Please enter your email'); return; }
  if (!token) { result.style.color='#f87171'; result.textContent=umT('setup.summaryModal.generateYourSetupFirst', 'Generate your setup first'); return; }
  btn.disabled = true; btn.textContent = umT('setup.summaryModal.registering', 'Registering...');
  result.style.color='#8888aa'; result.textContent='';
  try {
    const r = await fetch('/api/register-email', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ token, email, confirm: confirm || false })
    });
    const data = await r.json();
    if (data.exists) {
      // Email already registered — show warning with confirm/cancel
      result.innerHTML = '<span style="color:#f5c518;">⚠️ ' + data.message + '</span><br><div style="display:flex;gap:8px;margin-top:8px;">'
        + '<button onclick="registerRecoveryEmail(true)" style="background:#FF3D5A;color:#fff;border:none;font-family:inherit;font-size:11px;font-weight:600;padding:6px 14px;border-radius:6px;cursor:pointer;">' + umT('setup.summaryModal.yesReplaceIt','Yes, replace it') + '</button>'
        + '<button onclick="cancelEmailReg()" style="background:#1e1e36;color:#8888aa;border:1px solid #2a2a45;font-family:inherit;font-size:11px;padding:6px 14px;border-radius:6px;cursor:pointer;">' + umT('setup.summaryModal.cancel','Cancel') + '</button>'
        + '</div>';
      btn.disabled = false; btn.textContent = umT('setup.summaryModal.register', 'Register');
    } else if (data.ok) {
      result.style.color='#34d399'; result.innerHTML='✓ ' + data.message;
      btn.textContent=umT('setup.summaryModal.registered', 'Registered ✓'); btn.style.background='#34d399'; btn.style.color='#000';
    } else {
      result.style.color='#f87171'; result.textContent='✗ ' + (data.error || umT('setup.summaryModal.failed','Failed'));
      btn.disabled=false; btn.textContent=umT('setup.summaryModal.register2', 'Register');
    }
  } catch(e) {
    result.style.color='#f87171'; result.textContent=umT('setup.summaryModal.networkError', '✗ Network error');
    btn.disabled=false; btn.textContent=umT('setup.summaryModal.register3', 'Register');
  }
}

function cancelEmailReg() {
  document.getElementById('emailRegResult').textContent = '';
  document.getElementById('registerEmailBtn').disabled = false;
}
