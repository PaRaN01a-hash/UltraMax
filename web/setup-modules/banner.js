function showBanner(msg, type){
  const old = document.getElementById('liveBanner');
  if(old) old.remove();

  const d = document.createElement('div');
  d.id = 'liveBanner';
  d.className = 'banner-msg ' + (type === 'error' ? 'banner-error' : 'banner-success');
  d.innerHTML = msg;
  document.body.appendChild(d);

  setTimeout(function(){
    if(d) d.remove();
  }, 3200);
}
