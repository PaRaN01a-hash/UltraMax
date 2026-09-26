function doInlineShare(){
  var name = document.getElementById('inlineShareName').value.trim();
  var author = document.getElementById('inlineShareAuthor').value.trim()||'Anonymous';
  if(!name){ showToast(umT('setup.shareModal.pleaseEnterAName', 'Please enter a name')); return; }
  var raw = localStorage.getItem('um_share_full');
  if(!raw){ showToast(umT('setup.shareModal.noDataToShareTryAgain', 'No data to share — try again')); return; }
  var data; try{ data=JSON.parse(raw); }catch(e){ showToast(umT('setup.shareModal.invalidData', 'Invalid data')); return; }
  var btn = document.getElementById('inlineShareBtn');
  btn.textContent=umT('setup.shareModal.sharing', 'Sharing...'); btn.disabled=true;
  // Check data size
  var dataStr = JSON.stringify(data);
  if(dataStr.length > 400000){
    showToast(umT('setup.shareModal.setupTooLargeToShare', 'Setup too large to share (')+Math.round(dataStr.length/1024)+'KB). Try sharing Collections only.');
    btn.textContent=umT('setup.shareModal.share2', '🚀 Share'); btn.disabled=false;
    return;
  }
  var payload = {type:'full',name:name,author:author,data:data};
  fetch('/api/share',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  })
  .then(function(r){
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  })
  .then(function(res){
    if(res.error){showToast(umT('setup.shareModal.error', 'Error: ')+res.error);btn.textContent=umT('setup.shareModal.share3', '🚀 Share');btn.disabled=false;return;}
    document.getElementById('inlineShareLink').value=res.url;
    document.getElementById('inlineShareResult').style.display='block';
    document.getElementById('inlineShareLinkRow').style.display='block';
    document.getElementById('inlineShareViewBtn').style.display='block';
    document.getElementById('inlineShareViewBtn').href='/gallery';
    btn.textContent=umT('setup.shareModal.shared', '✅ Shared!');
    showToast(umT('setup.shareModal.sharedSuccessfully', 'Shared successfully!'));
  })
  .catch(function(e){showToast(umT('setup.shareModal.shareFailed', 'Share failed: ')+e.message);btn.textContent=umT('setup.shareModal.share4', '🚀 Share');btn.disabled=false;});
}
