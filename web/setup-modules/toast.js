function showToast(msg, kind) {
  var existing = document.getElementById('um-toast');
  if (existing) existing.remove();
  var t = document.createElement('div');
  t.id = 'um-toast';
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:'+(kind==='error'?'#ef4444':'#7B2FFF')+';color:#fff;font-size:13px;font-weight:700;padding:10px 22px;border-radius:100px;z-index:9999;pointer-events:none;opacity:1;transition:opacity .3s;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.4);';
  document.body.appendChild(t);
  setTimeout(function(){ t.style.opacity='0'; setTimeout(function(){ t.remove(); }, 300); }, 2500);
}
