(() => {
  'use strict';

  const CLAIM_PREFIX='um_playplus_badge_v1:';
  const SPLASH_PREFIX='um_playplus_splash_v1:';
  const claimPattern=/^[A-Za-z0-9_-]{20,1200}\.[A-Za-z0-9_-]{43,100}$/;
  let expiryTimer=null;

  function b64url(bytes){
    let s='';
    for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);
    return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  async function setupHash(token){
    if(!window.crypto?.subtle)return '';
    return b64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
  }

  function clearSupporterState(badge,key){
    if(expiryTimer){clearTimeout(expiryTimer);expiryTimer=null}
    document.documentElement.classList.remove('um-playplus-active');
    if(badge)badge.hidden=true;
    if(key){try{localStorage.removeItem(key)}catch{}}
    const splash=document.querySelector('.um-playplus-splash');
    if(splash)splash.remove();
  }

  function showSupporterSplash(digest){
    const splashKey=SPLASH_PREFIX+digest;
    try{
      if(sessionStorage.getItem(splashKey)==='1')return;
      sessionStorage.setItem(splashKey,'1');
    }catch{}

    const splash=document.createElement('div');
    splash.className='um-playplus-splash';
    splash.setAttribute('role','status');
    splash.setAttribute('aria-live','polite');

    const card=document.createElement('div');
    card.className='um-playplus-splash-card';

    const mark=document.createElement('div');
    mark.className='um-playplus-splash-mark';
    mark.setAttribute('aria-hidden','true');
    mark.textContent='✦';

    const copy=document.createElement('div');
    copy.className='um-playplus-splash-copy';

    const kicker=document.createElement('div');
    kicker.className='um-playplus-splash-kicker';
    kicker.textContent='ULTRA MAX SUPPORTER';

    const title=document.createElement('div');
    title.className='um-playplus-splash-title';
    title.textContent='PLAY+ verified';

    const detail=document.createElement('div');
    detail.className='um-playplus-splash-detail';
    detail.textContent='Thanks for supporting Ultra MAX.';

    copy.append(kicker,title,detail);
    card.append(mark,copy);
    splash.append(card);
    document.body.append(splash);

    requestAnimationFrame(()=>splash.classList.add('is-visible'));
    window.setTimeout(()=>{
      splash.classList.remove('is-visible');
      window.setTimeout(()=>splash.remove(),420);
    },2200);
  }

  function activateSupporterState(badge,digest,key,data,incoming,claim){
    document.documentElement.classList.add('um-playplus-active');
    badge.hidden=false;
    badge.textContent='PLAY+ SUPPORTER';

    const badgeTitle=typeof window.umT==='function'
      ? window.umT('setup.playPlusBadge.title','UltraPlay+ verified for this Ultra MAX setup')
      : 'UltraPlay+ verified for this Ultra MAX setup';
    const badgeAria=typeof window.umT==='function'
      ? window.umT('setup.playPlusBadge.aria','UltraPlay Plus verified')
      : 'UltraPlay Plus verified';

    badge.title=badgeTitle;
    badge.setAttribute('aria-label',badgeAria);

    if(incoming){try{localStorage.setItem(key,claim)}catch{}}
    showSupporterSplash(digest);

    const expiresAt=Number(data?.expiresAt);
    if(Number.isFinite(expiresAt)){
      const delay=expiresAt-Date.now();
      if(delay<=0){
        clearSupporterState(badge,key);
        return;
      }
      expiryTimer=window.setTimeout(()=>clearSupporterState(badge,key),Math.min(delay,2147483647));
    }
  }

  async function initPlayPlusBadge(){
    const badge=document.getElementById('umPlayPlusBadge');
    if(!badge)return;

    const token=new URLSearchParams(location.search).get('token')||sessionStorage.getItem('um_setup_token')||'';
    if(!/^[A-Za-z0-9_-]{4,160}$/.test(token))return;

    const digest=await setupHash(token);
    if(!digest)return;

    const key=CLAIM_PREFIX+digest;
    let incoming='';
    try{
      const hash=new URLSearchParams(location.hash.replace(/^#/,''));
      incoming=hash.get('playplus')||'';
      if(incoming)history.replaceState(null,'',location.pathname+location.search);
    }catch{}

    let claim=claimPattern.test(incoming)?incoming:'';
    try{if(!claim)claim=localStorage.getItem(key)||''}catch{}

    if(!claimPattern.test(claim)){
      clearSupporterState(badge,key);
      return;
    }

    try{
      const response=await fetch('/api/ultraplay/badge/verify',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,claim}),
        cache:'no-store'
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.active!==true||data.label!=='PLAY+'){
        clearSupporterState(badge,key);
        return;
      }
      activateSupporterState(badge,digest,key,data,incoming,claim);
    }catch{
      document.documentElement.classList.remove('um-playplus-active');
      badge.hidden=true;
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>void initPlayPlusBadge(),{once:true});
  }else{
    void initPlayPlusBadge();
  }
})();
