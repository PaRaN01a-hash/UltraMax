function showForgotPassword(){
  const box = document.getElementById('forgotPasswordBox');
  if(box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

async function resetPassword(){
  const token = editToken || (document.getElementById('tokenInput')||{}).value || '';
  if(!token){ alert(umT('setup.streams.pleaseLoadYourConfigFirst', 'Please load your config first')); return; }
  const newPass = (document.getElementById('newPassword')||{}).value || '';
  const confirm = (document.getElementById('confirmNewPassword')||{}).value || '';
  const msg = document.getElementById('resetMsg');
  if(!newPass || newPass.length < 4){ msg.style.color='#f87171'; msg.textContent=umT('setup.streams.passwordMustBeAtLeast4', 'Password must be at least 4 characters'); return; }
  if(newPass !== confirm){ msg.style.color='#f87171'; msg.textContent=umT('setup.streams.passwordsDoNotMatch', 'Passwords do not match'); return; }
  try {
    const r = await fetch('/c/'+token+'/reset-password', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ newPassword: newPass })
    });
    const d = await r.json();
    if(d.ok){
      msg.style.color='#4ade80'; msg.textContent=umT('setup.streams.passwordResetSuccessfully', 'Password reset successfully!');
      document.getElementById('forgotPasswordBox').style.display='none';
      document.getElementById('password').value = newPass;
      if(typeof window.s1UpdateStatuses === 'function') window.s1UpdateStatuses();
    } else {
      msg.style.color='#f87171'; msg.textContent = d.error || 'Reset failed';
    }
  } catch(e) { msg.style.color='#f87171'; msg.textContent=umT('setup.streams.somethingWentWrong', 'Something went wrong'); }
}

function togglePass(id, btn){
  const el = document.getElementById(id);
  if(!el) return;
  if(el.type === 'password'){ el.type = 'text'; btn.textContent = '🙈'; }
  else { el.type = 'password'; btn.textContent = '👁'; }
}
