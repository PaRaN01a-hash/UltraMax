(function(){
  function applyTheme(mode){
    document.body.classList.toggle('light-mode', mode === 'light');
    const btn = document.getElementById('themeToggle');
    if(btn) btn.textContent = mode === 'light' ? '☀️ Light' : '🌙 Dark';
    if(typeof applyAssetLibraryLightMode === 'function') applyAssetLibraryLightMode();
  }

  window.toggleUltraTheme = function(){
    const next = document.body.classList.contains('light-mode') ? 'dark' : 'light';
    localStorage.setItem('ultramaxTheme', next);
    applyTheme(next);
  };

  document.addEventListener('DOMContentLoaded', function(){
    if(!document.getElementById('themeToggle')){
      const btn = document.createElement('button');
      btn.id = 'themeToggle';
      btn.type = 'button';
      btn.onclick = window.toggleUltraTheme;
      document.body.appendChild(btn);
    }

    const saved = localStorage.getItem('ultramaxTheme') || 'dark';
    applyTheme(saved);
  });
})();
