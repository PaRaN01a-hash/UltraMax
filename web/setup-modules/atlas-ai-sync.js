document.addEventListener('DOMContentLoaded', function(){
  const qKey = document.getElementById('quickGoogleAiKey');
  const qOn = document.getElementById('quickEnableAiRecommended');
  const key = document.getElementById('googleAiKey');
  const on = document.getElementById('enableAiRecommended');

  function syncAiFields(){
    if(qKey && key) key.value = qKey.value || key.value || '';
    if(qOn && on) on.checked = !!qOn.checked;
  }

  if(qKey) qKey.addEventListener('input', syncAiFields);
  if(qOn) qOn.addEventListener('change', syncAiFields);

  const oldQuick = window.quickGenerateV3;
  if(typeof oldQuick === 'function'){
    window.quickGenerateV3 = function(){
      syncAiFields();
      return oldQuick.apply(this, arguments);
    };
  }
});
